/**
 * Aura Music - Audio Player Engine with True Android Background Playback & YouTube Player Fallback
 */

import { CONFIG } from './config.js';
import { StorageManager } from './storage.js';
import { api } from './api.js';
import { recommendationEngine } from './recommendation.js';

class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    // Do NOT set crossOrigin = 'anonymous' to avoid CORS rejections on third-party CDNs
    this.audio.preload = 'auto';

    // Crucial for mobile / Android background audio
    this.audio.setAttribute('playsinline', 'true');
    this.audio.setAttribute('webkit-playsinline', 'true');

    this.currentTrack = null;
    this.queue = [];
    this.currentIndex = -1;
    this.originalQueue = [];
    this.userQueue = [];
    this.recommendationQueue = [];
    this.seedTrack = null;
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
    this.smartMoodAutoplay = settings.smartMoodAutoplay !== false; // default true (matches sad to sad, happy to happy)
    this.currentMood = 'chill';
    this.suggestedTracks = [];
    this.isFetchingSuggestions = false;

    this.audio.volume = this.isMuted ? 0 : this.volume;

    // Web Audio API
    this.audioCtx = null;
    this.analyser = null;
    this.sourceNode = null;
    this.audioConnected = false;

    // YouTube Iframe Fallback Player
    this.ytPlayer = null;
    this.usingYtPlayer = false; // True when YouTube Iframe is the active audio engine
    this.isYtPlaying = false;
    this.pendingVideoId = null;
    this.ytTimer = null;

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
      recommendationsUpdate: []
    };
    this.playbackRate = 1.0;

    this.bindAudioEvents();
    this.initMediaSession();
    this.bindVisibilityEvents();
    this.initYouTubeIframeAPI();
  }

  // --- Initialize Web Audio Analyser ---
  initAudioContext() {
    if (this.audioCtx) {
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
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
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible' && !this.audio.paused) {
        await this.requestWakeLock();
      }
    });
  }

  // --- YouTube IFrame API Fallback Loader ---
  initYouTubeIframeAPI() {
    if (window.YT && window.YT.Player) return;

    window.onYouTubeIframeAPIReady = () => {
      console.info('YouTube IFrame API Loaded successfully');
      if (this.pendingVideoId) {
        const vid = this.pendingVideoId;
        this.pendingVideoId = null;
        this.setupYouTubePlayer(vid);
      }
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }

  setupYouTubePlayer(videoId) {
    this.usingYtPlayer = true;

    let container = document.getElementById('ytPlayerContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'ytPlayerContainer';
      // Hidden off-screen but active
      container.style.cssText = 'position:fixed; width:10px; height:10px; left:-9999px; bottom:0; opacity:0; pointer-events:none; z-index:-1;';
      document.body.appendChild(container);
    }

    let playerDiv = document.getElementById('ytPlayerDiv');
    if (!playerDiv) {
      playerDiv = document.createElement('div');
      playerDiv.id = 'ytPlayerDiv';
      container.appendChild(playerDiv);
    }

    if (this.ytPlayer && typeof this.ytPlayer.loadVideoById === 'function') {
      this.ytPlayer.loadVideoById(videoId);
      this.ytPlayer.playVideo();
      this.isYtPlaying = true;
      this.notify('playbackChange', true);
      this.updateMediaSessionPlaybackState('playing');
      this.startYtProgressTracker();
      return;
    }

    if (!window.YT || !window.YT.Player) {
      this.pendingVideoId = videoId;
      return;
    }

    this.ytPlayer = new window.YT.Player('ytPlayerDiv', {
      height: '10',
      width: '10',
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        fs: 0,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: (event) => {
          event.target.setVolume(this.isMuted ? 0 : this.volume * 100);
          if (typeof event.target.setPlaybackRate === 'function') {
            try {
              event.target.setPlaybackRate(this.playbackRate || 1.0);
            } catch (e) {}
          }
          event.target.playVideo();
          this.isYtPlaying = true;
          this.notify('playbackChange', true);
          this.updateMediaSessionPlaybackState('playing');
          this.startYtProgressTracker();
        },
        onStateChange: (event) => {
          // YT.PlayerState.PLAYING = 1, PAUSED = 2, BUFFERING = 3, ENDED = 0
          if (event.data === 1) {
            this.isYtPlaying = true;
            this.notify('playbackChange', true);
            this.updateMediaSessionPlaybackState('playing');
          } else if (event.data === 2) {
            this.isYtPlaying = false;
            this.notify('playbackChange', false);
            this.updateMediaSessionPlaybackState('paused');
          } else if (event.data === 0) {
            this.isYtPlaying = false;
            this.handleTrackEnded();
          }
        },
        onError: (err) => {
          console.warn('YouTube Iframe Player Error:', err);
          this.isYtPlaying = false;
          this.notify('playbackChange', false);
        }
      }
    });
  }

  startYtProgressTracker() {
    clearInterval(this.ytTimer);
    this.ytTimer = setInterval(() => {
      if (this.usingYtPlayer && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
        const current = this.ytPlayer.getCurrentTime() || 0;
        const duration = (typeof this.ytPlayer.getDuration === 'function' ? this.ytPlayer.getDuration() : 0) || this.currentTrack?.duration || 0;
        const percent = duration > 0 ? (current / duration) * 100 : 0;
        if (percent >= 70 && !this.hasRecordedCompletion && this.currentTrack) {
          this.hasRecordedCompletion = true;
          StorageManager.recordPlaybackEvent(this.currentTrack, 'complete');
        }
        this.notify('timeUpdate', { current, duration, percent });
        this.updateMediaSessionPosition(current, duration);
      }
    }, 500);
  }

  fallbackToYouTubeIframe() {
    if (!this.currentTrack?.videoId) {
      if (this.currentTrack?.id && String(this.currentTrack.id).startsWith('yt_')) {
        this.currentTrack.videoId = String(this.currentTrack.id).replace('yt_', '');
      } else if (this.currentTrack?.id && /^[a-zA-Z0-9_-]{11}$/.test(String(this.currentTrack.id))) {
        this.currentTrack.videoId = String(this.currentTrack.id);
      } else {
        return;
      }
    }
    console.info(`Falling back to YouTube official player for: ${this.currentTrack.title}`);
    this.audio.pause();
    this.usingYtPlayer = true;
    this.setupYouTubePlayer(this.currentTrack.videoId);
  }

  // --- Audio Event Listeners ---
  bindAudioEvents() {
    this.audio.addEventListener('play', () => {
      this.usingYtPlayer = false;
      this.isYtPlaying = false;
      if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      }
      this.notify('playbackChange', true);
      this.updateMediaSessionPlaybackState('playing');
      this.requestWakeLock();
    });

    this.audio.addEventListener('pause', () => {
      if (!this.usingYtPlayer) {
        this.notify('playbackChange', false);
        this.updateMediaSessionPlaybackState('paused');
        this.releaseWakeLock();
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      if (!this.usingYtPlayer) {
        const current = this.audio.currentTime || 0;
        const duration = this.audio.duration || this.currentTrack?.duration || 0;
        const percent = duration > 0 ? (current / duration) * 100 : 0;
        if (percent >= 70 && !this.hasRecordedCompletion && this.currentTrack) {
          this.hasRecordedCompletion = true;
          StorageManager.recordPlaybackEvent(this.currentTrack, 'complete');
        }
        this.notify('timeUpdate', { current, duration, percent });
        this.updateMediaSessionPosition(current, duration);
      }
    });

    this.audio.addEventListener('ended', () => {
      this.handleTrackEnded();
    });

    this.audio.addEventListener('error', (e) => {
      console.warn('Audio element playback error encountered:', e);

      // Auto-detect videoId if missing
      if (!this.currentTrack?.videoId) {
        if (this.currentTrack?.id && String(this.currentTrack.id).startsWith('yt_')) {
          this.currentTrack.videoId = String(this.currentTrack.id).replace('yt_', '');
        } else if (this.currentTrack?.id && /^[a-zA-Z0-9_-]{11}$/.test(String(this.currentTrack.id))) {
          this.currentTrack.videoId = String(this.currentTrack.id);
        }
      }

      // If YouTube track, try failover without skipping!
      if (this.currentTrack?.videoId) {
        if (this.streamRetryCount === 0) {
          this.streamRetryCount++;
          // Try Piped stream proxy
          const pipedUrl = `https://pipedapi.adminforge.de/streams/${this.currentTrack.videoId}`;
          fetch(pipedUrl, { signal: AbortSignal.timeout(4000) })
            .then(res => res.json())
            .then(data => {
              const audioStreams = data?.audioStreams || [];
              if (audioStreams.length > 0 && audioStreams[0].url) {
                console.info('Found Piped stream fallback');
                this.audio.src = audioStreams[0].url;
                this.audio.load();
                this.audio.play().catch(() => this.fallbackToYouTubeIframe());
              } else {
                this.fallbackToYouTubeIframe();
              }
            })
            .catch(() => {
              this.fallbackToYouTubeIframe();
            });
          return;
        }

        // Exhausted direct audio streams, switch to YouTube official player
        this.fallbackToYouTubeIframe();
        return;
      }

      this.notify('playbackChange', false);
    });
  }

  // --- Track Ended Handler ---
  handleTrackEnded() {
    if (this.currentTrack && !this.hasRecordedCompletion) {
      this.hasRecordedCompletion = true;
      StorageManager.recordPlaybackEvent(this.currentTrack, 'complete');
    }

    if (this.repeatMode === 'one') {
      if (this.usingYtPlayer && this.ytPlayer) {
        if (typeof this.ytPlayer.seekTo === 'function') {
          this.ytPlayer.seekTo(0, true);
        }
        if (typeof this.ytPlayer.playVideo === 'function') {
          this.ytPlayer.playVideo();
        }
      } else {
        this.audio.currentTime = 0;
        this.audio.play().catch(() => {});
      }
      return;
    }

    if (this.hasNext()) {
      this.next(true);
    } else if (this.repeatMode === 'all') {
      this.currentIndex = 0;
      this.loadAndPlayCurrent();
    } else if (this.recommendationQueue.length > 0) {
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
    } else if (this.smartMoodAutoplay && this.suggestedTracks.length > 0) {
      this.playNextSuggestedMoodTrack();
    } else {
      this.notify('playbackChange', false);
    }
  }

  // --- Enhanced Android Media Session API ---
  initMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.setActionHandler('play', () => this.resume());
    navigator.mediaSession.setActionHandler('pause', () => this.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => this.previous());
    navigator.mediaSession.setActionHandler('nexttrack', () => this.next());
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        this.seekTo(details.seekTime);
      }
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      const cur = this.usingYtPlayer ? (typeof this.ytPlayer?.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : 0) : this.audio.currentTime;
      this.seekTo(Math.max(0, cur - 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      const cur = this.usingYtPlayer ? (typeof this.ytPlayer?.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : 0) : this.audio.currentTime;
      const dur = this.usingYtPlayer ? (typeof this.ytPlayer?.getDuration === 'function' ? this.ytPlayer.getDuration() : 0) : this.audio.duration;
      this.seekTo(Math.min(dur || 0, cur + 10));
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      this.pause();
      this.seekTo(0);
    });
  }

  updateMediaSessionMetadata() {
    if (!('mediaSession' in navigator) || !this.currentTrack) return;

    const img = this.currentTrack.image || 'assets/default-cover.svg';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: this.currentTrack.title || 'Aura Track',
      artist: this.currentTrack.artist || 'Aura Music',
      album: this.currentTrack.album || 'Live Music',
      artwork: [
        { src: img, sizes: '96x96', type: 'image/jpeg' },
        { src: img, sizes: '128x128', type: 'image/jpeg' },
        { src: img, sizes: '192x192', type: 'image/jpeg' },
        { src: img, sizes: '256x256', type: 'image/jpeg' },
        { src: img, sizes: '384x384', type: 'image/jpeg' },
        { src: img, sizes: '512x512', type: 'image/jpeg' }
      ]
    });
  }

  updateMediaSessionPlaybackState(state) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.playbackState = state;
    } catch (e) {}
  }

  updateMediaSessionPosition(current = null, duration = null) {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    try {
      const dur = duration ?? (this.usingYtPlayer ? (typeof this.ytPlayer?.getDuration === 'function' ? this.ytPlayer.getDuration() : 0) : this.audio.duration);
      const cur = current ?? (this.usingYtPlayer ? (typeof this.ytPlayer?.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : 0) : this.audio.currentTime);

      if (dur && !isNaN(dur) && isFinite(dur) && cur !== null && !isNaN(cur)) {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: 1,
          position: Math.min(cur, dur)
        });
      }
    } catch (e) {}
  }

  // --- Core Playback Controls ---
  playTrack(track, queue = null) {
    if (!track) return;
    this.streamRetryCount = 0;

    if (queue && Array.isArray(queue) && queue.length > 0) {
      this.seedTrack = track;
      this.userQueue = [];
      this.recommendationQueue = [];
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
    this.seedTrack = track;
    this.userQueue = [];
    this.recommendationQueue = [];
    this.originalQueue = [track];
    this.queue = [track];
    this.currentIndex = 0;

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
    if (!seedTrack || this.isGeneratingRecommendations) return;
    this.isGeneratingRecommendations = true;
    try {
      const existingIds = [seedTrack.id, seedTrack.videoId].filter(Boolean);
      const recs = await recommendationEngine.generateQueue(seedTrack, {
        limit: 20,
        existingQueueIds: existingIds
      });

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
    for (const t of [...this.userQueue, ...this.recommendationQueue]) {
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
    const remainingCount = this.queue.length - (this.currentIndex + 1);
    if (remainingCount < 4 && this.currentTrack && !this.isGeneratingRecommendations) {
      this.isGeneratingRecommendations = true;
      try {
        const moreRecs = await recommendationEngine.fetchMoreRecommendations(
          this.currentTrack,
          this.queue,
          10
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
    this.usingYtPlayer = false;
    this.isYtPlaying = false;
    this.currentPlayStartTime = Date.now();
    this.hasRecordedCompletion = false;

    // Record playback start in user preferences
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

    if (this.ytPlayer && typeof this.ytPlayer.pauseVideo === 'function') {
      this.ytPlayer.pauseVideo();
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

    const playPromise = this.audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.info('Direct audio stream pending or failed, evaluating fallback:', err);
        // If YouTube track fails immediately, try fallback
        if (this.currentTrack?.videoId) {
          setTimeout(() => {
            if (this.audio.paused && !this.isYtPlaying && !this.usingYtPlayer) {
              this.fallbackToYouTubeIframe();
            }
          }, 1500);
        }
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

    if (this.usingYtPlayer && this.ytPlayer) {
      const state = typeof this.ytPlayer.getPlayerState === 'function' ? this.ytPlayer.getPlayerState() : (this.isYtPlaying ? 1 : 2);
      if (state === 1 || state === 3) {
        if (typeof this.ytPlayer.pauseVideo === 'function') {
          this.ytPlayer.pauseVideo();
        }
        this.isYtPlaying = false;
        this.notify('playbackChange', false);
        this.updateMediaSessionPlaybackState('paused');
      } else {
        if (typeof this.ytPlayer.playVideo === 'function') {
          this.ytPlayer.playVideo();
        }
        this.isYtPlaying = true;
        this.notify('playbackChange', true);
        this.updateMediaSessionPlaybackState('playing');
        this.startYtProgressTracker();
      }
      return;
    }

    if (this.audio.paused) {
      this.audio.play().catch(() => {
        if (this.currentTrack?.videoId) {
          this.fallbackToYouTubeIframe();
        }
      });
    } else {
      this.audio.pause();
    }
  }

  pause() {
    if (this.usingYtPlayer && this.ytPlayer) {
      if (typeof this.ytPlayer.pauseVideo === 'function') {
        this.ytPlayer.pauseVideo();
      }
      this.isYtPlaying = false;
      this.notify('playbackChange', false);
      this.updateMediaSessionPlaybackState('paused');
    } else {
      this.audio.pause();
    }
  }

  resume() {
    this.initAudioContext();
    if (this.usingYtPlayer && this.ytPlayer) {
      if (typeof this.ytPlayer.playVideo === 'function') {
        this.ytPlayer.playVideo();
      }
      this.isYtPlaying = true;
      this.notify('playbackChange', true);
      this.updateMediaSessionPlaybackState('playing');
      this.startYtProgressTracker();
    } else if (this.audio.src) {
      this.audio.play().catch(() => {
        if (this.currentTrack?.videoId) {
          this.fallbackToYouTubeIframe();
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

    if (this.hasNext()) {
      this.currentIndex++;
      this.loadAndPlayCurrent();
      this.checkAndReplenishRecommendations();
    } else if (this.repeatMode === 'all') {
      this.currentIndex = 0;
      this.loadAndPlayCurrent();
    } else if (this.recommendationQueue.length > 0) {
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
    } else if (this.smartMoodAutoplay && this.suggestedTracks.length > 0) {
      this.playNextSuggestedMoodTrack();
    } else if (!autoTrigger) {
      this.currentIndex = 0;
      this.loadAndPlayCurrent();
    }
  }

  prev() {
    return this.previous();
  }

  previous() {
    const cur = this.usingYtPlayer ? (typeof this.ytPlayer?.getCurrentTime === 'function' ? this.ytPlayer.getCurrentTime() : 0) : this.audio.currentTime;
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
    if (this.usingYtPlayer && this.ytPlayer && typeof this.ytPlayer.getDuration === 'function') {
      const d = this.ytPlayer.getDuration();
      if (d > 0) return d;
    }
    if (this.audio && Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
      return this.audio.duration;
    }
    return this.currentTrack?.duration || 0;
  }

  get currentTime() {
    if (this.usingYtPlayer && this.ytPlayer && typeof this.ytPlayer.getCurrentTime === 'function') {
      return this.ytPlayer.getCurrentTime() || 0;
    }
    if (this.audio && Number.isFinite(this.audio.currentTime)) {
      return this.audio.currentTime;
    }
    return 0;
  }

  seekTo(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return;
    if (this.usingYtPlayer && this.ytPlayer) {
      if (typeof this.ytPlayer.seekTo === 'function') {
        this.ytPlayer.seekTo(seconds, true);
      }
    } else {
      this.audio.currentTime = seconds;
    }
  }

  seekByPercent(percent) {
    const duration = this.usingYtPlayer ? ((typeof this.ytPlayer?.getDuration === 'function' ? this.ytPlayer.getDuration() : 0) || this.currentTrack?.duration || 0) : (this.audio.duration || this.currentTrack?.duration || 0);
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

    if (this.ytPlayer && this.ytPlayer.setVolume) {
      this.ytPlayer.setVolume(this.volume * 100);
      this.ytPlayer.unMute();
    }

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
    if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
      this.ytPlayer.setVolume(effectiveVol * 100);
    }
  }

  /**
   * Restores audio playback volume to the user's saved master volume setting.
   */
  restoreNormalVolume() {
    const effectiveVol = this.isMuted ? 0 : this.volume;
    this.audio.volume = effectiveVol;
    if (this.ytPlayer && typeof this.ytPlayer.setVolume === 'function') {
      this.ytPlayer.setVolume(effectiveVol * 100);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    this.audio.muted = this.isMuted;
    this.audio.volume = this.isMuted ? 0 : this.volume;

    if (this.ytPlayer) {
      if (this.isMuted) {
        this.ytPlayer.mute();
      } else {
        this.ytPlayer.unMute();
        this.ytPlayer.setVolume(this.volume * 100);
      }
    }

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
    if (this.usingYtPlayer && this.ytPlayer && typeof this.ytPlayer.setPlaybackRate === 'function') {
      try {
        this.ytPlayer.setPlaybackRate(rate);
      } catch (e) {}
    }
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
    if (!track) return;
    const targetMood = overrideMood || this.currentMood;
    this.isFetchingSuggestions = true;
    try {
      const res = await api.getRelatedTracks(track, targetMood, 15);
      if (res && Array.isArray(res.tracks)) {
        const existingIds = new Set(this.queue.map(t => t.id));
        existingIds.add(track.id);
        this.suggestedTracks = res.tracks.filter(t => !existingIds.has(t.id));
        this.notify('suggestionsUpdate', { mood: targetMood, tracks: this.suggestedTracks });
      }
    } catch (err) {
      console.warn('Failed to fetch mood suggestions:', err);
    } finally {
      this.isFetchingSuggestions = false;
    }
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
