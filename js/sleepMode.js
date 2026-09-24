/**
 * AppleTube - Sleep Mode Session & Timer Manager
 * Controls countdown timers, gradual volume fade-out, and automatic playback cessation.
 */

import { player } from './player.js';

class SleepModeManager {
  constructor() {
    this.isActive = false;
    this.durationMinutes = 0;
    this.endTime = null;
    this.timerId = null;
    this.isFading = false;
    this.storageKey = 'appletube_sleep_mode';

    // Event listeners
    this.listeners = {
      tick: [],      // ({ remainingSec, formattedTime, isFading }) => {}
      start: [],     // ({ durationMinutes, endTime }) => {}
      cancel: [],    // () => {}
      complete: []   // () => {}
    };

    this.bindVisibility();
  }

  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  notify(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`[SleepMode] Error in ${event} listener:`, e);
        }
      });
    }
  }

  bindVisibility() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.isActive) {
          // Immediately recalibrate timer on tab wake
          this.tick();
        }
      });
    }
  }

  /**
   * Initializes state on application launch, restoring a valid active session or purging expired ones.
   */
  init() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return;

      const data = JSON.parse(raw);
      const now = Date.now();

      if (data && data.endTime && data.endTime > now) {
        // Safe to resume
        this.isActive = true;
        this.durationMinutes = data.durationMinutes || Math.round((data.endTime - now) / 60000);
        this.endTime = data.endTime;
        this.startInterval();
        this.notify('start', { durationMinutes: this.durationMinutes, endTime: this.endTime });
      } else {
        // Expired while closed — fail safely and clear
        this.clearStorage();
      }
    } catch (e) {
      console.warn('[SleepMode] Failed to restore session:', e);
      this.clearStorage();
    }
  }

  /**
   * Starts a new Sleep Mode timer for the given duration in minutes.
   * @param {number} minutes
   */
  start(minutes) {
    const mins = parseFloat(minutes);
    if (isNaN(mins) || mins <= 0) return;

    this.clearTimer();

    this.durationMinutes = mins;
    this.endTime = Date.now() + Math.round(mins * 60 * 1000);
    this.isActive = true;
    this.isFading = false;

    // Restore volume in case a previous fade was interrupted
    player.restoreNormalVolume();

    this.saveStorage();
    this.startInterval();
    this.tick(); // Immediate initial tick

    this.notify('start', { durationMinutes: this.durationMinutes, endTime: this.endTime });
  }

  startInterval() {
    this.clearTimer();
    this.timerId = setInterval(() => {
      this.tick();
    }, 500);
  }

  clearTimer() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /**
   * Evaluates the countdown using actual timestamp differences.
   */
  tick() {
    if (!this.isActive || !this.endTime) return;

    const remainingMs = Math.max(0, this.endTime - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);

    // Format mm:ss or hh:mm:ss
    const formattedTime = this.formatTime(remainingSec);

    if (remainingSec <= 0) {
      this.complete();
      return;
    }

    // Gradual fade out in final 60 seconds
    if (remainingSec <= 60) {
      this.isFading = true;
      const fadeRatio = Math.max(0, remainingSec / 60);
      player.setFadeVolume(fadeRatio);
    } else if (this.isFading) {
      this.isFading = false;
      player.restoreNormalVolume();
    }

    this.notify('tick', {
      remainingSec,
      formattedTime,
      isFading: this.isFading
    });
  }

  /**
   * Cancels Sleep Mode, restores normal audio output, and leaves playback running.
   */
  cancel() {
    if (!this.isActive) return;

    this.clearTimer();
    this.isActive = false;
    this.isFading = false;
    this.endTime = null;
    this.durationMinutes = 0;

    player.restoreNormalVolume();
    this.clearStorage();

    this.notify('cancel', {});
  }

  /**
   * Fired when the timer reaches 0.
   */
  complete() {
    this.clearTimer();
    this.isActive = false;
    this.isFading = false;
    this.endTime = null;

    // Set fade volume to 0, pause player, then restore normal baseline so user's next play isn't muted
    player.setFadeVolume(0);
    player.pause();
    player.restoreNormalVolume();

    this.clearStorage();

    this.notify('complete', {});
  }

  formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  getRemaining() {
    if (!this.isActive || !this.endTime) {
      return { remainingSec: 0, formattedTime: '0:00', isActive: false };
    }
    const remainingMs = Math.max(0, this.endTime - Date.now());
    const remainingSec = Math.ceil(remainingMs / 1000);
    return {
      remainingSec,
      formattedTime: this.formatTime(remainingSec),
      isActive: true,
      isFading: this.isFading,
      durationMinutes: this.durationMinutes
    };
  }

  saveStorage() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        durationMinutes: this.durationMinutes,
        endTime: this.endTime
      }));
    } catch (e) {}
  }

  clearStorage() {
    try {
      localStorage.removeItem(this.storageKey);
    } catch (e) {}
  }
}

export const sleepMode = new SleepModeManager();
