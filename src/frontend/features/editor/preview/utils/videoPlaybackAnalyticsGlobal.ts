/**
 * Video Playback Diagnostic Utility - GLOBALLY EXPOSED VERSION
 *
 * This module provides comprehensive logging and debugging tools for tracking
 * black frame flicker issues at segment and clip boundaries.
 *
 * USAGE IN BROWSER CONSOLE:
 * -------------------------
 * VideoPlaybackDiagnostics.enable()     - Start logging
 * VideoPlaybackDiagnostics.disable()    - Stop logging
 * VideoPlaybackDiagnostics.logState()   - Print current state
 * VideoPlaybackDiagnostics.printSummary() - Print analysis summary
 * VideoPlaybackDiagnostics.clear()      - Clear all logs
 * VideoPlaybackDiagnostics.exportLogs() - Export logs as JSON
 *
 * This module is automatically attached to window in ALL environments
 * to ensure it's available for debugging.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SegmentTransitionEvent {
  timestamp: number;
  fromTrackId: string | undefined;
  toTrackId: string;
  fromSourceUrl: string | undefined;
  toSourceUrl: string;
  isSameSource: boolean;
  isPlaying: boolean;
  videoCurrentTime: number;
  expectedTime: number;
  currentFrame: number;
  videoReadyState: number;
  transitionType: 'same-source' | 'cross-clip' | 'seek';
}

export interface VideoElementEvent {
  timestamp: number;
  event:
    | 'mount'
    | 'unmount'
    | 'src_change'
    | 'loadedmetadata'
    | 'canplay'
    | 'canplaythrough'
    | 'error'
    | 'seeking'
    | 'seeked'
    | 'playing'
    | 'pause'
    | 'waiting'
    | 'stalled';
  trackId: string | undefined;
  sourceUrl: string | undefined;
  videoCurrentTime: number;
  videoReadyState: number;
  videoSlot?: 'A' | 'B' | 'single';
  additionalInfo?: Record<string, any>;
}

export interface FrameRenderEvent {
  timestamp: number;
  frame: number;
  expectedFrame: number;
  videoMediaTime: number;
  videoCurrentTime: number;
  isBlackFrame: boolean;
  avgBrightness?: number;
  readyState: number;
}

export interface BufferStateEvent {
  timestamp: number;
  activeSlot: 'A' | 'B';
  activeSource: string | null;
  activeReadyState: number;
  preloadSource: string | null;
  preloadReadyState: number;
  currentFrame: number;
  framesUntilClipEnd: number;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentFrame: number;
  activeTrackId: string | undefined;
  activeSourceUrl: string | undefined;
  videoReadyState: number;
  videoCurrentTime: number;
  videoPaused: boolean;
  bufferStatus?: {
    activeSlot: 'A' | 'B';
    preloadReady: boolean;
  };
}

// =============================================================================
// DIAGNOSTICS CLASS
// =============================================================================

class VideoPlaybackDiagnosticsClass {
  private _enabled = false;
  private segmentTransitions: SegmentTransitionEvent[] = [];
  private videoElementEvents: VideoElementEvent[] = [];
  private frameRenderEvents: FrameRenderEvent[] = [];
  private bufferStateEvents: BufferStateEvent[] = [];
  private maxEvents = 1000;
  private currentState: PlaybackState | null = null;
  private stateUpdateCallbacks: Set<(state: PlaybackState) => void> = new Set();

  constructor() {
    // Log initialization
    console.log(
      '%c[VideoPlaybackDiagnostics] Initialized - call VideoPlaybackDiagnostics.enable() to start logging',
      'color: #888; font-style: italic',
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Enable diagnostic logging
   */
  enable(): void {
    this._enabled = true;
    console.log(
      '%c[VideoPlaybackDiagnostics] ✅ ENABLED - logging video playback events',
      'color: green; font-weight: bold; font-size: 14px',
    );
    console.log('Available commands:');
    console.log('  .disable()      - Stop logging');
    console.log('  .logState()     - Print current playback state');
    console.log('  .printSummary() - Print analysis summary');
    console.log('  .clear()        - Clear all logs');
    console.log('  .exportLogs()   - Export logs as JSON string');
  }

  /**
   * Disable diagnostic logging
   */
  disable(): void {
    this._enabled = false;
    console.log(
      '%c[VideoPlaybackDiagnostics] ⏹ DISABLED',
      'color: orange; font-weight: bold',
    );
  }

  /**
   * Check if diagnostics are enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Log current playback state
   */
  logState(): void {
    if (!this.currentState) {
      console.log(
        '%c[VideoPlaybackDiagnostics] No state available yet',
        'color: orange',
      );
      return;
    }

    console.log(
      '%c[VideoPlaybackDiagnostics] Current State:',
      'color: blue; font-weight: bold',
    );
    console.table(this.currentState);
  }

  /**
   * Update current state (called from React components)
   */
  updateState(state: Partial<PlaybackState>): void {
    this.currentState = {
      ...this.currentState,
      ...state,
    } as PlaybackState;

    // Notify callbacks
    if (this._enabled) {
      this.stateUpdateCallbacks.forEach((cb) => {
        try {
          cb(this.currentState!);
        } catch (e) {
          // Ignore callback errors
        }
      });
    }
  }

  /**
   * Subscribe to state updates
   */
  onStateUpdate(callback: (state: PlaybackState) => void): () => void {
    this.stateUpdateCallbacks.add(callback);
    return () => {
      this.stateUpdateCallbacks.delete(callback);
    };
  }

  // ==========================================================================
  // EVENT LOGGING
  // ==========================================================================

  /**
   * Log a segment/clip transition
   */
  logSegmentTransition(event: Omit<SegmentTransitionEvent, 'timestamp'>): void {
    const fullEvent: SegmentTransitionEvent = {
      ...event,
      timestamp: performance.now(),
    };

    this.segmentTransitions.push(fullEvent);
    if (this.segmentTransitions.length > this.maxEvents) {
      this.segmentTransitions.shift();
    }

    if (!this._enabled) return;

    const colorMap: Record<string, string> = {
      'same-source': 'color: green; font-weight: bold',
      'cross-clip': 'color: orange; font-weight: bold',
      seek: 'color: blue',
    };

    console.log(
      `%c[Transition:${event.transitionType}] ${event.fromTrackId?.substring(0, 8) || 'none'} → ${event.toTrackId.substring(0, 8)}`,
      colorMap[event.transitionType] || 'color: gray',
      {
        isSameSource: event.isSameSource,
        isPlaying: event.isPlaying,
        videoTime: event.videoCurrentTime.toFixed(3),
        expectedTime: event.expectedTime.toFixed(3),
        diff: Math.abs(event.videoCurrentTime - event.expectedTime).toFixed(3),
        readyState: event.videoReadyState,
        frame: event.currentFrame,
      },
    );
  }

  /**
   * Log a video element event
   */
  logVideoElementEvent(event: Omit<VideoElementEvent, 'timestamp'>): void {
    const fullEvent: VideoElementEvent = {
      ...event,
      timestamp: performance.now(),
    };

    this.videoElementEvents.push(fullEvent);
    if (this.videoElementEvents.length > this.maxEvents) {
      this.videoElementEvents.shift();
    }

    if (!this._enabled) return;

    const eventColors: Record<string, string> = {
      mount: 'color: blue; font-weight: bold',
      unmount: 'color: red; font-weight: bold',
      src_change: 'color: purple; font-weight: bold',
      loadedmetadata: 'color: green',
      canplay: 'color: green',
      canplaythrough: 'color: green; font-weight: bold',
      error: 'color: red; font-weight: bold',
      seeking: 'color: gray',
      seeked: 'color: gray',
      playing: 'color: green',
      pause: 'color: orange',
      waiting: 'color: yellow; font-weight: bold',
      stalled: 'color: red',
    };

    const slotLabel = event.videoSlot ? `[${event.videoSlot}]` : '';

    console.log(
      `%c[Video${slotLabel}:${event.event}]`,
      eventColors[event.event] || 'color: black',
      {
        trackId: event.trackId?.substring(0, 8),
        source:
          event.sourceUrl?.substring(0, 40) +
          (event.sourceUrl && event.sourceUrl.length > 40 ? '...' : ''),
        time: event.videoCurrentTime?.toFixed(3),
        ready: event.videoReadyState,
        ...event.additionalInfo,
      },
    );
  }

  /**
   * Log a frame render event
   */
  logFrameRender(event: Omit<FrameRenderEvent, 'timestamp'>): void {
    const fullEvent: FrameRenderEvent = {
      ...event,
      timestamp: performance.now(),
    };

    this.frameRenderEvents.push(fullEvent);
    if (this.frameRenderEvents.length > this.maxEvents) {
      this.frameRenderEvents.shift();
    }

    if (!this._enabled) return;

    // Only log significant events
    const frameDiff = Math.abs(event.frame - event.expectedFrame);
    if (event.isBlackFrame || frameDiff > 2) {
      console.log(
        `%c[Frame] ${event.isBlackFrame ? '⬛ BLACK FRAME' : `⚠️ Drop (${frameDiff} frames)`}`,
        event.isBlackFrame ? 'color: red; font-weight: bold' : 'color: orange',
        {
          frame: event.frame,
          expected: event.expectedFrame,
          mediaTime: event.videoMediaTime.toFixed(3),
          currentTime: event.videoCurrentTime.toFixed(3),
          brightness: event.avgBrightness?.toFixed(1),
          readyState: event.readyState,
        },
      );
    }
  }

  /**
   * Log buffer state (for dual-buffer system)
   */
  logBufferState(event: Omit<BufferStateEvent, 'timestamp'>): void {
    const fullEvent: BufferStateEvent = {
      ...event,
      timestamp: performance.now(),
    };

    this.bufferStateEvents.push(fullEvent);
    if (this.bufferStateEvents.length > this.maxEvents) {
      this.bufferStateEvents.shift();
    }

    if (!this._enabled) return;

    // Only log when approaching clip end or on significant changes
    if (event.framesUntilClipEnd <= 60) {
      console.log(
        `%c[Buffer] ${event.framesUntilClipEnd} frames until clip end`,
        'color: purple',
        {
          activeSlot: event.activeSlot,
          activeReady: event.activeReadyState,
          preloadReady: event.preloadReadyState,
          preloadSource: event.preloadSource?.substring(0, 30),
        },
      );
    }
  }

  // ==========================================================================
  // ANALYSIS
  // ==========================================================================

  /**
   * Get recent segment transitions
   */
  getRecentSegmentTransitions(count = 10): SegmentTransitionEvent[] {
    return this.segmentTransitions.slice(-count);
  }

  /**
   * Get recent video element events
   */
  getRecentVideoElementEvents(count = 20): VideoElementEvent[] {
    return this.videoElementEvents.slice(-count);
  }

  /**
   * Get recent frame render events
   */
  getRecentFrameRenderEvents(count = 100): FrameRenderEvent[] {
    return this.frameRenderEvents.slice(-count);
  }

  /**
   * Analyze black frames
   */
  analyzeBlackFrames(): {
    totalBlackFrames: number;
    blackFramesAtTransitions: number;
    blackFramesAtCrossClip: number;
    avgTimeSinceTransition: number;
  } {
    const blackFrames = this.frameRenderEvents.filter((e) => e.isBlackFrame);

    let blackFramesAtTransitions = 0;
    let blackFramesAtCrossClip = 0;
    let totalTimeSinceTransition = 0;

    blackFrames.forEach((bf) => {
      // Find transitions that happened shortly before this black frame
      const recentTransitions = this.segmentTransitions.filter(
        (st) =>
          bf.timestamp - st.timestamp < 500 && bf.timestamp - st.timestamp > 0,
      );

      if (recentTransitions.length > 0) {
        blackFramesAtTransitions++;
        totalTimeSinceTransition +=
          bf.timestamp -
          recentTransitions[recentTransitions.length - 1].timestamp;

        // Check if it was a cross-clip transition
        const lastTransition = recentTransitions[recentTransitions.length - 1];
        if (lastTransition.transitionType === 'cross-clip') {
          blackFramesAtCrossClip++;
        }
      }
    });

    return {
      totalBlackFrames: blackFrames.length,
      blackFramesAtTransitions,
      blackFramesAtCrossClip,
      avgTimeSinceTransition:
        blackFramesAtTransitions > 0
          ? totalTimeSinceTransition / blackFramesAtTransitions
          : 0,
    };
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.segmentTransitions = [];
    this.videoElementEvents = [];
    this.frameRenderEvents = [];
    this.bufferStateEvents = [];
    console.log(
      '%c[VideoPlaybackDiagnostics] 🗑 Cleared all logs',
      'color: gray',
    );
  }

  /**
   * Export logs as JSON string
   */
  exportLogs(): string {
    return JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        segmentTransitions: this.segmentTransitions,
        videoElementEvents: this.videoElementEvents,
        frameRenderEvents: this.frameRenderEvents,
        bufferStateEvents: this.bufferStateEvents,
        analysis: this.analyzeBlackFrames(),
      },
      null,
      2,
    );
  }

  /**
   * Print analysis summary
   */
  printSummary(): void {
    const analysis = this.analyzeBlackFrames();

    console.log('%c' + '='.repeat(60), 'color: blue');
    console.log(
      '%cVIDEO PLAYBACK DIAGNOSTICS SUMMARY',
      'color: blue; font-weight: bold; font-size: 14px',
    );
    console.log('%c' + '='.repeat(60), 'color: blue');

    console.log('\n%cSegment Transitions:', 'font-weight: bold');
    console.log(`  Total: ${this.segmentTransitions.length}`);
    console.log(
      `  Same-source: ${this.segmentTransitions.filter((e) => e.transitionType === 'same-source').length}`,
    );
    console.log(
      `  Cross-clip: ${this.segmentTransitions.filter((e) => e.transitionType === 'cross-clip').length}`,
    );
    console.log(
      `  Seeks: ${this.segmentTransitions.filter((e) => e.transitionType === 'seek').length}`,
    );

    console.log('\n%cVideo Element Events:', 'font-weight: bold');
    console.log(`  Total: ${this.videoElementEvents.length}`);
    console.log(
      `  Mounts: ${this.videoElementEvents.filter((e) => e.event === 'mount').length}`,
    );
    console.log(
      `  Unmounts: ${this.videoElementEvents.filter((e) => e.event === 'unmount').length}`,
    );
    console.log(
      `  Source changes: ${this.videoElementEvents.filter((e) => e.event === 'src_change').length}`,
    );
    console.log(
      `  Metadata loads: ${this.videoElementEvents.filter((e) => e.event === 'loadedmetadata').length}`,
    );
    console.log(
      `  Waiting events: ${this.videoElementEvents.filter((e) => e.event === 'waiting').length}`,
    );
    console.log(
      `  Stalled events: ${this.videoElementEvents.filter((e) => e.event === 'stalled').length}`,
    );

    console.log('\n%cBlack Frame Analysis:', 'font-weight: bold');
    console.log(`  Total black frames: ${analysis.totalBlackFrames}`);
    console.log(`  At transitions: ${analysis.blackFramesAtTransitions}`);
    console.log(`  At cross-clip: ${analysis.blackFramesAtCrossClip}`);
    console.log(
      `  Avg time since transition: ${analysis.avgTimeSinceTransition.toFixed(1)}ms`,
    );

    console.log('\n%c' + '='.repeat(60), 'color: blue');

    // Warnings
    if (analysis.blackFramesAtCrossClip > 0) {
      console.log(
        '%c⚠️ Cross-clip black frames detected! Consider enabling dual-buffer preloading.',
        'color: orange; font-weight: bold',
      );
    }

    if (
      this.videoElementEvents.filter((e) => e.event === 'unmount').length > 5
    ) {
      console.log(
        '%c⚠️ Multiple video unmounts detected! Check for key changes causing remounts.',
        'color: orange; font-weight: bold',
      );
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE & GLOBAL EXPOSURE
// =============================================================================

// Create singleton instance
const VideoPlaybackDiagnostics = new VideoPlaybackDiagnosticsClass();

// ALWAYS expose to window (not just in development)
// This ensures it's available for debugging in any environment
if (typeof window !== 'undefined') {
  // Use direct assignment first
  (window as any).VideoPlaybackDiagnostics = VideoPlaybackDiagnostics;

  // Also expose as VPD shorthand
  (window as any).VPD = VideoPlaybackDiagnostics;

  console.log(
    '%c[VideoPlaybackDiagnostics] Available globally as window.VideoPlaybackDiagnostics or window.VPD',
    'color: #888; font-style: italic',
  );
}

// Export for module usage
export { VideoPlaybackDiagnostics };
export default VideoPlaybackDiagnostics;
