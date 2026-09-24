/**
 * Aura Music - Main Application Controller with Auth, Downloads, Posters & Sharing
 */

import { CONFIG } from './config.js';
import { api } from './api.js';
import { player } from './player.js';
import { AudioVisualizer } from './visualizer.js';
import { StorageManager } from './storage.js';
import { UIManager } from './ui.js';
import { renderQRCodeSvg } from './qrcode.js';
import { auth } from './auth.js';
import { ColorExtractor } from './colorExtractor.js';
import { sleepMode } from './sleepMode.js';
import { TRAVEL_CATEGORIES, OVERALL_TRAVEL_SONGS, CATEGORY_SONGS, getSuggestedTravelSongs } from './travelData.js';

class App {
  constructor() {
    this.currentView = 'home';
    this.activeGenre = 'all';
    this.currentPlaylistId = null;
    this.activeLyricsLines = [];
    this.searchTimeout = null;
    this.currentSuggestionsSongs = [];
    this.highlightedSuggIndex = -1;
    this.deferredInstallPrompt = null;
    this.authMode = 'login'; // 'login' | 'register'

    // Sleep Mode & Traveling Vibes State
    this.selectedSleepMinutes = 15;
    this.activeTravelCategory = null; // null => Overall Traveling Songs
    this.isTravelSuggestActive = false;

    // Visualizer instance
    this.visualizer = null;

    this.init();
  }

  async init() {
    this.cacheDOM();
    this.initVisualizer();
    this.initSleepMode();
    this.bindEvents();
    this.bindSwipeNavigation();
    this.bindPlayerEvents();
    this.bindKeyboardShortcuts();
    this.initDragAndDrop();
    this.initAndroidPWA();

    // Auto-sync storage changes with server when authenticated
    StorageManager.onDataChanged = () => {
      if (auth.isLoggedIn()) {
        auth.syncCollectionToServer();
      }
    };

    // Initialize Auth Session
    await auth.init((user) => this.updateAuthUI(user));
    await this.initGoogleAuth();

    // Render sidebar playlists
    UIManager.renderSidebarPlaylists((playlistId) => this.navigatePlaylist(playlistId));

    // Check URL parameters for shared songs or actions
    const urlParams = new URLSearchParams(window.location.search);
    const sharedSongQuery = urlParams.get('q') || urlParams.get('song');
    const action = urlParams.get('action');

    if (sharedSongQuery) {
      this.handleSharedSong(sharedSongQuery);
    } else if (action === 'liked') {
      this.navigate('liked');
    } else if (action === 'radio') {
      this.navigate('radio');
    } else {
      await this.navigate('home');
    }

    // Register service worker for offline resilience & Android PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
          reg.update();
        }).catch(() => {});
      });
    }
  }

  cacheDOM() {
    this.dom = {
      // Navigation
      navLinks: document.querySelectorAll('.sidebar .nav-link[data-view]'),
      bottomTabs: document.querySelectorAll('.bottom-tab-bar .tab-item[data-view]'),
      mobileMenuBtn: document.getElementById('mobileMenuBtn'),
      sidebar: document.getElementById('sidebar'),
      contentArea: document.getElementById('contentArea'),

      // Search
      searchContainer: document.getElementById('searchContainer'),
      searchInput: document.getElementById('searchInput'),
      searchClear: document.getElementById('searchClear'),
      btnSearchSubmit: document.getElementById('btnSearchSubmit'),
      searchSuggestionsDropdown: document.getElementById('searchSuggestionsDropdown'),

      // User Profile & Auth Modal
      userProfileBtn: document.getElementById('userProfileBtn'),
      authModal: document.getElementById('authModal'),
      btnCloseAuthModal: document.getElementById('btnCloseAuthModal'),
      authErrorMsg: document.getElementById('authErrorMsg'),

      // Google Auth Elements
      btnContinueWithGoogle: document.getElementById('btnContinueWithGoogle'),
      btnGoogleText: document.getElementById('btnGoogleText'),
      googleSignInBtnContainer: document.getElementById('googleSignInBtnContainer'),

      // Password Sub-Tabs & Form
      subTabLogin: document.getElementById('subTabLogin'),
      subTabRegister: document.getElementById('subTabRegister'),
      authForm: document.getElementById('authForm'),
      authTabLogin: document.getElementById('authTabLogin'),
      authTabRegister: document.getElementById('authTabRegister'),
      authEmailGroup: document.getElementById('authEmailGroup'),
      authUsernameInput: document.getElementById('authUsernameInput'),
      authEmailInput: document.getElementById('authEmailInput'),
      authPasswordInput: document.getElementById('authPasswordInput'),
      authSubmitBtn: document.getElementById('authSubmitBtn'),

      // User Profile Dropdown Modal
      userMenuModal: document.getElementById('userMenuModal'),
      btnCloseUserMenu: document.getElementById('btnCloseUserMenu'),
      userMenuName: document.getElementById('userMenuName'),
      userMenuEmail: document.getElementById('userMenuEmail'),
      btnSyncCollection: document.getElementById('btnSyncCollection'),
      btnLogout: document.getElementById('btnLogout'),

      // Android Install & Mobile Connect
      btnInstallApp: document.getElementById('btnInstallApp'),
      btnConnectMobile: document.getElementById('btnConnectMobile'),
      mobileModal: document.getElementById('mobileModal'),
      btnCloseMobileModal: document.getElementById('btnCloseMobileModal'),
      mobileQrContainer: document.getElementById('mobileQrContainer'),
      mobileUrlText: document.getElementById('mobileUrlText'),

      // Player bar
      playerBar: document.getElementById('playerBar'),
      trackThumbWrapper: document.getElementById('trackThumbWrapper'),
      trackThumb: document.getElementById('trackThumb'),
      trackTitle: document.getElementById('trackTitle'),
      trackArtist: document.getElementById('trackArtist'),
      playerMoodBadge: document.getElementById('playerMoodBadge'),
      btnLikeCurrent: document.getElementById('btnLikeCurrent'),
      btnDownloadCurrent: document.getElementById('btnDownloadCurrent'),
      btnShareCurrent: document.getElementById('btnShareCurrent'),
      miniEq: document.getElementById('miniEq'),

      btnShuffle: document.getElementById('btnShuffle'),
      btnPrev: document.getElementById('btnPrev'),
      btnPlay: document.getElementById('btnPlay'),
      btnNext: document.getElementById('btnNext'),
      btnRepeat: document.getElementById('btnRepeat'),

      progressSlider: document.getElementById('progressSlider'),
      progressFill: document.getElementById('progressFill'),
      progressThumb: document.getElementById('progressThumb'),
      progressTooltip: document.getElementById('progressTooltip'),
      timeCurrent: document.getElementById('timeCurrent'),
      timeTotal: document.getElementById('timeTotal'),

      btnMute: document.getElementById('btnMute'),
      volumeSlider: document.getElementById('volumeSlider'),
      volumeFill: document.getElementById('volumeFill'),
      volumeThumb: document.getElementById('volumeThumb'),

      btnLyricsToggle: document.getElementById('btnLyricsToggle'),
      btnQueueToggle: document.getElementById('btnQueueToggle'),
      btnFullscreenToggle: document.getElementById('btnFullscreenToggle'),

      // Queue Drawer
      queueDrawer: document.getElementById('queueDrawer'),
      btnCloseQueue: document.getElementById('btnCloseQueue'),
      btnClearQueue: document.getElementById('btnClearQueue'),
      queueSuggestionsContainer: document.getElementById('queueSuggestionsContainer'),
      queueSmartAutoplayToggle: document.getElementById('queueSmartAutoplayToggle'),

      // Mood Picker Modal
      moodModal: document.getElementById('moodModal'),
      btnCloseMoodModal: document.getElementById('btnCloseMoodModal'),

      // Lyrics Overlay & Reading Mode
      lyricsOverlay: document.getElementById('lyricsOverlay'),
      lyricsContent: document.getElementById('lyricsContent'),
      lyricsTitle: document.getElementById('lyricsTitle'),
      lyricsArtist: document.getElementById('lyricsArtist'),
      btnCloseLyrics: document.getElementById('btnCloseLyrics'),
      btnLyricsModeToggle: document.getElementById('btnLyricsModeToggle'),
      btnLyricsFontDec: document.getElementById('btnLyricsFontDec'),
      btnLyricsFontInc: document.getElementById('btnLyricsFontInc'),
      btnLyricsCopy: document.getElementById('btnLyricsCopy'),

      // Fullscreen Overlay
      fullscreenOverlay: document.getElementById('fullscreenOverlay'),
      appleSheetHandle: document.getElementById('appleSheetHandle'),
      fullscreenBg: document.getElementById('fullscreenBg'),
      fullscreenVinyl: document.getElementById('fullscreenVinyl'),
      fullscreenArtwork: document.getElementById('fullscreenArtwork'),
      fullscreenTitle: document.getElementById('fullscreenTitle'),
      fullscreenHeaderTitle: document.getElementById('fullscreenHeaderTitle'),
      fullscreenArtist: document.getElementById('fullscreenArtist'),
      fullscreenPlayBtn: document.getElementById('fullscreenPlayBtn'),
      btnCloseFullscreen: document.getElementById('btnCloseFullscreen'),
      btnFullscreenShuffle: document.getElementById('btnFullscreenShuffle'),
      btnFullscreenPrev: document.getElementById('btnFullscreenPrev'),
      btnFullscreenNext: document.getElementById('btnFullscreenNext'),
      btnFullscreenRepeat: document.getElementById('btnFullscreenRepeat'),
      btnFullscreenSpeed: document.getElementById('btnFullscreenSpeed'),
      btnFullscreenLike: document.getElementById('btnFullscreenLike'),
      btnFullscreenLyrics: document.getElementById('btnFullscreenLyrics'),
      btnFullscreenDownload: document.getElementById('btnFullscreenDownload'),
      btnFullscreenShare: document.getElementById('btnFullscreenShare'),
      btnFullscreenAddToPlaylist: document.getElementById('btnFullscreenAddToPlaylist'),
      btnFullscreenUpNext: document.getElementById('btnFullscreenUpNext'),
      fullscreenProgressSlider: document.getElementById('fullscreenProgressSlider'),
      fullscreenProgressFill: document.getElementById('fullscreenProgressFill'),
      fullscreenProgressThumb: document.getElementById('fullscreenProgressThumb'),
      fullscreenProgressTooltip: document.getElementById('fullscreenProgressTooltip'),
      fullscreenTimeCurrent: document.getElementById('fullscreenTimeCurrent'),
      fullscreenTimeTotal: document.getElementById('fullscreenTimeTotal'),
      visualizerCanvas: document.getElementById('visualizerCanvas'),

      // Share Modal
      shareModal: document.getElementById('shareModal'),
      btnCloseShareModal: document.getElementById('btnCloseShareModal'),

      // Playlist Modal
      btnOpenCreatePlaylist: document.getElementById('btnOpenCreatePlaylist'),
      playlistModal: document.getElementById('playlistModal'),
      playlistForm: document.getElementById('playlistForm'),
      playlistNameInput: document.getElementById('playlistNameInput'),
      playlistDescInput: document.getElementById('playlistDescInput'),
      btnCancelPlaylist: document.getElementById('btnCancelPlaylist'),

      // Local File Input
      localFileInput: document.getElementById('localFileInput'),

      // Add to Playlist Elements
      btnAddToPlaylistCurrent: document.getElementById('btnAddToPlaylistCurrent'),
      btnFullscreenAddToPlaylist: document.getElementById('btnFullscreenAddToPlaylist'),
      addToPlaylistModal: document.getElementById('addToPlaylistModal'),
      btnCloseAddToPlaylistModal: document.getElementById('btnCloseAddToPlaylistModal'),
      addToPlaylistThumb: document.getElementById('addToPlaylistThumb'),
      addToPlaylistTitle: document.getElementById('addToPlaylistTitle'),
      addToPlaylistArtist: document.getElementById('addToPlaylistArtist'),
      addToPlaylistItems: document.getElementById('addToPlaylistItems'),
      btnCreateNewFromAddToPlaylist: document.getElementById('btnCreateNewFromAddToPlaylist'),

      // Sleep Mode Elements
      sleepModal: document.getElementById('sleepModal'),
      btnCloseSleepModal: document.getElementById('btnCloseSleepModal'),
      sleepSetupView: document.getElementById('sleepSetupView'),
      sleepActiveView: document.getElementById('sleepActiveView'),
      sleepCountdownDisplay: document.getElementById('sleepCountdownDisplay'),
      sleepFadeNotice: document.getElementById('sleepFadeNotice'),
      btnStartSleepMode: document.getElementById('btnStartSleepMode'),
      btnChangeSleepTimer: document.getElementById('btnChangeSleepTimer'),
      btnCancelSleepMode: document.getElementById('btnCancelSleepMode'),
      sleepCustomInputWrap: document.getElementById('sleepCustomInputWrap'),
      sleepCustomMinutes: document.getElementById('sleepCustomMinutes'),
      btnOpenSleepFromOptions: document.getElementById('btnOpenSleepFromOptions'),
      moreSleepStatus: document.getElementById('moreSleepStatus'),
      moreSleepTag: document.getElementById('moreSleepTag'),
      miniSleepPill: document.getElementById('miniSleepPill'),
      miniSleepRemaining: document.getElementById('miniSleepRemaining'),
      fullscreenSleepPill: document.getElementById('fullscreenSleepPill'),
      fullscreenSleepRemaining: document.getElementById('fullscreenSleepRemaining')
    };
  }

  initVisualizer() {
    if (this.dom.visualizerCanvas) {
      this.visualizer = new AudioVisualizer(this.dom.visualizerCanvas);
    }
  }

  // --- Google Authentication & Account Chooser (GIS) ---
  async initGoogleAuth() {
    let clientId = CONFIG.GOOGLE_CLIENT_ID ? CONFIG.GOOGLE_CLIENT_ID.trim() : '';
    if (!clientId) {
      try {
        const res = await fetch('/api/auth/config', { signal: AbortSignal.timeout(2500) });
        if (res.ok) {
          const cfg = await res.json();
          if (cfg.googleClientId) {
            clientId = cfg.googleClientId.trim();
          }
        }
      } catch (e) {
        // Fallback or offline
      }
    }

    this.googleClientId = clientId;

    const setupGIS = () => {
      if (!window.google?.accounts || !this.googleClientId) return;

      // 1. Initialize Google Identity Services (ID Token Flow)
      try {
        window.google.accounts.id.initialize({
          client_id: this.googleClientId,
          callback: async (response) => {
            if (response.credential) {
              await this.handleGoogleAuthSuccess({ credential: response.credential });
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin'
        });

        // Render official GIS button if container exists
        if (this.dom.googleSignInBtnContainer) {
          window.google.accounts.id.renderButton(
            this.dom.googleSignInBtnContainer,
            {
              theme: 'filled_blue',
              size: 'large',
              type: 'standard',
              shape: 'pill',
              text: 'continue_with',
              logo_alignment: 'left',
              width: 320
            }
          );
        }
      } catch (err) {
        console.warn('[Google GIS init]', err);
      }

      // 2. Initialize Google OAuth 2.0 Token Client (Popup flow with official Account Chooser)
      try {
        this.googleTokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: this.googleClientId,
          scope: 'openid profile email',
          prompt: 'select_account',
          callback: async (tokenResponse) => {
            if (tokenResponse.error) {
              this.setGoogleButtonLoading(false);
              if (tokenResponse.error !== 'access_denied') {
                if (this.dom.authErrorMsg) {
                  this.dom.authErrorMsg.textContent = `Google Sign-In: ${tokenResponse.error_description || tokenResponse.error}`;
                }
              }
              return;
            }
            if (tokenResponse.access_token) {
              await this.handleGoogleAuthSuccess({ accessToken: tokenResponse.access_token });
            }
          },
          error_callback: (err) => {
            this.setGoogleButtonLoading(false);
            console.warn('[Google TokenClient error]', err);
            if (this.dom.authErrorMsg) {
              this.dom.authErrorMsg.textContent = 'Google sign-in was closed or could not open.';
            }
          }
        });
      } catch (err) {
        console.warn('[Google TokenClient init]', err);
      }
    };

    if (window.google?.accounts) {
      setupGIS();
    } else {
      window.addEventListener('load', setupGIS, { once: true });
    }
  }

  setGoogleButtonLoading(isLoading) {
    if (!this.dom.btnContinueWithGoogle) return;
    if (isLoading) {
      this.dom.btnContinueWithGoogle.disabled = true;
      if (this.dom.btnGoogleText) this.dom.btnGoogleText.textContent = 'Signing in with Google...';
    } else {
      this.dom.btnContinueWithGoogle.disabled = false;
      if (this.dom.btnGoogleText) this.dom.btnGoogleText.textContent = 'Continue with Google';
    }
  }

  async handleGoogleAuthSuccess({ credential, accessToken }) {
    this.setGoogleButtonLoading(true);
    if (this.dom.authErrorMsg) this.dom.authErrorMsg.textContent = '';

    try {
      const user = await auth.loginWithGoogle({ credential, accessToken });
      UIManager.showToast(`Signed in as ${user.username || user.email}!`, 'success');

      this.updateAuthUI(user);
      UIManager.renderSidebarPlaylists((id) => this.navigatePlaylist(id));
      this.dom.authModal.classList.remove('open');

      if (this.currentView === 'library') this.renderLibraryView();
      if (this.currentView === 'liked') this.renderLikedView();
    } catch (err) {
      if (this.dom.authErrorMsg) {
        this.dom.authErrorMsg.textContent = err.message || 'Google authentication failed';
      }
    } finally {
      this.setGoogleButtonLoading(false);
    }
  }

  // --- Auth UI Updates ---
  updateAuthUI(user) {
    if (user) {
      const isGoogle = user.authProvider === 'google';
      let avatarHtml = `<div class="user-avatar-circle">${UIManager.escapeHtml(user.username.charAt(0).toUpperCase())}</div>`;
      if (isGoogle && user.picture) {
        avatarHtml = `<img src="${UIManager.escapeHtml(user.picture)}" class="user-avatar-circle" style="object-fit: cover; width: 28px; height: 28px; border-radius: 50%;" referrerpolicy="no-referrer" alt="${UIManager.escapeHtml(user.username)}" />`;
      } else if (isGoogle) {
        avatarHtml = `<div class="user-avatar-circle" style="background:#4285F4; color:#fff;">G</div>`;
      }

      this.dom.userProfileBtn.innerHTML = `
        ${avatarHtml}
        <span>${UIManager.escapeHtml(user.username)}</span>
      `;

      let badgeHtml = isGoogle ? `<span class="google-user-badge">Google</span>` : '';

      this.dom.userMenuName.innerHTML = `
        <span>${UIManager.escapeHtml(user.username)}</span>
        ${badgeHtml}
      `;
      this.dom.userMenuEmail.textContent = user.email || 'AppleTube Member';
    } else {
      this.dom.userProfileBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
        <span>Sign In</span>
      `;
    }
  }

  // --- Android PWA Installation ---
  initAndroidPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      if (this.dom.btnInstallApp) {
        this.dom.btnInstallApp.style.display = 'inline-flex';
      }
      const heroInstall = document.getElementById('btnHeroInstall');
      if (heroInstall) {
        heroInstall.style.display = 'inline-flex';
      }
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      if (this.dom.btnInstallApp) {
        this.dom.btnInstallApp.style.display = 'none';
      }
      UIManager.showToast('🎉 Aura Music installed successfully!', 'success');
    });
  }

  triggerAndroidInstall() {
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      this.deferredInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === 'accepted') {
          UIManager.showToast('Installing Aura Music...', 'info');
        }
        this.deferredInstallPrompt = null;
      });
    } else {
      this.openMobileModal();
    }
  }

  openMobileModal() {
    if (!this.dom.mobileModal) return;
    const currentHost = window.location.host;
    const isLocalhost = currentHost.includes('localhost') || currentHost.includes('127.0.0.1');
    const displayUrl = isLocalhost
      ? `http://${window.location.hostname}:3000`
      : window.location.href;

    if (this.dom.mobileQrContainer) {
      this.dom.mobileQrContainer.innerHTML = renderQRCodeSvg(displayUrl, 190);
    }
    if (this.dom.mobileUrlText) {
      this.dom.mobileUrlText.textContent = displayUrl;
    }

    this.dom.mobileModal.classList.add('open');
  }

  // --- Download & Share Methods ---
  downloadTrack(track) {
    if (!track) return;
    UIManager.showToast(`Downloading "${track.title}"...`, 'info');

    let downloadUrl = track.audioUrl;
    if (track.videoId) {
      downloadUrl = `/api/yt/audio?id=${track.videoId}&download=1&title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist)}`;
    }

    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${track.artist || 'AppleTube'} - ${track.title || 'Track'}.m4a`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }

  shareTrack(track) {
    if (!track) {
      UIManager.showToast('No song playing to share', 'info');
      return;
    }
    UIManager.showShareModal(track);
  }

  openAddToPlaylist(track) {
    if (!track) return;
    UIManager.showAddToPlaylistModal(
      track,
      async (playlistId, t, isAdded) => {
        await auth.syncCollectionToServer();
        UIManager.renderSidebarPlaylists((id) => this.navigatePlaylist(id));
        if (this.currentView === 'library') this.renderLibraryView();
        if (this.currentView === 'playlist' && this.currentPlaylistId === playlistId) {
          const updated = StorageManager.getPlaylists().find(p => p.id === playlistId);
          if (updated) this.renderPlaylistView(updated);
        }
      },
      (t) => {
        this.pendingTrackForNewPlaylist = t;
        this.dom.playlistModal.classList.add('open');
        this.dom.playlistNameInput.focus();
      }
    );
  }

  async handleSharedSong(query) {
    UIManager.showToast('Loading shared track...', 'info');
    const results = await api.searchSongs(query, 5);
    if (results && results.length > 0) {
      player.playTrack(results[0], results);
    }
    this.navigate('home');
  }

  // --- Sleep Mode Controls ---
  initSleepMode() {
    sleepMode.init();

    sleepMode.on('tick', ({ formattedTime, isFading }) => {
      if (this.dom.sleepCountdownDisplay) {
        this.dom.sleepCountdownDisplay.textContent = formattedTime;
      }
      if (this.dom.sleepFadeNotice) {
        this.dom.sleepFadeNotice.style.display = isFading ? 'block' : 'none';
      }
      if (this.dom.miniSleepRemaining) {
        this.dom.miniSleepRemaining.textContent = formattedTime;
      }
      if (this.dom.fullscreenSleepRemaining) {
        this.dom.fullscreenSleepRemaining.textContent = formattedTime;
      }
      if (this.dom.moreSleepStatus) {
        this.dom.moreSleepStatus.textContent = `${formattedTime} remaining`;
      }
      const heroBadge = document.getElementById('sleepHeroBadge');
      if (heroBadge) {
        heroBadge.textContent = `🌙 ${formattedTime} remaining`;
      }
    });

    sleepMode.on('start', ({ durationMinutes }) => {
      this.updateSleepUIState(true);
      UIManager.showToast(`Sleep Mode started for ${durationMinutes} minutes`, 'success');
      this.openSleepModal();
    });

    sleepMode.on('cancel', () => {
      this.updateSleepUIState(false);
      UIManager.showToast('Sleep Mode cancelled', 'info');
      this.openSleepModal();
    });

    sleepMode.on('complete', () => {
      this.updateSleepUIState(false);
      this.closeSleepModal();
      UIManager.showToast('Sleep timer ended. Goodnight!', 'info');
    });

    this.updateSleepUIState(sleepMode.isActive);
  }

  updateSleepUIState(isActive) {
    if (this.dom.miniSleepPill) {
      this.dom.miniSleepPill.style.display = isActive ? 'inline-flex' : 'none';
    }
    if (this.dom.fullscreenSleepPill) {
      this.dom.fullscreenSleepPill.style.display = isActive ? 'inline-flex' : 'none';
    }
    if (this.dom.moreSleepTag) {
      this.dom.moreSleepTag.textContent = isActive ? 'Active' : 'Off';
      this.dom.moreSleepTag.classList.toggle('active', isActive);
    }
    if (this.dom.moreSleepStatus) {
      this.dom.moreSleepStatus.textContent = isActive
        ? `${sleepMode.getRemaining().formattedTime} remaining`
        : 'Set timer to auto-stop playback';
    }
    const heroBadge = document.getElementById('sleepHeroBadge');
    if (heroBadge) {
      heroBadge.style.display = isActive ? 'inline-flex' : 'none';
      if (isActive) heroBadge.textContent = `🌙 ${sleepMode.getRemaining().formattedTime} remaining`;
    }
  }

  openSleepModal() {
    const isRunning = sleepMode.isActive;
    if (isRunning) {
      if (this.dom.sleepSetupView) this.dom.sleepSetupView.style.display = 'none';
      if (this.dom.sleepActiveView) this.dom.sleepActiveView.style.display = 'block';
      const rem = sleepMode.getRemaining();
      if (this.dom.sleepCountdownDisplay) this.dom.sleepCountdownDisplay.textContent = rem.formattedTime;
      if (this.dom.sleepFadeNotice) this.dom.sleepFadeNotice.style.display = rem.isFading ? 'block' : 'none';
    } else {
      if (this.dom.sleepSetupView) this.dom.sleepSetupView.style.display = 'block';
      if (this.dom.sleepActiveView) this.dom.sleepActiveView.style.display = 'none';
    }
    if (this.dom.sleepModal) this.dom.sleepModal.classList.add('open');
  }

  closeSleepModal() {
    if (this.dom.sleepModal) this.dom.sleepModal.classList.remove('open');
  }

  // --- UI Event Bindings ---
  bindEvents() {
    // Sidebar Navigation
    this.dom.navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const view = link.dataset.view;
        this.navigate(view);
        if (window.innerWidth <= 720) {
          this.dom.sidebar.classList.remove('mobile-open');
        }
      });
    });

    // Apple Music Android Bottom Tab Bar Navigation
    if (this.dom.bottomTabs) {
      this.dom.bottomTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
          e.preventDefault();
          const view = tab.dataset.view;
          this.navigate(view);
        });
      });
    }

    // Apple Music Mobile Floating Mini-Player: tap card to expand Now Playing sheet
    if (this.dom.playerBar) {
      this.dom.playerBar.addEventListener('click', (e) => {
        if (window.innerWidth <= 960) {
          // If clicked on button or slider, let the control handle it
          if (e.target.closest('button') || e.target.closest('.slider-bar')) {
            return;
          }
          this.toggleFullscreen(true);
        }
      });
    }

    // Mobile menu toggle
    if (this.dom.mobileMenuBtn) {
      this.dom.mobileMenuBtn.addEventListener('click', () => {
        this.dom.sidebar.classList.toggle('mobile-open');
      });
    }

    // User Profile / Auth Button
    if (this.dom.userProfileBtn) {
      this.dom.userProfileBtn.addEventListener('click', () => {
        if (auth.isLoggedIn()) {
          this.dom.userMenuModal.classList.add('open');
        } else {
          this.dom.authModal.classList.add('open');
          if (this.dom.authErrorMsg) this.dom.authErrorMsg.textContent = '';
        }
      });
    }

    if (this.dom.btnCloseAuthModal) {
      this.dom.btnCloseAuthModal.addEventListener('click', () => {
        this.dom.authModal.classList.remove('open');
      });
    }

    if (this.dom.btnCloseUserMenu) {
      this.dom.btnCloseUserMenu.addEventListener('click', () => {
        this.dom.userMenuModal.classList.remove('open');
      });
    }

    // --- Official Google Sign-In Action (Account Chooser) ---
    if (this.dom.btnContinueWithGoogle) {
      this.dom.btnContinueWithGoogle.addEventListener('click', () => {
        if (this.dom.authErrorMsg) this.dom.authErrorMsg.textContent = '';

        if (!this.googleClientId) {
          if (this.dom.authErrorMsg) {
            this.dom.authErrorMsg.textContent = 'Google sign-in is currently unavailable.';
          }
          return;
        }

        if (this.googleTokenClient) {
          this.setGoogleButtonLoading(true);
          try {
            this.googleTokenClient.requestAccessToken({ prompt: 'select_account' });
          } catch (e) {
            this.setGoogleButtonLoading(false);
            console.error('Google token client request error:', e);
            if (this.dom.authErrorMsg) {
              this.dom.authErrorMsg.textContent = 'Failed to open Google Account Chooser. Please check popup permissions.';
            }
          }
        } else if (window.google?.accounts?.id) {
          this.setGoogleButtonLoading(true);
          window.google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
              this.setGoogleButtonLoading(false);
              if (this.dom.googleSignInBtnContainer) {
                this.dom.googleSignInBtnContainer.style.display = 'flex';
              }
            }
          });
        } else {
          if (this.dom.authErrorMsg) {
            this.dom.authErrorMsg.textContent = 'Google Identity Services is loading. Please try again.';
          }
        }
      });
    }

    // --- 3. Password Auth Handlers & Sub-Tabs ---
    if (this.dom.subTabLogin && this.dom.subTabRegister) {
      this.dom.subTabLogin.addEventListener('click', () => {
        this.authMode = 'login';
        this.dom.subTabLogin.style.background = 'rgba(255,255,255,0.12)';
        this.dom.subTabLogin.style.color = '#fff';
        this.dom.subTabRegister.style.background = 'transparent';
        this.dom.subTabRegister.style.color = 'var(--text-secondary)';
        if (this.dom.authEmailGroup) this.dom.authEmailGroup.style.display = 'none';
        if (this.dom.authSubmitBtn) this.dom.authSubmitBtn.textContent = 'Sign In';
        if (this.dom.authErrorMsg) this.dom.authErrorMsg.textContent = '';
      });

      this.dom.subTabRegister.addEventListener('click', () => {
        this.authMode = 'register';
        this.dom.subTabRegister.style.background = 'rgba(255,255,255,0.12)';
        this.dom.subTabRegister.style.color = '#fff';
        this.dom.subTabLogin.style.background = 'transparent';
        this.dom.subTabLogin.style.color = 'var(--text-secondary)';
        if (this.dom.authEmailGroup) this.dom.authEmailGroup.style.display = 'block';
        if (this.dom.authSubmitBtn) this.dom.authSubmitBtn.textContent = 'Create Account';
        if (this.dom.authErrorMsg) this.dom.authErrorMsg.textContent = '';
      });
    }

    // Auth Form Submission (Username / Password)
    if (this.dom.authForm) {
      this.dom.authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = this.dom.authUsernameInput.value.trim();
        const password = this.dom.authPasswordInput.value.trim();
        const email = this.dom.authEmailInput ? this.dom.authEmailInput.value.trim() : '';

        this.dom.authErrorMsg.textContent = '';
        this.dom.authSubmitBtn.disabled = true;

        try {
          let user;
          if (this.authMode === 'register') {
            user = await auth.register(username, email, password);
            UIManager.showToast(`Welcome to AppleTube, ${user.username}!`, 'success');
          } else {
            user = await auth.login(username, password);
            UIManager.showToast(`Welcome back, ${user.username}!`, 'success');
          }

          this.updateAuthUI(user);
          UIManager.renderSidebarPlaylists((id) => this.navigatePlaylist(id));
          this.dom.authModal.classList.remove('open');
          this.dom.authForm.reset();

          if (this.currentView === 'library') this.renderLibraryView();
          if (this.currentView === 'liked') this.renderLikedView();
        } catch (err) {
          this.dom.authErrorMsg.textContent = err.message || 'Authentication error';
        } finally {
          this.dom.authSubmitBtn.disabled = false;
        }
      });
    }

    // User Menu Actions (Sync & Logout)
    if (this.dom.btnSyncCollection) {
      this.dom.btnSyncCollection.addEventListener('click', async () => {
        await auth.syncCollectionToServer();
        UIManager.showToast('Music collection synced with cloud!', 'success');
      });
    }

    if (this.dom.btnLogout) {
      this.dom.btnLogout.addEventListener('click', async () => {
        await auth.logout();
        this.updateAuthUI(null);
        this.dom.userMenuModal.classList.remove('open');
        UIManager.showToast('Logged out');
        UIManager.renderSidebarPlaylists((id) => this.navigatePlaylist(id));
      });
    }

    // Android Install button
    if (this.dom.btnInstallApp) {
      this.dom.btnInstallApp.addEventListener('click', () => {
        this.triggerAndroidInstall();
      });
    }

    // Mobile Connect button
    if (this.dom.btnConnectMobile) {
      this.dom.btnConnectMobile.addEventListener('click', () => {
        this.openMobileModal();
      });
    }

    if (this.dom.btnCloseMobileModal) {
      this.dom.btnCloseMobileModal.addEventListener('click', () => {
        this.dom.mobileModal.classList.remove('open');
      });
    }

    // Search input & live suggestions
    this.bindSearchEvents();

    // Playback buttons
    this.dom.btnPlay.addEventListener('click', (e) => {
      e.stopPropagation();
      player.togglePlay();
    });
    this.dom.btnPrev.addEventListener('click', (e) => {
      e.stopPropagation();
      player.previous();
    });
    this.dom.btnNext.addEventListener('click', (e) => {
      e.stopPropagation();
      player.next();
    });
    this.dom.btnShuffle.addEventListener('click', (e) => {
      e.stopPropagation();
      player.toggleShuffle();
    });
    this.dom.btnRepeat.addEventListener('click', (e) => {
      e.stopPropagation();
      player.toggleRepeat();
    });

    // Like currently playing song (Favorites)
    this.dom.btnLikeCurrent.addEventListener('click', async () => {
      if (!player.currentTrack) return;
      const isLiked = StorageManager.toggleLike(player.currentTrack);
      this.updateLikeButton(isLiked);
      UIManager.showToast(isLiked ? 'Added to Favorites' : 'Removed from Favorites', 'success');
      await auth.syncCollectionToServer();
      if (this.currentView === 'liked') {
        this.renderLikedView();
      } else if (this.currentView === 'library') {
        this.renderLibraryView();
      }
    });

    // Download current song
    if (this.dom.btnDownloadCurrent) {
      this.dom.btnDownloadCurrent.addEventListener('click', () => {
        this.downloadTrack(player.currentTrack);
      });
    }

    // Share current song
    if (this.dom.btnShareCurrent) {
      this.dom.btnShareCurrent.addEventListener('click', () => {
        this.shareTrack(player.currentTrack);
      });
    }

    // Add current song to playlist from player bar
    if (this.dom.btnAddToPlaylistCurrent) {
      this.dom.btnAddToPlaylistCurrent.addEventListener('click', () => {
        if (player.currentTrack) {
          this.openAddToPlaylist(player.currentTrack);
        } else {
          UIManager.showToast('No song playing currently', 'info');
        }
      });
    }

    // Sleep Mode Modal Events & Controls
    this.dom.btnCloseSleepModal?.addEventListener('click', () => this.closeSleepModal());
    this.dom.sleepModal?.addEventListener('click', (e) => {
      if (e.target === this.dom.sleepModal) this.closeSleepModal();
    });

    document.querySelectorAll('.sleep-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sleep-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mins = btn.dataset.mins;
        if (mins === 'custom') {
          if (this.dom.sleepCustomInputWrap) this.dom.sleepCustomInputWrap.style.display = 'block';
          if (this.dom.sleepCustomMinutes) this.dom.sleepCustomMinutes.focus();
        } else {
          if (this.dom.sleepCustomInputWrap) this.dom.sleepCustomInputWrap.style.display = 'none';
          this.selectedSleepMinutes = parseInt(mins, 10);
        }
      });
    });

    this.dom.btnStartSleepMode?.addEventListener('click', () => {
      const activePreset = document.querySelector('.sleep-preset-btn.active');
      let mins = this.selectedSleepMinutes || 15;
      if (activePreset?.dataset.mins === 'custom') {
        const val = parseFloat(this.dom.sleepCustomMinutes?.value);
        if (isNaN(val) || val <= 0) {
          UIManager.showToast('Please enter valid minutes', 'warning');
          return;
        }
        mins = val;
      }
      sleepMode.start(mins);
    });

    this.dom.btnChangeSleepTimer?.addEventListener('click', () => {
      if (this.dom.sleepSetupView) this.dom.sleepSetupView.style.display = 'block';
      if (this.dom.sleepActiveView) this.dom.sleepActiveView.style.display = 'none';
    });

    this.dom.btnCancelSleepMode?.addEventListener('click', () => {
      sleepMode.cancel();
    });

    this.dom.btnOpenSleepFromOptions?.addEventListener('click', () => {
      if (this.dom.addToPlaylistModal) this.dom.addToPlaylistModal.classList.remove('open');
      this.openSleepModal();
    });

    this.dom.miniSleepPill?.addEventListener('click', () => this.openSleepModal());
    this.dom.fullscreenSleepPill?.addEventListener('click', () => this.openSleepModal());

    // Fullscreen View trigger from left bottom poster
    const openFullscreenFromPoster = () => {
      this.toggleFullscreen(true);
    };

    if (this.dom.trackThumbWrapper) {
      this.dom.trackThumbWrapper.addEventListener('click', openFullscreenFromPoster);
      this.dom.trackThumbWrapper.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openFullscreenFromPoster();
        }
      });
    }


    // Scrubber & Volume
    this.setupSeekScrubber();
    this.setupVolumeSlider();
    this.dom.btnMute.addEventListener('click', () => player.toggleMute());

    // Drawers
    this.dom.btnQueueToggle.addEventListener('click', () => {
      this.dom.queueDrawer.classList.toggle('open');
    });

    const btnFullscreenQueue = document.getElementById('btnFullscreenQueue');
    if (btnFullscreenQueue) {
      btnFullscreenQueue.addEventListener('click', () => {
        this.dom.queueDrawer.classList.toggle('open');
      });
    }

    this.dom.btnCloseQueue.addEventListener('click', () => {
      this.dom.queueDrawer.classList.remove('open');
    });

    this.dom.btnClearQueue.addEventListener('click', () => {
      player.clearQueue();
      UIManager.showToast('Queue cleared');
    });

    // Mood Badge Click -> Open Mood Selector Modal
    if (this.dom.playerMoodBadge) {
      this.dom.playerMoodBadge.addEventListener('click', () => {
        UIManager.showMoodPickerModal(player.currentMood, (newMood) => {
          player.setMoodOverride(newMood);
        });
      });
    }

    if (this.dom.btnCloseMoodModal) {
      this.dom.btnCloseMoodModal.addEventListener('click', () => {
        this.dom.moodModal.classList.remove('open');
      });
    }

    // Smart Mood Autoplay Switch in Queue Drawer
    if (this.dom.queueSmartAutoplayToggle) {
      this.dom.queueSmartAutoplayToggle.checked = player.smartMoodAutoplay;
      this.dom.queueSmartAutoplayToggle.addEventListener('change', () => {
        player.toggleSmartMoodAutoplay();
        UIManager.showToast(
          player.smartMoodAutoplay
            ? '✨ Smart Mood Autoplay Enabled (Sad to Sad, Happy to Happy)'
            : 'Smart Mood Autoplay Disabled',
          'info'
        );
      });
    }

    // Enhanced Lyrics Overlay
    this.dom.btnLyricsToggle.addEventListener('click', () => {
      this.toggleLyrics();
    });

    this.dom.btnCloseLyrics.addEventListener('click', () => {
      this.dom.lyricsOverlay.classList.remove('open');
    });

    if (this.dom.btnLyricsModeToggle) {
      this.dom.btnLyricsModeToggle.addEventListener('click', () => {
        this.activeLyricsLines = UIManager.toggleLyricsReadingMode(this.dom.lyricsContent);
        this.dom.btnLyricsModeToggle.textContent = UIManager.isLyricsReadingMode ? '🎤 Synced Karaoke' : '📖 Full Reading';
      });
    }

    if (this.dom.btnLyricsFontDec) {
      this.dom.btnLyricsFontDec.addEventListener('click', () => {
        UIManager.changeLyricsFontSize(this.dom.lyricsContent, -0.15);
      });
    }

    if (this.dom.btnLyricsFontInc) {
      this.dom.btnLyricsFontInc.addEventListener('click', () => {
        UIManager.changeLyricsFontSize(this.dom.lyricsContent, 0.15);
      });
    }

    if (this.dom.btnLyricsCopy) {
      this.dom.btnLyricsCopy.addEventListener('click', async () => {
        const text = UIManager.currentLyricsText.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
        if (text) {
          await navigator.clipboard.writeText(text);
          UIManager.showToast('Lyrics copied to clipboard!', 'success');
        }
      });
    }

    // Fullscreen Overlay
    if (this.dom.btnFullscreenToggle) {
      this.dom.btnFullscreenToggle.addEventListener('click', () => {
        this.toggleFullscreen();
      });
    }

    if (this.dom.btnCloseFullscreen) {
      this.dom.btnCloseFullscreen.addEventListener('click', () => {
        this.toggleFullscreen(false);
      });
    }

    if (this.dom.appleSheetHandle) {
      this.dom.appleSheetHandle.addEventListener('click', () => {
        this.toggleFullscreen(false);
      });
    }

    if (this.dom.fullscreenPlayBtn) {
      this.dom.fullscreenPlayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        player.togglePlay();
      });
    }

    if (this.dom.btnFullscreenPrev) {
      this.dom.btnFullscreenPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        player.previous();
      });
    }

    if (this.dom.btnFullscreenNext) {
      this.dom.btnFullscreenNext.addEventListener('click', (e) => {
        e.stopPropagation();
        player.next();
      });
    }

    if (this.dom.btnFullscreenShuffle) {
      this.dom.btnFullscreenShuffle.addEventListener('click', (e) => {
        e.stopPropagation();
        player.toggleShuffle();
      });
    }

    if (this.dom.btnFullscreenRepeat) {
      this.dom.btnFullscreenRepeat.addEventListener('click', (e) => {
        e.stopPropagation();
        player.toggleRepeat();
      });
    }

    if (this.dom.btnFullscreenLyrics) {
      this.dom.btnFullscreenLyrics.addEventListener('click', () => {
        this.toggleLyrics();
      });
    }

    if (this.dom.btnFullscreenLike) {
      this.dom.btnFullscreenLike.addEventListener('click', async () => {
        if (!player.currentTrack) return;
        const isLiked = StorageManager.toggleLike(player.currentTrack);
        this.updateLikeButton(isLiked);
        UIManager.showToast(isLiked ? 'Added to Favorites' : 'Removed from Favorites', 'success');
        await auth.syncCollectionToServer();
        if (this.currentView === 'liked') {
          this.renderLikedView();
        } else if (this.currentView === 'library') {
          this.renderLibraryView();
        }
      });
    }

    if (this.dom.btnFullscreenSpeed) {
      this.dom.btnFullscreenSpeed.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const rate = player.togglePlaybackRate();
        this.updateFullscreenSpeedBadge(rate);
        UIManager.showToast(`Playback speed: ${rate}x`, 'info');
      });
    }

    const btnFullscreenAirplay = document.getElementById('btnFullscreenAirplay');
    if (btnFullscreenAirplay) {
      btnFullscreenAirplay.addEventListener('click', () => {
        if (this.dom.mobileModal) {
          this.dom.mobileModal.classList.add('open');
        } else {
          UIManager.showToast('AirPlay / Audio Output', 'info');
        }
      });
    }

    if (this.dom.btnFullscreenUpNext) {
      this.dom.btnFullscreenUpNext.addEventListener('click', () => {
        this.dom.queueDrawer.classList.toggle('open');
      });
    }

    // Swipe up in the fullscreen player to reveal the glass Up Next sheet.
    if (this.dom.fullscreenOverlay) {
      let swipeStartY = 0;
      let swipeStartX = 0;
      let swipeCurrentY = 0;
      let swipeTracking = false;
      let swipeDirection = null;

      this.dom.fullscreenOverlay.addEventListener('touchstart', (event) => {
        if (event.touches.length !== 1 || event.target.closest('button, input, .fullscreen-progress-row, .queue-drawer')) {
          swipeTracking = false;
          return;
        }
        swipeStartY = event.touches[0].clientY;
        swipeStartX = event.touches[0].clientX;
        swipeCurrentY = swipeStartY;
        swipeDirection = null;
        swipeTracking = true;
      }, { passive: true });

      this.dom.fullscreenOverlay.addEventListener('touchmove', (event) => {
        if (!swipeTracking || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const deltaY = touch.clientY - swipeStartY;
        const deltaX = touch.clientX - swipeStartX;
        swipeCurrentY = touch.clientY;

        if (!swipeDirection && Math.max(Math.abs(deltaY), Math.abs(deltaX)) > 8) {
          swipeDirection = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
        }
        if (swipeDirection === 'vertical' && deltaY > 0) {
          event.preventDefault();
          this.dom.fullscreenOverlay.style.setProperty('--fullscreen-drag-offset', `${Math.min(deltaY, window.innerHeight)}px`);
          this.dom.fullscreenOverlay.classList.add('dragging');
        }
      }, { passive: false });

      this.dom.fullscreenOverlay.addEventListener('touchend', (event) => {
        if (!swipeTracking || event.changedTouches.length !== 1) return;
        swipeTracking = false;
        const endTouch = event.changedTouches[0];
        const verticalDistance = swipeStartY - endTouch.clientY;
        const downwardDistance = swipeCurrentY - swipeStartY;
        const horizontalDistance = Math.abs(swipeStartX - endTouch.clientX);
        this.dom.fullscreenOverlay.classList.remove('dragging');
        this.dom.fullscreenOverlay.style.removeProperty('--fullscreen-drag-offset');
        if (downwardDistance > 80 && downwardDistance > horizontalDistance * 1.2) {
          this.toggleFullscreen(false);
        } else if (verticalDistance > 70 && verticalDistance > horizontalDistance * 1.2) {
          this.dom.queueDrawer.classList.add('open');
        }
      }, { passive: true });

      this.dom.fullscreenOverlay.addEventListener('touchcancel', () => {
        swipeTracking = false;
        this.dom.fullscreenOverlay.classList.remove('dragging');
        this.dom.fullscreenOverlay.style.removeProperty('--fullscreen-drag-offset');
      }, { passive: true });
    }

    if (this.dom.btnFullscreenDownload) {
      this.dom.btnFullscreenDownload.addEventListener('click', () => {
        this.downloadTrack(player.currentTrack);
      });
    }

    if (this.dom.btnFullscreenShare) {
      this.dom.btnFullscreenShare.addEventListener('click', () => {
        this.shareTrack(player.currentTrack);
      });
    }

    if (this.dom.btnFullscreenAddToPlaylist) {
      this.dom.btnFullscreenAddToPlaylist.addEventListener('click', () => {
        if (player.currentTrack) {
          this.openAddToPlaylist(player.currentTrack);
        } else {
          UIManager.showToast('No song playing currently', 'info');
        }
      });
    }

    // Add to Playlist Modal Close & New Playlist
    if (this.dom.btnCloseAddToPlaylistModal) {
      this.dom.btnCloseAddToPlaylistModal.addEventListener('click', () => {
        this.dom.addToPlaylistModal.classList.remove('open');
      });
    }

    if (this.dom.btnCreateNewFromAddToPlaylist) {
      this.dom.btnCreateNewFromAddToPlaylist.addEventListener('click', () => {
        this.dom.addToPlaylistModal.classList.remove('open');
        this.dom.playlistModal.classList.add('open');
        this.dom.playlistNameInput.focus();
      });
    }

    // Create Playlist Modal
    this.dom.btnOpenCreatePlaylist.addEventListener('click', () => {
      this.pendingTrackForNewPlaylist = null;
      this.dom.playlistModal.classList.add('open');
      this.dom.playlistNameInput.focus();
    });

    this.dom.btnCancelPlaylist.addEventListener('click', () => {
      this.dom.playlistModal.classList.remove('open');
      this.dom.playlistForm.reset();
      this.pendingTrackForNewPlaylist = null;
    });

    this.dom.playlistForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = this.dom.playlistNameInput.value.trim();
      const desc = this.dom.playlistDescInput.value.trim();
      if (name) {
        const pl = StorageManager.createPlaylist(name, desc);
        if (this.pendingTrackForNewPlaylist) {
          StorageManager.addTrackToPlaylist(pl.id, this.pendingTrackForNewPlaylist);
          UIManager.showToast(`Created "${pl.name}" and added "${this.pendingTrackForNewPlaylist.title}"!`, 'success');
          this.pendingTrackForNewPlaylist = null;
        } else {
          UIManager.showToast(`Playlist "${pl.name}" created!`, 'success');
        }
        await auth.syncCollectionToServer();
        UIManager.renderSidebarPlaylists((id) => this.navigatePlaylist(id));
        this.dom.playlistModal.classList.remove('open');
        this.dom.playlistForm.reset();
        this.navigatePlaylist(pl.id);
      }
    });

    // Local file picker
    if (this.dom.localFileInput) {
      this.dom.localFileInput.addEventListener('change', (e) => {
        this.handleLocalFiles(e.target.files);
      });
    }
  }

  // --- Search Bar, Live Suggestions & Submit Controls ---
  bindSearchEvents() {
    if (!this.dom.searchInput) return;

    // Typing in search input: debounced live song & query suggestions
    this.dom.searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      if (this.dom.searchClear) {
        this.dom.searchClear.classList.toggle('visible', val.length > 0);
      }
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.fetchAndRenderSuggestions(val.trim());
      }, 200);
    });

    // Keyboard navigation (ArrowDown, ArrowUp, Enter, Esc)
    this.dom.searchInput.addEventListener('keydown', (e) => {
      this.handleSearchKeydown(e);
    });

    // Focus on input: show suggestions or recent searches
    this.dom.searchInput.addEventListener('focus', () => {
      const val = this.dom.searchInput.value.trim();
      this.fetchAndRenderSuggestions(val);
    });

    // Clear search button (✕)
    if (this.dom.searchClear) {
      this.dom.searchClear.addEventListener('click', () => {
        this.dom.searchInput.value = '';
        this.dom.searchClear.classList.remove('visible');
        this.closeSuggestions();
        if (this.currentView === 'search') {
          this.renderSearchView();
        }
      });
    }

    // Explicit Search Button click (Stores history & runs search!)
    if (this.dom.btnSearchSubmit) {
      this.dom.btnSearchSubmit.addEventListener('click', (e) => {
        e.preventDefault();
        clearTimeout(this.searchTimeout);
        const val = this.dom.searchInput ? this.dom.searchInput.value.trim() : '';
        if (val) {
          this.submitSearch(val);
        } else {
          this.navigate('search');
        }
      });
    }

    // Dismiss suggestions on outside click
    document.addEventListener('click', (e) => {
      if (this.dom.searchContainer && !this.dom.searchContainer.contains(e.target)) {
        this.closeSuggestions();
      }
    });
  }

  handleSearchKeydown(e) {
    const dropdown = this.dom.searchSuggestionsDropdown;
    const isOpen = dropdown && dropdown.classList.contains('open');

    if (e.key === 'Escape') {
      this.closeSuggestions();
      return;
    }

    if (isOpen) {
      const items = dropdown.querySelectorAll('.sugg-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length > 0) {
          this.highlightedSuggIndex = (this.highlightedSuggIndex + 1) % items.length;
          items.forEach((it, idx) => it.classList.toggle('highlighted', idx === this.highlightedSuggIndex));
          if (items[this.highlightedSuggIndex]) {
            items[this.highlightedSuggIndex].scrollIntoView({ block: 'nearest' });
          }
        }
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length > 0) {
          this.highlightedSuggIndex = (this.highlightedSuggIndex - 1 + items.length) % items.length;
          items.forEach((it, idx) => it.classList.toggle('highlighted', idx === this.highlightedSuggIndex));
          if (items[this.highlightedSuggIndex]) {
            items[this.highlightedSuggIndex].scrollIntoView({ block: 'nearest' });
          }
        }
        return;
      } else if (e.key === 'Enter') {
        if (this.highlightedSuggIndex >= 0 && items[this.highlightedSuggIndex]) {
          e.preventDefault();
          items[this.highlightedSuggIndex].click();
          return;
        }
      }
    }

    if (e.key === 'Enter') {
      clearTimeout(this.searchTimeout);
      const val = this.dom.searchInput ? this.dom.searchInput.value.trim() : '';
      if (val) {
        this.submitSearch(val);
      }
    }
  }

  async fetchAndRenderSuggestions(query) {
    if (!this.dom.searchSuggestionsDropdown) return;
    const dropdown = this.dom.searchSuggestionsDropdown;

    if (!query) {
      const recent = StorageManager.getRecentSearches().slice(0, 5);
      if (recent.length > 0) {
        dropdown.innerHTML = `
          <div class="sugg-section-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>Recent Searches</span>
          </div>
          ${recent.map((q) => `
            <div class="sugg-query-item sugg-item" data-type="query" data-value="${UIManager.escapeHtml(q)}" tabindex="0">
              <svg class="sugg-query-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <span class="sugg-query-text">${UIManager.escapeHtml(q)}</span>
              <svg class="sugg-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          `).join('')}
        `;
        dropdown.classList.add('open');
        this.highlightedSuggIndex = -1;
        this.bindSuggestionClicks();
        return;
      } else {
        this.closeSuggestions();
        return;
      }
    }

    try {
      const data = await api.getSearchSuggestions(query, 7);
      if (!data || (!data.suggestions?.length && !data.songs?.length)) {
        this.closeSuggestions();
        return;
      }

      let html = '';

      // 1. Song matches
      if (data.songs && data.songs.length > 0) {
        html += `
          <div class="sugg-section-title">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            <span>Song Suggestions</span>
          </div>
        `;
        data.songs.forEach((song, idx) => {
          html += `
            <div class="sugg-song-item sugg-item" data-type="song" data-index="${idx}" tabindex="0">
              <img class="sugg-song-thumb" src="${song.image || 'assets/default-cover.svg'}" alt="" loading="lazy" />
              <div class="sugg-song-meta">
                <div class="sugg-song-title">${UIManager.escapeHtml(song.title)}</div>
                <div class="sugg-song-artist">${UIManager.escapeHtml(song.artist)} • ${UIManager.formatDuration(song.duration || 180)}</div>
              </div>
              <button class="sugg-play-btn" title="Play Now" aria-label="Play song">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
              </button>
            </div>
          `;
        });
      }

      if (data.songs?.length > 0 && data.suggestions?.length > 0) {
        html += '<div class="sugg-divider"></div>';
      }

      // 2. Query keyword suggestions
      if (data.suggestions && data.suggestions.length > 0) {
        html += `
          <div class="sugg-section-title">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span>Search Suggestions</span>
          </div>
        `;
        data.suggestions.forEach(s => {
          html += `
            <div class="sugg-query-item sugg-item" data-type="query" data-value="${UIManager.escapeHtml(s)}" tabindex="0">
              <svg class="sugg-query-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span class="sugg-query-text">${UIManager.escapeHtml(s)}</span>
              <svg class="sugg-arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="7" y1="17" x2="17" y2="7"></line>
                <polyline points="7 7 17 7 17 17"></polyline>
              </svg>
            </div>
          `;
        });
      }

      dropdown.innerHTML = html;
      dropdown.classList.add('open');
      this.currentSuggestionsSongs = data.songs || [];
      this.highlightedSuggIndex = -1;
      this.bindSuggestionClicks();
    } catch (err) {
      console.warn('Suggestions error:', err);
      this.closeSuggestions();
    }
  }

  closeSuggestions() {
    if (this.dom.searchSuggestionsDropdown) {
      this.dom.searchSuggestionsDropdown.classList.remove('open');
      this.dom.searchSuggestionsDropdown.innerHTML = '';
      this.highlightedSuggIndex = -1;
    }
  }

  bindSuggestionClicks() {
    if (!this.dom.searchSuggestionsDropdown) return;

    this.dom.searchSuggestionsDropdown.querySelectorAll('.sugg-song-item').forEach(item => {
      item.addEventListener('click', () => {
        const idx = parseInt(item.dataset.index, 10);
        const song = this.currentSuggestionsSongs?.[idx];
        if (song) {
          this.closeSuggestions();
          // Store search query in history
          StorageManager.addRecentSearch(song.title);
          if (this.dom.searchInput) {
            this.dom.searchInput.value = song.title;
            if (this.dom.searchClear) this.dom.searchClear.classList.add('visible');
          }
          player.playWithSeed(song, 'suggestion');
        }
      });
    });

    this.dom.searchSuggestionsDropdown.querySelectorAll('.sugg-query-item').forEach(item => {
      item.addEventListener('click', () => {
        const query = item.dataset.value;
        if (query) {
          this.submitSearch(query);
        }
      });
    });
  }

  submitSearch(query) {
    if (!query || !query.trim()) return;
    const clean = query.trim();
    this.closeSuggestions();
    // Explicitly add to search history
    StorageManager.addRecentSearch(clean);
    if (this.dom.searchInput) {
      this.dom.searchInput.value = clean;
      if (this.dom.searchClear) this.dom.searchClear.classList.add('visible');
    }
    this.navigateSearch(clean);
  }

  // --- Player Event Bindings ---
  bindPlayerEvents() {
    player.on('trackChange', (track) => {
      this.updateNowPlayingUI(track);
      if (this.visualizer) {
        this.visualizer.start();
      }
      this.fetchAndDisplayLyrics(track);
    });

    player.on('playbackChange', (isPlaying) => {
      this.updatePlayStateUI(isPlaying);
      if (isPlaying && this.visualizer) {
        this.visualizer.start();
      }
    });

    player.on('playbackRateChange', (rate) => {
      this.updateFullscreenSpeedBadge(rate);
    });

    player.on('timeUpdate', ({ current, duration, percent }) => {
      if (this.isUserSeeking) return;

      const curStr = UIManager.formatTimelineTime(current);
      const remSec = Math.max(0, duration - current);
      const durStr = this.isRemainingTimeMode
        ? `-${UIManager.formatTimelineTime(remSec)}`
        : UIManager.formatTimelineTime(duration);

      this.dom.timeCurrent.textContent = curStr;
      this.dom.timeTotal.textContent = durStr;
      this.dom.progressFill.style.width = `${percent}%`;
      this.dom.progressThumb.style.left = `${percent}%`;

      const pVal = Math.round(percent);
      if (this.dom.progressSlider) {
        this.dom.progressSlider.setAttribute('aria-valuenow', pVal);
        this.dom.progressSlider.setAttribute('aria-valuetext', `${curStr} of ${durStr}`);
      }

      // Apple Music floating mini-player hairline progress bar
      if (this.dom.playerBar) {
        this.dom.playerBar.style.setProperty('--mini-progress', `${percent}%`);
      }

      // Apple Music fullscreen scrubber
      if (this.dom.fullscreenTimeCurrent) this.dom.fullscreenTimeCurrent.textContent = curStr;
      if (this.dom.fullscreenTimeTotal) this.dom.fullscreenTimeTotal.textContent = durStr;
      if (this.dom.fullscreenProgressFill) this.dom.fullscreenProgressFill.style.width = `${percent}%`;
      if (this.dom.fullscreenProgressThumb) this.dom.fullscreenProgressThumb.style.left = `${percent}%`;

      if (this.dom.fullscreenProgressSlider) {
        this.dom.fullscreenProgressSlider.setAttribute('aria-valuenow', pVal);
        this.dom.fullscreenProgressSlider.setAttribute('aria-valuetext', `${curStr} of ${durStr}`);
      }

      if (!UIManager.isLyricsReadingMode) {
        this.syncLyrics(current);
      }
    });

    player.on('queueUpdate', ({ queue, index, seedTrack }) => {
      UIManager.renderQueue(
        queue,
        index,
        (idx) => {
          player.currentIndex = idx;
          player.loadAndPlayCurrent();
        },
        (idx) => player.removeFromQueue(idx),
        seedTrack
      );
    });

    player.on('recommendationsUpdate', ({ seedTrack }) => {
      UIManager.renderQueue(
        player.queue,
        player.currentIndex,
        (idx) => {
          player.currentIndex = idx;
          player.loadAndPlayCurrent();
        },
        (idx) => player.removeFromQueue(idx),
        seedTrack
      );
    });

    player.on('modeChange', ({ volume, isMuted, shuffle, repeatMode }) => {
      this.dom.btnShuffle.classList.toggle('active', shuffle);
      if (this.dom.btnFullscreenShuffle) {
        this.dom.btnFullscreenShuffle.classList.toggle('active', shuffle);
        this.dom.btnFullscreenShuffle.style.color = shuffle ? 'var(--apple-pink)' : '';
      }

      this.dom.btnRepeat.classList.toggle('active', repeatMode !== 'off');
      if (this.dom.btnFullscreenRepeat) {
        this.dom.btnFullscreenRepeat.classList.toggle('active', repeatMode !== 'off');
        this.dom.btnFullscreenRepeat.style.color = repeatMode !== 'off' ? 'var(--apple-pink)' : '';
      }

      if (repeatMode === 'one') {
        this.dom.btnRepeat.setAttribute('title', 'Repeat One');
        this.dom.btnRepeat.style.color = 'var(--apple-pink)';
      } else {
        this.dom.btnRepeat.setAttribute('title', repeatMode === 'all' ? 'Repeat All' : 'Repeat Off');
        this.dom.btnRepeat.style.color = '';
      }

      const volPercent = isMuted ? 0 : volume * 100;
      this.dom.volumeFill.style.width = `${volPercent}%`;
      this.dom.volumeThumb.style.left = `${volPercent}%`;
      this.updateVolumeIcon(isMuted, volume);
    });

    player.on('moodChange', ({ mood }) => {
      UIManager.updateMoodBadge(this.dom.playerMoodBadge, mood);
    });

    player.on('suggestionsUpdate', ({ mood, tracks, loading }) => {
      UIManager.renderQueueSuggestions(
        this.dom.queueSuggestionsContainer,
        tracks,
        mood,
        (track) => {
          player.playNext(track);
          player.next();
        },
        (track) => player.playNext(track),
        loading
      );
    });
  }

  // --- Keyboard Shortcuts ---
  bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          player.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          player.seekTo(player.audio.currentTime + (e.shiftKey ? 15 : 5));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          player.seekTo(Math.max(0, player.audio.currentTime - (e.shiftKey ? 15 : 5)));
          break;
        case 'ArrowUp':
          e.preventDefault();
          player.setVolume(player.volume + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          player.setVolume(player.volume - 0.05);
          break;
        case 'KeyM':
          e.preventDefault();
          player.toggleMute();
          break;
        case 'KeyL':
          e.preventDefault();
          this.toggleLyrics();
          break;
        case 'KeyF':
          e.preventDefault();
          this.toggleFullscreen();
          break;
        case 'KeyD':
          e.preventDefault();
          this.downloadTrack(player.currentTrack);
          break;
        case 'Escape':
          this.dom.lyricsOverlay.classList.remove('open');
          this.toggleFullscreen(false);
          this.dom.queueDrawer.classList.remove('open');
          this.dom.playlistModal.classList.remove('open');
          if (this.dom.mobileModal) this.dom.mobileModal.classList.remove('open');
          if (this.dom.authModal) this.dom.authModal.classList.remove('open');
          if (this.dom.userMenuModal) this.dom.userMenuModal.classList.remove('open');
          if (this.dom.shareModal) this.dom.shareModal.classList.remove('open');
          if (this.dom.addToPlaylistModal) this.dom.addToPlaylistModal.classList.remove('open');
          break;
      }
    });
  }

  // --- Drag and Drop Audio Files ---
  initDragAndDrop() {
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer?.files?.length > 0) {
        this.handleLocalFiles(e.dataTransfer.files);
      }
    });
  }

  handleLocalFiles(files) {
    const audioFiles = Array.from(files).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a|aac)$/i.test(f.name));
    if (audioFiles.length === 0) {
      UIManager.showToast('No valid audio files detected', 'error');
      return;
    }

    const localTracks = audioFiles.map((file, idx) => {
      const fileName = file.name.replace(/\.[^/.]+$/, '');
      const parts = fileName.split('-');
      const artist = parts.length > 1 ? parts[0].trim() : 'Local File';
      const title = parts.length > 1 ? parts.slice(1).join('-').trim() : fileName;

      return {
        id: 'local_' + Date.now() + '_' + idx,
        title: title,
        artist: artist,
        album: 'Local Storage',
        duration: 0,
        image: 'assets/default-cover.svg',
        audioUrl: URL.createObjectURL(file),
        source: 'Local Audio',
        hasLyrics: false
      };
    });

    UIManager.showToast(`Imported ${localTracks.length} local song${localTracks.length === 1 ? '' : 's'}`, 'success');
    player.playTrack(localTracks[0], localTracks);
  }

  // --- Seek & Volume Setup ---
  setupSeekScrubber() {
    this.isUserSeeking = false;
    this.isRemainingTimeMode = false;

    const toggleRemainingMode = () => {
      this.isRemainingTimeMode = !this.isRemainingTimeMode;
      const duration = player.duration || 0;
      const current = player.currentTime || 0;
      const remSec = Math.max(0, duration - current);
      const durStr = this.isRemainingTimeMode
        ? `-${UIManager.formatTimelineTime(remSec)}`
        : UIManager.formatTimelineTime(duration);

      if (this.dom.timeTotal) this.dom.timeTotal.textContent = durStr;
      if (this.dom.fullscreenTimeTotal) this.dom.fullscreenTimeTotal.textContent = durStr;
    };

    this.dom.timeTotal?.addEventListener('click', toggleRemainingMode);
    this.dom.fullscreenTimeTotal?.addEventListener('click', toggleRemainingMode);

    const updateBothSliders = (percent) => {
      const pStr = `${percent}%`;
      if (this.dom.progressFill) this.dom.progressFill.style.width = pStr;
      if (this.dom.progressThumb) this.dom.progressThumb.style.left = pStr;
      if (this.dom.fullscreenProgressFill) this.dom.fullscreenProgressFill.style.width = pStr;
      if (this.dom.fullscreenProgressThumb) this.dom.fullscreenProgressThumb.style.left = pStr;

      const duration = player.duration || 0;
      if (duration > 0) {
        const previewSec = (percent / 100) * duration;
        const timeStr = UIManager.formatTimelineTime(previewSec);
        const remSec = Math.max(0, duration - previewSec);
        const durStr = this.isRemainingTimeMode
          ? `-${UIManager.formatTimelineTime(remSec)}`
          : UIManager.formatTimelineTime(duration);

        if (this.dom.timeCurrent) this.dom.timeCurrent.textContent = timeStr;
        if (this.dom.fullscreenTimeCurrent) this.dom.fullscreenTimeCurrent.textContent = timeStr;
        if (this.dom.timeTotal) this.dom.timeTotal.textContent = durStr;
        if (this.dom.fullscreenTimeTotal) this.dom.fullscreenTimeTotal.textContent = durStr;

        const pVal = Math.round(percent);
        if (this.dom.progressSlider) {
          this.dom.progressSlider.setAttribute('aria-valuenow', pVal);
          this.dom.progressSlider.setAttribute('aria-valuetext', `${timeStr} of ${durStr}`);
        }
        if (this.dom.fullscreenProgressSlider) {
          this.dom.fullscreenProgressSlider.setAttribute('aria-valuenow', pVal);
          this.dom.fullscreenProgressSlider.setAttribute('aria-valuetext', `${timeStr} of ${durStr}`);
        }
      }
    };

    const wireSlider = (slider, tooltip) => {
      if (!slider) return;

      const getPercent = (e) => {
        const rect = slider.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : (e.clientX ?? 0);
        const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        return Math.max(0, Math.min(100, (clickX / rect.width) * 100));
      };

      const updateTooltip = (percent) => {
        if (!tooltip) return;
        const duration = player.duration || 0;
        if (duration > 0) {
          const hoverSec = (percent / 100) * duration;
          tooltip.textContent = UIManager.formatTimelineTime(hoverSec);
          tooltip.style.left = `${percent}%`;
          tooltip.classList.add('visible');
        }
      };

      // Hover preview
      slider.addEventListener('mousemove', (e) => {
        if (!this.isUserSeeking) {
          const percent = getPercent(e);
          updateTooltip(percent);
        }
      });

      slider.addEventListener('mouseleave', () => {
        if (!this.isUserSeeking && tooltip) {
          tooltip.classList.remove('visible');
        }
      });

      // Mouse drag and click handling
      slider.addEventListener('mousedown', (e) => {
        this.isUserSeeking = true;
        slider.classList.add('is-dragging');
        if (this.dom.fullscreenProgressSlider) this.dom.fullscreenProgressSlider.classList.add('is-dragging');
        if (this.dom.progressSlider) this.dom.progressSlider.classList.add('is-dragging');

        const initialPercent = getPercent(e);
        updateBothSliders(initialPercent);
        updateTooltip(initialPercent);

        let latestPercent = initialPercent;
        const onMouseMove = (moveEvent) => {
          if (this.isUserSeeking) {
            latestPercent = getPercent(moveEvent);
            updateBothSliders(latestPercent);
            updateTooltip(latestPercent);
          }
        };

        const onMouseUp = () => {
          this.isUserSeeking = false;
          slider.classList.remove('is-dragging');
          if (this.dom.fullscreenProgressSlider) this.dom.fullscreenProgressSlider.classList.remove('is-dragging');
          if (this.dom.progressSlider) this.dom.progressSlider.classList.remove('is-dragging');
          if (tooltip) tooltip.classList.remove('visible');
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          player.seekByPercent(latestPercent);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      // Mobile touch drag and tap handling
      slider.addEventListener('touchstart', (e) => {
        this.isUserSeeking = true;
        slider.classList.add('is-dragging');
        if (this.dom.fullscreenProgressSlider) this.dom.fullscreenProgressSlider.classList.add('is-dragging');
        if (this.dom.progressSlider) this.dom.progressSlider.classList.add('is-dragging');

        const initialPercent = getPercent(e);
        updateBothSliders(initialPercent);
        updateTooltip(initialPercent);

        let latestPercent = initialPercent;
        const onTouchMove = (moveEvent) => {
          if (this.isUserSeeking) {
            latestPercent = getPercent(moveEvent);
            updateBothSliders(latestPercent);
            updateTooltip(latestPercent);
          }
        };

        const onTouchEnd = () => {
          this.isUserSeeking = false;
          slider.classList.remove('is-dragging');
          if (this.dom.fullscreenProgressSlider) this.dom.fullscreenProgressSlider.classList.remove('is-dragging');
          if (this.dom.progressSlider) this.dom.progressSlider.classList.remove('is-dragging');
          if (tooltip) tooltip.classList.remove('visible');
          window.removeEventListener('touchmove', onTouchMove);
          window.removeEventListener('touchend', onTouchEnd);
          player.seekByPercent(latestPercent);
        };

        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd);
      }, { passive: true });

      // Keyboard Accessibility
      slider.addEventListener('keydown', (e) => {
        const duration = player.duration || 0;
        const current = player.currentTime || 0;

        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          const target = Math.min(duration, current + 5);
          player.seekTo(target);
          if (duration > 0) updateBothSliders((target / duration) * 100);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          const target = Math.max(0, current - 5);
          player.seekTo(target);
          if (duration > 0) updateBothSliders((target / duration) * 100);
        } else if (e.key === 'Home') {
          e.preventDefault();
          player.seekTo(0);
          updateBothSliders(0);
        } else if (e.key === 'End') {
          e.preventDefault();
          if (duration > 0) {
            player.seekTo(duration);
            updateBothSliders(100);
          }
        }
      });
    };

    wireSlider(this.dom.progressSlider, this.dom.progressTooltip);
    wireSlider(this.dom.fullscreenProgressSlider, this.dom.fullscreenProgressTooltip);
  }

  setupVolumeSlider() {
    const slider = this.dom.volumeSlider;
    let isDragging = false;

    const onVolChange = (e) => {
      const rect = slider.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const val = clickX / rect.width;
      player.setVolume(val);
    };

    slider.addEventListener('mousedown', (e) => {
      isDragging = true;
      onVolChange(e);
      const onMouseMove = (moveEvent) => {
        if (isDragging) onVolChange(moveEvent);
      };
      const onMouseUp = () => {
        isDragging = false;
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

  // --- UI Updates ---
  updateNowPlayingUI(track) {
    if (!track) return;

    this.dom.trackTitle.textContent = track.title;
    this.dom.trackArtist.textContent = track.artist;
    this.dom.trackThumb.src = track.image || 'assets/default-cover.svg';

    const isLiked = StorageManager.isLiked(track.id);
    this.updateLikeButton(isLiked);

    if (this.dom.playerMoodBadge) {
      UIManager.updateMoodBadge(this.dom.playerMoodBadge, track.mood || player.currentMood);
    }

    this.dom.fullscreenTitle.textContent = track.title;
    if (this.dom.fullscreenHeaderTitle) {
      this.dom.fullscreenHeaderTitle.textContent = track.title;
      this.dom.fullscreenHeaderTitle.title = track.title;
    }
    this.dom.fullscreenArtist.textContent = track.artist;
    this.dom.fullscreenArtwork.src = track.image || 'assets/default-cover.svg';
    this.dom.fullscreenBg.style.backgroundImage = `url(${track.image || 'assets/default-cover.svg'})`;

    // Dynamic timeline accent color based on album artwork
    ColorExtractor.extract(track.image, (colors) => {
      document.documentElement.style.setProperty('--timeline-accent', colors.primary);
      document.documentElement.style.setProperty('--timeline-accent-glow', colors.glow);
      document.documentElement.style.setProperty('--timeline-accent-glow-subtle', colors.glowSoft);

      const targets = [
        this.dom.fullscreenProgressSlider,
        this.dom.progressSlider,
        this.dom.fullscreenProgressFill,
        this.dom.progressFill,
        this.dom.fullscreenProgressThumb,
        this.dom.progressThumb,
        this.dom.fullscreenProgressTooltip,
        this.dom.progressTooltip
      ];
      targets.forEach(el => {
        if (el) {
          el.style.setProperty('--timeline-accent', colors.primary);
          el.style.setProperty('--timeline-accent-glow', colors.glow);
          el.style.setProperty('--timeline-accent-glow-subtle', colors.glowSoft);
        }
      });
    });

    if (this.dom.btnFullscreenSpeed) {
      this.updateFullscreenSpeedBadge(player.playbackRate || 1.0);
    }
    const initialDur = UIManager.formatTimelineTime(track.duration || 0);
    if (this.dom.fullscreenTimeTotal && initialDur !== '00:00') {
      this.dom.fullscreenTimeTotal.textContent = initialDur;
    }
    if (this.dom.fullscreenTimeCurrent) {
      this.dom.fullscreenTimeCurrent.textContent = '00:00';
    }
    if (this.dom.timeTotal && initialDur !== '00:00') {
      this.dom.timeTotal.textContent = initialDur;
    }
    if (this.dom.timeCurrent) {
      this.dom.timeCurrent.textContent = '00:00';
    }

    document.querySelectorAll('.music-card, .track-row').forEach(el => {
      el.classList.toggle('active', el.dataset.id === track.id);
    });
  }

  updatePlayStateUI(isPlaying) {
    const playIcon = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="6 3 20 12 6 21 6 3"></polygon>
      </svg>
    `;
    const pauseIcon = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="4" width="4" height="16"></rect>
        <rect x="14" y="4" width="4" height="16"></rect>
      </svg>
    `;

    this.dom.btnPlay.innerHTML = isPlaying ? pauseIcon : playIcon;

    if (this.dom.fullscreenPlayBtn) {
      this.dom.fullscreenPlayBtn.innerHTML = isPlaying ? pauseIcon : playIcon;
    }


    this.dom.miniEq.classList.toggle('playing', isPlaying);
    this.dom.fullscreenVinyl.classList.toggle('playing', isPlaying);
  }

  updateFullscreenSpeedBadge(rate) {
    if (!this.dom.btnFullscreenSpeed) return;
    const speedText = this.dom.btnFullscreenSpeed.querySelector('#fullscreenSpeedText');
    if (speedText) {
      speedText.textContent = `${rate}x`;
    } else {
      this.dom.btnFullscreenSpeed.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span id="fullscreenSpeedText">${rate}x</span>
      `;
    }
  }

  updateLikeButton(isLiked) {
    if (this.dom.btnLikeCurrent) {
      this.dom.btnLikeCurrent.classList.toggle('liked', isLiked);
      const svg = this.dom.btnLikeCurrent.querySelector('svg');
      if (svg) {
        svg.setAttribute('fill', isLiked ? 'currentColor' : 'none');
      }
    }
    if (this.dom.btnFullscreenLike) {
      this.dom.btnFullscreenLike.classList.toggle('liked', isLiked);
      const fsSvg = this.dom.btnFullscreenLike.querySelector('svg');
      if (fsSvg) {
        fsSvg.setAttribute('fill', isLiked ? '#fa2d48' : 'none');
        fsSvg.setAttribute('stroke', isLiked ? '#fa2d48' : 'currentColor');
      }
    }
  }

  updateVolumeIcon(isMuted, volume) {
    let iconSvg = '';
    if (isMuted || volume === 0) {
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <line x1="23" y1="9" x2="17" y2="15"></line>
          <line x1="17" y1="9" x2="23" y2="15"></line>
        </svg>
      `;
    } else if (volume < 0.5) {
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      `;
    } else {
      iconSvg = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
      `;
    }
    this.dom.btnMute.innerHTML = iconSvg;
  }

  // --- Lyrics Handler ---
  async fetchAndDisplayLyrics(track) {
    this.dom.lyricsTitle.textContent = track.title;
    this.dom.lyricsArtist.textContent = track.artist;
    this.dom.lyricsContent.innerHTML = '<div class="spinner" style="margin: 40px auto;"></div>';

    const lyricsText = await api.getLyrics(track);
    this.activeLyricsLines = UIManager.renderLyrics(this.dom.lyricsContent, lyricsText);
  }

  syncLyrics(currentTime) {
    if (!this.activeLyricsLines || this.activeLyricsLines.length === 0) return;

    let activeIndex = -1;
    for (let i = 0; i < this.activeLyricsLines.length; i++) {
      const lineTime = this.activeLyricsLines[i].time;
      if (lineTime !== null && lineTime <= currentTime) {
        activeIndex = i;
      } else if (lineTime !== null && lineTime > currentTime) {
        break;
      }
    }

    if (activeIndex !== -1) {
      this.activeLyricsLines.forEach((item, idx) => {
        const isActive = idx === activeIndex;
        item.element.classList.toggle('active', isActive);
        if (isActive) {
          item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }
  }

  toggleLyrics() {
    this.dom.lyricsOverlay.classList.toggle('open');
  }

  toggleFullscreen(forceState = null) {
    const shouldOpen = forceState !== null ? forceState : !this.dom.fullscreenOverlay.classList.contains('open');
    clearTimeout(this.fullscreenCloseTimer);
    this.dom.fullscreenOverlay.classList.remove('dragging');
    this.dom.fullscreenOverlay.style.removeProperty('--fullscreen-drag-offset');
    if (!shouldOpen && this.dom.fullscreenOverlay.classList.contains('open')) {
      this.dom.fullscreenOverlay.classList.add('closing');
      this.fullscreenCloseTimer = setTimeout(() => {
        this.dom.fullscreenOverlay.classList.remove('open', 'closing');
        document.body.classList.remove('fullscreen-player-open');
      }, 300);
      return;
    }

    this.dom.fullscreenOverlay.classList.toggle('open', shouldOpen);
    this.dom.fullscreenOverlay.classList.remove('closing');
    document.body.classList.toggle('fullscreen-player-open', shouldOpen);
    if (shouldOpen) {
      if (this.visualizer) {
        this.visualizer.resize();
        this.visualizer.start();
      }

      // Immediately synchronize playback progress, time labels, and visual states
      const duration = player.duration || 0;
      const current = player.currentTime || 0;
      const percent = duration > 0 ? Math.min(100, Math.max(0, (current / duration) * 100)) : 0;
      const curStr = UIManager.formatTimelineTime(current);
      const remSec = Math.max(0, duration - current);
      const durStr = this.isRemainingTimeMode
        ? `-${UIManager.formatTimelineTime(remSec)}`
        : UIManager.formatTimelineTime(duration);

      if (this.dom.fullscreenTimeCurrent) this.dom.fullscreenTimeCurrent.textContent = curStr;
      if (this.dom.fullscreenTimeTotal) this.dom.fullscreenTimeTotal.textContent = durStr;
      if (this.dom.fullscreenProgressFill) this.dom.fullscreenProgressFill.style.width = `${percent}%`;
      if (this.dom.fullscreenProgressThumb) this.dom.fullscreenProgressThumb.style.left = `${percent}%`;
      if (this.dom.fullscreenProgressSlider) {
        this.dom.fullscreenProgressSlider.setAttribute('aria-valuenow', Math.round(percent));
        this.dom.fullscreenProgressSlider.setAttribute('aria-valuetext', `${curStr} of ${durStr}`);
      }
      if (this.dom.btnFullscreenSpeed) {
        this.updateFullscreenSpeedBadge(player.playbackRate || 1.0);
      }
      if (player.currentTrack) {
        this.updateLikeButton(StorageManager.isLiked(player.currentTrack.id));
      }
    }
  }

  bindSwipeNavigation() {
    const surface = this.dom.contentArea;
    if (!surface || !window.PointerEvent) return;

    const swipeViews = ['home', 'radio', 'search', 'sleep', 'travel', 'library', 'liked', 'recent'];
    const ignoredTargets = 'button, a, input, textarea, select, [role="slider"], .slider-bar, .search-suggestions-dropdown, .queue-drawer, .modal-backdrop';
    let gesture = null;
    let frameId = 0;
    let transitionTimer = 0;

    const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const adjacentView = (direction) => {
      const index = swipeViews.indexOf(this.currentView);
      const nextIndex = index + (direction < 0 ? 1 : -1);
      return swipeViews[nextIndex] || null;
    };
    const isAtScrollEdge = (direction) => {
      if (direction < 0) {
        return surface.scrollTop + surface.clientHeight >= surface.scrollHeight - 4;
      }
      return surface.scrollTop <= 4;
    };
    const setTransform = (offset, opacity = 1) => {
      surface.style.transform = `translate3d(0, ${offset}px, 0)`;
      surface.style.opacity = String(opacity);
    };
    const scheduleTransform = (offset, opacity) => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => setTransform(offset, opacity));
    };
    const clearTransition = () => {
      clearTimeout(transitionTimer);
      cancelAnimationFrame(frameId);
      surface.classList.remove('swipe-active');
      surface.style.transition = '';
      surface.style.transform = '';
      surface.style.opacity = '';
      gesture = null;
    };

    const finishGesture = (event, cancelled = false) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const current = gesture;
      gesture = null;
      surface.releasePointerCapture?.(event.pointerId);

      const elapsed = Math.max(1, performance.now() - current.startedAt);
      const distance = current.offset;
      const velocity = Math.abs(distance) / elapsed;
      const direction = distance < 0 ? -1 : 1;
      const targetView = adjacentView(direction);
      const threshold = Math.max(56, Math.min(window.innerHeight * 0.22, 180));
      const committed = !cancelled && targetView && isAtScrollEdge(direction) &&
        (Math.abs(distance) > threshold || (Math.abs(distance) > 38 && velocity > 0.7));
      const targetOffset = committed ? direction * window.innerHeight : 0;
      const duration = prefersReducedMotion() ? 120 : committed ? 230 : 190;

      surface.style.transition = `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${duration}ms ease-out`;
      scheduleTransform(targetOffset, committed ? 0.82 : 1);

      transitionTimer = window.setTimeout(async () => {
        if (!committed) {
          clearTransition();
          return;
        }

        await this.navigate(targetView);
        surface.style.transition = 'none';
        setTransform(-targetOffset, 0.82);
        requestAnimationFrame(() => {
          surface.style.transition = `transform ${prefersReducedMotion() ? 120 : 230}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${prefersReducedMotion() ? 120 : 230}ms ease-out`;
          scheduleTransform(0, 1);
          transitionTimer = window.setTimeout(clearTransition, prefersReducedMotion() ? 130 : 240);
        });
      }, duration + 16);
    };

    surface.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || event.isPrimary === false || event.target.closest(ignoredTargets)) return;
      if (this.dom.fullscreenOverlay?.classList.contains('open')) return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offset: 0,
        startedAt: performance.now(),
        tracking: false
      };
      surface.setPointerCapture?.(event.pointerId);
    }, { passive: true });

    surface.addEventListener('pointermove', (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (!gesture.tracking) {
        if (Math.abs(dy) < 8 || Math.abs(dy) < Math.abs(dx) * 1.15) {
          if (Math.abs(dx) > 12) gesture = null;
          return;
        }
        const direction = dy < 0 ? -1 : 1;
        if (!adjacentView(direction) || !isAtScrollEdge(direction)) {
          gesture = null;
          return;
        }
        gesture.tracking = true;
        surface.classList.add('swipe-active');
        event.preventDefault();
      }
      if (!gesture.tracking) return;
      event.preventDefault();
      const resistance = Math.abs(dy) > window.innerHeight ? 0.82 : 1;
      gesture.offset = dy * resistance;
      const opacity = 1 - Math.min(0.18, Math.abs(gesture.offset) / window.innerHeight * 0.18);
      scheduleTransform(gesture.offset, opacity);
    }, { passive: false });

    surface.addEventListener('pointerup', finishGesture, { passive: true });
    surface.addEventListener('pointercancel', (event) => finishGesture(event, true), { passive: true });
  }

  // --- Views Navigation ---
  async navigate(view) {
    this.currentView = view;
    this.dom.navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.view === view);
    });
    if (this.dom.bottomTabs) {
      this.dom.bottomTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === view);
      });
    }

    switch (view) {
      case 'home':
        await this.renderHomeView();
        break;
      case 'radio':
        await this.renderRadioView();
        break;
      case 'search':
        await this.renderSearchView();
        break;
      case 'sleep':
        await this.renderSleepView();
        break;
      case 'travel':
        this.renderTravelView();
        break;
      case 'library':
        this.renderLibraryView();
        break;
      case 'liked':
        this.renderLikedView();
        break;
      case 'recent':
        this.renderRecentView();
        break;
      default:
        await this.renderHomeView();
    }
  }

  async navigateSearch(query) {
    if (query && query.trim()) {
      StorageManager.addRecentSearch(query.trim());
    }
    this.currentView = 'search';
    this.dom.navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.view === 'search');
    });
    if (this.dom.bottomTabs) {
      this.dom.bottomTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === 'search');
      });
    }
    this.dom.contentArea.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; gap: 14px;">
        <div class="spinner"></div>
        <div style="color: var(--text-secondary); font-size: 0.95rem;">Searching music catalogs...</div>
      </div>
    `;

    try {
      const results = await api.searchSongs(query, 30);
      this.renderSearchResults(query, results);
    } catch (error) {
      console.error('[Music] Search request failed:', error);
      this.renderSearchResults(query, [], 'Music service temporarily unavailable. Please try again.');
    }
  }

  async renderSearchView() {
    const recentSearches = StorageManager.getRecentSearches();

    this.dom.contentArea.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title" style="font-size: 1.85rem; font-weight: 800; letter-spacing: -0.5px;">Search</h2>
          <div class="section-subtitle">Browse music genres, moods, top hits, and online catalogs</div>
        </div>
      </div>

      ${recentSearches.length > 0 ? `
        <div class="recent-searches-box">
          <div class="recent-searches-header">
            <div class="recent-searches-title">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <span>Recent Searches</span>
            </div>
            <button class="btn-glass" id="btnClearSearchInSearch" style="padding: 6px 14px; font-size: 0.8rem;">
              Clear All
            </button>
          </div>
          <div class="recent-search-chips" id="searchRecentChips">
            ${recentSearches.map(q => `
              <div class="recent-search-chip" data-query="${UIManager.escapeHtml(q)}">
                <span class="chip-query">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>
                  <span>${UIManager.escapeHtml(q)}</span>
                </span>
                <button class="chip-remove-btn" data-remove="${UIManager.escapeHtml(q)}" title="Remove this search">✕</button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : `
        <div class="recent-searches-box" style="padding: 16px 20px; color: var(--text-muted); font-size: 0.88rem; display: flex; align-items: center; gap: 8px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>No search history yet. Search from the top search bar or pick a category below to start listening.</span>
        </div>
      `}

      <!-- Apple Music Browse Categories Grid -->
      <div class="apple-browse-section">
        <h3 class="apple-browse-heading">Browse Categories</h3>
        <div class="apple-browse-grid" id="appleBrowseGrid">
          <div class="apple-category-card" data-query="Bollywood Top Hits" style="background: linear-gradient(135deg, #e11d48 0%, #881337 100%);">
            <div class="apple-cat-title">Bollywood<br />Hits</div>
            <div class="apple-cat-icon">🎬</div>
          </div>
          <div class="apple-category-card" data-query="Punjabi Top Hits" style="background: linear-gradient(135deg, #f59e0b 0%, #92400e 100%);">
            <div class="apple-cat-title">Punjabi<br />Hits</div>
            <div class="apple-cat-icon">🪕</div>
          </div>
          <div class="apple-category-card" data-query="Global Pop Hits" style="background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);">
            <div class="apple-cat-title">Global<br />Pop</div>
            <div class="apple-cat-icon">🌟</div>
          </div>
          <div class="apple-category-card" data-query="Hip Hop Rap Hits" style="background: linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%);">
            <div class="apple-cat-title">Hip-Hop &<br />Rap</div>
            <div class="apple-cat-icon">🔥</div>
          </div>
          <div class="apple-category-card" data-query="Lo-Fi Chill Beats" style="background: linear-gradient(135deg, #10b981 0%, #065f46 100%);">
            <div class="apple-cat-title">Lo-Fi &<br />Chill</div>
            <div class="apple-cat-icon">☕</div>
          </div>
          <div class="apple-category-card" data-query="Romantic Love Songs" style="background: linear-gradient(135deg, #ec4899 0%, #9d174d 100%);">
            <div class="apple-cat-title">Romance &<br />Love</div>
            <div class="apple-cat-icon">❤️</div>
          </div>
          <div class="apple-category-card" data-query="Workout Motivation Gym" style="background: linear-gradient(135deg, #f97316 0%, #9a3412 100%);">
            <div class="apple-cat-title">Workout &<br />Energy</div>
            <div class="apple-cat-icon">⚡</div>
          </div>
          <div class="apple-category-card" data-query="Sad Emotional Heartbreak Songs" style="background: linear-gradient(135deg, #475569 0%, #0f172a 100%);">
            <div class="apple-cat-title">Sad &<br />Heartfelt</div>
            <div class="apple-cat-icon">🌧️</div>
          </div>
          <div class="apple-category-card" data-query="Party EDM Dance" style="background: linear-gradient(135deg, #a855f7 0%, #6b21a8 100%);">
            <div class="apple-cat-title">Party &<br />Dance</div>
            <div class="apple-cat-icon">🪩</div>
          </div>
          <div class="apple-category-card" data-query="Rock Classic Indie" style="background: linear-gradient(135deg, #ef4444 0%, #7f1d1d 100%);">
            <div class="apple-cat-title">Rock &<br />Indie</div>
            <div class="apple-cat-icon">🎸</div>
          </div>
          <div class="apple-category-card" data-query="Spatial Audio 8D Music" style="background: linear-gradient(135deg, #6366f1 0%, #3730a3 100%);">
            <div class="apple-cat-title">Spatial<br />Audio</div>
            <div class="apple-cat-icon">🎧</div>
          </div>
          <div class="apple-category-card" data-query="Peaceful Acoustic Classical" style="background: linear-gradient(135deg, #14b8a6 0%, #115e59 100%);">
            <div class="apple-cat-title">Acoustic &<br />Peaceful</div>
            <div class="apple-cat-icon">🕊️</div>
          </div>
        </div>
      </div>
    `;

    document.querySelectorAll('#searchRecentChips .recent-search-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.chip-remove-btn')) return;
        const query = chip.dataset.query;
        this.submitSearch(query);
      });
    });

    document.querySelectorAll('#searchRecentChips .chip-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const query = btn.dataset.remove;
        StorageManager.removeRecentSearch(query);
        this.renderSearchView();
      });
    });

    document.getElementById('btnClearSearchInSearch')?.addEventListener('click', () => {
      StorageManager.clearRecentSearches();
      UIManager.showToast('Recent searches cleared', 'info');
      this.renderSearchView();
    });

    document.querySelectorAll('#appleBrowseGrid .apple-category-card').forEach(card => {
      card.addEventListener('click', () => {
        const query = card.dataset.query;
        this.submitSearch(query);
      });
    });
  }

  navigatePlaylist(playlistId) {
    this.currentView = 'playlist';
    this.currentPlaylistId = playlistId;
    this.dom.navLinks.forEach(link => link.classList.remove('active'));

    const playlists = StorageManager.getPlaylists();
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;

    this.renderPlaylistView(pl);
  }

  // --- View Renderers ---
  async renderHomeView() {
    this.dom.contentArea.innerHTML = `
      <!-- Genre / Mood Filters -->
      <div class="chips-row" id="genreChips">
        ${CONFIG.GENRES.map(g => `
          <button class="chip-btn ${this.activeGenre === g.id ? 'active' : ''}" data-genre="${g.id}">
            ${g.name}
          </button>
        `).join('')}
      </div>

      <!-- Trending Section -->
      <div>
        <div class="section-header">
          <div>
            <h2 class="section-title">Trending Music</h2>
            <div class="section-subtitle">Streamed directly without ads with background playback</div>
          </div>
        </div>
        <div class="cards-grid" id="trendingGrid">
          <div class="spinner" style="margin: 40px auto; grid-column: 1 / -1;"></div>
        </div>
      </div>

      <!-- Live Radio Section -->
      <div>
        <div class="section-header">
          <div>
            <h2 class="section-title">24/7 Live Radio Stations</h2>
            <div class="section-subtitle">Lo-fi, Lounge, Bollywood & Rock broadcasts</div>
          </div>
          <span class="section-action" id="btnViewAllRadio">Explore all 35k stations →</span>
        </div>
        <div class="cards-grid" id="radioGrid"></div>
      </div>
    `;

    document.getElementById('btnViewAllRadio')?.addEventListener('click', () => {
      this.navigate('radio');
    });

    // Genre filter chips
    document.querySelectorAll('#genreChips .chip-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('#genreChips .chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeGenre = btn.dataset.genre;

        const grid = document.getElementById('trendingGrid');
        grid.innerHTML = '<div class="spinner" style="margin: 40px auto; grid-column: 1 / -1;"></div>';
        const tracks = await api.getGenreTracks(this.activeGenre);
        this.renderGridItems(grid, tracks);
      });
    });

    // Fetch and render initial tracks
    const trendingGrid = document.getElementById('trendingGrid');
    const trendingTracks = await api.getTrendingTracks();
    this.renderGridItems(trendingGrid, trendingTracks);

    // Render radio highlight
    const radioGrid = document.getElementById('radioGrid');
    this.renderGridItems(radioGrid, CONFIG.CURATED_RADIO);
  }

  renderGridItems(container, tracks) {
    if (!container) return;
    container.innerHTML = '';
    if (!tracks || tracks.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); grid-column: 1 / -1; padding: 20px;">No tracks found</div>';
      return;
    }

    tracks.forEach(track => {
      const card = UIManager.createMusicCard(
        track,
        player.currentTrack?.id,
        (t) => (player.currentTrack?.id === t.id ? player.togglePlay() : player.playTrack(t, tracks)),
        async (t, isLiked) => {
          await auth.syncCollectionToServer();
          if (this.currentView === 'liked') this.renderLikedView();
          else if (this.currentView === 'library') this.renderLibraryView();
        },
        (t) => player.addToQueue(t),
        (t) => this.downloadTrack(t),
        (t) => this.shareTrack(t),
        (t) => this.openAddToPlaylist(t)
      );
      container.appendChild(card);
    });
  }

  renderSearchResults(query, tracks, errorMessage = '') {
    this.searchViewMode = this.searchViewMode || 'list'; // 'list' | 'grid'

    this.dom.contentArea.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">Results for "${UIManager.escapeHtml(query)}"</h2>
          <div class="section-subtitle">${tracks.length} song${tracks.length === 1 ? '' : 's'} • Ad-Free Stream</div>
        </div>
        ${tracks.length > 0 ? `
          <div class="search-view-toggle">
            <button class="view-toggle-btn ${this.searchViewMode === 'list' ? 'active' : ''}" id="btnSearchList" title="Song List View">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
            </button>
            <button class="view-toggle-btn ${this.searchViewMode === 'grid' ? 'active' : ''}" id="btnSearchGrid" title="Grid View">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </button>
          </div>
        ` : ''}
      </div>

      ${tracks.length === 0 ? `
        <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5;">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <div style="font-size: 1.1rem; font-weight: 600;">${errorMessage || `No online songs found for "${UIManager.escapeHtml(query)}"`}</div>
          <div style="font-size: 0.9rem; margin-top: 6px;">${errorMessage ? 'Please try again in a moment.' : 'Try searching for popular artists or songs'}</div>
        </div>
      ` : `
        <div id="searchResultsContainer"></div>
      `}
    `;

    const container = document.getElementById('searchResultsContainer');
    if (!container || tracks.length === 0) return;

    const renderResults = () => {
      container.innerHTML = '';
      if (this.searchViewMode === 'grid') {
        container.className = 'cards-grid';
        tracks.forEach(track => {
          const card = UIManager.createMusicCard(
            track,
            player.currentTrack?.id,
            (t) => (player.currentTrack?.id === t.id ? player.togglePlay() : player.playWithSeed(t, 'search')),
            async (t, isLiked) => {
              await auth.syncCollectionToServer();
              if (this.currentView === 'liked') this.renderLikedView();
              else if (this.currentView === 'library') this.renderLibraryView();
            },
            (t) => player.addToQueue(t),
            (t) => this.downloadTrack(t),
            (t) => this.shareTrack(t),
            (t) => this.openAddToPlaylist(t)
          );
          container.appendChild(card);
        });
      } else {
        container.className = 'track-list';
        tracks.forEach((track, idx) => {
          const row = UIManager.createTrackRow(
            track,
            idx,
            player.currentTrack?.id,
            (t) => (player.currentTrack?.id === t.id ? player.togglePlay() : player.playWithSeed(t, 'search')),
            async (t, isLiked) => {
              await auth.syncCollectionToServer();
              if (this.currentView === 'liked') this.renderLikedView();
              else if (this.currentView === 'library') this.renderLibraryView();
            },
            null,
            (t) => this.downloadTrack(t),
            (t) => this.shareTrack(t),
            (t) => this.openAddToPlaylist(t)
          );
          container.appendChild(row);
        });
      }
    };

    renderResults();

    document.getElementById('btnSearchList')?.addEventListener('click', () => {
      this.searchViewMode = 'list';
      document.getElementById('btnSearchList')?.classList.add('active');
      document.getElementById('btnSearchGrid')?.classList.remove('active');
      renderResults();
    });

    document.getElementById('btnSearchGrid')?.addEventListener('click', () => {
      this.searchViewMode = 'grid';
      document.getElementById('btnSearchGrid')?.classList.add('active');
      document.getElementById('btnSearchList')?.classList.remove('active');
      renderResults();
    });
  }

  async renderRadioView() {
    this.dom.contentArea.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">Global Live Radio</h2>
          <div class="section-subtitle">Tune into 35,000+ uninterrupted live stations worldwide</div>
        </div>
      </div>
      <div class="cards-grid" id="allRadioGrid">
        <div class="spinner" style="margin: 40px auto; grid-column: 1 / -1;"></div>
      </div>
    `;

    const stations = await api.getLiveRadioStations('top');
    const container = document.getElementById('allRadioGrid');
    this.renderGridItems(container, stations);
  }

  renderLibraryView() {
    const liked = StorageManager.getLikedSongs();
    const recent = StorageManager.getRecentTracks();
    const playlists = StorageManager.getPlaylists();
    const user = auth.getUser();

    this.dom.contentArea.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">Your Music Collection</h2>
          <div class="section-subtitle">
            ${user ? `Connected to <b>${UIManager.escapeHtml(user.username)}</b>'s cloud account` : 'Guest Mode • Sign in to sync across phone and laptop'}
          </div>
        </div>
        ${!user ? `
          <button class="btn-primary" id="btnLibrarySignIn" style="padding: 8px 18px; font-size: 0.85rem;">
            Sign In / Register
          </button>
        ` : ''}
      </div>

      <!-- Quick Library Cards -->
      <div class="cards-grid" style="margin-bottom: 30px;">
        <div class="music-card" id="cardGoLiked" style="background: linear-gradient(135deg, rgba(236,72,153,0.2) 0%, rgba(99,102,241,0.2) 100%);">
          <div style="font-size: 1.3rem; font-weight: 700; margin-bottom: 4px;">Favorites</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${liked.length} saved songs</div>
        </div>

        <div class="music-card" id="cardGoRecent" style="background: linear-gradient(135deg, rgba(59,130,246,0.2) 0%, rgba(16,185,129,0.2) 100%);">
          <div style="font-size: 1.3rem; font-weight: 700; margin-bottom: 4px;">Recent Activity</div>
          <div style="font-size: 0.85rem; color: var(--text-secondary);">${recent.length} played • ${StorageManager.getRecentSearches().length} searches</div>
        </div>

        ${playlists.map(p => `
          <div class="music-card playlist-nav-card" data-id="${p.id}">
            <div style="font-size: 1.15rem; font-weight: 700; margin-bottom: 4px;">${UIManager.escapeHtml(p.name)}</div>
            <div style="font-size: 0.82rem; color: var(--text-secondary);">${p.tracks?.length || 0} songs</div>
          </div>
        `).join('')}
      </div>

      <!-- Recently Played Section -->
      <div class="section-header">
        <div>
          <h3 class="section-title" style="font-size: 1.2rem;">Recently Played</h3>
          <div class="section-subtitle">Your latest listening session</div>
        </div>
      </div>
      <div class="track-list" id="recentTrackList">
        ${recent.length === 0 ? '<div style="color: var(--text-muted); padding: 20px;">No recent listening history yet</div>' : ''}
      </div>
    `;

    document.getElementById('btnLibrarySignIn')?.addEventListener('click', () => {
      this.dom.authModal.classList.add('open');
    });

    document.getElementById('cardGoLiked')?.addEventListener('click', () => {
      this.navigate('liked');
    });

    document.getElementById('cardGoRecent')?.addEventListener('click', () => {
      this.navigate('recent');
    });

    document.querySelectorAll('.playlist-nav-card').forEach(card => {
      card.addEventListener('click', () => {
        this.navigatePlaylist(card.dataset.id);
      });
    });

    const recentList = document.getElementById('recentTrackList');
    if (recentList && recent.length > 0) {
      recent.forEach((track, idx) => {
        const row = UIManager.createTrackRow(
          track,
          idx,
          player.currentTrack?.id,
          (t) => {
            if (player.currentTrack?.id === t.id && !player.audio.paused) {
              player.togglePlay();
            } else {
              player.playTrack(t, recent);
            }
          },
          (t, isLiked) => {
            auth.syncCollectionToServer();
          },
          null,
          (t) => this.downloadTrack(t),
          (t) => this.shareTrack(t),
          (t) => this.openAddToPlaylist(t)
        );
        recentList.appendChild(row);
      });
    }
  }

  renderLikedView() {
    const liked = StorageManager.getLikedSongs();

    this.dom.contentArea.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">Favorites</h2>
          <div class="section-subtitle">${liked.length} saved track${liked.length === 1 ? '' : 's'} in your personal favorites collection</div>
        </div>
        ${liked.length > 0 ? `
          <button class="btn-primary" id="btnPlayLiked">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="6 3 20 12 6 21 6 3"></polygon>
            </svg>
            Play All
          </button>
        ` : ''}
      </div>

      <div class="track-list" id="likedTrackList">
        ${liked.length === 0 ? `
          <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5;">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
            <div style="font-size: 1.1rem; font-weight: 600;">No favorite songs yet</div>
            <div style="font-size: 0.9rem; margin-top: 6px;">Tap the heart icon on any song to save it to Favorites</div>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('btnPlayLiked')?.addEventListener('click', () => {
      if (liked.length > 0) {
        if (player.currentTrack && liked.some(t => t.id === player.currentTrack.id)) {
          player.togglePlay();
        } else {
          player.playTrack(liked[0], liked, { type: 'favorites' });
        }
      }
    });

    const list = document.getElementById('likedTrackList');
    if (list && liked.length > 0) {
      liked.forEach((track, idx) => {
        const row = UIManager.createTrackRow(
          track,
          idx,
          player.currentTrack?.id,
          (t) => (player.currentTrack?.id === t.id ? player.togglePlay() : player.playTrack(t, liked, { type: 'favorites' })),
          (t, isLiked) => {
            auth.syncCollectionToServer();
            if (!isLiked) this.renderLikedView();
          },
          null,
          (t) => this.downloadTrack(t),
          (t) => this.shareTrack(t),
          (t) => this.openAddToPlaylist(t)
        );
        list.appendChild(row);
      });
    }
  }

  renderRecentView() {
    const recentSearches = StorageManager.getRecentSearches();
    const recentTracks = StorageManager.getRecentTracks();

    this.dom.contentArea.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title" style="font-size: 1.85rem; font-weight: 800; letter-spacing: -0.5px;">Recent Activity</h2>
          <div class="section-subtitle">Your search history and recently played listening sessions</div>
        </div>
      </div>

      <!-- Recent Searches Section -->
      <div class="recent-searches-box">
        <div class="recent-searches-header">
          <div class="recent-searches-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <span>Recent Searches (${recentSearches.length})</span>
          </div>
          ${recentSearches.length > 0 ? `
            <button class="btn-glass" id="btnClearSearchHistory" style="padding: 6px 14px; font-size: 0.8rem;">
              Clear Searches
            </button>
          ` : ''}
        </div>

        <div class="recent-search-chips" id="recentSearchChipsContainer">
          ${recentSearches.length === 0 ? `
            <div class="recent-search-empty">
              No search history yet. Search for songs, artists, or genres to see your searches here.
            </div>
          ` : recentSearches.map(q => `
            <div class="recent-search-chip" data-query="${UIManager.escapeHtml(q)}">
              <span class="chip-query">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>${UIManager.escapeHtml(q)}</span>
              </span>
              <button class="chip-remove-btn" data-remove="${UIManager.escapeHtml(q)}" title="Remove this search">✕</button>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Recently Played Songs Section -->
      <div class="section-header" style="margin-top: 10px;">
        <div>
          <h3 class="section-title" style="font-size: 1.35rem;">Recently Played Songs</h3>
          <div class="section-subtitle">${recentTracks.length} song${recentTracks.length === 1 ? '' : 's'} played recently</div>
        </div>
        <div style="display: flex; gap: 10px;">
          ${recentTracks.length > 0 ? `
            <button class="btn-primary" id="btnPlayAllRecent" style="padding: 8px 18px; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21 6 3"></polygon>
              </svg>
              <span>Play All</span>
            </button>
            <button class="btn-glass" id="btnClearRecentSongs" style="padding: 8px 14px; font-size: 0.85rem;">
              Clear Songs
            </button>
          ` : ''}
        </div>
      </div>

      <div class="track-list" id="recentViewTrackList">
        ${recentTracks.length === 0 ? `
          <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5;">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <div style="font-size: 1.1rem; font-weight: 600;">No recently played tracks</div>
            <div style="font-size: 0.9rem; margin-top: 6px;">Songs you listen to will automatically appear here</div>
          </div>
        ` : ''}
      </div>
    `;

    // Event handlers for Recent Searches
    document.querySelectorAll('#recentSearchChipsContainer .recent-search-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        if (e.target.closest('.chip-remove-btn')) return;
        const q = chip.dataset.query;
        if (q) {
          this.dom.searchInput.value = q;
          if (this.dom.searchClear) this.dom.searchClear.classList.add('visible');
          this.navigateSearch(q);
        }
      });
    });

    document.querySelectorAll('#recentSearchChipsContainer .chip-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const q = btn.dataset.remove;
        StorageManager.removeRecentSearch(q);
        this.renderRecentView();
      });
    });

    document.getElementById('btnClearSearchHistory')?.addEventListener('click', () => {
      StorageManager.clearRecentSearches();
      UIManager.showToast('Search history cleared', 'info');
      this.renderRecentView();
    });

    document.getElementById('btnClearRecentSongs')?.addEventListener('click', () => {
      StorageManager.clearRecentTracks();
      UIManager.showToast('Recently played history cleared', 'info');
      this.renderRecentView();
    });

    document.getElementById('btnPlayAllRecent')?.addEventListener('click', () => {
      if (recentTracks.length > 0) {
        player.playTrack(recentTracks[0], recentTracks);
      }
    });

    const recentList = document.getElementById('recentViewTrackList');
    if (recentList && recentTracks.length > 0) {
      recentTracks.forEach((track, idx) => {
        const row = UIManager.createTrackRow(
          track,
          idx,
          player.currentTrack?.id,
          (t) => {
            if (player.currentTrack?.id === t.id && !player.audio.paused) {
              player.togglePlay();
            } else {
              player.playTrack(t, recentTracks);
            }
          },
          (t, isLiked) => {
            auth.syncCollectionToServer();
          },
          null,
          (t) => this.downloadTrack(t),
          (t) => this.shareTrack(t),
          (t) => this.openAddToPlaylist(t)
        );
        recentList.appendChild(row);
      });
    }
  }

  renderPlaylistView(playlist) {
    const tracks = playlist.tracks || [];

    this.dom.contentArea.innerHTML = `
      <div class="section-header">
        <div>
          <h2 class="section-title">${UIManager.escapeHtml(playlist.name)}</h2>
          <div class="section-subtitle">${UIManager.escapeHtml(playlist.description || `${tracks.length} tracks`)}</div>
        </div>
        <div style="display: flex; gap: 10px;">
          ${tracks.length > 0 ? `
            <button class="btn-primary" id="btnPlayPlaylist">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="6 3 20 12 6 21 6 3"></polygon>
              </svg>
              Play
            </button>
          ` : ''}
          <button class="btn-glass" id="btnDeletePlaylist" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.3);">
            Delete Playlist
          </button>
        </div>
      </div>

      <div class="track-list" id="playlistTrackList">
        ${tracks.length === 0 ? `
          <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
            <div style="font-size: 1.1rem; font-weight: 600;">This playlist is empty</div>
            <div style="font-size: 0.9rem; margin-top: 6px;">Add tracks by clicking the "..." or "+" button on song cards</div>
          </div>
        ` : ''}
      </div>
    `;

    document.getElementById('btnPlayPlaylist')?.addEventListener('click', () => {
      if (tracks.length > 0) {
        if (player.currentTrack && tracks.some(t => t.id === player.currentTrack.id)) {
          player.togglePlay();
        } else {
          player.playTrack(tracks[0], tracks, { type: 'playlist', id: playlist.id });
        }
      }
    });

    document.getElementById('btnDeletePlaylist')?.addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete "${playlist.name}"?`)) {
        StorageManager.deletePlaylist(playlist.id);
        auth.syncCollectionToServer();
        UIManager.renderSidebarPlaylists((id) => this.navigatePlaylist(id));
        UIManager.showToast(`Playlist "${playlist.name}" deleted`);
        this.navigate('library');
      }
    });

    const list = document.getElementById('playlistTrackList');
    if (list && tracks.length > 0) {
      tracks.forEach((track, idx) => {
        const row = UIManager.createTrackRow(
          track,
          idx,
          player.currentTrack?.id,
          (t) => (player.currentTrack?.id === t.id ? player.togglePlay() : player.playTrack(t, tracks, { type: 'playlist', id: playlist.id })),
          (t, isLiked) => {
            auth.syncCollectionToServer();
          },
          (t) => {
            StorageManager.removeTrackFromPlaylist(playlist.id, t.id);
            auth.syncCollectionToServer();
            const updated = StorageManager.getPlaylists().find(p => p.id === playlist.id);
            this.renderPlaylistView(updated);
            UIManager.showToast(`Removed from "${playlist.name}"`);
          },
          (t) => this.downloadTrack(t),
          (t) => this.shareTrack(t),
          (t) => this.openAddToPlaylist(t)
        );
        list.appendChild(row);
      });
    }
  }

  // --- Sleep & Relax Dedicated View ---
  async renderSleepView() {
    const isRunning = sleepMode.isActive;
    const remainingText = isRunning ? sleepMode.getRemaining().formattedTime : '';

    this.dom.contentArea.innerHTML = `
      <!-- Hero Card -->
      <div class="sleep-hero-card">
        <div style="max-width: 540px; position: relative; z-index: 2;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px;">
            <span style="font-size: 1.15rem;">🌙</span>
            <span style="font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #c084fc;">Nighttime Serenity</span>
          </div>
          <h1 style="font-size: 2.2rem; font-weight: 800; letter-spacing: -0.8px; margin-bottom: 8px; color: #ffffff;">Sleep & Relax</h1>
          <p style="font-size: 1rem; color: rgba(255, 255, 255, 0.75); line-height: 1.5; margin-bottom: 22px;">Slow down, breathe, and let the music fade into the night.</p>
          <div style="display: flex; flex-wrap: wrap; gap: 12px; align-items: center;">
            <button type="button" class="btn-primary" id="btnStartSleepSession" style="background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%); border: none; padding: 12px 24px; font-size: 0.95rem; font-weight: 700; box-shadow: 0 4px 18px rgba(168, 85, 247, 0.4);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              Start Sleep Session
            </button>
            <span class="sleep-pill-badge" style="padding: 6px 14px; font-size: 0.85rem; display: ${isRunning ? 'inline-flex' : 'none'};" id="sleepHeroBadge">
              🌙 ${remainingText} remaining
            </span>
          </div>
        </div>
      </div>

      <!-- Made for Sleep -->
      <div style="margin-bottom: 34px;">
        <div class="section-header">
          <div>
            <h2 class="section-title">Made for Sleep</h2>
            <div class="section-subtitle">Gentle tones and peaceful compositions to calm your mind</div>
          </div>
        </div>
        <div class="cards-grid" id="sleepMadeGrid"></div>
      </div>

      <!-- Deep Relaxation -->
      <div style="margin-bottom: 34px;">
        <div class="section-header">
          <div>
            <h2 class="section-title">Deep Relaxation</h2>
            <div class="section-subtitle">Binaural, nature acoustic, and meditation soundscapes</div>
          </div>
        </div>
        <div class="cards-grid" id="sleepDeepGrid"></div>
      </div>

      <!-- Calm Instrumentals -->
      <div style="margin-bottom: 34px;">
        <div class="section-header">
          <div>
            <h2 class="section-title">Calm Instrumentals</h2>
            <div class="section-subtitle">Fingerpicked acoustics and quiet piano harmonies</div>
          </div>
        </div>
        <div class="cards-grid" id="sleepInstrumentalGrid"></div>
      </div>

      <!-- Lo-Fi Nights -->
      <div style="margin-bottom: 34px;">
        <div class="section-header">
          <div>
            <h2 class="section-title">Lo-Fi Nights</h2>
            <div class="section-subtitle">Mellow beats and quiet midnight chords</div>
          </div>
        </div>
        <div class="cards-grid" id="sleepLofiGrid"></div>
      </div>
    `;

    document.getElementById('btnStartSleepSession')?.addEventListener('click', () => {
      this.openSleepModal();
    });

    // Populate calming collections from existing library
    const madeForSleep = [
      CONFIG.CURATED_TRACKS[1], // Coffee Beans & Raindrops
      CONFIG.CURATED_TRACKS[0], // Midnight City Lights
      CONFIG.CURATED_RADIO[0]   // Lofi Girl 24/7 Stream
    ].filter(Boolean);

    const deepRelaxation = [
      CONFIG.CURATED_TRACKS[4], // Deep Focus & Flow
      CONFIG.CURATED_TRACKS[3], // Acoustic Morning Breeze
      CONFIG.CURATED_RADIO[1]   // Chillout Lounge FM
    ].filter(Boolean);

    const calmInstrumentals = [
      CONFIG.CURATED_TRACKS[3], // Acoustic Morning Breeze
      CONFIG.CURATED_TRACKS[1], // Coffee Beans & Raindrops
      CONFIG.CURATED_TRACKS[4]  // Deep Focus & Flow
    ].filter(Boolean);

    const lofiNights = [
      CONFIG.CURATED_TRACKS[0], // Midnight City Lights
      CONFIG.CURATED_TRACKS[1], // Coffee Beans & Raindrops
      CONFIG.CURATED_TRACKS[4]  // Deep Focus & Flow
    ].filter(Boolean);

    this.renderGridItems(document.getElementById('sleepMadeGrid'), madeForSleep);
    this.renderGridItems(document.getElementById('sleepDeepGrid'), deepRelaxation);
    this.renderGridItems(document.getElementById('sleepInstrumentalGrid'), calmInstrumentals);
    this.renderGridItems(document.getElementById('sleepLofiGrid'), lofiNights);
  }

  // --- Traveling Vibes Dedicated View (Strictly Zero Emojis) ---
  renderTravelView() {
    const activeCat = this.activeTravelCategory;
    const isSuggest = this.isTravelSuggestActive;

    const currentCatObj = activeCat ? TRAVEL_CATEGORIES.find(c => c.id === activeCat) : null;
    const currentCatName = currentCatObj ? currentCatObj.name : '';

    this.dom.contentArea.innerHTML = `
      <div class="travel-header">
        <div class="section-header" style="margin-bottom: 14px;">
          <div>
            <h1 class="section-title" style="font-size: 2rem; font-weight: 800; letter-spacing: -0.5px;">Traveling Vibes</h1>
            <div class="section-subtitle">Soundtracks for open roads, mountains, and late-night journeys.</div>
          </div>
        </div>

        <!-- Horizontal Category Bar (Text only, horizontally scrollable) -->
        <div class="travel-category-bar" id="travelCategoryBar">
          ${TRAVEL_CATEGORIES.map(cat => `
            <button type="button" class="travel-category-tab ${(!isSuggest && activeCat === cat.id) ? 'active' : ''}" data-cat="${cat.id}">
              ${cat.name}
            </button>
          `).join('')}
          <button type="button" class="travel-category-tab suggest-tab ${isSuggest ? 'active' : ''}" id="btnTravelSuggest">
            Suggest Songs
          </button>
        </div>
      </div>

      <!-- Main Content Section -->
      <div>
        <div class="section-header">
          <div>
            <h2 class="section-title" id="travelSectionTitle">
              ${isSuggest 
                ? 'Recommended For Your Journey' 
                : (activeCat ? `${currentCatName} Songs` : 'Overall Traveling Songs')}
            </h2>
            <div class="section-subtitle" id="travelSectionSubtitle">
              ${isSuggest 
                ? (activeCat ? `Curated recommendations tuned for your ${currentCatName} journey.` : 'Curated recommendations tuned for your travel vibe.')
                : (activeCat ? `Specially chosen tracks for ${currentCatName.toLowerCase()} adventures.` : 'Curated collection of popular road-trip and travel songs.')}
            </div>
          </div>
          ${isSuggest ? `
            <div class="travel-notice-badge">
              <span>Showing curated recommendations</span>
            </div>
          ` : ''}
        </div>
        <div class="cards-grid" id="travelGrid"></div>
      </div>
    `;

    // Category click handler
    document.querySelectorAll('#travelCategoryBar .travel-category-tab[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const catId = btn.dataset.cat;
        if (this.activeTravelCategory === catId && !this.isTravelSuggestActive) {
          // Toggle off back to Overall
          this.activeTravelCategory = null;
        } else {
          this.activeTravelCategory = catId;
        }
        this.isTravelSuggestActive = false;
        this.renderTravelView();
      });
    });

    // Suggest Songs click handler
    document.getElementById('btnTravelSuggest')?.addEventListener('click', () => {
      this.isTravelSuggestActive = true;
      this.renderTravelView();
    });

    // Determine songs to render
    const travelGrid = document.getElementById('travelGrid');
    let tracksToRender = [];

    if (isSuggest) {
      tracksToRender = getSuggestedTravelSongs(this.activeTravelCategory, {
        liked: StorageManager.getLikedTracks(),
        recent: StorageManager.getRecentTracks()
      });
    } else if (activeCat && CATEGORY_SONGS[activeCat]) {
      tracksToRender = this.getTravelCategoryFallback(activeCat);
    } else {
      tracksToRender = OVERALL_TRAVEL_SONGS;
    }

    this.renderGridItems(travelGrid, tracksToRender);

    if (activeCat && !isSuggest) {
      this.loadTravelCategoryTracks(activeCat, travelGrid, tracksToRender);
    }
  }

  getTravelCategoryFallback(categoryId) {
    const categoryTracks = CATEGORY_SONGS[categoryId] || [];
    const allCategoryTracks = Object.values(CATEGORY_SONGS).flat();
    const seen = new Set();
    return [...categoryTracks, ...OVERALL_TRAVEL_SONGS, ...allCategoryTracks]
      .filter(track => {
        if (!track || seen.has(track.id)) return false;
        seen.add(track.id);
        return true;
      })
      .slice(0, 15);
  }

  async loadTravelCategoryTracks(categoryId, container, fallbackTracks) {
    const requestId = (this.travelRequestId || 0) + 1;
    this.travelRequestId = requestId;
    const queryByCategory = {
      road_trip: 'best road trip songs travel anthems high energy',
      mountain_journey: 'mountain journey songs scenic travel anthems',
      chill_travel: 'chill travel songs road trip relaxing playlist',
      night_drive: 'night drive songs atmospheric synthwave travel playlist',
      long_drive: 'long drive songs highway travel playlist',
      solo_travel: 'solo travel songs wanderlust road trip playlist'
    };

    try {
      const remoteTracks = await api.searchSongs(queryByCategory[categoryId], 20);
      if (requestId !== this.travelRequestId || this.activeTravelCategory !== categoryId || this.isTravelSuggestActive) {
        return;
      }
      const seen = new Set();
      const mergedTracks = [...(Array.isArray(remoteTracks) ? remoteTracks : []), ...fallbackTracks]
        .filter(track => {
          const id = track?.videoId || track?.id;
          if (!track || !id || seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .slice(0, 15);
      this.renderGridItems(container, mergedTracks);
    } catch (error) {
      console.warn('[Traveling Vibes] Category search failed:', error);
      if (requestId === this.travelRequestId) this.renderGridItems(container, fallbackTracks);
    }
  }
}

// Bootstrap Aura Music on DOM Ready
window.addEventListener('DOMContentLoaded', () => {
  window.AuraApp = new App();
});
