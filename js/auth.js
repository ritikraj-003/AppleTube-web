/**
 * Aura Music - Authentication & Cloud Collection Sync Client
 */

import { StorageManager } from './storage.js';

const SESSION_KEYS = {
  token: ['appletube_token', 'aura_auth_token'],
  user: ['appletube_user', 'aura_auth_user']
};

class AuthManager {
  constructor() {
    this.token = this.readSessionValue(SESSION_KEYS.token);
    this.user = null;
    try {
      const storedUser = this.readSessionValue(SESSION_KEYS.user);
      this.user = storedUser ? JSON.parse(storedUser) : null;
    } catch (e) {
      this.user = null;
    }
  }

  readSessionValue(keys) {
    for (const key of keys) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    return null;
  }

  persistSession() {
    if (!this.token || !this.user) return;
    const userJson = JSON.stringify(this.user);
    localStorage.setItem('appletube_token', this.token);
    localStorage.setItem('appletube_user', userJson);
    // Keep existing installations signed in while they migrate to the new keys.
    localStorage.setItem('aura_auth_token', this.token);
    localStorage.setItem('aura_auth_user', userJson);
  }

  isLoggedIn() {
    return Boolean(this.token && this.user);
  }

  getUser() {
    return this.user;
  }

  async init(onStateChange) {
    if (!this.token || !this.user) {
      if (onStateChange) onStateChange(null);
      return;
    }

    // Restore the cached session before any network request can delay the UI.
    if (onStateChange) onStateChange(this.user);

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${this.token}` },
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        this.user = data.user;
        this.persistSession();
        
        // Populate local storage with the cloud collection
        if (data.collection) {
          this.applyCloudCollection(data.collection);
        }
        if (onStateChange) onStateChange(this.user);
      } else if (res.status === 401 || res.status === 403) {
        // Only an explicit authorization failure invalidates the cached session.
        this.logout();
        if (onStateChange) onStateChange(null);
      }
    } catch (e) {
      // Offline fallback: keep the restored local session.
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
    this.persistSession();

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
    this.persistSession();

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
    this.persistSession();

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
    localStorage.removeItem('appletube_token');
    localStorage.removeItem('appletube_user');
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
