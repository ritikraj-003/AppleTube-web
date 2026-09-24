/**
 * Aura Music - Multi-Source Music API Client with Live YouTube Database Engine
 */

import { CONFIG } from './config.js';

class MusicAPI {
  constructor() {
    this.searchCache = new Map();
    this.suggestionsCache = new Map();
    this.ytMirrorIndex = 0;
    this.saavnMirrorIndex = 0;
    this.audiusMirrorIndex = 0;
    this.radioMirrorIndex = 0;
    this.hasLiveBackend = null; // Autodetected on first call
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
    if (this.hasLiveBackend !== null) return this.hasLiveBackend;
    try {
      const res = await fetch('/api/status', { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        this.hasLiveBackend = data?.status === 'online';
        return this.hasLiveBackend;
      }
    } catch (e) {
      this.hasLiveBackend = false;
    }
    return false;
  }

  // --- 1. Live YouTube Search (via Live Backend or Invidious) ---
  async searchYouTube(query, limit = 30) {
    // 1A. Try local live server backend first (InnerTube live database)
    const isLive = await this.checkLiveBackend();
    if (isLive) {
      try {
        const res = await fetch(`/api/yt/search?q=${encodeURIComponent(query)}&limit=${limit}`, {
          signal: AbortSignal.timeout(6000)
        });
        if (res.ok) {
          const items = await res.json();
          if (Array.isArray(items) && items.length > 0) {
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
    if (this.suggestionsCache.has(cacheKey)) {
      return this.suggestionsCache.get(cacheKey);
    }

    try {
      const res = await fetch(`/api/yt/suggestions?q=${encodeURIComponent(trimmed)}&limit=${limit}`, {
        signal: AbortSignal.timeout(2800)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object') {
          this.suggestionsCache.set(cacheKey, data);
          return data;
        }
      }
    } catch (e) {
      // Fallback below
    }

    // Client-side fallback if backend suggestion failed/offline
    const matchingSongs = CONFIG.CURATED_TRACKS.filter(t =>
      t.title.toLowerCase().includes(cacheKey) || t.artist.toLowerCase().includes(cacheKey)
    ).slice(0, 4);

    const fallbackResult = {
      query: trimmed,
      suggestions: [trimmed],
      songs: matchingSongs
    };
    return fallbackResult;
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

    return CONFIG.CURATED_TRACKS;
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

  // --- Related / Same Mood Continuation Tracks ---
  async getRelatedTracks(track, overrideMood = null, limit = 20) {
    if (!track) return { mood: 'chill', tracks: [] };
    const mood = overrideMood || this.detectMood(track);
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
            return {
              mood: data.mood || mood,
              tracks: data.tracks
            };
          }
        }
      } catch (e) {
        console.warn('Backend related songs fetch failed, falling back to search...', e);
      }
    }

    // 2. Client-side fallback: search for same artist + mood or general mood tracks
    const searchQuery = track.artist && track.artist !== 'YouTube Artist'
      ? `${track.artist} ${mood} songs`
      : `best ${mood} songs hits`;

    const searched = await this.searchSongs(searchQuery, limit);
    const filtered = (searched || []).filter(t => t.id !== track.id);
    filtered.forEach(t => { t.mood = this.detectMood(t); });

    return {
      mood: mood,
      tracks: filtered
    };
  }
}

export const api = new MusicAPI();
