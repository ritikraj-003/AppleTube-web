/**
 * Aura Music - LocalStorage Data Manager
 */

const STORAGE_KEYS = {
  LIKED: 'aura_liked_songs',
  PLAYLISTS: 'aura_playlists',
  RECENT: 'aura_recent_history',
  SEARCH_HISTORY: 'aura_recent_searches',
  SETTINGS: 'aura_user_settings',
  PREFERENCES: 'aura_user_preferences'
};

export class StorageManager {
  // --- Liked Songs ---
  static getLikedSongs() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LIKED);
      const list = data ? JSON.parse(data) : [];
      return list.map(t => {
        const vid = t.videoId || (t.id && String(t.id).startsWith('yt_') ? String(t.id).replace('yt_', '') : undefined);
        return {
          ...t,
          videoId: vid,
          audioUrl: vid && (!t.audioUrl || t.audioUrl.includes('latest_version') || t.audioUrl.includes('invidious'))
            ? `/api/yt/audio?id=${vid}`
            : t.audioUrl
        };
      });
    } catch (e) {
      console.error('Error reading liked songs', e);
      return [];
    }
  }

  static isLiked(trackId) {
    if (!trackId) return false;
    const liked = this.getLikedSongs();
    return liked.some(t => t.id === trackId);
  }

  static toggleLike(track) {
    if (!track || !track.id) return false;
    let liked = this.getLikedSongs();
    const index = liked.findIndex(t => t.id === track.id);
    let isNowLiked = false;

    if (index > -1) {
      liked.splice(index, 1);
      isNowLiked = false;
    } else {
      const videoId = track.videoId || (track.id && String(track.id).startsWith('yt_') ? String(track.id).replace('yt_', '') : undefined);
      liked.unshift({
        ...track,
        id: track.id,
        videoId: videoId,
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album || '',
        duration: track.duration || 0,
        image: track.image || 'assets/default-cover.svg',
        audioUrl: videoId ? `/api/yt/audio?id=${videoId}` : track.audioUrl,
        source: track.source || 'Online',
        addedAt: Date.now()
      });
      isNowLiked = true;
    }

    try {
      localStorage.setItem(STORAGE_KEYS.LIKED, JSON.stringify(liked));

      // Also synchronize into the 'My Favorites' playlist
      const playlists = this.getPlaylists();
      let favPlaylist = playlists.find(p => p.id === 'pl_favorites');
      if (!favPlaylist) {
        favPlaylist = {
          id: 'pl_favorites',
          name: 'My Favorites',
          description: 'Tracks you loved',
          createdAt: Date.now(),
          tracks: []
        };
        playlists.unshift(favPlaylist);
      }

      if (isNowLiked) {
        if (!favPlaylist.tracks.some(t => t.id === track.id)) {
          favPlaylist.tracks.unshift({
            id: track.id,
            title: track.title || 'Unknown Title',
            artist: track.artist || 'Unknown Artist',
            album: track.album || '',
            duration: track.duration || 0,
            image: track.image || 'assets/default-cover.svg',
            audioUrl: track.audioUrl,
            source: track.source || 'Online',
            addedAt: Date.now()
          });
        }
      } else {
        favPlaylist.tracks = favPlaylist.tracks.filter(t => t.id !== track.id);
      }
      this.savePlaylists(playlists);
      this.recordPlaybackEvent(track, isNowLiked ? 'like' : 'unlike');
    } catch (e) {
      console.error('Error saving liked songs', e);
    }
    return isNowLiked;
  }

  // --- Custom Playlists ---
  static getPlaylists() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      return data ? JSON.parse(data) : [
        {
          id: 'pl_favorites',
          name: 'My Favorites',
          description: 'Tracks you loved',
          createdAt: Date.now(),
          tracks: []
        }
      ];
    } catch (e) {
      console.error('Error reading playlists', e);
      return [];
    }
  }

  static savePlaylists(playlists) {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
    } catch (e) {
      console.error('Error saving playlists', e);
    }
  }

  static createPlaylist(name, description = '') {
    if (!name || !name.trim()) return null;
    const playlists = this.getPlaylists();
    const newPlaylist = {
      id: 'pl_' + Date.now(),
      name: name.trim(),
      description: description.trim(),
      createdAt: Date.now(),
      tracks: []
    };
    playlists.push(newPlaylist);
    this.savePlaylists(playlists);
    return newPlaylist;
  }

  static deletePlaylist(playlistId) {
    let playlists = this.getPlaylists();
    playlists = playlists.filter(p => p.id !== playlistId);
    this.savePlaylists(playlists);
  }

  static addTrackToPlaylist(playlistId, track) {
    const playlists = this.getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return false;

    // Check if already in playlist
    if (!playlist.tracks.some(t => t.id === track.id)) {
      const videoId = track.videoId || (track.id && String(track.id).startsWith('yt_') ? String(track.id).replace('yt_', '') : undefined);
      playlist.tracks.push({
        ...track,
        id: track.id,
        videoId: videoId,
        title: track.title,
        artist: track.artist,
        album: track.album,
        duration: track.duration,
        image: track.image,
        audioUrl: videoId ? `/api/yt/audio?id=${videoId}` : track.audioUrl,
        addedAt: Date.now()
      });
      this.savePlaylists(playlists);
      return true;
    }
    return false;
  }

  static removeTrackFromPlaylist(playlistId, trackId) {
    const playlists = this.getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);
    if (!playlist) return;
    playlist.tracks = playlist.tracks.filter(t => t.id !== trackId);
    this.savePlaylists(playlists);
  }

  static isTrackInPlaylist(playlistId, trackId) {
    if (!playlistId || !trackId) return false;
    const playlists = this.getPlaylists();
    const playlist = playlists.find(p => p.id === playlistId);
    return Boolean(playlist && playlist.tracks.some(t => t.id === trackId));
  }

  // --- Recently Played History ---
  static getRecentTracks() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RECENT);
      const list = data ? JSON.parse(data) : [];
      return list.map(t => {
        const vid = t.videoId || (t.id && String(t.id).startsWith('yt_') ? String(t.id).replace('yt_', '') : undefined);
        return {
          ...t,
          videoId: vid,
          audioUrl: vid && (!t.audioUrl || t.audioUrl.includes('latest_version') || t.audioUrl.includes('invidious'))
            ? `/api/yt/audio?id=${vid}`
            : t.audioUrl
        };
      });
    } catch (e) {
      return [];
    }
  }

  static addRecentTrack(track) {
    if (!track || !track.id) return;
    const videoId = track.videoId || (track.id && String(track.id).startsWith('yt_') ? String(track.id).replace('yt_', '') : undefined);
    let recent = this.getRecentTracks();
    recent = recent.filter(t => t.id !== track.id);
    recent.unshift({
      ...track,
      id: track.id,
      videoId: videoId || track.videoId,
      title: track.title,
      artist: track.artist,
      album: track.album,
      duration: track.duration,
      image: track.image,
      audioUrl: videoId ? `/api/yt/audio?id=${videoId}` : track.audioUrl,
      source: track.source,
      playedAt: Date.now()
    });
    // Keep max 40 items
    if (recent.length > 40) {
      recent = recent.slice(0, 40);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.RECENT, JSON.stringify(recent));
    } catch (e) {}
  }

  static clearRecentTracks() {
    try {
      localStorage.removeItem(STORAGE_KEYS.RECENT);
    } catch (e) {}
  }

  // --- Search History ---
  static getRecentSearches() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  static addRecentSearch(query) {
    if (!query || typeof query !== 'string') return;
    const clean = query.trim();
    if (!clean) return;
    let searches = this.getRecentSearches();
    searches = searches.filter(s => s.toLowerCase() !== clean.toLowerCase());
    searches.unshift(clean);
    if (searches.length > 25) {
      searches = searches.slice(0, 25);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(searches));
    } catch (e) {}
  }

  static removeRecentSearch(query) {
    if (!query) return;
    let searches = this.getRecentSearches();
    searches = searches.filter(s => s.toLowerCase() !== query.toLowerCase().trim());
    try {
      localStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(searches));
    } catch (e) {}
  }

  static clearRecentSearches() {
    try {
      localStorage.removeItem(STORAGE_KEYS.SEARCH_HISTORY);
    } catch (e) {}
  }

  // --- User Settings ---
  static getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? JSON.parse(data) : {
        volume: 0.8,
        muted: false,
        shuffle: false,
        repeatMode: 'off' // 'off' | 'all' | 'one'
      };
    } catch (e) {
      return { volume: 0.8, muted: false, shuffle: false, repeatMode: 'off' };
    }
  }

  static saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {}
  }

  static updateSettings(partial) {
    const current = this.getSettings();
    const updated = { ...current, ...partial };
    this.saveSettings(updated);
    return updated;
  }

  // --- User Preferences & Recommendation Profile ---
  static getUserPreferences() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
      if (!data) return this.getDefaultPreferences();
      const parsed = JSON.parse(data);
      return {
        artists: parsed.artists || {},
        genres: parsed.genres || {},
        tracks: parsed.tracks || {},
        languages: parsed.languages || {},
        moods: parsed.moods || {},
        recentTrackIds: Array.isArray(parsed.recentTrackIds) ? parsed.recentTrackIds : [],
        sessionTrackIds: Array.isArray(parsed.sessionTrackIds) ? parsed.sessionTrackIds : []
      };
    } catch (e) {
      console.warn('Error reading user preferences', e);
      return this.getDefaultPreferences();
    }
  }

  static getDefaultPreferences() {
    return {
      artists: {},
      genres: {},
      languages: {},
      moods: {},
      tracks: {},
      recentTrackIds: [],
      sessionTrackIds: []
    };
  }

  static saveUserPreferences(prefs) {
    if (!prefs) return;
    try {
      // Prune tracks if too large to save space
      const trackKeys = Object.keys(prefs.tracks || {});
      if (trackKeys.length > 200) {
        const sorted = trackKeys.sort((a, b) => (prefs.tracks[b].lastPlayed || 0) - (prefs.tracks[a].lastPlayed || 0));
        const prunedTracks = {};
        sorted.slice(0, 150).forEach(k => { prunedTracks[k] = prefs.tracks[k]; });
        prefs.tracks = prunedTracks;
      }
      if (prefs.recentTrackIds && prefs.recentTrackIds.length > 40) {
        prefs.recentTrackIds = prefs.recentTrackIds.slice(0, 40);
      }
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(prefs));
    } catch (e) {
      console.warn('Error saving user preferences', e);
    }
  }

  static parseArtists(artistStr) {
    if (!artistStr || typeof artistStr !== 'string') return [];
    return artistStr
      .split(/,|&|\band\b|\bft\.?\b|\bfeat\.?\b/i)
      .map(a => a.trim())
      .filter(a => a.length > 1 && !/^(youtube|official|vevo|records|music|audio|channel)$/i.test(a));
  }

  static recordPlaybackEvent(track, eventType, details = {}) {
    if (!track || !track.id) return;
    try {
      const prefs = this.getUserPreferences();
      const trackId = String(track.id);
      const artists = this.parseArtists(track.artist);
      const vibe = track.vibeMetadata || {};
      const language = String(track.language || vibe.language || 'unknown').toLowerCase();
      const mood = String(track.mood || vibe.mood || 'chill').toLowerCase();
      const genre = String(track.genre || vibe.genreTags?.[0] || mood || 'unknown').toLowerCase();
      const profileBucket = (bucket, key, name = key) => {
        if (!key || key === 'unknown') return null;
        if (!prefs[bucket][key]) prefs[bucket][key] = { name, playCount: 0, completions: 0, skips: 0, likes: 0, score: 0 };
        return prefs[bucket][key];
      };

      // 1. Update track stats
      if (!prefs.tracks[trackId]) {
        prefs.tracks[trackId] = { playCount: 0, completions: 0, skips: 0, replays: 0, lastPlayed: 0 };
      }
      const tStat = prefs.tracks[trackId];

      if (eventType === 'play') {
        tStat.playCount = (tStat.playCount || 0) + 1;
        tStat.lastPlayed = Date.now();
        // Add to recentTrackIds
        prefs.recentTrackIds = [trackId, ...(prefs.recentTrackIds || []).filter(id => id !== trackId)].slice(0, 40);
        prefs.sessionTrackIds = [trackId, ...(prefs.sessionTrackIds || []).filter(id => id !== trackId)].slice(0, 20);

        // Update artist play counts
        artists.forEach(art => {
          const key = art.toLowerCase();
          if (!prefs.artists[key]) prefs.artists[key] = { name: art, playCount: 0, completions: 0, skips: 0, likes: 0, score: 0 };
          prefs.artists[key].playCount += 1;
        });

        const languageStat = profileBucket('languages', language, language);
        const moodStat = profileBucket('moods', mood, mood);
        const genreStat = profileBucket('genres', genre, genre);
        [languageStat, moodStat, genreStat].forEach(stat => { if (stat) stat.playCount += 1; });
        if (tStat.playCount > 1) tStat.replays = (tStat.replays || 0) + 1;
      } else if (eventType === 'complete') {
        tStat.completions = (tStat.completions || 0) + 1;
        artists.forEach(art => {
          const key = art.toLowerCase();
          if (prefs.artists[key]) prefs.artists[key].completions = (prefs.artists[key].completions || 0) + 1;
        });
        if (genre && prefs.genres[genre.toLowerCase()]) {
          prefs.genres[genre.toLowerCase()].completions = (prefs.genres[genre.toLowerCase()].completions || 0) + 1;
        }
        if (prefs.languages[language]) prefs.languages[language].completions = (prefs.languages[language].completions || 0) + 1;
        if (prefs.moods[mood]) prefs.moods[mood].completions = (prefs.moods[mood].completions || 0) + 1;
      } else if (eventType === 'skip') {
        // Only count as early skip if played for less than 25 seconds
        const playedSec = details.playedSeconds || 0;
        if (playedSec < 25) {
          tStat.skips = (tStat.skips || 0) + 1;
          artists.forEach(art => {
            const key = art.toLowerCase();
            if (prefs.artists[key]) prefs.artists[key].skips = (prefs.artists[key].skips || 0) + 1;
          });
          if (genre && prefs.genres[genre.toLowerCase()]) {
            prefs.genres[genre.toLowerCase()].skips = (prefs.genres[genre.toLowerCase()].skips || 0) + 1;
          }
          if (prefs.languages[language]) prefs.languages[language].skips = (prefs.languages[language].skips || 0) + 1;
          if (prefs.moods[mood]) prefs.moods[mood].skips = (prefs.moods[mood].skips || 0) + 1;
        }
      } else if (eventType === 'like') {
        artists.forEach(art => {
          const key = art.toLowerCase();
          if (!prefs.artists[key]) prefs.artists[key] = { name: art, playCount: 0, completions: 0, skips: 0, likes: 0, score: 0 };
          prefs.artists[key].likes = (prefs.artists[key].likes || 0) + 1;
        });
        if (genre) {
          const gKey = genre.toLowerCase();
          if (!prefs.genres[gKey]) prefs.genres[gKey] = { name: genre, playCount: 0, completions: 0, skips: 0, likes: 0, score: 0 };
          prefs.genres[gKey].likes = (prefs.genres[gKey].likes || 0) + 1;
        }
        if (prefs.languages[language]) prefs.languages[language].likes = (prefs.languages[language].likes || 0) + 1;
        if (prefs.moods[mood]) prefs.moods[mood].likes = (prefs.moods[mood].likes || 0) + 1;
      } else if (eventType === 'unlike') {
        artists.forEach(art => {
          const key = art.toLowerCase();
          if (prefs.artists[key] && prefs.artists[key].likes > 0) prefs.artists[key].likes -= 1;
        });
        if (genre && prefs.genres[genre.toLowerCase()] && prefs.genres[genre.toLowerCase()].likes > 0) {
          prefs.genres[genre.toLowerCase()].likes -= 1;
        }
        if (prefs.languages[language] && prefs.languages[language].likes > 0) prefs.languages[language].likes -= 1;
        if (prefs.moods[mood] && prefs.moods[mood].likes > 0) prefs.moods[mood].likes -= 1;
      }

      // Re-calculate scores for affected artists & genres
      artists.forEach(art => {
        const key = art.toLowerCase();
        const a = prefs.artists[key];
        if (a) {
          a.score = (a.completions * 2.0) + (a.playCount * 1.0) + (a.likes * 3.0) - (a.skips * 1.5);
        }
      });
      if (genre && prefs.genres[genre.toLowerCase()]) {
        const g = prefs.genres[genre.toLowerCase()];
        g.score = (g.completions * 2.0) + (g.playCount * 1.0) + (g.likes * 3.0) - (g.skips * 1.5);
      }
      [language, mood].forEach((key, index) => {
        const bucket = index === 0 ? prefs.languages : prefs.moods;
        const stat = bucket[key];
        if (stat) stat.score = (stat.completions * 2.0) + (stat.playCount * 1.0) + (stat.likes * 3.0) - (stat.skips * 1.5);
      });

      this.saveUserPreferences(prefs);
    } catch (e) {
      console.warn('Error recording playback event', e);
    }
  }

  static getArtistAffinity(artistName) {
    if (!artistName) return 0;
    try {
      const prefs = this.getUserPreferences();
      const artists = this.parseArtists(artistName);
      if (!artists.length) return 0;
      let totalScore = 0;
      artists.forEach(art => {
        const key = art.toLowerCase();
        if (prefs.artists[key]) {
          totalScore += prefs.artists[key].score || 0;
        }
      });
      return totalScore / artists.length;
    } catch (e) {
      return 0;
    }
  }

  static getGenreAffinity(genreName) {
    if (!genreName) return 0;
    try {
      const prefs = this.getUserPreferences();
      const key = genreName.toLowerCase();
      return prefs.genres[key] ? (prefs.genres[key].score || 0) : 0;
    } catch (e) {
      return 0;
    }
  }

  static getRecentPlayedIds(limit = 15) {
    try {
      const prefs = this.getUserPreferences();
      return (prefs.recentTrackIds || []).slice(0, limit);
    } catch (e) {
      return [];
    }
  }

  /**
   * Clear the current-session track list.
   * Call this when the user starts a fresh discovery session so the
   * recommendation engine doesn't penalise songs from a previous session.
   */
  static clearSessionTracks() {
    try {
      const prefs = this.getUserPreferences();
      prefs.sessionTrackIds = [];
      this.saveUserPreferences(prefs);
    } catch (e) {}
  }
}
