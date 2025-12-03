/* eslint-disable @typescript-eslint/no-explicit-any */

type AudioSourceType =
  | 'video-main'
  | 'video-buffer-a'
  | 'video-buffer-b'
  | 'audio-independent';

interface RegisteredSource {
  element: HTMLVideoElement | HTMLAudioElement;
  type: AudioSourceType;
  trackId: string | undefined;
}

class UnifiedAudioController {
  private sources: Map<string, RegisteredSource> = new Map();
  private activeSourceKey: string | null = null;
  private globalMuted = false;
  private globalVolume = 1;
  private debugEnabled = false;

  private log(message: string, data?: any) {
    if (this.debugEnabled) {
      console.log(`[AudioController] ${message}`, data || '');
    }
  }

  /**
   * Enable or disable debug logging
   */
  setDebug(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  /**
   * Register an audio/video element as an audio source
   */
  register(
    key: string,
    element: HTMLVideoElement | HTMLAudioElement,
    type: AudioSourceType,
    trackId?: string,
  ) {
    this.log(`Registering source: ${key}`, { type, trackId });

    // Immediately mute the new source until it's activated
    element.muted = true;
    element.volume = 0;

    this.sources.set(key, { element, type, trackId });
  }

  /**
   * Unregister an audio source
   */
  unregister(key: string) {
    const source = this.sources.get(key);
    if (source) {
      this.log(`Unregistering source: ${key}`);
      // Mute before removing
      source.element.muted = true;
      source.element.volume = 0;
      this.sources.delete(key);

      // If this was the active source, clear it
      if (this.activeSourceKey === key) {
        this.activeSourceKey = null;
      }
    }
  }

  /**
   * Set which source should be the active audio output
   * All other sources will be muted
   */
  setActiveSource(key: string | null) {
    if (this.activeSourceKey === key) {
      return; // No change needed
    }

    this.log(`Switching active source from ${this.activeSourceKey} to ${key}`);

    // Mute ALL sources first
    this.sources.forEach((source, sourceKey) => {
      source.element.muted = true;
      source.element.volume = 0;
    });

    this.activeSourceKey = key;

    // Unmute only the active source (if not globally muted)
    if (key && this.sources.has(key)) {
      const activeSource = this.sources.get(key)!;
      if (!this.globalMuted) {
        activeSource.element.muted = false;
        activeSource.element.volume = this.globalVolume;
      }
      this.log(`Activated source: ${key}`, {
        muted: activeSource.element.muted,
        volume: activeSource.element.volume,
      });
    }
  }

  /**
   * Get the currently active source key
   */
  getActiveSourceKey(): string | null {
    return this.activeSourceKey;
  }

  /**
   * Set global mute state
   */
  setMuted(muted: boolean) {
    this.globalMuted = muted;

    // Update the active source
    if (this.activeSourceKey && this.sources.has(this.activeSourceKey)) {
      const activeSource = this.sources.get(this.activeSourceKey)!;
      activeSource.element.muted = muted;
      if (!muted) {
        activeSource.element.volume = this.globalVolume;
      }
    }
  }

  /**
   * Set global volume
   */
  setVolume(volume: number) {
    this.globalVolume = Math.max(0, Math.min(1, volume));

    // Update the active source
    if (
      this.activeSourceKey &&
      this.sources.has(this.activeSourceKey) &&
      !this.globalMuted
    ) {
      const activeSource = this.sources.get(this.activeSourceKey)!;
      activeSource.element.volume = this.globalVolume;
    }
  }

  /**
   * Mute all sources (emergency stop)
   */
  muteAll() {
    this.log('Muting ALL sources');
    this.sources.forEach((source) => {
      source.element.muted = true;
      source.element.volume = 0;
    });
  }

  /**
   * Get debug info about all registered sources
   */
  getDebugInfo(): object {
    const info: any = {
      activeSourceKey: this.activeSourceKey,
      globalMuted: this.globalMuted,
      globalVolume: this.globalVolume,
      sources: {},
    };

    this.sources.forEach((source, key) => {
      info.sources[key] = {
        type: source.type,
        trackId: source.trackId,
        muted: source.element.muted,
        volume: source.element.volume,
        paused: source.element.paused,
        currentTime: source.element.currentTime,
        readyState: source.element.readyState,
      };
    });

    return info;
  }

  /**
   * Print debug info to console
   */
  printDebugInfo() {
    console.log('[AudioController] Debug Info:', this.getDebugInfo());
  }
}

// Singleton instance
export const audioController = new UnifiedAudioController();

// Expose to window for debugging
if (typeof window !== 'undefined') {
  (window as any).AudioController = audioController;
}
