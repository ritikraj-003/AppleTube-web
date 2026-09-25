/**
 * Aura Music - Audio Player Engine with True Mobile Background Playback
 */

import { CONFIG } from './config.js';
import { StorageManager } from './storage.js';
import { api } from './api.js';
import { recommendationEngine } from './recommendation.js';
import { OVERALL_TRAVEL_SONGS } from './travelData.js';
import { UIManager } from './ui.js';

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    // Do NOT set crossOrigin = 'anonymous' to avoid CORS rejections on third-party CDNs
    this.audio.preload = 'auto';

    // Crucial attributes for mobile / Android / iOS background media playback
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');
    this.audio.setAttribute('x-webkit-airplay', 'allow');
    this.audio.autoplay = false;

    this.currentTrack = null;
    this.queue = [];
    this.currentIndex = -1;
    this.originalQueue = [];
    this.userQueue = [];
    this.recommendationQueue = [];
    this.seedTrack = null;
    this.playbackContext = { type: 'browse' };
    this.sessionHistory = [];
    this.currentPlayStartTime = 0;
    this.hasRecordedCompletion = false;
    this.isGeneratingRecommendations = false;
    this.wakeLock = null;
    this.streamRetryCount = 0;

    const settings = StorageManager.getSettings();
    this.volume = settings.volume ?? 0.8;
    this.isMuted = settings.muted ?? false;
    this.isShuffle = settings.shuffle ?? false;
    this.repeatMode = settings.repeatMode ?? 'off'; // 'off' | 'all' | 'one'
    this.smartMoodAutoplay = settings.smartMoodAutoplay === true;
    this.currentMood = 'chill';
    this.suggestedTracks = [];
    this.isFetchingSuggestions = false;

    this.audio.volume = this.isMuted ? 0 : this.volume;

    // Web Audio API
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.audioConnected = false;

    // Listeners
    this.listeners = {
      trackChange: [],
      playbackChange: [],
      timeUpdate: [],
      queueUpdate: [],
      modeChange: [],
      moodChange: [],
      playbackRateChange: [],
      suggestionsUpdate: [],
      recommendationsUpdate: [],
      audioOutputChange: []
    };
    this.playbackRate = 1.0;
    this.currentSinkId = 'default';

    this.mountAudioElement();
    this.bindAudioEvents();
    this.initMediaSession();
    this.bindVisibilityEvents();
  }

  // --- Mount Authoritative Audio Element in DOM Tree ---
  mountAudioElement() {
    if (typeof document === 'undefined') return;
    const attach = () => {
      if (document.body && !document.getElementById('auraAudioElement')) {
        this.audio.id = 'auraAudioElement';
        this.audio.style.position = 'fixed';
        this.audio.style.width = '0';
        this.audio.style.height = '0';
        this.audio.style.opacity = '0';
        this.audio.style.pointerEvents = 'none';
        this.audio.style.zIndex = '-9999';
        document.body.appendChild(this.audio);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', attach, { once: true });
    } else {
      attach();
    }
  }

  // --- Initialize Web Audio Analyser ---
  initAudioContext() {
    // Avoid hijacking native <audio> on mobile / touch devices where Web Audio suspension silences background audio.
    // The visualizer smoothly falls back to simulated harmonics on mobile devices.
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    if (isMobile) {
      this.audioConnected = false;
      return;
    }

    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return;
    }

    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;

      this.audioCtx = new AudioCtxClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      try {
        this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
        this.sourceNode.connect(this.analyser);
        this.analyser.connect(this.audioCtx.destination);
        this.audioConnected = true;
      } catch (corsErr) {
        this.audioConnected = false;
      }
    } catch (e) {
      console.warn('Web Audio API not supported in current mode:', e);
    }
  }

  // --- Android WakeLock ---
  async requestWakeLock() {
    if ('wakeLock' in navigator && !this.wakeLock) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      } catch (err) {}
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  bindVisibilityEvents() {
    // 1. Visibility change (user locks phone, switches apps, switches tabs)
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        // Returned to foreground:
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
        if (!this.audio.paused) {
          await this.requestWakeLock();
        }
        // Immediately resynchronize all foreground UI components with true playback state
        this.resyncForegroundUI();
      } else if (document.visibilityState === 'hidden') {
        // Page going hidden / screen locked:
        // Do NOT pause or alter audio. Audio continues playing naturally in background.
        if (!this.audio.paused) {
          this.updateMediaSessionPlaybackState('playing');
          this.updateMediaSessionPosition();
        }
      }
    });

    // 2. Mobile lifecycle: pagehide event (switching apps or navigating)
    window.addEventListener('pagehide', () => {
      // Do NOT pause or teardown audio. Allow natural background audio streaming.
      if (!this.audio.paused) {
        this.updateMediaSessionPlaybackState('playing');
        this.updateMediaSessionPosition();
      }
    });

    // 3. Pageshow event (returning from bfcache / background)
    window.addEventListener('pageshow', async () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (!this.audio.paused) {
        await this.requestWakeLock();
      }
      this.resyncForegroundUI();
    });

    // 4. Page Lifecycle API events: freeze and resume (Android Chrome)
    window.addEventListener('freeze', () => {
      // Do NOT pause audio
    });

    window.addEventListener('resume', async () => {
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      if (!this.audio.paused) {
        await this.requestWakeLock();
      }
      this.resyncForegroundUI();
    });

    // 5. Window focus event
    window.addEventListener('focus', () => {
      if (document.visibilityState === 'visible') {
        this.resyncForegroundUI();
      }
    });
  }

  resyncForegroundUI() {
    if (!this.currentTrack) return;
    try {
      const isPlaying = !this.audio.paused;

      // Notify trackChange so UI shows correct track if it changed while in background
      this.notify('trackChange', this.currentTrack);
      this.notify('playbackChange', isPlaying);

      const cur = this.currentTime;
      const dur = this.duration;
      const percent = dur > 0 ? (cur / dur) * 100 : 0;
      this.notify('timeUpdate', { current: cur, duration: dur, percent });

      this.notify('queueUpdate', {
        queue: this.queue,
        index: this.currentIndex,
        seedTrack: this.seedTrack,
        userQueue: this.userQueue,
        recommendationQueue: this.recommendationQueue
      });

      this.notify('modeChange', {
        volume: this.volume,
        isMuted: this.isMuted,
        shuffle: this.isShuffle,
        repeatMode: this.repeatMode
      });

      this.notify('playbackRateChange', this.playbackRate || 1.0);

      this.updateMediaSessionPosition(cur, dur);
      this.updateMediaSessionPlaybackState(isPlaying ? 'playing' : 'paused');
    } catch (e) {
      console.warn('Error resyncing foreground UI:', e);
    }
  }

  // --- Audio Event Listeners ---
  bindAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.notify('playbackChange', true);
      this.updateMediaSessionPlaybackState('playing');
      this.updateMediaSessionPosition();
      this.requestWakeLock();
    });

    this.audio.addEventListener('playing', () => {
      this.notify('playbackChange', true);
      this.updateMediaSessionPlaybackState('playing');
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('waiting', () => {
      if (!this.audio.paused) {
        this.updateMediaSessionPlaybackState('playing');
      }
    });

    this.audio.addEventListener('pause', () => {
      this.notify('playbackChange', false);
      this.updateMediaSessionPlaybackState('paused');
      this.updateMediaSessionPosition();
      this.releaseWakeLock();
    });

    this.audio.addEventListener('timeupdate', () => {
      const current = this.audio.currentTime || 0;
      const duration = this.audio.duration || this.currentTrack?.duration || 0;
      const percent = duration > 0 ? (current / duration) * 100 : 0;
      if (percent >= 70 && !this.hasRecordedCompletion && this.currentTrack) {
        this.hasRecordedCompletion = true;
        StorageManager.recordPlaybackEvent(this.currentTrack, 'complete');
      }
      this.notify('timeUpdate', { current, duration, percent });
      this.updateMediaSessionPosition(current, duration);
    });

    this.audio.addEventListener('durationchange', () => {
      const cur = this.audio.currentTime || 0;
      const dur = this.audio.duration || 0;
      if (dur > 0) {
        this.updateMediaSessionPosition(cur, dur);
        const percent = (cur / dur) * 100;
        this.notify('timeUpdate', { current: cur, duration: dur, percent });
      }
    });

    this.audio.addEventListener('seeking', () => {
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('seeked', () => {
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('ratechange', () => {
      this.updateMediaSessionPosition();
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Native HTMLAudioElement playback error encountered:', e);
      this.handleAudioPlaybackError();
    });
  }

  async handleAudioPlaybackError() {
    const track = this.currentTrack;
    if (!track) {
      this.notify('playbackChange', false);
      return;
    }

    // Auto-detect videoId if missing
    if (!track.videoId) {
      if (track.id && String(track.id).startsWith('yt_')) {
        track.videoId = String(track.id).replace('yt_', '');
      } else if (track.id && /^[a-zA-Z0-9_-]{11}$/.test(String(track.id))) {
        track.videoId = String(track.id);
      }
    }

    // Attempt direct audio mirror fallback if retry count allows
    if (track.videoId && this.streamRetryCount === 0) {
      this.streamRetryCount++;
      console.info(`Attempting fallback direct audio stream for ${track.title} (${track.videoId})...`);
      
      const fallbackMirrors = [
        `https://invidious.protokolla.fi/api/v1/videos/${track.videoId}`,
        `https://pipedapi.adminforge.de/streams/${track.videoId}`
      ];

      for (const mirrorUrl of fallbackMirrors) {
        try {
          const res = await fetch(mirrorUrl, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const data = await res.json();
            let streamUrl = null;
            if (Array.isArray(data.adaptiveFormats)) {
              const audioFmt = data.adaptiveFormats.find(f => (f.type || f.mimeType || '').startsWith('audio/') && f.url);
              if (audioFmt) streamUrl = audioFmt.url;
            } else if (Array.isArray(data.audioStreams)) {
              if (data.audioStreams[0]?.url) streamUrl = data.audioStreams[0].url;
            }

            if (streamUrl) {
              console.info('Found valid fallback direct audio stream');
              this.audio.src = streamUrl;
              this.audio.load();
              await this.audio.play();
              return;
            }
          }
        } catch (err) {
          // Continue to next mirror or failure handling
        }
      }
    }

    // If all direct stream methods failed, show clean error without skipping track
    console.warn(`Direct audio stream unavailable for: ${track.title}`);
    UIManager.showToast(`Audio unavailable for "${track.title}"`, 'warning');
    this.notify('playbackChange', false);
    this.updateMediaSessionPlaybackState('paused');
    // Note: NEVER automatically advance to the next track on playback error.
  }

  // --- Track Ended Handler ---
  handleTrackEnded() {
    const dur = this.duration;
    const cur = this.currentTime;
    // Guard against premature or spurious ended events (e.g. 0 duration, unplayed track)
    if (!this.currentTrack || dur <= 0 || (cur < 1 && !this.hasRecordedCompletion)) {
      console.warn('[AudioPlayer] Ignoring spurious ended event (track did not genuinely finish):', { cur, dur });
      return;
    }

    if (this.currentTrack && !this.hasRecordedCompletion) {
      this.hasRecordedCompletion = true;
      StorageManager.recordPlaybackEvent(this.currentTrack, 'complete');
    }

    // ── Repeat One: replay the current track ─────────────────────────────
    if (this.repeatMode === 'one') {
      this.audio.currentTime = 0;
      this.audio.play().catch(() => {});
      return;
    }

    // ── Has next item in the current queue ───────────────────────────────
    if (this.hasNext()) {
      this.next(true);
      return;
    }

    // ── End of queue — behaviour depends on playback mode ────────────────

    // DETERMINISTIC MODE (Favorites / User-Created Playlist)
    // The Recommendation Engine must NEVER inject songs here.
    if (this.isDeterministicPlayback()) {
      if (this.repeatMode === 'all') {
        // Repeat playlist: restart from the beginning
        this.currentIndex = 0;
        this.loadAndPlayCurrent();
      } else if (this.isShuffle) {
        // Shuffle within the deterministic set
        const shuffled = this.shuffleArray([...this.originalQueue]);
        this.queue = shuffled;
        this.originalQueue = [...shuffled];
        this.currentIndex = 0;
        this.notify('queueUpdate', { queue: this.queue, index: this.currentIndex, seedTrack: this.seedTrack });
        this.loadAndPlayCurrent();
      } else {
        // Clean stop — do NOT inject recommendations
        this.notify('playbackChange', false);
      }
      return;
    }

    // REPEAT ALL in browse / discovery mode
    if (this.repeatMode === 'all') {
      this.currentIndex = 0;
      this.loadAndPlayCurrent();
      return;
    }

    // DISCOVERY MODE: extend queue from recommendation engine
    if (this.smartMoodAutoplay && this.recommendationQueue.length > 0) {
      const nextTrack = this.recommendationQueue.shift();
      this.queue.push(nextTrack);
      this.currentIndex = this.queue.length - 1;
      this.notify('queueUpdate', {
        queue: this.queue,
        index: this.currentIndex,
        seedTrack: this.seedTrack,
        userQueue: this.userQueue,
        recommendationQueue: this.recommendationQueue
      });
      this.loadAndPlayCurrent();
      this.checkAndReplenishRecommendations();
      return;
    }

    if (this.smartMoodAutoplay && this.suggestedTracks.length > 0) {
      this.playNextSuggestedMoodTrack();
      return;
    }

    // Default: stop playback
    this.notify('playbackChange', false);
  }

  // --- Enhanced Android Media Session API ---
  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    const safeSetHandler = (action, handler) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (err) {
        // Gracefully ignore actions not supported by this browser/OS version
      }
    };

    safeSetHandler('play', () => this.resume());
    safeSetHandler('pause', () => this.pause());
    safeSetHandler('previoustrack', () => this.previous());
    safeSetHandler('nexttrack', () => this.next());
    safeSetHandler('seekto', (details) => {
      if (details && typeof details.seekTime === 'number' && !isNaN(details.seekTime)) {
        if (details.fastSeek && typeof this.audio.fastSeek === 'function') {
          try {
            this.audio.fastSeek(details.seekTime);
            this.updateMediaSessionPosition(details.seekTime);
            return;
          } catch (e) {}
        }
        this.seekTo(details.seekTime);
      }
    });
    safeSetHandler('seekbackward', (details) => {
      const skip = (details && details.seekOffset) || 10;
      this.seekTo(Math.max(0, this.currentTime - skip));
    });
    safeSetHandler('seekforward', (details) => {
      const skip = (details && details.seekOffset) || 10;
      const dur = this.duration || 0;
      this.seekTo(Math.min(dur, this.currentTime + skip));
    });
    safeSetHandler('stop', () => {
      this.pause();
      this.seekTo(0);
    });
  }

  buildMediaSessionArtwork(track) {
    const defaultCoverPng = new URL('assets/default-cover.png', window.location.href).href;
    const rawImg = track?.image || track?.artwork || track?.cover || track?.thumbnail;

    if (!rawImg) {
      return [
        { src: defaultCoverPng, sizes: '96x96', type: 'image/png' },
        { src: defaultCoverPng, sizes: '128x128', type: 'image/png' },
        { src: defaultCoverPng, sizes: '192x192', type: 'image/png' },
        { src: defaultCoverPng, sizes: '256x256', type: 'image/png' },
        { src: defaultCoverPng, sizes: '384x384', type: 'image/png' },
        { src: defaultCoverPng, sizes: '512x512', type: 'image/png' }
      ];
    }

    let fullImgUrl = rawImg;
    try {
      fullImgUrl = new URL(rawImg, window.location.href).href;
    } catch (e) {
      fullImgUrl = rawImg;
    }

    // Android System MediaStyle notifications and lock screens can reject SVG artwork.
    // If the image is SVG, use our generated high-res default-cover.png.
    if (fullImgUrl.includes('.svg')) {
      return [
        { src: defaultCoverPng, sizes: '96x96', type: 'image/png' },
        { src: defaultCoverPng, sizes: '128x128', type: 'image/png' },
        { src: defaultCoverPng, sizes: '192x192', type: 'image/png' },
        { src: defaultCoverPng, sizes: '256x256', type: 'image/png' },
        { src: defaultCoverPng, sizes: '384x384', type: 'image/png' },
        { src: defaultCoverPng, sizes: '512x512', type: 'image/png' }
      ];
    }

    let mimeType = 'image/jpeg';
    if (fullImgUrl.includes('.png')) {
      mimeType = 'image/png';
    } else if (fullImgUrl.includes('.webp')) {
      mimeType = 'image/webp';
    }

    const artworkList = [];
    if (fullImgUrl.includes('ytimg.com') || fullImgUrl.includes('youtube.com')) {
      const vid = track.videoId || (track.id && String(track.id).replace('yt_', ''));
      if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
        artworkList.push(
          { src: `https://i.ytimg.com/vi/${vid}/default.jpg`, sizes: '120x90', type: 'image/jpeg' },
          { src: `https://i.ytimg.com/vi/${vid}/mqdefault.jpg`, sizes: '320x180', type: 'image/jpeg' },
          { src: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`, sizes: '480x360', type: 'image/jpeg' },
          { src: `https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`, sizes: '1280x720', type: 'image/jpeg' }
        );
      }
    }

    if (artworkList.length === 0) {
      const sizes = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512'];
      sizes.forEach(s => {
        artworkList.push({ src: fullImgUrl, sizes: s, type: mimeType });
      });
    }

    return artworkList;
  }

  updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !this.currentTrack) return;

    try {
      const track = this.currentTrack;
      const title = track.title || 'AppleTube Track';
      const artist = track.artist || 'AppleTube Artist';
      const album = track.album || (track.movie ? track.movie : 'AppleTube Music');
      const artwork = this.buildMediaSessionArtwork(track);

      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist,
        album,
        artwork
      });
    } catch (e) {
      console.warn('Error updating MediaSession metadata:', e);
    }
  }

  updateMediaSessionPlaybackState(state) {
    if (!('mediaSession' in navigator)) return;
    try {
      if (['playing', 'paused', 'none'].includes(state)) {
        navigator.mediaSession.playbackState = state;
      }
    } catch (e) {}
  }

  updateMediaSessionPosition(current = null, duration = null) {
    if (!('mediaSession' in navigator) || typeof navigator.mediaSession.setPositionState !== 'function') return;
    try {
      const rawDur = duration ?? (Number.isFinite(this.audio.duration) && this.audio.duration > 0 ? this.audio.duration : this.currentTrack?.duration || 0);
      const rawCur = current ?? (Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0);

      const dur = Number(rawDur);
      const cur = Number(rawCur);

      if (Number.isFinite(dur) && dur > 0 && Number.isFinite(cur) && cur >= 0) {
        const clampedPos = Math.min(Math.max(0, cur), dur);
        const rate = Math.max(0.1, Number(this.playbackRate || 1.0));
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: rate,
          position: clampedPos
        });
      }
    } catch (e) {
      // Ignore non-finite (e.g. live radio) or unsupported arguments
    }
  }

  // --- Core Playback Controls ---

  /**
   * Returns true when it is safe for playback to auto-advance to the next
   * item in the current queue. This covers ALL modes — the caller is
   * responsible for deciding whether that next item may come from
   * recommendations or must be the next deterministic entry.
   */
  _isAutoAdvanceAllowed() {
    return this.smartMoodAutoplay || this.isDeterministicPlayback();
  }

  /**
   * Returns true when the player is in a mode where song order is
   * fully controlled by the user (Favorites or User-Created Playlist).
   * In this mode the Recommendation Engine must NEVER inject songs.
   */
  isDeterministicPlayback() {
    return ['favorites', 'playlist'].includes(this.playbackContext.type);
  }

  // Backwards-compatible alias (used by smartMoodAutoplay check paths)
  isContinuousPlaybackAllowed() {
    return this.smartMoodAutoplay || this.isDeterministicPlayback();
  }

  playTrack(track, queue = null, context = { type: 'browse' }) {
    if (!track) return;
    this.streamRetryCount = 0;

    if (queue && Array.isArray(queue) && queue.length > 0) {
      this.playbackContext = context;
      this.seedTrack = track;
      this.userQueue = [];
      this.recommendationQueue = [];

      // IMPORTANT: For deterministic playback (favorites/playlist) we must
      // never allow the recommendation engine's previously computed
      // suggestedTracks to bleed into playback after the queue ends.
      if (this.isDeterministicPlayback()) {
        this.suggestedTracks = [];
      }

      // For deterministic modes, shuffle is only applied when the user
      // explicitly enables it AFTER entering the mode — on initial entry
      // always respect the source order so the user's intent is honoured.
      this.originalQueue = [...queue];
      this.queue = this.isShuffle ? this.shuffleArray([...queue]) : [...queue];
      this.currentIndex = this.queue.findIndex(t => t.id === track.id);
      if (this.currentIndex === -1) {
        this.queue.unshift(track);
        this.currentIndex = 0;
      }
      this.notify('queueUpdate', {
        queue: this.queue,
        index: this.currentIndex,
        seedTrack: this.seedTrack,
        userQueue: this.userQueue,
        recommendationQueue: this.recommendationQueue
      });
      this.loadAndPlayCurrent();
    } else {
      this.playWithSeed(track, 'track');
    }
  }

  async playWithSeed(track, context = 'search') {
    if (!track) return;
    this.playbackContext = { type: typeof context === 'string' ? 'browse' : context.type };
    this.seedTrack = track;
    this.userQueue = [];
    this.recommendationQueue = [];
    this.originalQueue = [track];
    this.queue = [track];
    this.currentIndex = 0;

    // Reset session history when starting a new discovery session so the
    // recommendation engine has a clean slate for repetition avoidance.
    this.sessionHistory = [];

    this.notify('queueUpdate', {
      queue: this.queue,
      index: this.currentIndex,
      seedTrack: this.seedTrack,
      userQueue: this.userQueue,
      recommendationQueue: this.recommendationQueue
    });

    this.loadAndPlayCurrent();

    // Dynamically generate true recommendation queue in background (independent of search results)
    this.fetchRecommendationsForSeed(track);
  }

  async fetchRecommendationsForSeed(seedTrack) {
    if (!seedTrack || this.isGeneratingRecommendations || this.isDeterministicPlayback()) return;
    this.isGeneratingRecommendations = true;
    try {
      const existingIds = [seedTrack.id, seedTrack.videoId].filter(Boolean);
      const recs = await recommendationEngine.generateQueue(seedTrack, {
        limit: 20,
        existingQueueIds: existingIds
      });

      if (this.isDeterministicPlayback()) return;

      if (Array.isArray(recs) && recs.length > 0) {
        this.recommendationQueue = recs;
        this.rebuildCombinedQueue();
        this.notify('recommendationsUpdate', {
          seedTrack,
          recommendations: this.recommendationQueue
        });
      }
    } catch (err) {
      console.warn('[AudioPlayer] Error fetching recommendations for seed:', err);
    } finally {
      this.isGeneratingRecommendations = false;
    }
  }

  rebuildCombinedQueue() {
    const historyAndCurrent = this.queue.slice(0, this.currentIndex + 1);
    const existingIds = new Set(historyAndCurrent.map(t => t.id || t.videoId));

    const combinedUpNext = [];
    const recommendationTracks = this.isDeterministicPlayback() ? [] : this.recommendationQueue;
    for (const t of [...this.userQueue, ...recommendationTracks]) {
      const vid = t.videoId || t.id;
      if (!existingIds.has(t.id) && !existingIds.has(vid)) {
        existingIds.add(t.id);
        existingIds.add(vid);
        combinedUpNext.push(t);
      }
    }

    this.queue = [...historyAndCurrent, ...combinedUpNext];
    this.originalQueue = [...this.queue];
    this.notify('queueUpdate', {
      queue: this.queue,
      index: this.currentIndex,
      seedTrack: this.seedTrack,
      userQueue: this.userQueue,
      recommendationQueue: this.recommendationQueue
    });
  }

  async checkAndReplenishRecommendations() {
    if (this.isDeterministicPlayback()) return;
    const remainingCount = this.queue.length - (this.currentIndex + 1);
    if (remainingCount < 4 && this.currentTrack && !this.isGeneratingRecommendations) {
      this.isGeneratingRecommendations = true;
      try {
        const moreRecs = await recommendationEngine.fetchMoreRecommendations(
          this.currentTrack,
          this.queue,
          10,
          { sessionContext: this.sessionHistory }  // pass session history so engine avoids repeats
        );
        if (moreRecs && moreRecs.length > 0) {
          this.recommendationQueue.push(...moreRecs);
          this.rebuildCombinedQueue();
        }
      } catch (err) {
        console.warn('[AudioPlayer] Error replenishing recommendations:', err);
      } finally {
        this.isGeneratingRecommendations = false;
      }
    }
  }

  loadAndPlayCurrent() {
    if (this.currentIndex < 0 || this.currentIndex >= this.queue.length) return;
    this.currentTrack = this.queue[this.currentIndex];
    this.streamRetryCount = 0;
    this.currentPlayStartTime = Date.now();
    this.hasRecordedCompletion = false;

    // Normalize metadata before recording the event so profile and ranking agree.
    this.currentTrack.vibeMetadata = api.extractVibe(this.currentTrack);
    this.currentTrack.language = this.currentTrack.vibeMetadata.language;
    this.sessionHistory = [this.currentTrack, ...this.sessionHistory.filter(item => item.id !== this.currentTrack.id)].slice(0, 20);
    StorageManager.recordPlaybackEvent(this.currentTrack, 'play');

    // Auto-detect YouTube video ID from track.videoId or track.id (e.g. 'yt_dQw4w9WgXcQ' or 11-char ID)
    if (!this.currentTrack.videoId) {
      if (this.currentTrack.id && String(this.currentTrack.id).startsWith('yt_')) {
        this.currentTrack.videoId = String(this.currentTrack.id).replace('yt_', '');
      } else if (this.currentTrack.id && /^[a-zA-Z0-9_-]{11}$/.test(String(this.currentTrack.id))) {
        this.currentTrack.videoId = String(this.currentTrack.id);
      }
    }

    // Ensure YouTube tracks route through our local live audio proxy
    if (this.currentTrack.videoId) {
      this.currentTrack.audioUrl = `/api/yt/audio?id=${this.currentTrack.videoId}`;
    }

    this.audio.src = this.currentTrack.audioUrl;
    this.audio.load();
    try {
      this.audio.playbackRate = this.playbackRate || 1.0;
      this.audio.defaultPlaybackRate = this.playbackRate || 1.0;
    } catch (e) {}

    this.initAudioContext();
    this.updateMediaSessionMetadata();
    this.notify('trackChange', this.currentTrack);

    // Detect and notify song mood, then pre-fetch same-mood continuation
    const detectedMood = this.currentTrack.mood || api.detectMood(this.currentTrack);
    this.currentTrack.mood = detectedMood;
    this.currentMood = detectedMood;
    this.notify('moodChange', { mood: this.currentMood, track: this.currentTrack });
    this.fetchMoodSuggestions(this.currentTrack);

    StorageManager.addRecentTrack(this.currentTrack);

    // Primary audio engine: play via native HTML5 <audio> for uninterrupted background playback
    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        if (err.name === 'AbortError') {
          // Play was superseded by a new track or load operation
          return;
        }
        if (err.name === 'NotAllowedError') {
          // Autoplay policy prevented automatic playback; pause UI and wait for user play tap
          console.warn('[AudioPlayer] Playback not allowed by autoplay policy:', err);
          this.notify('playbackChange', false);
          this.updateMediaSessionPlaybackState('paused');
          return;
        }
        console.warn('Native HTMLAudio play promise rejected:', err);
        this.handleAudioPlaybackError();
      });
    }
  }

  togglePlay() {
    if (!this.currentTrack) {
      if (this.queue.length > 0) {
        this.currentIndex = 0;
        this.loadAndPlayCurrent();
      } else if (CONFIG.CURATED_TRACKS && CONFIG.CURATED_TRACKS.length > 0) {
        this.playTrack(CONFIG.CURATED_TRACKS[0], CONFIG.CURATED_TRACKS);
      }
      return;
    }

    this.initAudioContext();

    if (this.audio.paused) {
      this.audio.play().catch(err => {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          this.handleAudioPlaybackError();
        }
      });
    } else {
      this.audio.pause();
    }
  }

  pause() {
    this.audio.pause();
    this.notify('playbackChange', false);
    this.updateMediaSessionPlaybackState('paused');
    this.updateMediaSessionPosition();
    this.releaseWakeLock();
  }

  resume() {
    this.initAudioContext();
    if (this.audio.src) {
      this.notify('playbackChange', true);
      this.updateMediaSessionPlaybackState('playing');
      this.requestWakeLock();
      this.audio.play().catch(err => {
        if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
          this.handleAudioPlaybackError();
        }
      });
    }
  }

  hasNext() {
    return this.currentIndex < this.queue.length - 1;
  }

  hasPrev() {
    return this.currentIndex > 0;
  }

  next(autoTrigger = false) {
    if (!autoTrigger && this.currentTrack && !this.hasRecordedCompletion) {
      const playedSeconds = this.currentPlayStartTime ? (Date.now() - this.currentPlayStartTime) / 1000 : 0;
      StorageManager.recordPlaybackEvent(this.currentTrack, 'skip', { playedSeconds });
    }

    // ── Move to next item in the current queue ───────────────────────────
    if (this.hasNext()) {
      this.currentIndex++;
      this.loadAndPlayCurrent();
      // Only replenish recommendations in Discovery mode
      if (!this.isDeterministicPlayback()) {
        this.checkAndReplenishRecommendations();
      }
      return;
    }

    // ── End of queue ─────────────────────────────────────────────────────

    // DETERMINISTIC MODE (Favorites / User-Created Playlist)
    // Recommendations must NEVER be injected here.
    if (this.isDeterministicPlayback()) {
      if (this.repeatMode === 'all') {
        this.currentIndex = 0;
        this.loadAndPlayCurrent();
      } else if (this.isShuffle) {
        const shuffled = this.shuffleArray([...this.originalQueue]);
        this.queue = shuffled;
        this.originalQueue = [...shuffled];
        this.currentIndex = 0;
        this.notify('queueUpdate', { queue: this.queue, index: this.currentIndex, seedTrack: this.seedTrack });
        this.loadAndPlayCurrent();
      } else {
        // Clean stop
        this.notify('playbackChange', false);
      }
      return;
    }

    // DISCOVERY MODE
    if (this.repeatMode === 'all') {
      this.currentIndex = 0;
      this.loadAndPlayCurrent();
      return;
    }

    if (this.smartMoodAutoplay && this.recommendationQueue.length > 0) {
      const nextTrack = this.recommendationQueue.shift();
      this.queue.push(nextTrack);
      this.currentIndex = this.queue.length - 1;
      this.notify('queueUpdate', {
        queue: this.queue,
        index: this.currentIndex,
        seedTrack: this.seedTrack,
        userQueue: this.userQueue,
        recommendationQueue: this.recommendationQueue
      });
      this.loadAndPlayCurrent();
      this.checkAndReplenishRecommendations();
      return;
    }

    if (this.smartMoodAutoplay && this.suggestedTracks.length > 0) {
      this.playNextSuggestedMoodTrack();
      return;
    }

    // No more tracks — stop
    this.notify('playbackChange', false);
  }

  prev() {
    return this.previous();
  }

  previous() {
    const cur = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    if (cur > 3) {
      this.seekTo(0);
      return;
    }

    if (this.hasPrev()) {
      this.currentIndex--;
      this.loadAndPlayCurrent();
    } else {
      this.seekTo(0);
    }
  }

  get duration() {
    if (this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }
    return this.currentTrack?.duration || 0;
  }

  get currentTime() {
    if (this.audio && Number.isFinite(this.audio.currentTime)) {
      return this.audio.currentTime;
    }
    return 0;
  }

  seekTo(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return;
    const dur = this.duration;
    const clamped = dur > 0 ? Math.max(0, Math.min(seconds, dur)) : Math.max(0, seconds);
    this.audio.currentTime = clamped;
    this.updateMediaSessionPosition(clamped, dur);
    const percent = dur > 0 ? (clamped / dur) * 100 : 0;
    this.notify('timeUpdate', { current: clamped, duration: dur, percent });
  }

  seekByPercent(percent) {
    const duration = this.duration;
    if (duration > 0) {
      this.seekTo((percent / 100) * duration);
    }
  }

  setVolume(val) {
    const volume = Math.max(0, Math.min(1, val));
    this.volume = volume;
    this.isMuted = false;
    this.audio.volume = this.volume;
    this.audio.muted = false;

    StorageManager.saveSettings({
      volume: this.volume,
      muted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });

    this.notify('modeChange', {
      volume: this.volume,
      isMuted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });
  }

  /**
   * Temporary volume adjustment for Sleep Mode gradual fade-out.
   * Does NOT alter the user's permanent master volume or settings.
   */
  setFadeVolume(ratio) {
    const clamped = Math.max(0, Math.min(1, ratio));
    const effectiveVol = this.isMuted ? 0 : (this.volume * clamped);
    this.audio.volume = effectiveVol;
  }

  /**
   * Restores audio playback volume to the user's saved master volume setting.
   */
  restoreNormalVolume() {
    const effectiveVol = this.isMuted ? 0 : this.volume;
    this.audio.volume = effectiveVol;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.muted = this.isMuted;
    this.audio.volume = this.isMuted ? 0 : this.volume;

    StorageManager.saveSettings({
      volume: this.volume,
      muted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });

    this.notify('modeChange', {
      volume: this.volume,
      isMuted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;

    if (this.isShuffle) {
      const current = this.queue[this.currentIndex];
      const remaining = this.queue.filter((_, idx) => idx !== this.currentIndex);
      this.queue = [current, ...this.shuffleArray(remaining)];
      this.currentIndex = 0;
    } else {
      if (this.originalQueue.length > 0) {
        const current = this.queue[this.currentIndex];
        this.queue = [...this.originalQueue];
        this.currentIndex = this.queue.findIndex(t => t.id === current?.id);
        if (this.currentIndex === -1) this.currentIndex = 0;
      }
    }

    StorageManager.saveSettings({
      volume: this.volume,
      muted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });

    this.notify('queueUpdate', { queue: this.queue, index: this.currentIndex });
    this.notify('modeChange', {
      volume: this.volume,
      isMuted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });
  }

  toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const nextIdx = (modes.indexOf(this.repeatMode) + 1) % modes.length;
    this.repeatMode = modes[nextIdx];

    StorageManager.saveSettings({
      volume: this.volume,
      muted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });

    this.notify('modeChange', {
      volume: this.volume,
      isMuted: this.isMuted,
      shuffle: this.isShuffle,
      repeatMode: this.repeatMode
    });
  }

  setPlaybackRate(rate) {
    this.playbackRate = rate;
    if (this.audio) {
      try {
        this.audio.playbackRate = rate;
        this.audio.defaultPlaybackRate = rate;
      } catch (e) {}
    }
    this.updateMediaSessionPosition();
    this.notify('playbackRateChange', rate);
    return rate;
  }

  togglePlaybackRate() {
    const rates = [1.0, 1.25, 1.5, 2.0, 0.75];
    const curRate = this.playbackRate || this.audio.playbackRate || 1.0;
    let curIdx = rates.findIndex(r => Math.abs(r - curRate) < 0.05);
    if (curIdx === -1) curIdx = 0;
    const nextIdx = (curIdx + 1) % rates.length;
    const newRate = rates[nextIdx];
    return this.setPlaybackRate(newRate);
  }

  shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // --- Queue Operations ---
  addToQueue(track) {
    if (!track) return;
    this.userQueue.push(track);
    this.rebuildCombinedQueue();
  }

  playNext(track) {
    if (!track) return;
    this.userQueue.unshift(track);
    this.rebuildCombinedQueue();
  }

  removeFromQueue(index) {
    if (index < 0 || index >= this.queue.length) return;
    if (index === this.currentIndex) {
      this.next();
      return;
    }
    const removedTrack = this.queue[index];
    this.queue.splice(index, 1);
    if (index < this.currentIndex) {
      this.currentIndex--;
    }
    if (removedTrack) {
      this.userQueue = this.userQueue.filter(t => t.id !== removedTrack.id);
      this.recommendationQueue = this.recommendationQueue.filter(t => t.id !== removedTrack.id);
    }
    this.notify('queueUpdate', {
      queue: this.queue,
      index: this.currentIndex,
      seedTrack: this.seedTrack,
      userQueue: this.userQueue,
      recommendationQueue: this.recommendationQueue
    });
  }

  clearQueue() {
    this.userQueue = [];
    this.recommendationQueue = [];
    if (this.currentTrack) {
      this.queue = [this.currentTrack];
      this.currentIndex = 0;
    } else {
      this.queue = [];
      this.currentIndex = -1;
    }
    this.notify('queueUpdate', {
      queue: this.queue,
      index: this.currentIndex,
      seedTrack: this.seedTrack,
      userQueue: this.userQueue,
      recommendationQueue: this.recommendationQueue
    });
  }

  // --- Mood-Based Next Music Suggestions & Smart Autoplay ---
  async fetchMoodSuggestions(track, overrideMood = null) {
    if (!track || this.isDeterministicPlayback()) {
      this.suggestedTracks = [];
      return;
    }
    const requestId = (this.suggestionRequestId || 0) + 1;
    this.suggestionRequestId = requestId;
    const targetMood = overrideMood || this.currentMood;
    this.isFetchingSuggestions = true;
    this.notify('suggestionsUpdate', { mood: targetMood, tracks: this.suggestedTracks, loading: true });
    try {
      const res = await api.getRelatedTracks(track, targetMood, 15);
      const existingIds = new Set(this.queue.flatMap(item => [item.id, item.videoId].filter(Boolean)));
      existingIds.add(track.id);
      if (track.videoId) existingIds.add(track.videoId);
      const rankedTracks = await recommendationEngine.generateQueue(track, {
        limit: 15,
        existingQueueIds: [...existingIds],
        sessionContext: this.sessionHistory
      });
      if (requestId !== this.suggestionRequestId || this.currentTrack?.id !== track.id) return;
      const remoteTracks = (rankedTracks.length > 0 ? rankedTracks : (res?.tracks || []))
        .filter(t => !existingIds.has(t.id) && !existingIds.has(t.videoId));
      const fallbackTracks = this.getLocalSuggestionFallback(track, targetMood, existingIds);
      const seenIds = new Set();
      this.suggestedTracks = [...remoteTracks, ...fallbackTracks]
        .filter(candidate => {
          const key = candidate.videoId || candidate.id;
          if (!key || seenIds.has(key) || candidate.id === track.id || candidate.videoId === track.videoId) return false;
          seenIds.add(key);
          return true;
        })
        .slice(0, 10);
      this.notify('suggestionsUpdate', { mood: targetMood, tracks: this.suggestedTracks });
    } catch (err) {
      console.warn('Failed to fetch mood suggestions:', err);
      if (requestId !== this.suggestionRequestId || this.currentTrack?.id !== track.id) return;
      this.suggestedTracks = this.getLocalSuggestionFallback(track, targetMood);
      this.notify('suggestionsUpdate', { mood: targetMood, tracks: this.suggestedTracks });
    } finally {
      this.isFetchingSuggestions = false;
    }
  }

  getLocalSuggestionFallback(track, targetMood, excludedIds = null) {
    const excluded = excludedIds || new Set(this.queue.flatMap(item => [item.id, item.videoId].filter(Boolean)));
    excluded.add(track.id);
    if (track.videoId) excluded.add(track.videoId);
    const seedLanguage = api.extractVibe(track).language;
    if (!['hindi', 'bhojpuri', 'punjabi', 'tamil', 'telugu', 'bengali', 'english'].includes(seedLanguage)) return [];
    const libraryTracks = [
      ...StorageManager.getLikedSongs(),
      ...StorageManager.getPlaylists().flatMap(playlist => playlist.tracks || []),
      ...StorageManager.getRecentTracks()
    ];
    const candidates = [...this.queue, ...libraryTracks, ...CONFIG.CURATED_TRACKS, ...OVERALL_TRAVEL_SONGS];
    const seenIds = new Set();
    return candidates
      .filter(candidate => {
        const key = candidate?.videoId || candidate?.id;
        return candidate && key && api.extractVibe(candidate).language === seedLanguage &&
          !excluded.has(candidate.id) && !excluded.has(candidate.videoId);
      })
      .sort((a, b) => {
        const aScore = (a.mood === targetMood ? 2 : 0) + (a.artist === track.artist ? 1 : 0);
        const bScore = (b.mood === targetMood ? 2 : 0) + (b.artist === track.artist ? 1 : 0);
        return bScore - aScore;
      })
      .filter(candidate => {
        const key = candidate.videoId || candidate.id;
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      })
      .slice(0, 10);
  }

  setMoodOverride(newMood) {
    this.currentMood = newMood;
    if (this.currentTrack) {
      this.currentTrack.mood = newMood;
    }
    this.notify('moodChange', { mood: this.currentMood, track: this.currentTrack });
    if (this.currentTrack) {
      this.fetchMoodSuggestions(this.currentTrack, newMood);
    }
  }

  toggleSmartMoodAutoplay() {
    this.smartMoodAutoplay = !this.smartMoodAutoplay;
    StorageManager.updateSettings({ smartMoodAutoplay: this.smartMoodAutoplay });
    this.notify('modeChange', { smartMoodAutoplay: this.smartMoodAutoplay });
    return this.smartMoodAutoplay;
  }

  async playNextSuggestedMoodTrack() {
    if (this.suggestedTracks.length > 0) {
      const nextTrack = this.suggestedTracks.shift();
      nextTrack.mood = nextTrack.mood || this.currentMood;
      this.queue.push(nextTrack);
      this.currentIndex = this.queue.length - 1;
      this.notify('queueUpdate', { queue: this.queue, index: this.currentIndex });
      this.notify('suggestionsUpdate', { mood: this.currentMood, tracks: this.suggestedTracks });
      this.loadAndPlayCurrent();
    } else if (this.currentTrack) {
      await this.fetchMoodSuggestions(this.currentTrack);
      if (this.suggestedTracks.length > 0) {
        const nextTrack = this.suggestedTracks.shift();
        nextTrack.mood = nextTrack.mood || this.currentMood;
        this.queue.push(nextTrack);
        this.currentIndex = this.queue.length - 1;
        this.notify('queueUpdate', { queue: this.queue, index: this.currentIndex });
        this.notify('suggestionsUpdate', { mood: this.currentMood, tracks: this.suggestedTracks });
        this.loadAndPlayCurrent();
      } else {
        this.notify('playbackChange', false);
      }
    }
  }

  // --- Audio Output Routing & Device Management ---
  async getAudioOutputDevices() {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(d => d.kind === 'audiooutput');
      } catch (err) {
        console.warn('MediaDevices enumerateDevices error:', err);
        return [];
      }
    }
    return [];
  }

  isSetSinkIdSupported() {
    return !!(this.audio && typeof this.audio.setSinkId === 'function');
  }

  async setAudioOutputDevice(deviceId) {
    if (!this.isSetSinkIdSupported()) {
      return { success: false, reason: 'unsupported' };
    }
    try {
      const targetSinkId = deviceId === 'default' ? '' : deviceId;
      await this.audio.setSinkId(targetSinkId);
      this.currentSinkId = deviceId;
      this.notify('audioOutputChange', { deviceId });
      return { success: true, deviceId };
    } catch (err) {
      console.warn('Failed to switch audio output sink:', err);
      return { success: false, error: err };
    }
  }

  getCurrentSinkId() {
    if (this.currentSinkId) return this.currentSinkId;
    if (this.audio && typeof this.audio.sinkId === 'string') {
      return this.audio.sinkId === '' ? 'default' : this.audio.sinkId;
    }
    return 'default';
  }

  // --- Observer ---
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  notify(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(fn => fn(data));
    }
  }
}

export const player = new AudioPlayer();
