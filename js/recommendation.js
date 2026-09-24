/**
 * Aura Music - Modular Recommendation Engine
 * Intelligently generates dynamic "Up Next" queues using YouTube Live candidates,
 * multi-factor scoring, user listening history, and diversity heuristics.
 */

import { api } from './api.js';
import { StorageManager } from './storage.js';

export const RECOMMENDATION_WEIGHTS = Object.freeze({
  language: 0.25,
  genre: 0.15,
  mood: 0.15,
  similarity: 0.15,
  artist: 0.08,
  energy: 0.07,
  history: 0.07,
  session: 0.05,
  exploration: 0.03
});

export const RECENT_SONG_WINDOW = 10;

export class RecommendationEngine {
  constructor(customWeights = {}) {
    // Configurable multi-factor recommendation scoring weights
    this.weights = { ...RECOMMENDATION_WEIGHTS, ...customWeights };

    // Keep an in-memory cache of generated recommendation batches
    this.recommendationCache = new Map();
  }

  /**
   * Set or tune scoring weights at runtime
   */
  setWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
  }

  /**
   * Main recommendation entry point:
   * Takes a seed track and returns a diversified, ranked list of recommended tracks.
   * Completely independent of search result lists.
   */
  async generateQueue(seedTrack, options = {}) {
    if (!seedTrack) return [];

    const limit = options.limit || 20;
    const currentQueueIds = new Set(options.existingQueueIds || []);
    const seedId = String(seedTrack.id || seedTrack.videoId || '');
    const seedVibe = seedTrack.vibeMetadata || api.extractVibe(seedTrack);

    try {
      // 1. Fetch genuine candidates from YouTube InnerTube watch-next API
      const primaryResult = await api.getRelatedTracks(seedTrack, null, 25);
      let candidates = Array.isArray(primaryResult?.tracks) ? [...primaryResult.tracks] : [];

      // 2. If candidates are sparse (< 12), perform targeted discovery search
      const primaryArtist = StorageManager.parseArtists(seedTrack.artist)[0] || seedTrack.artist;
      if (candidates.length < 12) {
        try {
          const discoveryQueries = [
            primaryArtist && primaryArtist !== 'YouTube Artist'
              ? `${primaryArtist} ${seedVibe.mood} ${seedVibe.language} similar songs`
              : '',
            `${seedTrack.title || ''} radio ${seedVibe.genreTags.join(' ')}`
          ].filter(Boolean);
          const batches = await Promise.all(discoveryQueries.map(query => api.searchSongs(query, 10)));
          for (const batch of batches) {
            if (Array.isArray(batch)) candidates.push(...batch);
          }
        } catch (e) {
          console.warn('[RecommendationEngine] Artist discovery query failed', e);
        }
      }

      // Discovery results are filtered again because they bypass getRelatedTracks().
      candidates = api.filterRelatedTracks(seedTrack, candidates, Math.max(limit, 20));

      // Deduplicate candidates by videoId or id
      const uniqueCandidates = [];
      const seen = new Set();
      if (seedId) seen.add(seedId);
      if (seedTrack.videoId) seen.add(seedTrack.videoId);

      for (const track of candidates) {
        const vid = track.videoId || (track.id?.startsWith('yt_') ? track.id.replace('yt_', '') : track.id);
        if (!vid || seen.has(vid) || seen.has(track.id) || currentQueueIds.has(track.id) || currentQueueIds.has(vid)) {
          continue;
        }
        if (api.extractVibe(track).language !== seedVibe.language) {
          continue;
        }
        // Duration sanity check: only normal songs (40s to 600s)
        const dur = Number(track.duration) || 180;
        if (dur < 40 || dur > 600) {
          continue;
        }
        seen.add(vid);
        if (track.id) seen.add(track.id);
        uniqueCandidates.push(track);
      }

      // 3. User listening history, recent window, and current session context
      const userPrefs = StorageManager.getUserPreferences();
      const recentPlayed = new Set((userPrefs.recentTrackIds || []).slice(0, options.recentSongWindow || RECENT_SONG_WINDOW));
      const sessionContext = options.sessionContext || userPrefs.sessionTrackIds || [];

      // 4. Score each candidate
      const scoredCandidates = uniqueCandidates.map((candidate, index) => {
        const scoreBreakdown = this.scoreCandidate(candidate, seedTrack, userPrefs, index, uniqueCandidates.length, {
          recentPlayed,
          sessionContext
        });
        return {
          track: candidate,
          score: scoreBreakdown.total,
          breakdown: scoreBreakdown
        };
      });

      // Sort by final composite score descending
      scoredCandidates.sort((a, b) => b.score - a.score);

      // 5. Apply diversity while preserving the ranked score order.
      const freshCandidates = scoredCandidates.filter(item => {
        const key = item.track.videoId || item.track.id;
        return !recentPlayed.has(key);
      });
      const rankedPool = freshCandidates.length >= Math.min(limit, 10)
        ? freshCandidates
        : [...freshCandidates, ...scoredCandidates.filter(item => !freshCandidates.includes(item))];
      const diversifiedList = [];
      const artistCounts = {};

      for (const item of rankedPool) {
        const t = item.track;

        const primaryArt = (StorageManager.parseArtists(t.artist)[0] || t.artist || 'Unknown').toLowerCase();
        const currentArtCount = artistCounts[primaryArt] || 0;

        // Cap to max 2 per artist in first 10, max 3 overall
        if (diversifiedList.length < 10 && currentArtCount >= 2) {
          continue;
        }
        if (currentArtCount >= 3) {
          continue;
        }

        artistCounts[primaryArt] = currentArtCount + 1;
        diversifiedList.push(t);

        if (diversifiedList.length >= limit) {
          break;
        }
      }

      // If diversity filter was too aggressive and we have fewer than 10 tracks, fill with remaining scored tracks
      if (diversifiedList.length < 10) {
        for (const item of rankedPool) {
          if (!diversifiedList.some(d => d.id === item.track.id || (d.videoId && d.videoId === item.track.videoId))) {
            diversifiedList.push(item.track);
            if (diversifiedList.length >= limit) break;
          }
        }
      }

      return diversifiedList;
    } catch (err) {
      console.error('[RecommendationEngine] Failed to generate recommendation queue', err);
      return [];
    }
  }

  /**
   * Fetches more recommendations when the active queue runs low
   */
  async fetchMoreRecommendations(currentTrack, existingQueue = [], limit = 10) {
    const existingQueueIds = existingQueue.map(t => t.id || t.videoId).filter(Boolean);
    return this.generateQueue(currentTrack, { limit, existingQueueIds });
  }

  /**
   * Weighted context score. All components are normalized to 0..1 before
   * penalties are applied, so language continuity remains the strongest gate.
   */
  scoreCandidate(candidate, seedTrack, userPrefs, rankIndex, totalCandidates, context = {}) {
    const seedVibe = seedTrack.vibeMetadata || api.extractVibe(seedTrack);
    const candidateVibe = candidate.vibeMetadata || api.extractVibe(candidate);
    const language = this.computeLanguageSimilarity(candidate, seedTrack, userPrefs);
    const genre = this.computeGenreSimilarity(candidate, seedTrack);
    const mood = seedVibe.mood === candidateVibe.mood ? 1 : genre * 0.65;
    const songSimilarity = this.computeSongSimilarity(candidate, seedTrack);
    const albumSimilarity = this.computeAlbumSimilarity(candidate, seedTrack);
    const eraSimilarity = this.computeEraSimilarity(candidateVibe, seedVibe);
    const similarity = (songSimilarity + albumSimilarity + eraSimilarity) / 3;
    const artist = this.computeArtistTier(candidate, seedTrack);
    const energy = this.computeEnergySimilarity(candidateVibe, seedVibe);
    const history = this.computeUserPreferenceScore(candidate, userPrefs);
    const session = this.computeSessionScore(candidate, seedTrack, context.sessionContext);
    const exploration = this.computeExplorationScore(candidate, seedTrack, rankIndex);
    const recentPenalty = context.recentPlayed?.has(candidate.id) || context.recentPlayed?.has(candidate.videoId) ? 0.22 : 0;
    const skipPenalty = this.computeSkipPenalty(candidate, userPrefs);
    const weightTotal = Object.values(this.weights).reduce((sum, value) => sum + value, 0);
    const weightedScore =
      (language * this.weights.language) + (genre * this.weights.genre) + (mood * this.weights.mood) +
      (similarity * this.weights.similarity) + (artist * this.weights.artist) +
      (energy * this.weights.energy) + (history * this.weights.history) +
      (session * this.weights.session) + (exploration * this.weights.exploration);
    const total = (weightedScore / weightTotal) - recentPenalty - skipPenalty;

    return {
      total: Math.max(0, Math.min(1, total)),
      language,
      genre,
      mood,
      similarity,
      songSimilarity,
      albumSimilarity,
      eraSimilarity,
      artist,
      energy,
      history,
      session,
      exploration,
      recentPenalty,
      skipPenalty,
      vibe: candidateVibe,
    };
  }

  /**
   * 1. Artist Similarity: 0.0 - 1.0
   * Exact match = 1.0, shared featured artist = 0.8, related affinity = 0.7, different = 0.2
   */
  computeArtistSimilarity(candidate, seedTrack) {
    const seedArtists = StorageManager.parseArtists(seedTrack.artist).map(a => a.toLowerCase());
    const candArtists = StorageManager.parseArtists(candidate.artist).map(a => a.toLowerCase());

    if (!seedArtists.length || !candArtists.length) return 0.3;

    // Check exact primary artist match
    if (seedArtists[0] && candArtists[0] && seedArtists[0] === candArtists[0]) {
      return 1.0;
    }

    // Check intersection of any featured artists
    const hasIntersection = seedArtists.some(sa => candArtists.includes(sa));
    if (hasIntersection) {
      return 0.8;
    }

    // Check partial string matching (e.g., "Arijit" in "Arijit Singh")
    for (const sa of seedArtists) {
      for (const ca of candArtists) {
        if (sa.includes(ca) || ca.includes(sa)) {
          return 0.7;
        }
      }
    }

    return 0.2;
  }

  computeArtistTier(candidate, seedTrack) {
    const seedArtists = StorageManager.parseArtists(seedTrack.artist).map(artist => artist.toLowerCase());
    const candidateArtists = StorageManager.parseArtists(candidate.artist).map(artist => artist.toLowerCase());
    if (seedArtists.some(seed => candidateArtists.some(candidateName => candidateName === seed || candidateName.includes(seed) || seed.includes(candidateName)))) {
      return 1;
    }

    const peerGroups = [
      ['arijit singh', 'atif aslam', 'mohit chauhan', 'jubin nautiyal', 'jasleen royal', 'shreya ghoshal'],
      ['karan aujla', 'ap dhillon', 'diljit dosanjh', 'shubh', 'sidhu moose wala', 'guru randhawa']
    ];
    const samePeerGroup = peerGroups.some(group =>
      seedArtists.some(seed => group.some(peer => seed.includes(peer) || peer.includes(seed))) &&
      candidateArtists.some(candidateName => group.some(peer => candidateName.includes(peer) || peer.includes(candidateName)))
    );
    return samePeerGroup ? 0.78 : 0.18;
  }

  computeEnergySimilarity(candidateVibe, seedVibe) {
    const distance = Math.abs((candidateVibe.energy ?? 0.5) - (seedVibe.energy ?? 0.5));
    const tempoMatch = candidateVibe.tempo === seedVibe.tempo ? 0.2 : 0;
    return Math.max(0, Math.min(1, 1 - distance + tempoMatch));
  }

  computeSessionScore(candidate, seedTrack, sessionTrackIds = []) {
    if (!Array.isArray(sessionTrackIds) || sessionTrackIds.length === 0) return 0.5;
    const seedLanguage = api.extractVibe(seedTrack).language;
    const candidateLanguage = api.extractVibe(candidate).language;
    const sessionLanguages = sessionTrackIds
      .map(item => typeof item === 'object' ? api.extractVibe(item).language : null)
      .filter(Boolean);
    const sessionMoods = sessionTrackIds
      .map(item => typeof item === 'object' ? api.extractVibe(item).mood : null)
      .filter(Boolean);
    if (sessionLanguages.length === 0) return candidateLanguage === seedLanguage ? 0.65 : 0;
    const sessionLanguageMatch = sessionLanguages.filter(language => language === candidateLanguage).length / sessionLanguages.length;
    const sessionMoodMatch = sessionMoods.filter(mood => mood === api.extractVibe(candidate).mood).length / sessionMoods.length;
    return candidateLanguage === seedLanguage ? (0.65 + (sessionLanguageMatch * 0.2) + (sessionMoodMatch * 0.15)) : 0;
  }

  computeExplorationScore(candidate, seedTrack, rankIndex) {
    const candidateVibe = api.extractVibe(candidate);
    const seedVibe = api.extractVibe(seedTrack);
    if (candidateVibe.language !== seedVibe.language) return 0;
    return rankIndex < 5 && candidateVibe.mood === seedVibe.mood ? 0.2 : 0.05;
  }

  computeSkipPenalty(candidate, userPrefs) {
    const trackStats = userPrefs?.tracks?.[candidate.id] || userPrefs?.tracks?.[candidate.videoId];
    const artistStats = StorageManager.parseArtists(candidate.artist)
      .map(artist => userPrefs?.artists?.[artist.toLowerCase()])
      .filter(Boolean);
    const trackSkips = trackStats?.skips || 0;
    const artistSkips = artistStats.reduce((sum, stat) => sum + (stat.skips || 0), 0);
    return Math.min(0.25, (trackSkips * 0.04) + (artistSkips * 0.015));
  }

  /**
   * 2. Genre / Mood Similarity: 0.0 - 1.0
   */
  computeGenreSimilarity(candidate, seedTrack) {
    const seedVibe = seedTrack.vibeMetadata || api.extractVibe(seedTrack);
    const candidateVibe = candidate.vibeMetadata || api.extractVibe(candidate);
    const seedMood = seedVibe.mood;
    const candMood = candidateVibe.mood;

    const sharedGenres = seedVibe.genreTags.filter(tag => candidateVibe.genreTags.includes(tag)).length;
    if (sharedGenres > 0 && seedMood === candMood) return 1;
    if (sharedGenres > 0) return 0.8;

    if (seedMood === candMood) {
      return 1.0;
    }

    // Complementary moods
    const complementary = {
      romantic: ['chill', 'sad'],
      chill: ['romantic', 'happy'],
      happy: ['energetic', 'chill'],
      energetic: ['happy'],
      sad: ['romantic', 'chill']
    };

    if (complementary[seedMood]?.includes(candMood)) {
      return 0.65;
    }

    // Opposites (e.g. sad vs energetic)
    const opposites = {
      sad: ['energetic', 'happy'],
      happy: ['sad'],
      chill: ['energetic'],
      energetic: ['sad', 'chill']
    };

    if (opposites[seedMood]?.includes(candMood)) {
      return 0.1;
    }

    return 0.4;
  }

  /**
   * 3. Language Similarity: 0.0 - 1.0
   * Detects Hindi/Bollywood, Punjabi, English, South Indian based on scripts and keywords
   */
  computeLanguageSimilarity(candidate, seedTrack, userPrefs = {}) {
    const seedLang = this.detectLanguage(seedTrack.title, seedTrack.artist);
    const candLang = this.detectLanguage(candidate.title, candidate.artist);

    if (seedLang === candLang) {
      return 1.0;
    }

    const multilingual = Object.entries(userPrefs.languages || {})
      .filter(([, stat]) => (stat.playCount || 0) + (stat.completions || 0) >= 3)
      .map(([language]) => language);
    if (multilingual.includes(candLang) && multilingual.includes(seedLang)) {
      return 0.35;
    }

    return 0;
  }

  detectLanguage(title = '', artist = '') {
    return api.detectLanguage(title, artist);
  }

  /**
   * 4. Song / Title Lexical & Context Similarity: 0.0 - 1.0
   */
  computeSongSimilarity(candidate, seedTrack) {
    const cleanSeed = (seedTrack.title || '').toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !/^(song|video|audio|lyrics|version|remix|official|full|original)$/i.test(w));

    const cleanCand = (candidate.title || '').toLowerCase()
      .replace(/[^a-z0-9\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !/^(song|video|audio|lyrics|version|remix|official|full|original)$/i.test(w));

    if (!cleanSeed.length || !cleanCand.length) return 0.5;

    // Count overlapping significant keywords
    const matches = cleanCand.filter(w => cleanSeed.includes(w));
    if (matches.length >= 2) return 0.9;
    if (matches.length === 1) return 0.7;

    // Check duration similarity (e.g. tracks within 40 seconds of each other have similar structure)
    const seedDur = seedTrack.duration || 180;
    const candDur = candidate.duration || 180;
    const durRatio = Math.min(seedDur, candDur) / Math.max(seedDur, candDur);

    return 0.3 + (durRatio * 0.2);
  }

  computeAlbumSimilarity(candidate, seedTrack) {
    const seedAlbum = String(seedTrack.album || '').toLowerCase().trim();
    const candidateAlbum = String(candidate.album || '').toLowerCase().trim();
    if (!seedAlbum || !candidateAlbum || seedAlbum === 'youtube music' || candidateAlbum === 'youtube music') return 0.5;
    if (seedAlbum === candidateAlbum) return 1;
    if (seedAlbum.includes(candidateAlbum) || candidateAlbum.includes(seedAlbum)) return 0.8;
    return 0.2;
  }

  computeEraSimilarity(candidateVibe, seedVibe) {
    if (!candidateVibe.year || !seedVibe.year) return 0.5;
    return Math.max(0, 1 - (Math.abs(candidateVibe.year - seedVibe.year) / 20));
  }

  /**
   * 5. User Listening History & Affinity: 0.0 - 1.0
   */
  computeUserPreferenceScore(candidate, userPrefs) {
    if (!userPrefs || !userPrefs.artists) return 0.5; // Cold start baseline

    const candArtists = StorageManager.parseArtists(candidate.artist);
    let totalScore = 0;
    let counted = 0;

    for (const art of candArtists) {
      const key = art.toLowerCase();
      const aStat = userPrefs.artists[key];
      if (aStat) {
        totalScore += aStat.score || 0;
        counted++;
      }
    }

    // Genre affinity
    const genre = candidate.mood || 'chill';
    const gStat = userPrefs.genres?.[genre.toLowerCase()];
    if (gStat) {
      totalScore += (gStat.score || 0) * 0.5;
      counted += 0.5;
    }

    const candidateVibe = candidate.vibeMetadata || api.extractVibe(candidate);
    const languageStat = userPrefs.languages?.[candidateVibe.language];
    const moodStat = userPrefs.moods?.[candidateVibe.mood];
    [languageStat, moodStat].forEach(stat => {
      if (stat) {
        totalScore += (stat.score || 0) * 0.5;
        counted += 0.5;
      }
    });

    const trackStat = userPrefs.tracks?.[candidate.id] || userPrefs.tracks?.[candidate.videoId];
    if (trackStat) {
      totalScore += ((trackStat.replays || 0) * 1.5) + ((trackStat.completions || 0) * 0.75);
      counted += 1;
    }

    if (counted === 0) {
      return 0.5; // Neutral for unknown artists
    }

    const avgScore = totalScore / counted;
    // Map score (-10 to +10 range) to 0.0 - 1.0 range
    const normalized = 0.5 + (Math.tanh(avgScore / 5) * 0.5);
    return Math.max(0.1, Math.min(1.0, normalized));
  }

  /**
   * 6. Popularity & Relevance from Discovery Source: 0.0 - 1.0
   */
  computePopularityRelevance(rankIndex, total) {
    if (!total || total <= 1) return 0.8;
    // High rank in YouTube watch-next results gets 1.0 tapering down to 0.5
    return 1.0 - ((rankIndex / total) * 0.5);
  }
}

// Export singleton instance
export const recommendationEngine = new RecommendationEngine();
