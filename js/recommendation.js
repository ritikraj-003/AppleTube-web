/**
 * Aura Music - Modular Recommendation Engine
 * Intelligently generates dynamic "Up Next" queues using YouTube Live candidates,
 * multi-factor scoring, user listening history, and diversity heuristics.
 */

import { api } from './api.js';
import { StorageManager } from './storage.js';

export class RecommendationEngine {
  constructor(customWeights = {}) {
    // Configurable multi-factor recommendation scoring weights
    this.weights = {
      artistSimilarity: 0.25,
      genreSimilarity: 0.20,
      languageSimilarity: 0.10,
      songSimilarity: 0.20,
      userHistoryPreference: 0.15,
      popularityRelevance: 0.10,
      ...customWeights
    };

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

    try {
      // 1. Fetch genuine candidates from YouTube InnerTube watch-next API
      const primaryResult = await api.getRelatedTracks(seedTrack, null, 25);
      let candidates = Array.isArray(primaryResult?.tracks) ? [...primaryResult.tracks] : [];

      // 2. If candidates are sparse (< 12), perform targeted discovery search
      const primaryArtist = StorageManager.parseArtists(seedTrack.artist)[0] || seedTrack.artist;
      if (candidates.length < 12 && primaryArtist && primaryArtist !== 'YouTube Artist') {
        try {
          const discoveryQuery = `${primaryArtist} top hits songs`;
          const extra = await api.searchSongs(discoveryQuery, 10);
          if (Array.isArray(extra)) {
            candidates.push(...extra);
          }
        } catch (e) {
          console.warn('[RecommendationEngine] Artist discovery query failed', e);
        }
      }

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
        // Duration sanity check: only normal songs (40s to 600s)
        const dur = Number(track.duration) || 180;
        if (dur < 40 || dur > 600) {
          continue;
        }
        seen.add(vid);
        if (track.id) seen.add(track.id);
        uniqueCandidates.push(track);
      }

      // 3. User listening history & recent plays suppression
      const userPrefs = StorageManager.getUserPreferences();
      const recentPlayed = new Set(StorageManager.getRecentPlayedIds(15));

      // 4. Score each candidate
      const scoredCandidates = uniqueCandidates.map((candidate, index) => {
        const scoreBreakdown = this.scoreCandidate(candidate, seedTrack, userPrefs, index, uniqueCandidates.length);
        return {
          track: candidate,
          score: scoreBreakdown.total,
          breakdown: scoreBreakdown
        };
      });

      // Sort by final composite score descending
      scoredCandidates.sort((a, b) => b.score - a.score);

      // 5. Apply Diversity & Hygiene Filters
      // - Max 2 tracks per artist in top 10
      // - Suppress recently played tracks
      const diversifiedList = [];
      const artistCounts = {};

      for (const item of scoredCandidates) {
        const t = item.track;
        const trackId = String(t.id || t.videoId);

        // Recent play suppression (penalize or push to end unless highly scored)
        if (recentPlayed.has(trackId)) {
          continue;
        }

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
        for (const item of scoredCandidates) {
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
   * Multi-Factor Candidate Scoring
   * score = (artistSim * 0.25) + (genreSim * 0.20) + (langSim * 0.10) + (songSim * 0.20) + (userPref * 0.15) + (popRel * 0.10)
   */
  scoreCandidate(candidate, seedTrack, userPrefs, rankIndex, totalCandidates) {
    const artistSim = this.computeArtistSimilarity(candidate, seedTrack);
    const genreSim = this.computeGenreSimilarity(candidate, seedTrack);
    const langSim = this.computeLanguageSimilarity(candidate, seedTrack);
    const songSim = this.computeSongSimilarity(candidate, seedTrack);
    const userPref = this.computeUserPreferenceScore(candidate, userPrefs);
    const popRel = this.computePopularityRelevance(rankIndex, totalCandidates);

    const total = 
      (artistSim * this.weights.artistSimilarity) +
      (genreSim * this.weights.genreSimilarity) +
      (langSim * this.weights.languageSimilarity) +
      (songSim * this.weights.songSimilarity) +
      (userPref * this.weights.userHistoryPreference) +
      (popRel * this.weights.popularityRelevance);

    return {
      total: Math.max(0, Math.min(1, total)),
      artistSim,
      genreSim,
      langSim,
      songSim,
      userPref,
      popRel
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

  /**
   * 2. Genre / Mood Similarity: 0.0 - 1.0
   */
  computeGenreSimilarity(candidate, seedTrack) {
    const seedMood = seedTrack.mood || api.detectMood(seedTrack);
    const candMood = candidate.mood || api.detectMood(candidate);

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
  computeLanguageSimilarity(candidate, seedTrack) {
    const seedLang = this.detectLanguage(seedTrack.title, seedTrack.artist);
    const candLang = this.detectLanguage(candidate.title, candidate.artist);

    if (seedLang === candLang) {
      return 1.0;
    }

    // Cross-regional affinity (e.g. Hindi & Punjabi often blend well in Indian music)
    if ((seedLang === 'hindi' && candLang === 'punjabi') || (seedLang === 'punjabi' && candLang === 'hindi')) {
      return 0.6;
    }

    return 0.2;
  }

  detectLanguage(title = '', artist = '') {
    const text = `${title} ${artist}`.toLowerCase();

    // Devanagari Unicode (Hindi, Marathi, etc.)
    if (/[\u0900-\u097F]/.test(text)) return 'hindi';
    // Gurmukhi Unicode (Punjabi)
    if (/[\u0A00-\u0A7F]/.test(text)) return 'punjabi';
    // Tamil / Telugu / Malayalam / Kannada
    if (/[\u0B80-\u0BFF\u0C00-\u0C7F\u0D00-\u0D7F]/.test(text)) return 'south-indian';

    // Romanized Punjabi keywords
    if (/\b(punjabi|dhillon|sidhu|diljit|karan aujla|shubh|jassi|yaar|gabru|patiala|munda|kudi|bhangra|jatt)\b/i.test(text)) {
      return 'punjabi';
    }

    // Romanized Hindi / Bollywood keywords
    if (/\b(arijit|pritam|shreya|neha kakkar|kumar sanu|alka|sonu nigam|jubin|badshah|t-series|bollywood|kesariya|tum|dil|pyar|ishq|tera|teri|meri|hum|saath|raat|zindagi|aashiqui|channa|tere|deewani|geet|dard|sanam)\b/i.test(text)) {
      return 'hindi';
    }

    return 'english';
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
