/**
 * Aura Music - Context-Aware Recommendation Engine v2
 *
 * Architecture principle:
 *   PLAYBACK ENGINE  (player.js)      → determines WHICH song plays next
 *   RECOMMENDATION ENGINE (this file) → generates CANDIDATE songs for Discovery mode ONLY
 *
 * This engine is NEVER consulted for:
 *   - Favorite Songs playback  (playbackContext.type === 'favorites')
 *   - User-Created Playlist playback (playbackContext.type === 'playlist')
 *
 * Language is a HARD GATE: cross-language recommendations are blocked unless:
 *   (a) the user's listening history clearly shows multilingual preference, OR
 *   (b) there are genuinely insufficient same-language candidates (< 5 after exhaustive search)
 */

import { api } from './api.js';
import { StorageManager } from './storage.js';

// ─── Configurable Weights ────────────────────────────────────────────────────
export const RECOMMENDATION_WEIGHTS = Object.freeze({
  language:    0.30,   // HARD primary gate — boosted from 0.25
  genre:       0.15,
  mood:        0.15,
  similarity:  0.12,
  artist:      0.08,
  energy:      0.07,
  history:     0.07,
  session:     0.04,
  exploration: 0.02
});

// Songs that were played recently are penalised to avoid repetition
export const RECENT_SONG_WINDOW = 12;

// Max proportion of recommendations allowed in a different (but related) language
const CROSS_LANGUAGE_MAX_RATIO = 0.15; // 15% cross-language at most

// How many times the same artist can appear in a single recommendation batch
const MAX_ARTIST_OCCURRENCES = 3;
const MAX_ARTIST_OCCURRENCES_FIRST_TEN = 2;

// Peer-group artist clusters — used to score artist-tier similarity
const ARTIST_PEER_GROUPS = [
  // Hindi Bollywood male vocals
  ['arijit singh', 'atif aslam', 'mohit chauhan', 'jubin nautiyal', 'armaan malik', 'darshan raval', 'javed ali', 'shaan', 'udit narayan', 'sonu nigam', 'kumar sanu', 'vishal mishra', 'b praak'],
  // Hindi Bollywood female vocals
  ['shreya ghoshal', 'neha kakkar', 'alka yagnik', 'tulsi kumar', 'asees kaur', 'jasleen royal', 'sunidhi chauhan', 'monali thakur', 'palak muchhal', 'kanika kapoor'],
  // Punjabi artists
  ['karan aujla', 'ap dhillon', 'diljit dosanjh', 'shubh', 'sidhu moose wala', 'guru randhawa', 'jass manak', 'ammy virk', 'harrdy sandhu', 'babbal rai', 'mankirt aulakh', 'jassi gill'],
  // Bhojpuri artists
  ['pawan singh', 'khesari lal yadav', 'ritesh pandey', 'dinesh lal yadav', 'ankush raja', 'samar singh', 'neelkamal singh', 'gunjan singh', 'awadhesh premi'],
  // Tamil artists
  ['anirudh ravichander', 'yuvan shankar raja', 'harris jayaraj', 'sid sriram', 'dhanush', 'karthik', 'vijay antony', 'ilayaraja', 'a.r. rahman'],
  // Telugu artists
  ['devi sri prasad', 'thaman', 's.s. thaman', 'anirudh telugu', 'sid sriram', 'rahul sipligunj', 'hemachandra'],
  // English pop/indie
  ['taylor swift', 'ed sheeran', 'adele', 'charlie puth', 'shawn mendes', 'dua lipa', 'the weeknd', 'billie eilish', 'olivia rodrigo', 'harry styles'],
  // English hip-hop/r&b
  ['drake', 'post malone', 'juice wrld', 'xxxtentacion', 'khalid', 'joji'],
];

// ─── Engine ──────────────────────────────────────────────────────────────────
export class RecommendationEngine {
  constructor(customWeights = {}) {
    this.weights = { ...RECOMMENDATION_WEIGHTS, ...customWeights };
    // Cache: cacheKey → { timestamp, queue }
    this._queueCache = new Map();
    this._CACHE_TTL_MS = 3 * 60 * 1000; // 3-minute TTL
  }

  /** Override scoring weights at runtime */
  setWeights(newWeights) {
    this.weights = { ...this.weights, ...newWeights };
    this._queueCache.clear();
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Primary entry point.
   * Returns a diversified, language-safe, ranked list of recommended tracks.
   * Must ONLY be called when playbackContext.type is 'browse' / discovery.
   */
  async generateQueue(seedTrack, options = {}) {
    if (!seedTrack) return [];

    const limit = options.limit || 20;
    const currentQueueIds = new Set(options.existingQueueIds || []);
    const seedId = String(seedTrack.id || seedTrack.videoId || '');

    // Check result cache
    const cacheKey = `${seedId}__${limit}`;
    const cached = this._queueCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this._CACHE_TTL_MS) {
      const freshFromCache = cached.queue.filter(
        t => !currentQueueIds.has(t.id) && !currentQueueIds.has(t.videoId)
      );
      if (freshFromCache.length >= 5) return freshFromCache;
    }

    const seedVibe = seedTrack.vibeMetadata || api.extractVibe(seedTrack);

    try {
      // ── Step 1: Fetch raw candidates from YouTube watch-next ──────────────
      let candidates = [];
      try {
        const primaryResult = await api.getRelatedTracks(seedTrack, null, 30);
        candidates = Array.isArray(primaryResult?.tracks) ? [...primaryResult.tracks] : [];
      } catch (e) {
        console.warn('[RecommendationEngine] Primary related-tracks fetch failed', e);
      }

      // ── Step 2: Augment with targeted discovery if sparse ────────────────
      const primaryArtist = StorageManager.parseArtists(seedTrack.artist)[0] || seedTrack.artist || '';
      if (candidates.length < 12) {
        const discoveryQueries = this._buildDiscoveryQueries(seedTrack, seedVibe, primaryArtist);
        try {
          const batches = await Promise.all(discoveryQueries.map(q => api.searchSongs(q, 12)));
          for (const batch of batches) {
            if (Array.isArray(batch)) candidates.push(...batch);
          }
        } catch (e) {
          console.warn('[RecommendationEngine] Discovery queries failed', e);
        }
      }

      // ── Step 3: Language gate + deduplication ─────────────────────────────
      const { sameLangCandidates, crossLangCandidates } = this._partitionByLanguage(
        candidates, seedTrack, seedVibe, seedId, currentQueueIds
      );

      // Build working pool: predominantly same-language
      let workingPool = [...sameLangCandidates];

      // Only fill cross-language if same-language pool is genuinely short
      if (workingPool.length < 8) {
        const userPrefs = StorageManager.getUserPreferences();
        const isMultilingual = this._isMultilingualUser(userPrefs, seedVibe.language);
        if (isMultilingual && crossLangCandidates.length > 0) {
          const allowedCross = Math.max(0, Math.floor(limit * CROSS_LANGUAGE_MAX_RATIO));
          workingPool.push(...crossLangCandidates.slice(0, allowedCross));
        }
      }

      // ── Step 4: Score each candidate ─────────────────────────────────────
      const userPrefs = StorageManager.getUserPreferences();
      const recentPlayedSet = new Set(
        (userPrefs.recentTrackIds || []).slice(0, options.recentSongWindow || RECENT_SONG_WINDOW)
      );
      const sessionContext = options.sessionContext || userPrefs.sessionTrackIds || [];

      const scored = workingPool.map((candidate, index) => {
        const breakdown = this._scoreCandidate(
          candidate, seedTrack, userPrefs, index, workingPool.length,
          { recentPlayed: recentPlayedSet, sessionContext }
        );
        return { track: candidate, score: breakdown.total, breakdown };
      });

      // Sort by final score descending
      scored.sort((a, b) => b.score - a.score);

      // ── Step 5: Prefer fresh over recently-played ─────────────────────────
      const freshScored = scored.filter(item => {
        const key = item.track.videoId || item.track.id;
        return !recentPlayedSet.has(key);
      });
      const recentScored = scored.filter(item => {
        const key = item.track.videoId || item.track.id;
        return recentPlayedSet.has(key);
      });
      const rankedPool = freshScored.length >= Math.min(limit, 10)
        ? freshScored
        : [...freshScored, ...recentScored];

      // ── Step 6: Diversify by artist ───────────────────────────────────────
      const diversified = this._applyArtistDiversity(rankedPool, limit);

      // Cache result
      if (this._queueCache.size > 50) this._queueCache.clear();
      this._queueCache.set(cacheKey, { timestamp: Date.now(), queue: diversified });

      return diversified;
    } catch (err) {
      console.error('[RecommendationEngine] generateQueue failed', err);
      return [];
    }
  }

  /**
   * Replenishment call when the active queue runs low.
   */
  async fetchMoreRecommendations(currentTrack, existingQueue = [], limit = 10) {
    const existingQueueIds = existingQueue.map(t => t.id || t.videoId).filter(Boolean);
    return this.generateQueue(currentTrack, { limit, existingQueueIds });
  }

  // ─── Internal Helpers ────────────────────────────────────────────────────────

  _buildDiscoveryQueries(seedTrack, seedVibe, primaryArtist) {
    const langQuery = seedVibe.language === 'bhojpuri' ? 'bhojpuri'
      : seedVibe.language === 'punjabi'  ? 'punjabi'
      : seedVibe.language === 'tamil'    ? 'tamil'
      : seedVibe.language === 'telugu'   ? 'telugu'
      : seedVibe.language === 'bengali'  ? 'bengali'
      : seedVibe.language === 'hindi'    ? 'hindi bollywood'
      : '';

    const queries = [];
    if (primaryArtist && primaryArtist !== 'YouTube Artist') {
      queries.push(`${primaryArtist} ${seedVibe.mood} songs`);
    }
    if (langQuery) {
      queries.push(`${langQuery} ${seedVibe.mood} songs top hits`);
    }
    if (seedVibe.genreTags && seedVibe.genreTags.length > 0) {
      queries.push(`${seedVibe.genreTags.slice(0, 2).join(' ')} ${seedVibe.mood} songs`);
    }
    return queries.filter(Boolean);
  }

  _partitionByLanguage(candidates, seedTrack, seedVibe, seedId, currentQueueIds) {
    const sameLangCandidates = [];
    const crossLangCandidates = [];
    const seen = new Set([seedId]);
    if (seedTrack.videoId) seen.add(seedTrack.videoId);

    for (const candidate of candidates) {
      const vid = candidate.videoId ||
        (candidate.id && candidate.id.startsWith('yt_') ? candidate.id.replace('yt_', '') : candidate.id);

      if (!vid || seen.has(vid) || seen.has(candidate.id) ||
          currentQueueIds.has(candidate.id) || currentQueueIds.has(vid)) {
        continue;
      }

      // Duration sanity check: 40s – 12min
      const dur = Number(candidate.duration) || 180;
      if (dur < 40 || dur > 720) continue;

      seen.add(vid);
      if (candidate.id) seen.add(candidate.id);

      const candidateVibe = candidate.vibeMetadata || api.extractVibe(candidate);
      candidate.vibeMetadata = candidateVibe; // cache on object for reuse

      if (candidateVibe.language === seedVibe.language) {
        sameLangCandidates.push(candidate);
      } else {
        crossLangCandidates.push(candidate);
      }
    }

    return { sameLangCandidates, crossLangCandidates };
  }

  _isMultilingualUser(userPrefs, seedLanguage) {
    const otherLangs = Object.entries(userPrefs.languages || {})
      .filter(([lang, stat]) => {
        return lang !== seedLanguage &&
          ((stat.playCount || 0) + (stat.completions || 0)) >= 5;
      });
    return otherLangs.length >= 1;
  }

  _applyArtistDiversity(rankedPool, limit) {
    const result = [];
    const artistCounts = {};

    for (const item of rankedPool) {
      const primaryArtist = (
        StorageManager.parseArtists(item.track.artist)[0] || item.track.artist || 'Unknown'
      ).toLowerCase();
      const count = artistCounts[primaryArtist] || 0;

      if (result.length < 10 && count >= MAX_ARTIST_OCCURRENCES_FIRST_TEN) continue;
      if (count >= MAX_ARTIST_OCCURRENCES) continue;

      artistCounts[primaryArtist] = count + 1;
      result.push(item.track);
      if (result.length >= limit) break;
    }

    // Safety fill if diversity was too aggressive
    if (result.length < Math.min(limit, 8)) {
      for (const item of rankedPool) {
        const already = result.some(
          d => d.id === item.track.id || (d.videoId && d.videoId === item.track.videoId)
        );
        if (!already) {
          result.push(item.track);
          if (result.length >= limit) break;
        }
      }
    }

    return result;
  }

  // ─── Multi-Factor Scoring ────────────────────────────────────────────────────

  _scoreCandidate(candidate, seedTrack, userPrefs, rankIndex, totalCandidates, context = {}) {
    const seedVibe = seedTrack.vibeMetadata || api.extractVibe(seedTrack);
    const candVibe = candidate.vibeMetadata  || api.extractVibe(candidate);

    const language    = this._computeLanguageScore(candVibe, seedVibe, userPrefs);
    const genre       = this._computeGenreScore(candVibe, seedVibe);
    const mood        = candVibe.mood === seedVibe.mood ? 1.0 : genre * 0.65;
    const song        = this._computeSongSimilarity(candidate, seedTrack);
    const album       = this._computeAlbumSimilarity(candidate, seedTrack);
    const era         = this._computeEraSimilarity(candVibe, seedVibe);
    const similarity  = (song + album + era) / 3;
    const artist      = this._computeArtistTier(candidate, seedTrack);
    const energy      = this._computeEnergyScore(candVibe, seedVibe);
    const history     = this._computeHistoryScore(candidate, userPrefs);
    const session     = this._computeSessionScore(candidate, seedTrack, context.sessionContext, candVibe, seedVibe);
    const exploration = this._computeExplorationScore(candVibe, seedVibe, rankIndex);

    const recentPenalty = (
      context.recentPlayed?.has(candidate.id) || context.recentPlayed?.has(candidate.videoId)
    ) ? 0.20 : 0;
    const skipPenalty = this._computeSkipPenalty(candidate, userPrefs);

    const W = this.weights;
    const weightSum = W.language + W.genre + W.mood + W.similarity + W.artist +
                      W.energy + W.history + W.session + W.exploration;
    const weightedSum =
      (language    * W.language)    +
      (genre       * W.genre)       +
      (mood        * W.mood)        +
      (similarity  * W.similarity)  +
      (artist      * W.artist)      +
      (energy      * W.energy)      +
      (history     * W.history)     +
      (session     * W.session)     +
      (exploration * W.exploration);

    const total = Math.max(0, Math.min(1, (weightedSum / weightSum) - recentPenalty - skipPenalty));

    return {
      total, language, genre, mood, similarity, song, album, era,
      artist, energy, history, session, exploration, recentPenalty, skipPenalty, vibe: candVibe
    };
  }

  /**
   * Language Score: 0 | 0.35 | 1.0
   *
   * 1.0  → same language (always)
   * 0.35 → different language, user has proven multilingual taste (>=5 events in both)
   * 0.0  → different language, insufficient cross-language history
   */
  _computeLanguageScore(candVibe, seedVibe, userPrefs) {
    if (candVibe.language === seedVibe.language) return 1.0;

    const seedLangStat = userPrefs.languages?.[seedVibe.language];
    const candLangStat = userPrefs.languages?.[candVibe.language];
    const seedPlays = (seedLangStat?.playCount || 0) + (seedLangStat?.completions || 0);
    const candPlays = (candLangStat?.playCount || 0) + (candLangStat?.completions || 0);

    if (seedPlays >= 5 && candPlays >= 5) {
      // Reduce further based on user's skip rate in the candidate language
      const candSkips = candLangStat?.skips || 0;
      const skipRatio = candPlays > 0 ? candSkips / candPlays : 0;
      return Math.max(0, 0.35 - (skipRatio * 0.25));
    }

    return 0;
  }

  _computeGenreScore(candVibe, seedVibe) {
    const sharedGenres = (seedVibe.genreTags || []).filter(
      tag => (candVibe.genreTags || []).includes(tag)
    ).length;

    if (sharedGenres > 0 && seedVibe.mood === candVibe.mood) return 1.0;
    if (sharedGenres > 0) return 0.80;
    if (seedVibe.mood === candVibe.mood) return 0.90;

    const complementary = {
      romantic:  ['chill', 'sad'],
      chill:     ['romantic', 'happy'],
      happy:     ['energetic', 'chill'],
      energetic: ['happy'],
      sad:       ['romantic', 'chill']
    };
    if (complementary[seedVibe.mood]?.includes(candVibe.mood)) return 0.60;

    const opposites = {
      sad:       ['energetic', 'happy'],
      happy:     ['sad'],
      chill:     ['energetic'],
      energetic: ['sad', 'chill']
    };
    if (opposites[seedVibe.mood]?.includes(candVibe.mood)) return 0.10;

    return 0.35;
  }

  _computeArtistTier(candidate, seedTrack) {
    const seedArtists = StorageManager.parseArtists(seedTrack.artist).map(a => a.toLowerCase());
    const candArtists = StorageManager.parseArtists(candidate.artist).map(a => a.toLowerCase());

    const directMatch = seedArtists.some(sa =>
      candArtists.some(ca => ca === sa || ca.includes(sa) || sa.includes(ca))
    );
    if (directMatch) return 1.0;

    for (const group of ARTIST_PEER_GROUPS) {
      const seedIn = seedArtists.some(sa => group.some(peer => sa.includes(peer) || peer.includes(sa)));
      const candIn = candArtists.some(ca => group.some(peer => ca.includes(peer) || peer.includes(ca)));
      if (seedIn && candIn) return 0.75;
    }

    return 0.18;
  }

  _computeEnergyScore(candVibe, seedVibe) {
    const distance  = Math.abs((candVibe.energy ?? 0.5) - (seedVibe.energy ?? 0.5));
    const tempoBonus = (candVibe.tempo === seedVibe.tempo) ? 0.15 : 0;
    return Math.max(0, Math.min(1, 1 - distance + tempoBonus));
  }

  _computeSessionScore(candidate, seedTrack, sessionTrackIds, candVibe, seedVibe) {
    if (!Array.isArray(sessionTrackIds) || sessionTrackIds.length === 0) {
      return candVibe.language === seedVibe.language ? 0.55 : 0;
    }
    // Hard 0 for cross-language candidates
    if (candVibe.language !== seedVibe.language) return 0;

    const sessionVibes = sessionTrackIds
      .map(item => (typeof item === 'object' ? (item.vibeMetadata || api.extractVibe(item)) : null))
      .filter(Boolean);

    if (sessionVibes.length === 0) return 0.55;

    const langMatch = sessionVibes.filter(v => v.language === candVibe.language).length / sessionVibes.length;
    const moodMatch = sessionVibes.filter(v => v.mood === candVibe.mood).length / sessionVibes.length;

    return 0.55 + (langMatch * 0.20) + (moodMatch * 0.10);
  }

  _computeExplorationScore(candVibe, seedVibe, rankIndex) {
    if (candVibe.language !== seedVibe.language) return 0;
    return rankIndex < 5 && candVibe.mood === seedVibe.mood ? 0.20 : 0.05;
  }

  _computeSongSimilarity(candidate, seedTrack) {
    const stopwords = /^(song|video|audio|lyrics|version|remix|official|full|original|ft|feat|and|the|a|in|on|of)$/i;
    const clean = str => (str || '').toLowerCase()
      .replace(/[^a-z0-9\s\u0900-\u097F\u0A00-\u0A7F]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.test(w));

    const seedWords = clean(seedTrack.title);
    const candWords = clean(candidate.title);
    if (!seedWords.length || !candWords.length) return 0.5;

    const matches = candWords.filter(w => seedWords.includes(w));
    if (matches.length >= 2) return 0.9;
    if (matches.length === 1) return 0.7;

    const seedDur = seedTrack.duration || 180;
    const candDur = candidate.duration  || 180;
    return 0.3 + (Math.min(seedDur, candDur) / Math.max(seedDur, candDur)) * 0.2;
  }

  _computeAlbumSimilarity(candidate, seedTrack) {
    const s = String(seedTrack.album || '').toLowerCase().trim();
    const c = String(candidate.album  || '').toLowerCase().trim();
    if (!s || !c || s === 'youtube music' || c === 'youtube music') return 0.5;
    if (s === c) return 1.0;
    if (s.includes(c) || c.includes(s)) return 0.8;
    return 0.2;
  }

  _computeEraSimilarity(candVibe, seedVibe) {
    if (!candVibe.year || !seedVibe.year) return 0.5;
    return Math.max(0, 1 - Math.abs(candVibe.year - seedVibe.year) / 20);
  }

  _computeHistoryScore(candidate, userPrefs) {
    if (!userPrefs || !userPrefs.artists) return 0.5;

    const candArtists = StorageManager.parseArtists(candidate.artist);
    const candVibe = candidate.vibeMetadata || api.extractVibe(candidate);
    let total = 0, count = 0;

    for (const art of candArtists) {
      const stat = userPrefs.artists[art.toLowerCase()];
      if (stat) { total += stat.score || 0; count++; }
    }

    const moodStr  = (candVibe.mood || 'chill').toLowerCase();
    const genreStr = (candidate.genre || candVibe.genreTags?.[0] || moodStr).toLowerCase();
    const langStr  = candVibe.language;

    [
      userPrefs.genres?.[genreStr],
      userPrefs.languages?.[langStr],
      userPrefs.moods?.[moodStr]
    ].forEach(stat => {
      if (stat) { total += (stat.score || 0) * 0.5; count += 0.5; }
    });

    const trackStat = userPrefs.tracks?.[candidate.id] || userPrefs.tracks?.[candidate.videoId];
    if (trackStat) {
      total += ((trackStat.replays || 0) * 1.5) + ((trackStat.completions || 0) * 0.75);
      count += 1;
    }

    if (count === 0) return 0.5;
    return Math.max(0.1, Math.min(1.0, 0.5 + Math.tanh(total / count / 5) * 0.5));
  }

  _computeSkipPenalty(candidate, userPrefs) {
    const trackStat  = userPrefs?.tracks?.[candidate.id] || userPrefs?.tracks?.[candidate.videoId];
    const artistStats = StorageManager.parseArtists(candidate.artist)
      .map(a => userPrefs?.artists?.[a.toLowerCase()])
      .filter(Boolean);
    const candVibe   = candidate.vibeMetadata || api.extractVibe(candidate);
    const langStat   = userPrefs?.languages?.[candVibe.language];

    const trackSkips  = trackStat?.skips || 0;
    const artistSkips = artistStats.reduce((sum, s) => sum + (s.skips || 0), 0);
    const langSkips   = langStat?.skips || 0;
    const langPlays   = Math.max(1, (langStat?.playCount || 0) + (langStat?.completions || 0));
    const langSkipRatio = langSkips / langPlays;

    return Math.min(0.25,
      (trackSkips  * 0.04)  +
      (artistSkips * 0.012) +
      (langSkipRatio * 0.08)
    );
  }
}

// ─── Singleton Export ────────────────────────────────────────────────────────
export const recommendationEngine = new RecommendationEngine();
