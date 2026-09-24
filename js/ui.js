/**
 * Aura Music - Reactive UI Renderer & View Components
 */

import { StorageManager } from './storage.js';
import { api } from './api.js';

export class UIManager {
  static currentLyricsFontSize = 1.4; // rem
  static isLyricsReadingMode = false;
  static currentLyricsText = '';

  static formatTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  static formatTimelineTime(seconds) {
    if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    if (hrs > 0) {
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  static escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Toast Notifications ---
  static showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;

    if (type === 'success') {
      icon = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
      `;
    }

    toast.innerHTML = `${icon}<span>${this.escapeHtml(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // --- Song Cards Grid ---
  static createMusicCard(track, currentTrackId, onPlay, onLike, onAddToQueue, onDownload = null, onShare = null, onAddToPlaylist = null) {
    const isPlayingCurrent = currentTrackId === track.id;
    const isLiked = StorageManager.isLiked(track.id);
    const isYouTube = track.source?.includes('YouTube') || track.id?.startsWith('yt_');

    const card = document.createElement('div');
    card.className = `music-card ${isPlayingCurrent ? 'active' : ''}`;
    card.dataset.id = track.id;

    card.innerHTML = `
      <div class="card-artwork-wrapper">
        <img class="card-artwork" src="${this.escapeHtml(track.image || 'assets/default-cover.svg')}" alt="${this.escapeHtml(track.title)}" loading="lazy" onerror="this.src='assets/default-cover.svg'"/>
        <button class="card-play-btn" title="Play">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3"></polygon>
          </svg>
        </button>
      </div>
      <div class="card-title" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</div>
      <div class="card-subtitle" title="${this.escapeHtml(track.artist)}">${this.escapeHtml(track.artist)}</div>
      <div class="card-actions">
        <button class="card-btn btn-like ${isLiked ? 'liked' : ''}" title="${isLiked ? 'Unlike' : 'Like'}">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="card-btn btn-three-dots" title="Add to Playlist / More Options">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2"></circle>
              <circle cx="12" cy="12" r="2"></circle>
              <circle cx="12" cy="19" r="2"></circle>
            </svg>
          </button>
          <button class="card-btn btn-download" title="Download Song">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
          <button class="card-btn btn-queue" title="Add to Queue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    `;

    // Events
    card.querySelector('.card-play-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      onPlay(track);
    });

    card.addEventListener('click', () => {
      onPlay(track);
    });

    const likeBtn = card.querySelector('.btn-like');
    likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const likedNow = StorageManager.toggleLike(track);
      likeBtn.classList.toggle('liked', likedNow);
      likeBtn.querySelector('svg').setAttribute('fill', likedNow ? 'currentColor' : 'none');
      UIManager.showToast(likedNow ? 'Added to Favorites' : 'Removed from Favorites', 'success');
      if (onLike) onLike(track, likedNow);
    });

    const dotsBtn = card.querySelector('.btn-three-dots');
    if (dotsBtn) {
      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onAddToPlaylist) {
          onAddToPlaylist(track);
        } else {
          UIManager.showAddToPlaylistModal(track);
        }
      });
    }

    const downloadBtn = card.querySelector('.btn-download');
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onDownload) onDownload(track);
    });

    const queueBtn = card.querySelector('.btn-queue');
    queueBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onAddToQueue(track);
      UIManager.showToast(`"${track.title}" added to queue`, 'success');
    });

    return card;
  }

  // --- Track Table View ---
  static createTrackRow(track, index, currentTrackId, onPlay, onLike, onRemove = null, onDownload = null, onShare = null, onAddToPlaylist = null) {
    const isPlayingCurrent = currentTrackId === track.id;
    const isLiked = StorageManager.isLiked(track.id);
    const isYouTube = track.source?.includes('YouTube') || track.id?.startsWith('yt_');

    const row = document.createElement('div');
    row.className = `track-row ${isPlayingCurrent ? 'active' : ''}`;
    row.dataset.id = track.id;

    row.innerHTML = `
      <div class="track-num">${index + 1}</div>
      <div class="track-thumb-wrapper" title="Play ${this.escapeHtml(track.title)}">
        <img class="track-thumbnail" src="${this.escapeHtml(track.image || 'assets/default-cover.svg')}" alt="" onerror="this.src='assets/default-cover.svg'"/>
        <div class="track-thumb-overlay">
          <svg class="track-thumb-play-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="6 3 20 12 6 21 6 3"></polygon>
          </svg>
        </div>
      </div>
      <div class="track-info-cell">
        <div class="track-cell-title">${this.escapeHtml(track.title)}</div>
        <div class="track-cell-artist">${this.escapeHtml(track.artist)}</div>
      </div>
      <div class="track-cell-album">${this.escapeHtml(track.album || 'Single')}</div>
      <div class="track-cell-duration">${track.isLive ? 'LIVE' : this.formatTime(track.duration)}</div>
      <div class="track-row-actions">
        <button class="card-btn btn-like ${isLiked ? 'liked' : ''}" title="${isLiked ? 'Unlike' : 'Like'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
          </svg>
        </button>
        <button class="card-btn btn-three-dots" title="Add to Playlist / More Options">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="5" r="2"></circle>
            <circle cx="12" cy="12" r="2"></circle>
            <circle cx="12" cy="19" r="2"></circle>
          </svg>
        </button>
        <button class="card-btn btn-download" title="Download Song">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
        </button>
        <button class="card-btn btn-share" title="Share Song">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
          </svg>
        </button>
        ${onRemove ? `
        <button class="card-btn btn-remove" title="Remove">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>` : ''}
      </div>
    `;

    const thumbWrapper = row.querySelector('.track-thumb-wrapper');
    if (thumbWrapper) {
      thumbWrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        onPlay(track);
      });
    }

    row.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      onPlay(track);
    });

    const likeBtn = row.querySelector('.btn-like');
    likeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const likedNow = StorageManager.toggleLike(track);
      likeBtn.classList.toggle('liked', likedNow);
      likeBtn.querySelector('svg').setAttribute('fill', likedNow ? 'currentColor' : 'none');
      UIManager.showToast(likedNow ? 'Added to Favorites' : 'Removed from Favorites', 'success');
      if (onLike) onLike(track, likedNow);
    });

    const dotsBtn = row.querySelector('.btn-three-dots');
    if (dotsBtn) {
      dotsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onAddToPlaylist) {
          onAddToPlaylist(track);
        } else {
          UIManager.showAddToPlaylistModal(track);
        }
      });
    }

    const downloadBtn = row.querySelector('.btn-download');
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onDownload) onDownload(track);
    });

    const shareBtn = row.querySelector('.btn-share');
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onShare) onShare(track);
    });

    if (onRemove) {
      const removeBtn = row.querySelector('.btn-remove');
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        onRemove(track);
      });
    }

    return row;
  }

  // --- Add to Playlist Modal Handler ---
  static showAddToPlaylistModal(track, onPlaylistAdded = null, onCreateNewPlaylist = null) {
    const modal = document.getElementById('addToPlaylistModal');
    if (!modal || !track) return;

    const thumb = document.getElementById('addToPlaylistThumb');
    const title = document.getElementById('addToPlaylistTitle');
    const artist = document.getElementById('addToPlaylistArtist');
    const items = document.getElementById('addToPlaylistItems');
    const btnCreate = document.getElementById('btnCreateNewFromAddToPlaylist');
    const btnClose = document.getElementById('btnCloseAddToPlaylistModal');

    if (thumb) thumb.src = track.image || 'assets/default-cover.svg';
    if (title) title.textContent = track.title || 'Track';
    if (artist) artist.textContent = track.artist || 'AppleTube';

    const renderList = () => {
      if (!items) return;
      items.innerHTML = '';
      const playlists = StorageManager.getPlaylists();

      if (playlists.length === 0) {
        items.innerHTML = `
          <div style="text-align: center; padding: 24px 10px; color: var(--text-muted); font-size: 0.86rem;">
            No playlists found. Tap "Create New Playlist" above!
          </div>
        `;
        return;
      }

      playlists.forEach(pl => {
        const isIn = StorageManager.isTrackInPlaylist(pl.id, track.id);
        const item = document.createElement('div');
        item.className = 'playlist-picker-item';
        item.innerHTML = `
          <div style="display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1;">
            <div class="playlist-picker-icon">${pl.id === 'pl_favorites' ? '💖' : '🎶'}</div>
            <div style="min-width: 0; flex: 1;">
              <div style="font-size: 0.92rem; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${this.escapeHtml(pl.name)}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-secondary);">
                ${pl.tracks?.length || 0} songs
              </div>
            </div>
          </div>
          <button class="playlist-picker-add-btn ${isIn ? 'added' : ''}" title="${isIn ? 'Remove from playlist' : 'Add to playlist'}">
            ${isIn ? `
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <span>Added</span>
            ` : `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Add</span>
            `}
          </button>
        `;

        item.addEventListener('click', () => {
          if (isIn) {
            StorageManager.removeTrackFromPlaylist(pl.id, track.id);
            UIManager.showToast(`Removed from "${pl.name}"`, 'success');
          } else {
            StorageManager.addTrackToPlaylist(pl.id, track);
            UIManager.showToast(`Added to "${pl.name}"!`, 'success');
          }
          renderList();
          if (onPlaylistAdded) onPlaylistAdded(pl.id, track, !isIn);
        });

        items.appendChild(item);
      });
    };

    renderList();
    modal.classList.add('open');

    const closeHandler = () => {
      modal.classList.remove('open');
      if (btnClose) btnClose.removeEventListener('click', closeHandler);
    };
    if (btnClose) btnClose.addEventListener('click', closeHandler);

    if (btnCreate) {
      btnCreate.onclick = () => {
        modal.classList.remove('open');
        if (onCreateNewPlaylist) {
          onCreateNewPlaylist(track);
        } else {
          const playlistModal = document.getElementById('playlistModal');
          if (playlistModal) playlistModal.classList.add('open');
        }
      };
    }
  }

  // --- Sidebar Playlists ---
  static renderSidebarPlaylists(onSelectPlaylist) {
    const container = document.getElementById('sidebarPlaylists');
    if (!container) return;
    container.innerHTML = '';

    const playlists = StorageManager.getPlaylists();
    playlists.forEach(pl => {
      const link = document.createElement('a');
      link.className = 'nav-link';
      link.dataset.playlistId = pl.id;
      link.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
        <span>${this.escapeHtml(pl.name)}</span>
        <span class="badge">${pl.tracks?.length || 0}</span>
      `;

      link.addEventListener('click', (e) => {
        e.preventDefault();
        onSelectPlaylist(pl.id);
      });

      container.appendChild(link);
    });
  }

  // --- Queue Drawer ---
  static renderQueue(queue, currentIndex, onPlayQueueTrack, onRemoveTrack, seedTrack = null) {
    const list = document.getElementById('queueList');
    const countBadge = document.getElementById('queueCount');
    const subtitle = document.getElementById('queueContextSubtitle');
    if (!list) return;

    if (countBadge) {
      countBadge.textContent = `${queue.length} track${queue.length === 1 ? '' : 's'}`;
    }

    if (subtitle) {
      if (seedTrack && seedTrack.title) {
        subtitle.textContent = `✨ Recommended (Because you played "${seedTrack.title}")`;
      } else {
        subtitle.textContent = '';
      }
    }

    list.innerHTML = '';
    if (!queue || queue.length === 0) {
      list.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);">Queue is empty</div>';
      return;
    }

    let hasRenderedUpNextDivider = false;

    queue.forEach((track, index) => {
      const isCurrent = index === currentIndex;

      // Add a clean divider right before the upcoming recommended tracks
      if (index === currentIndex + 1 && !hasRenderedUpNextDivider) {
        hasRenderedUpNextDivider = true;
        const divider = document.createElement('div');
        divider.className = 'queue-section-divider';
        divider.innerHTML = `<span>✨ Up Next • Recommended</span>`;
        list.appendChild(divider);
      }

      const item = document.createElement('div');
      item.className = `queue-item ${isCurrent ? 'active' : ''}`;
      if (isCurrent) {
        item.style.borderLeft = '3px solid var(--apple-pink)';
        item.style.background = 'rgba(250, 45, 72, 0.12)';
      }

      item.innerHTML = `
        <img class="queue-thumb" src="${this.escapeHtml(track.image || 'assets/default-cover.svg')}" alt="" onerror="this.src='assets/default-cover.svg'"/>
        <div class="queue-item-info">
          <div class="queue-item-title">${this.escapeHtml(track.title)}</div>
          <div class="queue-item-artist">${this.escapeHtml(track.artist)}</div>
        </div>
        <button class="queue-item-remove" title="Remove">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.closest('.queue-item-remove')) return;
        onPlayQueueTrack(index);
      });

      item.querySelector('.queue-item-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        onRemoveTrack(index);
      });

      list.appendChild(item);
    });
  }

  // --- Enhanced Lyrics Reading & Synced Karaoke ---
  static parseLRC(lrcText) {
    if (!lrcText) return [];
    const lines = lrcText.split('\n');
    const result = [];
    const timeReg = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g;

    lines.forEach(line => {
      const match = [...line.matchAll(timeReg)];
      if (match.length > 0) {
        const text = line.replace(timeReg, '').trim();
        if (text) {
          match.forEach(m => {
            const min = parseInt(m[1], 10);
            const sec = parseInt(m[2], 10);
            const ms = m[3] ? parseFloat('0.' + m[3]) : 0;
            const time = min * 60 + sec + ms;
            result.push({ time, text });
          });
        }
      } else if (line.trim()) {
        result.push({ time: null, text: line.trim() });
      }
    });

    return result.sort((a, b) => (a.time || 0) - (b.time || 0));
  }

  static renderLyrics(container, lyricsText) {
    if (!container) return [];
    this.currentLyricsText = lyricsText || '';
    container.innerHTML = '';
    container.style.fontSize = `${this.currentLyricsFontSize}rem`;

    if (!lyricsText) {
      container.innerHTML = '<div style="color: var(--text-muted); font-size: 1.1rem; padding: 40px 0;">No lyrics available for this song</div>';
      return [];
    }

    if (this.isLyricsReadingMode) {
      container.classList.add('reading-mode');
      // Clean LRC timestamps for pure reading mode
      const cleanText = lyricsText.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, '').trim();
      container.textContent = cleanText;
      return [];
    }

    container.classList.remove('reading-mode');
    const parsed = this.parseLRC(lyricsText);
    const elements = [];

    parsed.forEach((item, idx) => {
      const line = document.createElement('div');
      line.className = 'lyrics-line';
      line.dataset.index = idx;
      if (item.time !== null) {
        line.dataset.time = item.time;
      }
      line.textContent = item.text;
      container.appendChild(line);
      elements.push({ time: item.time, element: line });
    });

    return elements;
  }

  static toggleLyricsReadingMode(container) {
    this.isLyricsReadingMode = !this.isLyricsReadingMode;
    return this.renderLyrics(container, this.currentLyricsText);
  }

  static changeLyricsFontSize(container, delta) {
    this.currentLyricsFontSize = Math.max(1.0, Math.min(2.4, this.currentLyricsFontSize + delta));
    if (container) {
      container.style.fontSize = `${this.currentLyricsFontSize}rem`;
    }
  }

  // --- Share Song Modal ---
  static showShareModal(track) {
    const modal = document.getElementById('shareModal');
    if (!modal || !track) return;

    const shareUrl = `${window.location.origin}${window.location.pathname}?song=${encodeURIComponent(track.id || track.videoId || '')}&q=${encodeURIComponent((track.title || '') + ' ' + (track.artist || ''))}`;
    const shareText = `Listen to "${track.title}" by ${track.artist} on AppleTube!`;

    const titleEl = document.getElementById('shareSongTitle');
    const artistEl = document.getElementById('shareSongArtist');
    const imgEl = document.getElementById('shareSongThumb');
    const linkInput = document.getElementById('shareLinkInput');
    const btnCopy = document.getElementById('btnCopyShareLink');
    const btnCopyText = document.getElementById('btnCopyShareLinkText');
    const btnClose = document.getElementById('btnCloseShareModal');
    const btnWhatsApp = document.getElementById('btnShareWhatsApp');
    const btnTelegram = document.getElementById('btnShareTelegram');
    const btnTwitter = document.getElementById('btnShareTwitter');
    const btnNative = document.getElementById('btnShareNative');

    if (titleEl) titleEl.textContent = track.title || 'Unknown Title';
    if (artistEl) artistEl.textContent = track.artist || 'Unknown Artist';
    if (imgEl) imgEl.src = track.image || 'assets/default-cover.svg';
    if (linkInput) linkInput.value = shareUrl;

    if (btnCopy) {
      btnCopy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(shareUrl);
          if (btnCopyText) btnCopyText.textContent = 'Copied!';
          setTimeout(() => { if (btnCopyText) btnCopyText.textContent = 'Copy'; }, 2000);
          UIManager.showToast('Music link copied to clipboard!', 'success');
        } catch (e) {
          if (linkInput) {
            linkInput.select();
            document.execCommand('copy');
            if (btnCopyText) btnCopyText.textContent = 'Copied!';
            setTimeout(() => { if (btnCopyText) btnCopyText.textContent = 'Copy'; }, 2000);
            UIManager.showToast('Link copied to clipboard!', 'success');
          }
        }
      };
    }

    if (btnWhatsApp) {
      btnWhatsApp.onclick = () => {
        const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText + ' ' + shareUrl)}`;
        window.open(url, '_blank');
      };
    }

    if (btnTelegram) {
      btnTelegram.onclick = () => {
        const url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;
        window.open(url, '_blank');
      };
    }

    if (btnTwitter) {
      btnTwitter.onclick = () => {
        const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
        window.open(url, '_blank');
      };
    }

    if (btnNative) {
      btnNative.onclick = async () => {
        if (navigator.share) {
          try {
            await navigator.share({
              title: track.title,
              text: shareText,
              url: shareUrl
            });
          } catch (e) {}
        } else {
          if (btnCopy) btnCopy.click();
        }
      };
    }

    if (btnClose) {
      btnClose.onclick = () => modal.classList.remove('open');
    }

    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('open');
    };

    modal.classList.add('open');
  }

  // --- Mood Badge & Same-Type Autoplay UI ---
  static updateMoodBadge(badgeEl, moodKey) {
    if (!badgeEl) return;
    const meta = api.getMoodMetadata(moodKey);
    badgeEl.className = `player-mood-pill ${meta.badgeClass || 'mood-chill'}`;
    badgeEl.innerHTML = `
      <span class="mood-emoji">${meta.emoji}</span>
      <span class="mood-text">${this.escapeHtml(meta.label)}</span>
      <svg class="mood-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    `;
    badgeEl.title = `Current Vibe: ${meta.label} (Click to switch mood)`;
  }

  static renderQueueSuggestions(container, suggestions, currentMood, onPlay, onAdd) {
    if (!container) return;
    container.innerHTML = '';

    const meta = api.getMoodMetadata(currentMood);
    const header = document.createElement('div');
    header.className = 'suggestions-header';
    header.innerHTML = `
      <div class="suggestions-title">
        <span>Up Next • Recommended Similar Songs</span>
      </div>
      <span class="suggestions-hint">Smart Autoplay: Matching Tracks</span>
    `;
    container.appendChild(header);

    if (!suggestions || suggestions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'suggestions-empty';
      empty.textContent = `Finding more ${meta.label.toLowerCase()} songs...`;
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'suggestions-list';

    suggestions.slice(0, 10).forEach(track => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      item.innerHTML = `
        <img class="suggestion-thumb" src="${this.escapeHtml(track.image || 'assets/default-cover.svg')}" alt="" onerror="this.src='assets/default-cover.svg'"/>
        <div class="suggestion-info">
          <div class="suggestion-name" title="${this.escapeHtml(track.title)}">${this.escapeHtml(track.title)}</div>
          <div class="suggestion-artist">${this.escapeHtml(track.artist)}</div>
        </div>
        <div class="suggestion-actions">
          <button class="btn-suggestion-play" title="Play This Next">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
          </button>
          <button class="btn-suggestion-add" title="Add to Queue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      `;

      item.querySelector('.btn-suggestion-play').addEventListener('click', (e) => {
        e.stopPropagation();
        onPlay(track);
      });

      item.querySelector('.btn-suggestion-add').addEventListener('click', (e) => {
        e.stopPropagation();
        onAdd(track);
        UIManager.showToast(`Added "${track.title}" to queue`, 'success');
      });

      item.addEventListener('click', () => {
        onPlay(track);
      });

      list.appendChild(item);
    });

    container.appendChild(list);
  }

  static showMoodPickerModal(currentMood, onSelectMood) {
    const modal = document.getElementById('moodModal');
    if (!modal) return;

    const moods = [
      { key: 'sad', label: 'Sad & Emotional', emoji: '😢', desc: 'Heartbreak, slow melodies, breakup & crying' },
      { key: 'happy', label: 'Happy & Upbeat', emoji: '😊', desc: 'Party, dance, celebration & positive hits' },
      { key: 'romantic', label: 'Romantic & Love', emoji: '❤️', desc: 'Love ballads, slow romance & soothing acoustics' },
      { key: 'chill', label: 'Chill & Lo-Fi', emoji: '☕', desc: 'Relaxing beats, study, rain & midnight vibes' },
      { key: 'energetic', label: 'Energetic & Gym', emoji: '⚡', desc: 'Workout, hardstyle, phonk, bass boosted & rock' }
    ];

    const container = document.getElementById('moodPickerOptions');
    if (container) {
      container.innerHTML = '';
      moods.forEach(m => {
        const btn = document.createElement('button');
        btn.className = `mood-picker-card ${m.key === currentMood ? 'active' : ''}`;
        btn.innerHTML = `
          <div class="mood-card-icon">${m.emoji}</div>
          <div class="mood-card-details">
            <div class="mood-card-title">${m.label}</div>
            <div class="mood-card-desc">${m.desc}</div>
          </div>
          ${m.key === currentMood ? '<span class="mood-active-dot">● Active</span>' : ''}
        `;

        btn.addEventListener('click', () => {
          onSelectMood(m.key);
          modal.classList.remove('open');
          UIManager.showToast(`Vibe switched to ${m.emoji} ${m.label}!`, 'success');
        });

        container.appendChild(btn);
      });
    }

    modal.classList.add('open');
  }
}
