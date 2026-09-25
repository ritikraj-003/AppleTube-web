/**
 * Aura Music - Multi-Source Music API Client with Live YouTube Database Engine
 */

import { CONFIG } from './config.js';
import { OVERALL_TRAVEL_SONGS } from './travelData.js';
import { StorageManager } from './storage.js';

class MusicAPI {
  constructor() {
    this.searchCache = new Map();
    this.suggestionsCache = new Map(); // key → { data, timestamp }
    this._SUGG_CACHE_TTL = 30 * 1000; // 30-second TTL so recent activity shows up quickly
    this.ytMirrorIndex = 0;
    this.saavnMirrorIndex = 0;
    this.audiusMirrorIndex = 0;
    this.radioMirrorIndex = 0;
    this.hasLiveBackend = null; // Autodetected on first call
  }

  /** Call this after user likes/unlikes a song so local suggestions refresh */
  invalidateSuggestionsCache() {
    this.suggestionsCache.clear();
  }

  // --- Helpers ---
  decodeHtml(str) {
    if (!str) return '';
    const txt = document.createElement('textarea');
    txt.innerHTML = str;
    return txt.value;
  }

  cleanYouTubeTitle(title) {
    if (!title) return 'YouTube Music';
    return title
      .replace(/\(Official (Music )?Video\)/gi, '')
      .replace(/\[Official (Music )?Video\]/gi, '')
      .replace(/\(Official Audio\)/gi, '')
      .replace(/\[Official Audio\]/gi, '')
      .replace(/\(Lyric Video\)/gi, '')
      .replace(/\[Lyrics\]/gi, '')
      .replace(/\(Visualizer\)/gi, '')
      .replace(/\|.*$/g, '')
      .trim();
  }

  getBestImageUrl(images) {
    if (!images) return 'assets/default-cover.svg';
    if (typeof images === 'string') return images;
    if (Array.isArray(images)) {
      const highRes = images.find(img => img.quality === '500x500' || img.quality === 'large') ||
                      images[images.length - 1];
      return highRes?.url || highRes?.link || 'assets/default-cover.svg';
    }
    if (typeof images === 'object') {
      return images['480x480'] || images['1000x1000'] || images['150x150'] || 'assets/default-cover.svg';
    }
    return 'assets/default-cover.svg';
  }

  getBestAudioUrl(downloadUrl, mediaUrl, previewUrl) {
    if (Array.isArray(downloadUrl) && downloadUrl.length > 0) {
      const highQuality = downloadUrl.find(d => d.quality === '320kbps' || d.quality === '160kbps') ||
                          downloadUrl[downloadUrl.length - 1];
      const direct = highQuality?.url || highQuality?.link;
      if (direct) return direct;
    }
    if (typeof downloadUrl === 'string' && downloadUrl.startsWith('http')) return downloadUrl;
    if (mediaUrl && mediaUrl.startsWith('http')) return mediaUrl;
    if (previewUrl && previewUrl.startsWith('http')) return previewUrl;
    return null;
  }

  // --- Live Backend Health Detector ---
  async checkLiveBackend() {
    if (this.hasLiveBackend === true) return true;
    try {
      const res = await fetch('/api/status', { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        this.hasLiveBackend = data?.status === 'online';
        return this.hasLiveBackend;
      }
    } catch (e) {
      // Do not permanently latch hasLiveBackend to false on a single transient timeout
    }
    return false;
  }

  // --- 1. Live YouTube Search (via Live Backend or Invidious) ---
  async searchYouTube(query, limit = 30) {
    // 1A. Try local live server backend first (InnerTube live database)
    const isLive = await this.checkLiveBackend();
    const shouldTryBackend = isLive || this.hasLiveBackend !== false || (typeof window !== 'undefined' && Boolean(window.location?.origin));
    if (shouldTryBackend) {
      try {
        const res = await fetch(`/api/yt/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
          signal: AbortSignal.timeout(8000)
        });
        if (res.ok) {
          const items = await res.json();
          if (Array.isArray(items) && items.length > 0) {
            this.hasLiveBackend = true;
            return items;
          }
        }
        if (res.status >= 500) {
          console.warn(`[Music] Live search service returned HTTP ${res.status}`);
        }
      } catch (e) {
        console.warn('Live backend query timed out, falling back to public mirrors...');
      }
    }

    // 1B. Fallback: Query public Invidious instances
    for (let i = 0; i < CONFIG.YOUTUBE_INVIDIOUS_MIRRORS.length; i++) {
      const mirror = CONFIG.YOUTUBE_INVIDIOUS_MIRRORS[(this.ytMirrorIndex + i) % CONFIG.YOUTUBE_INVIDIOUS_MIRRORS.length];
      try {
        const url = `${mirror}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) continue;

        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.ytMirrorIndex = (this.ytMirrorIndex + i) % CONFIG.YOUTUBE_INVIDIOUS_MIRRORS.length;
          return data.slice(0, limit).map(item => {
            const videoId = item.videoId;
            const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
            const directAudio = `${mirror}/latest_version?id=${videoId}&itag=140`;

            return {
              id: 'yt_' + videoId,
              videoId: videoId,
              title: this.cleanYouTubeTitle(this.decodeHtml(item.title)),
              artist: this.decodeHtml(item.author || 'YouTube Artist'),
              album: 'YouTube Music',
              duration: parseInt(item.lengthSeconds, 10) || 180,
              image: thumbnail,
              audioUrl: directAudio,
              source: 'YouTube Live',
              mirror: mirror,
              hasLyrics: false
            };
          });
        }
      } catch (err) {}
    }
    return [];
  }

  // --- 1B. Live Search Suggestions (Autocomplete & Quick Songs) ---
  async getSearchSuggestions(query, limit = 8) {
    if (!query || !query.trim()) {
      return { query: '', suggestions: [], songs: [] };
    }
    const trimmed = query.trim();
    const cacheKey = trimmed.toLowerCase();
    // TTL-aware cache check
    const cached = this.suggestionsCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < this._SUGG_CACHE_TTL) {
      return cached.data;
    }

    // Always compute local results immediately (fast, no network)
    const localResult = this._buildLocalSuggestions(trimmed, cacheKey, limit);

    // Attempt to enhance with live backend suggestions
    try {
      const res = await fetch(`/api/yt/suggestions?q=${encodeURIComponent(trimmed)}&limit=${limit}`, {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          // Merge: local song matches first (they are faster/more personalised),
          // then append live suggestions that weren't already in local results.
          const mergedSongs = [...localResult.songs];
          const localIds = new Set(localResult.songs.map(s => s.id));
          for (const s of (data.songs || [])) {
            if (!localIds.has(s.id) && mergedSongs.length < limit) mergedSongs.push(s);
          }
          const merged = {
            query: trimmed,
            songs: mergedSongs,
            suggestions: data.suggestions || localResult.suggestions
          };
          this.suggestionsCache.set(cacheKey, { data: merged, ts: Date.now() });
          return merged;
        }
      }
    } catch (e) {
      // Fall through to local-only result
    }

    this.suggestionsCache.set(cacheKey, { data: localResult, ts: Date.now() });
    return localResult;
  }

  /**
   * Build search suggestions entirely from local data sources.
   * Searches: liked songs, recent tracks, playlist tracks, curated tracks.
   * Boosts recently-played and favorited songs for personalised ranking.
   */
  _buildLocalSuggestions(query, queryLower, limit = 8) {
    let liked = [], recent = [], playlistTracks = [];
    try {
      liked         = StorageManager.getLikedSongs();
      recent        = StorageManager.getRecentTracks();
      playlistTracks = StorageManager.getPlaylists().flatMap(p => p.tracks || []);
    } catch (e) {}

    const likedIds  = new Set(liked.map(t => t.id));
    const recentIds = new Set(recent.slice(0, 20).map(t => t.id));

    // Gather candidates: liked > recent > playlist > curated (priority order for dedup)
    const allCandidates = [...liked, ...recent, ...playlistTracks, ...CONFIG.CURATED_TRACKS];

    // Deduplicate by id
    const seen = new Set();
    const unique = [];
    for (const t of allCandidates) {
      if (!t || !t.id || seen.has(t.id)) continue;
      seen.add(t.id);
      unique.push(t);
    }

    // Filter: partial, case-insensitive match on title, artist, or album
    const matched = unique.filter(t => {
      const haystack = `${t.title || ''} ${t.artist || ''} ${t.album || ''}`.toLowerCase();
      return haystack.includes(queryLower);
    });

    // Sort by relevance score
    matched.sort((a, b) => {
      const score = (t) => {
        const title  = (t.title  || '').toLowerCase();
        const artist = (t.artist || '').toLowerCase();
        let s = 0;
        if (title.startsWith(queryLower))      s += 50;
        else if (title.includes(queryLower))   s += 30;
        if (artist.startsWith(queryLower))     s += 25;
        else if (artist.includes(queryLower))  s += 15;
        if (likedIds.has(t.id))                s += 20;
        if (recentIds.has(t.id))               s += 10;
        return s;
      };
      return score(b) - score(a);
    });

    const songs = matched.slice(0, limit);
    return {
      query,
      songs,
      suggestions: songs.length > 0 ? [] : [query]
    };
  }

  // --- 2. Live YouTube Trending Music ---
  async getYouTubeTrending() {
    const isLive = await this.checkLiveBackend();
    if (isLive) {
      try {
        const res = await fetch('/api/yt/trending', { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const items = await res.json();
          if (Array.isArray(items) && items.length > 0) {
            return items;
          }
        }
      } catch (e) {}
    }

    // Fallback Invidious trending
    for (let i = 0; i < CONFIG.YOUTUBE_INVIDIOUS_MIRRORS.length; i++) {
      const mirror = CONFIG.YOUTUBE_INVIDIOUS_MIRRORS[(this.ytMirrorIndex + i) % CONFIG.YOUTUBE_INVIDIOUS_MIRRORS.length];
      try {
        const url = `${mirror}/api/v1/trending?type=music`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) continue;

        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          this.ytMirrorIndex = (this.ytMirrorIndex + i) % CONFIG.YOUTUBE_INVIDIOUS_MIRRORS.length;
          return data.slice(0, 25).map(item => ({
            id: 'yt_' + item.videoId,
            videoId: item.videoId,
            title: this.cleanYouTubeTitle(this.decodeHtml(item.title)),
            artist: this.decodeHtml(item.author || 'Trending Artist'),
            album: 'Trending Hits',
            duration: parseInt(item.lengthSeconds, 10) || 180,
            image: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
            audioUrl: `${mirror}/latest_version?id=${item.videoId}&itag=140`,
            source: 'Trending Hits',
            mirror: mirror,
            hasLyrics: false
          }));
        }
      } catch (e) {}
    }
    return [];
  }

  // --- Unified Multi-Source Search (Live YouTube Priority) ---
  async searchSongs(query, limit = 30) {
    if (!query || !query.trim()) return [];
    const trimmed = query.trim().toLowerCase();
    if (this.searchCache.has(trimmed)) {
      return this.searchCache.get(trimmed);
    }

    let results = [];

    // 1. Live YouTube Database search
    try {
      results = await this.searchYouTube(trimmed, limit);
    } catch (e) {
      console.warn('YouTube live search failed, trying alternative mirrors...', e);
    }

    // 2. JioSaavn (Bollywood / Global catalog) if YouTube returned few results
    if (!results || results.length < 5) {
      try {
        const saavnResults = await this.searchJioSaavn(trimmed, limit);
        if (saavnResults && saavnResults.length > 0) {
          results = [...(results || []), ...saavnResults];
        }
      } catch (e) {}
    }

    // 3. Fallback to Audius
    if (!results || results.length === 0) {
      try {
        const audiusResults = await this.searchAudius(trimmed, limit);
        if (audiusResults && audiusResults.length > 0) {
          results = audiusResults;
        }
      } catch (e) {}
    }

    // 4. Fallback to curated tracks
    if (!results || results.length === 0) {
      results = CONFIG.CURATED_TRACKS.filter(t =>
        t.title.toLowerCase().includes(trimmed) ||
        t.artist.toLowerCase().includes(trimmed) ||
        t.album.toLowerCase().includes(trimmed)
      );
    }

    this.searchCache.set(trimmed, results);
    return results;
  }

  // --- JioSaavn API Implementation ---
  async searchJioSaavn(query, limit = 20) {
    for (let i = 0; i < CONFIG.SAAVN_API_MIRRORS.length; i++) {
      const mirror = CONFIG.SAAVN_API_MIRRORS[(this.saavnMirrorIndex + i) % CONFIG.SAAVN_API_MIRRORS.length];
      try {
        const url = `${mirror}/search/songs?query=${encodeURIComponent(query)}&page=1&limit=${limit}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) continue;

        const json = await res.json();
        const items = json?.data?.results || json?.results || (Array.isArray(json?.data) ? json.data : null);
        if (Array.isArray(items) && items.length > 0) {
          this.saavnMirrorIndex = (this.saavnMirrorIndex + i) % CONFIG.SAAVN_API_MIRRORS.length;
          return items.map(item => {
            const audioUrl = this.getBestAudioUrl(item.downloadUrl, item.media_url, item.media_preview_url);
            return {
              id: 'saavn_' + (item.id || Math.random().toString(36).substr(2, 9)),
              rawId: item.id,
              title: this.decodeHtml(item.name || item.title || item.song),
              artist: this.decodeHtml(item.primaryArtists || item.singers || item.artist || 'Aura Music'),
              album: this.decodeHtml(item.album?.name || item.album || ''),
              duration: parseInt(item.duration, 10) || 180,
              image: this.getBestImageUrl(item.image),
              audioUrl: audioUrl,
              hasLyrics: Boolean(item.hasLyrics === 'true' || item.lyrics),
              source: 'JioSaavn'
            };
          }).filter(t => Boolean(t.audioUrl));
        }
      } catch (err) {}
    }
    return [];
  }

  // --- Audius API Implementation ---
  async searchAudius(query, limit = 20) {
    for (let i = 0; i < CONFIG.AUDIUS_API_MIRRORS.length; i++) {
      const mirror = CONFIG.AUDIUS_API_MIRRORS[(this.audiusMirrorIndex + i) % CONFIG.AUDIUS_API_MIRRORS.length];
      try {
        const url = `${mirror}/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}&app_name=AURA_MUSIC`;
        const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) continue;

        const json = await res.json();
        const tracks = json?.data;
        if (Array.isArray(tracks) && tracks.length > 0) {
          this.audiusMirrorIndex = (this.audiusMirrorIndex + i) % CONFIG.AUDIUS_API_MIRRORS.length;
          return tracks.map(track => ({
            id: 'audius_' + track.id,
            rawId: track.id,
            title: track.title,
            artist: track.user?.name || 'Independent Artist',
            album: track.genre || 'Trending',
            duration: Math.round(track.duration) || 180,
            image: this.getBestImageUrl(track.artwork),
            audioUrl: `${mirror}/tracks/${track.id}/stream?app_name=AURA_MUSIC`,
            source: 'Audius',
            hasLyrics: false
          }));
        }
      } catch (err) {}
    }
    return [];
  }

  // --- Trending Tracks (Live YouTube First) ---
  async getTrendingTracks() {
    const localizedTracks = await this.getLocalizedHomeTracks();
    if (localizedTracks.length > 0) return localizedTracks;
    return OVERALL_TRAVEL_SONGS.slice(0, 15);
  }

  isHindiPunjabiTrack(track) {
    const text = `${track?.title || ''} ${track?.artist || ''} ${track?.album || ''}`.toLowerCase();
    const artists = [
      'arijit', 'diljit', 'karan aujla', 'ap dhillon', 'sidhu moose', 'pritam',
      'shreya ghoshal', 'atif aslam', 'ar rahman', 'a.r. rahman', 'mohit chauhan',
      'lucky ali', 'shankar mahadevan', 'sunidhi chauhan', 'badshah', 'guru randhawa',
      'neha kakkar', 'jass manak', 'ammy virk', 'gippy grewal', 'harrdy sandhu',
      'vishal mishra', 'anuv jain', 'amit trivedi', 'sonu nigam', 'monali thakur'
    ];
    const languageMarkers = [
      'hindi', 'punjabi', 'bollywood', 'desi', 'bhangra', 'indian music', 't-series',
      'saregama', 'zee music', 'speed records', 'punjabi hits', 'hindi hits'
    ];
    return artists.some(artist => text.includes(artist)) ||
      languageMarkers.some(marker => text.includes(marker));
  }

  async getLocalizedHomeTracks() {
    const queries = [
      'trending Hindi Bollywood songs latest hits Arijit Singh Shreya Ghoshal',
      'trending Punjabi songs latest hits Diljit Dosanjh Karan Aujla AP Dhillon'
    ];
    const results = await Promise.all(queries.map(query => this.searchSongs(query, 20)));
    const seen = new Set();
    return results.flat()
      .filter(track => {
        const id = track?.videoId || track?.id;
        if (!track || !id || seen.has(id) || !this.isHindiPunjabiTrack(track)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 30);
  }

  async getGenericTrendingTracks() {
    try {
      const ytTrending = await this.getYouTubeTrending();
      if (ytTrending && ytTrending.length > 0) {
        return [...ytTrending, ...CONFIG.CURATED_TRACKS];
      }
    } catch (e) {}

    // Audius fallback
    try {
      const mirror = CONFIG.AUDIUS_API_MIRRORS[this.audiusMirrorIndex];
      const res = await fetch(`${mirror}/tracks/trending?limit=15&app_name=AURA_MUSIC`, {
        signal: AbortSignal.timeout(4000)
      });
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json?.data) && json.data.length > 0) {
          const trendingAudius = json.data.map(track => ({
            id: 'audius_' + track.id,
            rawId: track.id,
            title: track.title,
            artist: track.user?.name || 'Top Artist',
            album: track.genre || 'Trending',
            duration: Math.round(track.duration) || 180,
            image: this.getBestImageUrl(track.artwork),
            audioUrl: `${mirror}/tracks/${track.id}/stream?app_name=AURA_MUSIC`,
            source: 'Audius Trending',
            hasLyrics: false
          }));
          return [...trendingAudius, ...CONFIG.CURATED_TRACKS];
        }
      }
    } catch (e) {}

    return OVERALL_TRAVEL_SONGS.slice(0, 15);
  }

  // --- Genre / Category Tracks ---
  async getGenreTracks(genreId) {
    if (genreId === 'all') {
      return this.getTrendingTracks();
    }
    if (genreId === 'youtube_trending') {
      return this.getYouTubeTrending();
    }
    if (genreId === 'radio') {
      return this.getLiveRadioStations();
    }

    const genreQueries = {
      bollywood: 'bollywood latest hits songs 2026',
      punjabi: 'punjabi top 50 hits songs',
      pop: 'billboard hot 100 pop songs',
      lofi: 'lofi chill beats to relax and study',
      hiphop: 'hip hop rap latest hits songs',
      electronic: 'edm dance festival top tracks'
    };

    const query = genreQueries[genreId] || genreId;
    return this.searchSongs(query, 25);
  }

  // --- Live Radio Stations ---
  async getLiveRadioStations(category = 'top') {
    for (let i = 0; i < CONFIG.RADIO_API_MIRRORS.length; i++) {
      const mirror = CONFIG.RADIO_API_MIRRORS[(this.radioMirrorIndex + i) % CONFIG.RADIO_API_MIRRORS.length];
      try {
        let url = `${mirror}/stations/topclick/25`;
        if (category && category !== 'top') {
          url = `${mirror}/stations/bytag/${encodeURIComponent(category)}?limit=25`;
        }

        const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
        if (!res.ok) continue;

        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          this.radioMirrorIndex = (this.radioMirrorIndex + i) % CONFIG.RADIO_API_MIRRORS.length;
          const stations = list.map(item => ({
            id: 'radio_' + (item.stationuuid || Math.random().toString(36).substr(2, 9)),
            title: item.name?.trim() || 'Online Radio',
            artist: item.country ? `${item.country} • ${item.tags?.split(',').slice(0, 2).join(', ')}` : 'Live Stream',
            album: 'Live Radio Station',
            duration: 0,
            isLive: true,
            image: item.favicon || 'assets/default-cover.svg',
            audioUrl: item.url_resolved || item.url,
            source: 'Live Radio',
            hasLyrics: false
          })).filter(s => Boolean(s.audioUrl));

          return [...CONFIG.CURATED_RADIO, ...stations];
        }
      } catch (err) {}
    }
    return CONFIG.CURATED_RADIO;
  }

  // --- Lyrics Fetcher ---
  async getLyrics(track) {
    if (!track) return null;
    if (track.lyrics) return track.lyrics;

    // Saavn lyrics
    if (track.rawId && track.id.startsWith('saavn_')) {
      for (const mirror of CONFIG.SAAVN_API_MIRRORS) {
        try {
          const res = await fetch(`${mirror}/songs/${track.rawId}/lyrics`, {
            signal: AbortSignal.timeout(4000)
          });
          if (res.ok) {
            const json = await res.json();
            const lyricsData = json?.data?.lyrics || json?.lyrics;
            if (lyricsData) return this.decodeHtml(lyricsData);
          }
        } catch (e) {}
      }
    }

    return null;
  }

  // --- Mood Detection & Categorization Engine ---
  detectMood(track) {
    if (!track) return 'chill';
    if (track.mood) return track.mood;

    const text = `${track.title || ''} ${track.artist || ''} ${track.album || ''}`.toLowerCase();

    const moodKeywords = {
      sad: [
        'sad', 'dard', 'heartbreak', 'crying', 'broken', 'lonely', 'tear', 'alone', 'miss you',
        'judaai', 'rona', 'slowed', 'reverb', 'melancholy', 'depressing', 'depressed', 'acoustic',
        'dard bhare', 'gam', 'alvida', 'goodbye', 'hurt', 'pain', 'channa mereya', 'tujhe bhula diya',
        'agar tum saath ho', 'tum hi ho', 'phir bhi tumko chaahunga', 'bekhayali', 'judai', 'judaiyaan',
        'bewafa', 'tanha', 'tanhaai', 'emotional', 'acoustic version', 'sad version', 'piano version',
        'unplugged', 'breakup', 'someone like you', 'drivers license', 'traitor',
        'all too well', 'drown', 'grief', 'broken heart', 'sad lofi', 'mann bharryaa'
      ],
      happy: [
        'happy', 'party', 'dance', 'celebration', 'fun', 'joy', 'cheerful', 'smile', 'club',
        'groove', 'remix', 'bhangra', 'nacho', 'dhamaka', 'masti', 'disco', 'upbeat', 'bouncy',
        'sunny', 'feel good', 'summer', 'excited', 'hookah bar', 'kala chashma', 'kar gayi chull',
        'london thumakda', 'party all night', 'abhi toh party', 'high rated gabru', "can't stop the feeling",
        'uptown funk', 'levitating', 'good time', 'celebrate', 'cheers', 'dhol', 'bhangra hits',
        '24k magic', 'dynamite', 'butter', 'peppy', 'dhamakedar', 'proper patola', 'bom diggy'
      ],
      romantic: [
        'love', 'romantic', 'romance', 'pyaar', 'ishq', 'dil', 'mohabbat', 'humsafar', 'deewana',
        'crush', 'sweetheart', 'kiss', 'forever', 'valentine', 'sanam', 'pehla nasha',
        'raataan lambiyan', 'kesariya', 'shayad', 'tum se hi', 'enchanted', 'lover', 'perfect',
        'golden hour', 'tera ban jaunga', 'khairiyat', 'mast magan', 'tum mile', 'shiddat'
      ],
      chill: [
        'chill', 'lofi', 'lo-fi', 'relax', 'sleep', 'calm', 'coffee', 'study', 'peace', 'soft',
        'night drive', 'vibes', 'breeze', 'ambient', 'deep focus', 'rain', 'midnight', 'slow down'
      ],
      energetic: [
        'gym', 'workout', 'motivation', 'hardstyle', 'bass boosted', 'trap', 'phonk', 'aggressive',
        'power', 'beast', 'rock', 'metal', 'hype', 'workout mix', 'pump up', 'monster', 'believer'
      ]
    };

    const scores = { sad: 0, happy: 0, romantic: 0, chill: 0, energetic: 0 };
    for (const [mood, kws] of Object.entries(moodKeywords)) {
      for (const kw of kws) {
        if (text.includes(kw)) {
          scores[mood] += kw.length > 5 ? 3 : 2;
        }
      }
    }

    let bestMood = 'chill';
    let maxScore = 0;
    for (const [mood, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestMood = mood;
      }
    }

    return bestMood;
  }

  getMoodMetadata(moodKey) {
    const meta = {
      sad: { key: 'sad', label: 'Sad & Emotional', emoji: '😢', badgeClass: 'mood-sad', color: '#60a5fa' },
      happy: { key: 'happy', label: 'Happy & Upbeat', emoji: '😊', badgeClass: 'mood-happy', color: '#f59e0b' },
      romantic: { key: 'romantic', label: 'Romantic & Love', emoji: '❤️', badgeClass: 'mood-romantic', color: '#ec4899' },
      chill: { key: 'chill', label: 'Chill & Lo-Fi', emoji: '☕', badgeClass: 'mood-chill', color: '#10b981' },
      energetic: { key: 'energetic', label: 'Energetic & Party', emoji: '⚡', badgeClass: 'mood-energetic', color: '#8b5cf6' }
    };
    return meta[moodKey] || meta.chill;
  }

  detectLanguage(title = '', artist = '') {
    // Cache key: use first 80 chars of combined text to avoid expensive regex on identical strings
    const cacheKey = `${title}||${artist}`.slice(0, 80);
    if (this._langCache && this._langCache.has(cacheKey)) return this._langCache.get(cacheKey);
    if (!this._langCache) this._langCache = new Map();
    const text = `${title} ${artist}`.toLowerCase();

    let lang = this._detectLanguageInternal(text);

    // Evict cache if too large
    if (this._langCache.size > 300) this._langCache.clear();
    this._langCache.set(cacheKey, lang);
    return lang;
  }

  _detectLanguageInternal(text) {
    // CRITICAL ORDER: Bhojpuri uses Devanagari script — check by artist/keyword FIRST
    // so Bhojpuri songs are not wrongly classified as Hindi.
    if (/\b(bhojpuri|pawan singh|khesari lal yadav|khesari lal|shilpi raj|neelkamal singh|ritesh pandey|ankush raja|antra singh priyanka|antra singh|kalpana patowary|bhojpuriya|dinesh lal yadav|nirahua|gunjan singh|samar singh|awadhesh premi|sharda sinha|manoj tiwari|ravi kishan|devi|kajal raghwani|amrapali dubey)\b/i.test(text)) return 'bhojpuri';

    // Punjabi Gurmukhi script is the strongest signal
    if (/[\u0A00-\u0A7F]/.test(text)) return 'punjabi';

    // Devanagari script covers Hindi, Marathi, Bhojpuri — already excluded Bhojpuri above
    if (/[\u0900-\u097F]/.test(text)) return 'hindi';

    if (/[\u0980-\u09FF]/.test(text)) return 'bengali';
    if (/[\u0B80-\u0BFF]/.test(text)) return 'tamil';
    if (/[\u0C00-\u0C7F]/.test(text)) return 'telugu';
    if (/[\u0D00-\u0D7F]/.test(text)) return 'malayalam';
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kannada';

    // Keyword-based detection for Latin-script titles (artist/label names are reliable signals)
    // Punjabi keywords (must come before Hindi to avoid Punjabi artists being tagged Hindi)
    if (/\b(punjabi|diljit|karan aujla|ap dhillon|sidhu moose wala|shubh|jass manak|ammy virk|gippy grewal|harrdy sandhu|jassi gill|mankirt aulakh|guru randhawa|badsha|dhillon|gabru|jatt|bhangra|chandigarh|patiala|ludhiana|speed records|t-series apna punjab|white hill music)\b/i.test(text)) return 'punjabi';

    // Tamil keywords
    if (/\b(tamil|kollywood|anirudh|yuvan|harris jayaraj|sid sriram|sid sri ram|rahman tamil|a\.r\. rahman tamil|dhanush|vijay|ajith|rajinikanth|ilayaraja|vijay antony|vijay sethupathi|sivakarthikeyan|karthik|andrea jeremiah|chinmayi|sony music south tamil|sun tv)\b/i.test(text)) return 'tamil';

    // Telugu keywords
    if (/\b(telugu|tollywood|s\.s\. rajamouli|ss rajamouli|devi sri prasad|thaman|prabhas|allu arjun|ram charan|ntr|mahesh babu|anirudh telugu|adivi sesh|sid sriram telugu|shreya ghoshal telugu|chinmayi telugu|sony music south telugu|aditya music|lahari music|t-series telugu)\b/i.test(text)) return 'telugu';

    // Hindi Bollywood keywords
    if (/\b(arijit singh|atif aslam|pritam|shreya ghoshal|neha kakkar|kumar sanu|alka yagnik|sonu nigam|jubin nautiyal|badshah|mohit chauhan|jasleen royal|amit trivedi|shankar mahadevan|tulsi kumar|asees kaur|varun jain|anuv jain|a\.r\. rahman|ar rahman|vishal mishra|sachet tandon|parampara thakur|armaan malik|b praak|darshan raval|javed ali|shaan|udit narayan|t-series|zee music|saregama|yrf music|bollywood|hindi film|hindi song|kesariya|tum|dil|pyar|ishq|zindagi|aashiqui|channa|dard|sanam|humraah|raataan|bekhayali)\b/i.test(text)) return 'hindi';

    return 'english';
  }

  extractVibe(track) {
    const title = track?.title || '';
    const artist = track?.artist || '';
    const album = track?.album || '';
    const text = `${title} ${artist} ${album}`.toLowerCase();
    const mood = track?.mood || this.detectMood(track);
    const language = this.detectLanguage(title, artist);
    const genreTags = new Set();

    if (/lo[- ]?fi|chillhop|study|ambient/.test(text)) genreTags.add('lo-fi');
    if (/acoustic|unplugged|piano|guitar/.test(text)) genreTags.add('acoustic');
    if (/bollywood|hindi|arijit|pritam|t-series/.test(text)) genreTags.add('bollywood');
    if (/punjabi|dhillon|sidhu|diljit|shubh|jatt|bhangra/.test(text)) genreTags.add('punjabi');
    if (/bhojpuri|pawan singh|khesari lal|shilpi raj|bhojpuriya/.test(text)) genreTags.add('bhojpuri');
    if (/sufi|qawwali/.test(text)) genreTags.add('sufi');
    if (/remix|dance|party|bhangra|club/.test(text)) genreTags.add('dance');
    if (genreTags.size === 0) genreTags.add(language === 'english' ? 'pop' : language);

    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    const energy = mood === 'energetic' || genreTags.has('dance') ? 0.85
      : mood === 'happy' ? 0.7
        : mood === 'sad' || mood === 'chill' ? 0.3 : 0.5;

    return {
      artist,
      mood,
      language,
      region: language === 'punjabi' ? 'Punjab' : language === 'hindi' ? 'India' : 'International',
      genreTags: [...genreTags],
      tone: mood === 'sad' ? 'melancholic' : mood === 'romantic' ? 'warm' : mood === 'energetic' ? 'driving' : 'soft',
      acoustic: genreTags.has('acoustic'),
      tempo: mood === 'energetic' || genreTags.has('dance') ? 'upbeat' : 'slow-mid',
      energy,
      year: yearMatch ? Number(yearMatch[0]) : null
    };
  }

  filterRelatedTracks(seedTrack, candidates, limit, strict = true) {
    const seedVibe = seedTrack.vibeMetadata || this.extractVibe(seedTrack);
    const supportedLanguages = ['hindi', 'bhojpuri', 'punjabi', 'tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'english'];
    if (!supportedLanguages.includes(seedVibe.language)) return [];
    const seedKey = seedTrack.videoId || seedTrack.id;
    const seen = new Set([seedKey]);
    const filtered = (Array.isArray(candidates) ? candidates : []).filter(candidate => {
      const key = candidate?.videoId || candidate?.id;
      if (!key || seen.has(key)) return false;
      const candidateVibe = this.extractVibe(candidate);
      if (strict && candidateVibe.language !== seedVibe.language) return false;
      candidate.mood = candidateVibe.mood;
      candidate.vibeMetadata = candidateVibe;
      seen.add(key);
      return true;
    }).slice(0, limit);
    // If strict filtering yields too few results, relax language requirement
    if (strict && filtered.length < 5) {
      return this.filterRelatedTracks(seedTrack, candidates, limit, false);
    }
    return filtered;
  }

  // --- Related / Same Mood Continuation Tracks ---
  async getRelatedTracks(track, overrideMood = null, limit = 20) {
    if (!track) return { mood: 'chill', tracks: [] };
    const vibe = this.extractVibe(track);
    const mood = overrideMood || vibe.mood;
    const videoId = track.videoId || (track.id?.startsWith('yt_') ? track.id.replace('yt_', '') : '');

    // 1. Try Live Server Backend
    const isLive = await this.checkLiveBackend();
    if (isLive) {
      try {
        const queryParams = new URLSearchParams({
          id: videoId || '',
          mood: mood,
          title: track.title || '',
          artist: track.artist || '',
          limit: String(limit)
        });
        const res = await fetch(`/api/yt/related?${queryParams.toString()}`, {
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.tracks) && data.tracks.length > 0) {
            const relatedTracks = this.filterRelatedTracks(track, data.tracks, limit);
            if (relatedTracks.length > 0) {
              return {
                mood: data.mood || mood,
                vibe,
                tracks: relatedTracks
              };
            }
          }
        }
      } catch (e) {
        console.warn('Backend related songs fetch failed, falling back to search...', e);
      }
    }

    // 2. Artist-first fallback keeps regional and Bhojpuri artists discoverable
    // even when static language or genre tags are missing.
    const artist = String(track.artist || '').trim();
    const title = String(track.title || '').trim();
    const queries = artist && artist !== 'YouTube Artist'
      ? [`${artist} top hit songs`, `${artist} official audio`]
      : [title ? `${title} radio` : `${mood} songs`];
    const batches = await Promise.all(queries.map(query => this.searchSongs(query, 10)));
    const seedArtists = artist.toLowerCase().split(/,|&| feat\.? | ft\.? /).map(name => name.trim()).filter(Boolean);
    const regionalArtists = [
      'pawan singh', 'khesari lal yadav', 'shilpi raj', 'neelkamal singh', 'ritesh pandey',
      'ankush raja', 'priyanka singh', 'antra singh priyanka', 'kalpana patowary',
      'arijit singh', 'atif aslam', 'diljit dosanjh', 'karan aujla', 'ap dhillon', 'sidhu moose wala'
    ];
    const seedIsRegional = regionalArtists.some(name => artist.toLowerCase().includes(name)) ||
      /\b(bhojpuri|hindi|bollywood|punjabi|desi|bhangra)\b/i.test(`${title} ${artist}`);
    const foreignMarkers = /\b(english|k-pop|kpop|korean|spanish|french|tamil|telugu|malayalam|hollywood|edm|billboard|taylor swift|ed sheeran|justin bieber)\b/i;
    const seen = new Set([track.id, track.videoId].filter(Boolean));
    const candidates = batches.flat().filter(candidate => {
      const key = candidate?.videoId || candidate?.id;
      if (!candidate || !key || seen.has(key)) return false;
      const candidateArtist = String(candidate.artist || '').toLowerCase();
      const candidateText = `${candidate.title || ''} ${candidate.artist || ''} ${candidate.album || ''}`;
      if (seedIsRegional && foreignMarkers.test(candidateText)) return false;
      const sameArtist = seedArtists.some(name => candidateArtist.includes(name) || name.includes(candidateArtist));
      const regionalPeer = regionalArtists.some(name => candidateArtist.includes(name));
      candidate._artistMatch = sameArtist ? 2 : regionalPeer ? 1 : 0;
      seen.add(key);
      return true;
    }).sort((left, right) => right._artistMatch - left._artistMatch);
    candidates.forEach(candidate => delete candidate._artistMatch);
    const filtered = candidates.slice(0, 10);

    return {
      mood: mood,
      vibe,
      tracks: filtered
    };
  }
}

export const api = new MusicAPI();
