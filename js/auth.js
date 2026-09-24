/**
 * Aura Music - Authentication & Cloud Collection Sync Client
 */

import { StorageManager } from './storage.js';

class AuthManager {
  constructor() {
    this.token = localStorage.getItem('aura_auth_token') || null;
    this.user = null;
    try {
      const storedUser = localStorage.getItem('aura_auth_user');
      this.user = storedUser ? JSON.parse(storedUser) : null;
    } catch (e) {
      this.user = null;
    }
  }

  isLoggedIn() {
    return Boolean(this.token && this.user);
  }

  getUser() {
    return this.user;
  }

  async init(onStateChange) {
    if (!this.token) {
      if (onStateChange) onStateChange(null);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        this.user = data.user;
        localStorage.setItem('aura_auth_user', JSON.stringify(this.user));
        
        // Populate local storage with the cloud collection
        if (data.collection) {
          this.applyCloudCollection(data.collection);
        }
        if (onStateChange) onStateChange(this.user);
      } else {
        // Token expired or invalid
        this.logout();
        if (onStateChange) onStateChange(null);
      }
    } catch (e) {
      // Offline fallback: keep local cached user
      if (onStateChange) onStateChange(this.user);
    }
  }

  async register(username, email, password) {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Registration failed');
    }

    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('aura_auth_token', this.token);
    localStorage.setItem('aura_auth_user', JSON.stringify(this.user));

    if (data.collection) {
      this.applyCloudCollection(data.collection);
    }

    return this.user;
  }

  async login(username, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('aura_auth_token', this.token);
    localStorage.setItem('aura_auth_user', JSON.stringify(this.user));

    if (data.collection) {
      this.applyCloudCollection(data.collection);
    }

    return this.user;
  }

  async loginWithGoogle({ credential, accessToken } = {}) {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, accessToken })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Google authentication failed');
    }

    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('aura_auth_token', this.token);
    localStorage.setItem('aura_auth_user', JSON.stringify(this.user));

    if (data.collection) {
      this.applyCloudCollection(data.collection);
    }

    return this.user;
  }

  async logout() {
    if (this.token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` }
      }).catch(() => {});
    }

    this.token = null;
    this.user = null;
    localStorage.removeItem('aura_auth_token');
    localStorage.removeItem('aura_auth_user');
  }

  applyCloudCollection(collection) {
    try {
      if (Array.isArray(collection.liked)) {
        localStorage.setItem('aura_liked_songs', JSON.stringify(collection.liked));
      }
      if (Array.isArray(collection.playlists)) {
        localStorage.setItem('aura_playlists', JSON.stringify(collection.playlists));
      }
      if (Array.isArray(collection.recent)) {
        localStorage.setItem('aura_recent_history', JSON.stringify(collection.recent));
      }
    } catch (e) {
      console.warn('Error applying cloud collection:', e);
    }
  }

  async syncCollectionToServer() {
    if (!this.token) return;

    const collection = {
      liked: StorageManager.getLikedSongs(),
      playlists: StorageManager.getPlaylists(),
      recent: StorageManager.getRecentTracks()
    };

    try {
      await fetch('/api/user/collection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`
        },
        body: JSON.stringify({ collection })
      });
    } catch (e) {
      console.warn('Failed to sync collection with server:', e);
    }
  }
}

export const auth = new AuthManager();
