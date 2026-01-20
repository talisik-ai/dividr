import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import {
  createVirtualTimeline,
  VirtualTimelineManager,
} from '../services/VirtualTimelineManager';

// =============================================================================
// TYPES
// =============================================================================

export interface DualBufferVideoRef {
  getActiveVideo: () => HTMLVideoElement | null;
  getPreloadVideo: () => HTMLVideoElement | null;
  swapVideos: () => void;
  preloadSource: (url: string, startTime?: number) => Promise<void>;
  isSourceReady: (url: string) => boolean;
  getBufferStatus: () => BufferStatus;
  muteAll: () => void;
  getAudioState: () => AudioState;
  /** Force seek to a specific time */
  seekTo: (time: number) => void;
  /** Get the virtual timeline manager */
  getVirtualTimeline: () => VirtualTimelineManager | null;
}

export interface BufferStatus {
  activeSlot: 'A' | 'B';
  activeSource: string | null;
  activeReadyState: number;
  preloadSource: string | null;
  preloadReadyState: number;
  isPreloadReady: boolean;
}

export interface AudioState {
  activeSlot: 'A' | 'B';
  videoAMuted: boolean;
  videoAVolume: number;
  videoBMuted: boolean;
  videoBVolume: number;
}

export interface DualBufferVideoProps {
  activeTrack: VideoTrack | undefined;
  allTracks: VideoTrack[];
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playbackRate: number;
  onLoadedMetadata?: () => void;
  onActiveVideoChange?: (video: HTMLVideoElement) => void;
  /** Callback when frame updates during playback */
  onFrameUpdate?: (frame: number) => void;
  width: number;
  height: number;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
  /**
   * Whether this component should control audio output.
   * - true: Active video element will have audio (when not muted)
   * - false: ALL video elements are muted (audio comes from elsewhere)
   */
  handleAudio?: boolean;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Increased thresholds for better preloading
const PRELOAD_THRESHOLD_MS = 500; // 500ms before segment end
const PRELOAD_LOOKAHEAD_MS = 2000; // Look 2s ahead for preloading
const MIN_READY_STATE = 3; // HAVE_FUTURE_DATA
const SEEK_TOLERANCE = 0.033; // ~1 frame at 30fps

// Frame hold configuration - CRITICAL for preventing black frames
const FRAME_HOLD_TIMEOUT_MS = 2000; // Max time to wait for new frame before giving up
const CROSS_SOURCE_SCRUB_DEBOUNCE_MS = 50; // Debounce rapid cross-source scrubs

const DEBUG_DUAL_BUFFER = false; // Disabled after Test Case 4 & 5
const DEBUG_TRANSITIONS = false; // Disabled after Test Case 4 & 5
const DEBUG_SCRUBBING = false; // Disabled - enable for debugging scrubbing issues
const DEBUG_FRAME_HOLD = false; // Enable for debugging frame hold mechanism

function logDualBuffer(message: string, data?: unknown) {
  if (DEBUG_DUAL_BUFFER) {
    console.log(`[DualBuffer] ${message}`, data || '');
  }
}

function logTransition(message: string, data?: unknown) {
  if (DEBUG_TRANSITIONS) {
    console.log(`[Transition] ${message}`, data || '');
  }
}

function logScrubbing(message: string, data?: unknown) {
  if (DEBUG_SCRUBBING) {
    console.log(`[Scrubbing] ${message}`, data || '');
  }
}

function logFrameHold(message: string, data?: unknown) {
  if (DEBUG_FRAME_HOLD) {
    console.log(`[FrameHold] ${message}`, data || '');
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Normalize source URL for comparison.
 * Handles different URL formats and extracts the core path.
 */
function normalizeSourceUrl(url: string | undefined | null): string {
  if (!url) return '';
  try {
    // Handle blob URLs
    if (url.startsWith('blob:')) return url;
    // Parse and extract pathname for comparison
    const parsed = new URL(url, window.location.origin);
    // Decode the pathname to handle encoded characters
    return decodeURIComponent(parsed.pathname);
  } catch {
    return url;
  }
}

function getVideoSource(track: VideoTrack | undefined): string | undefined {
  if (!track) return undefined;
  if (track.previewUrl?.trim()) return track.previewUrl;
  if (track.source?.trim()) {
    const src = track.source.trim();
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    return `http://localhost:3001/${encodeURIComponent(src)}`;
  }
  return undefined;
}

function findNextVideoTrack(
  allTracks: VideoTrack[],
  currentFrame: number,
  currentTrackId: string | undefined,
): VideoTrack | undefined {
  const videoTracks = allTracks
    .filter((t) => t.type === 'video' && t.visible && t.previewUrl)
    .sort((a, b) => a.startFrame - b.startFrame);

  const currentTrack = videoTracks.find((t) => t.id === currentTrackId);
  if (!currentTrack) {
    return videoTracks.find((t) => t.endFrame > currentFrame);
  }

  return videoTracks.find(
    (t) => t.id !== currentTrackId && t.startFrame >= currentTrack.endFrame - 1,
  );
}

/**
 * Calculate the video source time for a given timeline frame
 */
function calculateVideoTime(
  track: VideoTrack,
  frame: number,
  fps: number,
): number {
  const relativeFrame = Math.max(0, frame - track.startFrame);
  const trackTime = relativeFrame / fps;
  return (track.sourceStartTime || 0) + trackTime;
}

/**
 * Wait for a video element to reach a specific ready state
 */
function waitForReadyState(
  video: HTMLVideoElement,
  minState: number = MIN_READY_STATE,
): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= minState) {
      resolve();
      return;
    }

    const check = () => {
      if (video.readyState >= minState) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    };

    requestAnimationFrame(check);
  });
}

/**
 * Seek to a specific time and wait for seek completion.
 * Uses 'seeked' event for reliable seeking on both playing and paused videos.
 */
async function seekWithVerification(
  video: HTMLVideoElement,
  targetTime: number,
  tolerance: number = SEEK_TOLERANCE,
): Promise<boolean> {
  return new Promise((resolve) => {
    // If already at target, resolve immediately
    if (Math.abs(video.currentTime - targetTime) <= tolerance) {
      resolve(true);
      return;
    }

    let resolved = false;

    const onSeeked = () => {
      if (resolved) return;
      video.removeEventListener('seeked', onSeeked);
      resolved = true;

      // Verify we're at the right time
      const diff = Math.abs(video.currentTime - targetTime);
      if (diff <= tolerance) {
        resolve(true);
      } else {
        logScrubbing('Seek verification: not at target', {
          target: targetTime.toFixed(3),
          actual: video.currentTime.toFixed(3),
          diff: diff.toFixed(3),
        });
        resolve(false);
      }
    };

    // Timeout protection
    const timeout = setTimeout(() => {
      if (resolved) return;
      video.removeEventListener('seeked', onSeeked);
      resolved = true;
      logScrubbing('Seek verification timeout', {
        target: targetTime.toFixed(3),
        actual: video.currentTime.toFixed(3),
      });
      resolve(false);
    }, 500);

    video.addEventListener('seeked', onSeeked);
    video.currentTime = targetTime;

    // If video is already at target after setting, resolve
    requestAnimationFrame(() => {
      if (resolved) return;
      if (Math.abs(video.currentTime - targetTime) <= tolerance) {
        clearTimeout(timeout);
        video.removeEventListener('seeked', onSeeked);
        resolved = true;
        resolve(true);
      }
    });
  });
}

// =============================================================================
// COMPONENT
// =============================================================================

export const DualBufferVideo = forwardRef<
  DualBufferVideoRef,
  DualBufferVideoProps
>(
  (
    {
      activeTrack,
      allTracks,
      currentFrame,
      fps,
      isPlaying,
      isMuted,
      volume,
      playbackRate,
      onLoadedMetadata,
      onActiveVideoChange,
      onFrameUpdate,
      width,
      height,
      className,
      objectFit = 'contain',
      handleAudio = true,
    },
    ref,
  ) => {
    // =========================================================================
    // STABLE REFS
    // =========================================================================
    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);

    // Track which slot is active
    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');

    // Source tracking
    const sourceARef = useRef<string | null>(null);
    const sourceBRef = useRef<string | null>(null);

    // Ready state tracking
    const [readyA, setReadyA] = useState(false);
    const [readyB, setReadyB] = useState(false);

    // Prevent duplicate operations
    const swapLockRef = useRef(false);
    const lastPreloadUrlRef = useRef<string | null>(null);
    const prevSourceRef = useRef<string | undefined>(undefined);
    const prevTrackIdRef = useRef<string | undefined>(undefined);

    // SEEK TRACKING: Prevent feedback loops during seek
    const seekInProgressRef = useRef(false);
    const lastSeekFrameRef = useRef<number>(-1);

    // Track if we're currently updating frame from video (to prevent circular updates)
    const frameUpdateInProgressRef = useRef(false);

    // Track stabilization: prevent rapid oscillation between tracks
    const lastStableTrackIdRef = useRef<string | undefined>(undefined);
    const trackChangeTimeRef = useRef<number>(0);
    const TRACK_STABILIZATION_MS = 100; // Ignore track changes within 100ms

    // CASE 4 cancellation: track pending swap operations
    const pendingSwapIdRef = useRef<number>(0);
    const case4PollActiveRef = useRef<boolean>(false);

    // Virtual Timeline for segment-aware transitions
    const virtualTimelineRef = useRef<VirtualTimelineManager | null>(null);

    // =========================================================================
    // CAPCUT-STYLE FRAME HOLD MECHANISM - CRITICAL for preventing black frames
    // =========================================================================
    //
    // KEY INSIGHT: We separate LOGICAL state from VISUAL state.
    // - Logical slot (activeSlot): Which video SHOULD be active
    // - Visual slot (visualSlot): Which video is ACTUALLY shown
    //
    // The visual slot only updates when a decoded frame is confirmed ready.
    // This ensures we NEVER show black - we hold the last valid frame.
    //
    // This mimics CapCut's behavior: mask latency, don't eliminate it.
    // =========================================================================

    // Visual slot - only changes when frame is CONFIRMED ready
    // This is what actually controls opacity in the render
    const [visualSlot, setVisualSlot] = useState<'A' | 'B'>('A');

    // Track pending visual commit - waiting for frame decode
    const pendingVisualCommitRef = useRef<{
      targetSlot: 'A' | 'B';
      source: string;
      startTime: number;
    } | null>(null);

    // Frame ready confirmation tracking
    const frameConfirmedReadyRef = useRef<{ A: boolean; B: boolean }>({
      A: false,
      B: false,
    });

    // Cross-source scrub state
    const crossSourceScrubDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const pendingScrubTargetRef = useRef<{
      source: string;
      time: number;
      frame: number;
    } | null>(null);

    // Deferred source commit - source is "pending" until frame decoded
    const deferredSourceRef = useRef<{
      slot: 'A' | 'B';
      source: string;
      time: number;
      committed: boolean;
    } | null>(null);

    // Current source URL
    const currentSourceUrl = useMemo(
      () => getVideoSource(activeTrack),
      [activeTrack?.previewUrl, activeTrack?.source],
    );

    // =========================================================================
    // CLEANUP EFFECT - Clear pending operations on unmount
    // =========================================================================
    useEffect(() => {
      return () => {
        // Clear any pending cross-source scrub debounce
        if (crossSourceScrubDebounceRef.current) {
          clearTimeout(crossSourceScrubDebounceRef.current);
          crossSourceScrubDebounceRef.current = null;
        }
        // Reset frame hold state
        pendingVisualCommitRef.current = null;
        pendingScrubTargetRef.current = null;
        deferredSourceRef.current = null;
      };
    }, []);

    // =========================================================================
    // VIRTUAL TIMELINE MANAGEMENT
    // =========================================================================

    // Update virtual timeline when tracks change
    useEffect(() => {
      virtualTimelineRef.current = createVirtualTimeline(allTracks, fps);
      logDualBuffer('Virtual timeline updated', {
        stats: virtualTimelineRef.current.getStats(),
      });
    }, [allTracks, fps]);

    // Calculate preload thresholds in frames
    const preloadThresholdFrames = useMemo(() => {
      const adjustedThreshold = PRELOAD_THRESHOLD_MS * playbackRate;
      return Math.ceil((adjustedThreshold / 1000) * fps);
    }, [fps, playbackRate]);

    const preloadLookaheadFrames = useMemo(() => {
      const adjustedLookahead = PRELOAD_LOOKAHEAD_MS * playbackRate;
      return Math.ceil((adjustedLookahead / 1000) * fps);
    }, [fps, playbackRate]);

    // =========================================================================
    // AUDIO ENFORCEMENT
    // =========================================================================
    const enforceAudioState = useCallback(() => {
      const videoA = videoARef.current;
      const videoB = videoBRef.current;

      // CRITICAL: If handleAudio is false, BOTH videos must be muted
      if (!handleAudio) {
        if (videoA) {
          videoA.muted = true;
          videoA.volume = 0;
        }
        if (videoB) {
          videoB.muted = true;
          videoB.volume = 0;
        }
        return;
      }

      // Only active slot gets audio
      const preloadVideo = activeSlot === 'A' ? videoB : videoA;
      const activeVideo = activeSlot === 'A' ? videoA : videoB;

      // Preload is ALWAYS muted (regardless of handleAudio)
      if (preloadVideo) {
        preloadVideo.muted = true;
        preloadVideo.volume = 0;
      }

      // Active video gets audio only if handleAudio is true
      if (activeVideo) {
        activeVideo.muted = isMuted;
        activeVideo.volume = isMuted ? 0 : Math.min(volume, 1);
      }
    }, [activeSlot, handleAudio, isMuted, volume]);

    // =========================================================================
    // ACCESSORS
    // =========================================================================
    const getActiveVideo = useCallback(
      () => (activeSlot === 'A' ? videoARef.current : videoBRef.current),
      [activeSlot],
    );

    const getPreloadVideo = useCallback(
      () => (activeSlot === 'A' ? videoBRef.current : videoARef.current),
      [activeSlot],
    );

    const getActiveSource = useCallback(
      () => (activeSlot === 'A' ? sourceARef.current : sourceBRef.current),
      [activeSlot],
    );

    const getPreloadSource = useCallback(
      () => (activeSlot === 'A' ? sourceBRef.current : sourceARef.current),
      [activeSlot],
    );

    const isPreloadReady = useCallback(
      () => (activeSlot === 'A' ? readyB : readyA),
      [activeSlot, readyA, readyB],
    );

    const getVirtualTimeline = useCallback(
      () => virtualTimelineRef.current,
      [],
    );

    // =========================================================================
    // SEEK TO - Direct seek method with frame-accurate verification
    // =========================================================================
    const seekTo = useCallback(
      async (time: number) => {
        const video = getActiveVideo();
        if (video && video.readyState >= 2) {
          logScrubbing('seekTo called', {
            time: time.toFixed(3),
            currentTime: video.currentTime.toFixed(3),
          });
          seekInProgressRef.current = true;
          await seekWithVerification(video, time);
          seekInProgressRef.current = false;
          logScrubbing('seekTo complete', {
            actualTime: video.currentTime.toFixed(3),
          });
        }
      },
      [getActiveVideo],
    );

    // =========================================================================
    // MUTE ALL
    // =========================================================================
    const muteAll = useCallback(() => {
      if (videoARef.current) {
        videoARef.current.muted = true;
        videoARef.current.volume = 0;
      }
      if (videoBRef.current) {
        videoBRef.current.muted = true;
        videoBRef.current.volume = 0;
      }
    }, []);

    // =========================================================================
    // GET AUDIO STATE
    // =========================================================================
    const getAudioState = useCallback((): AudioState => {
      return {
        activeSlot,
        videoAMuted: videoARef.current?.muted ?? true,
        videoAVolume: videoARef.current?.volume ?? 0,
        videoBMuted: videoBRef.current?.muted ?? true,
        videoBVolume: videoBRef.current?.volume ?? 0,
      };
    }, [activeSlot]);

    // =========================================================================
    // GET BUFFER STATUS
    // =========================================================================
    const getBufferStatus = useCallback((): BufferStatus => {
      const active = getActiveVideo();
      const preload = getPreloadVideo();
      return {
        activeSlot,
        activeSource: getActiveSource(),
        activeReadyState: active?.readyState || 0,
        preloadSource: getPreloadSource(),
        preloadReadyState: preload?.readyState || 0,
        isPreloadReady: isPreloadReady(),
      };
    }, [
      activeSlot,
      getActiveVideo,
      getPreloadVideo,
      getActiveSource,
      getPreloadSource,
      isPreloadReady,
    ]);

    // =========================================================================
    // SWAP VIDEOS WITH FRAME-ACCURATE TIMING
    // CRITICAL: Never swap until new frame is FULLY decoded and ready
    // This is the core mechanism preventing black frames during transitions
    // =========================================================================
    const swapVideos = useCallback(async () => {
      if (swapLockRef.current) {
        logTransition('SWAP: Blocked by lock!', { activeSlot });
        return;
      }
      swapLockRef.current = true;

      const oldActive = getActiveVideo();
      const newActive = getPreloadVideo();

      logTransition('SWAP: Starting', {
        from: activeSlot,
        to: activeSlot === 'A' ? 'B' : 'A',
        oldActiveSrc: oldActive?.src?.substring(0, 50),
        newActiveSrc: newActive?.src?.substring(0, 50),
        newActiveReadyState: newActive?.readyState,
      });

      // CRITICAL FRAME HOLD: Keep showing old frame until new one is ready
      // This prevents ANY black frame from appearing
      if (newActive) {
        // First, wait for minimum ready state with timeout
        if (newActive.readyState < MIN_READY_STATE) {
          logTransition('SWAP: Waiting for ready state (frame hold active)', {
            current: newActive.readyState,
            required: MIN_READY_STATE,
          });
          logFrameHold('Activated during swap wait', {});

          const readyWithTimeout = await Promise.race([
            waitForReadyState(newActive, MIN_READY_STATE),
            new Promise<boolean>((resolve) =>
              setTimeout(() => resolve(false), FRAME_HOLD_TIMEOUT_MS),
            ),
          ]);

          if (!readyWithTimeout) {
            logTransition('SWAP: Ready state timeout - proceeding anyway', {
              readyState: newActive.readyState,
            });
          }
        }

        // CRITICAL: Wait for actual frame decode
        // Use double RAF to ensure the GPU has rendered the frame
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              logTransition('SWAP: Frame decoded (double RAF)', {});
              resolve();
            });
          });
        });
      }

      // Frame is ready - NOW we can safely swap
      logFrameHold('Frame confirmed ready - committing swap', {});

      // Now that the new frame is ready, do the swap
      const newSlot = activeSlot === 'A' ? 'B' : 'A';

      // Update logical slot
      setActiveSlot(newSlot);

      // CRITICAL: Commit visual slot - this is what actually changes opacity
      // Only do this AFTER we've confirmed the frame is decoded
      frameConfirmedReadyRef.current[newSlot] = true;
      setVisualSlot(newSlot);

      // Start playing the new video BEFORE stopping the old one
      // This ensures continuous frame display
      if (newActive && isPlaying && newActive.readyState >= MIN_READY_STATE) {
        try {
          await newActive.play();
        } catch {
          // Ignore play errors during swap
        }
      }

      // Now safe to mute and pause old active (after new one is playing)
      if (oldActive) {
        oldActive.muted = true;
        oldActive.volume = 0;
        if (!oldActive.paused) {
          oldActive.pause();
        }
      }

      if (newActive && onActiveVideoChange) {
        onActiveVideoChange(newActive);
      }

      // Clear pending states
      pendingVisualCommitRef.current = null;
      pendingScrubTargetRef.current = null;
      deferredSourceRef.current = null;

      logTransition('SWAP: Complete', {
        newActiveSlot: newSlot,
        visualSlot: newSlot,
        isPlaying,
      });

      requestAnimationFrame(() => {
        swapLockRef.current = false;
        enforceAudioState();
      });
    }, [
      activeSlot,
      getActiveVideo,
      getPreloadVideo,
      isPlaying,
      onActiveVideoChange,
      enforceAudioState,
    ]);

    // =========================================================================
    // PRELOAD SOURCE
    // =========================================================================
    const preloadSource = useCallback(
      async (url: string, startTime = 0): Promise<void> => {
        if (lastPreloadUrlRef.current === url) return;

        const preloadVideo = getPreloadVideo();
        if (!preloadVideo) return;

        logDualBuffer('Preloading source', {
          url: url.substring(0, 50),
          startTime,
        });

        lastPreloadUrlRef.current = url;

        if (activeSlot === 'A') {
          sourceBRef.current = url;
          setReadyB(false);
        } else {
          sourceARef.current = url;
          setReadyA(false);
        }

        // Preload is ALWAYS muted
        preloadVideo.muted = true;
        preloadVideo.volume = 0;
        preloadVideo.src = url;
        preloadVideo.currentTime = startTime;
        preloadVideo.preload = 'auto';
        preloadVideo.load();

        // Wait for ready state with frame verification
        await waitForReadyState(preloadVideo, MIN_READY_STATE);

        // Ensure muted state
        preloadVideo.muted = true;
        preloadVideo.volume = 0;

        if (activeSlot === 'A') {
          setReadyB(true);
        } else {
          setReadyA(true);
        }

        logDualBuffer('Preload complete', { url: url.substring(0, 50) });
      },
      [activeSlot, getPreloadVideo],
    );

    // =========================================================================
    // IS SOURCE READY
    // =========================================================================
    const isSourceReady = useCallback(
      (url: string): boolean => {
        if (sourceARef.current === url && readyA) return true;
        if (sourceBRef.current === url && readyB) return true;
        return false;
      },
      [readyA, readyB],
    );

    // =========================================================================
    // EXPOSE REF
    // =========================================================================
    useImperativeHandle(
      ref,
      () => ({
        getActiveVideo,
        getPreloadVideo,
        swapVideos,
        preloadSource,
        isSourceReady,
        getBufferStatus,
        muteAll,
        getAudioState,
        seekTo,
        getVirtualTimeline,
      }),
      [
        getActiveVideo,
        getPreloadVideo,
        swapVideos,
        preloadSource,
        isSourceReady,
        getBufferStatus,
        muteAll,
        getAudioState,
        seekTo,
        getVirtualTimeline,
      ],
    );

    // =========================================================================
    // EFFECT: Handle source/track changes ONLY (not every frame!)
    // This effect should only trigger when the SOURCE or TRACK changes
    // =========================================================================
    useEffect(() => {
      if (!currentSourceUrl || !activeTrack) return;

      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();
      if (!activeVideo) return;

      // Normalize URLs for comparison
      const currentNormalized = normalizeSourceUrl(currentSourceUrl);
      const activeVideoSrc = normalizeSourceUrl(activeVideo.src);
      const preloadVideoSrc = normalizeSourceUrl(preloadVideo?.src);

      // Check if this is actually a new track (not just a frame update)
      const isNewTrack = prevTrackIdRef.current !== activeTrack.id;
      const isNewSource = prevSourceRef.current !== currentSourceUrl;

      logTransition('Track/Source check', {
        prevTrackId: prevTrackIdRef.current,
        currentTrackId: activeTrack.id,
        prevSource: prevSourceRef.current?.substring(0, 50),
        currentSource: currentSourceUrl.substring(0, 50),
        isNewTrack,
        isNewSource,
        activeVideoSrc: activeVideoSrc.substring(0, 50),
        preloadVideoSrc: preloadVideoSrc.substring(0, 50),
        readyA,
        readyB,
        isPreloadReady: isPreloadReady(),
        activeSlot,
      });

      // If neither track nor source changed, do nothing
      if (!isNewTrack && !isNewSource) {
        return;
      }

      // =====================================================================
      // PROFESSIONAL EDITOR BEHAVIOR: Non-destructive editing
      // =====================================================================
      // When a segment is moved (vertically OR horizontally), we should NOT
      // automatically reset playback. This mimics CapCut/Premiere behavior:
      // - Moving clips is a visual/timeline operation
      // - Playback state should be preserved
      // - Only seek when user explicitly plays or scrubs
      //
      // Detection: Same source, track ID changed (segment was edited/moved)
      // Action: Update refs but DON'T seek - let current playback continue
      // =====================================================================
      if (isNewTrack && !isNewSource && currentNormalized === activeVideoSrc) {
        // This is a same-source track change (segment move, cut, trim, etc.)
        // DON'T automatically seek - this would disrupt the editing experience

        // If video is currently playing, let it continue naturally
        // The playback sync effect will handle any necessary seeking
        if (!isPlaying) {
          // If paused, we're in editing mode
          // Don't seek automatically - wait for user to play or scrub
          logDualBuffer('EDIT OPERATION detected (paused) - preserving state', {
            prevTrackId: prevTrackIdRef.current,
            newTrackId: activeTrack.id,
            isPlaying,
          });
          prevTrackIdRef.current = activeTrack.id;
          prevSourceRef.current = currentSourceUrl;
          return;
        }

        // If playing, check if we're within tolerance to continue smoothly
        const targetTime = calculateVideoTime(activeTrack, currentFrame, fps);
        const currentTime = activeVideo.currentTime;
        const diff = Math.abs(currentTime - targetTime);

        // Use a generous tolerance during playback (1 second)
        // This allows smooth playback through edits
        const playbackTolerance = 1.0;

        if (diff <= playbackTolerance) {
          logDualBuffer(
            'EDIT OPERATION detected (playing) - continuing playback',
            {
              prevTrackId: prevTrackIdRef.current,
              newTrackId: activeTrack.id,
              currentTime,
              targetTime,
              diff,
              tolerance: playbackTolerance,
            },
          );
          prevTrackIdRef.current = activeTrack.id;
          prevSourceRef.current = currentSourceUrl;
          return;
        }

        // Large jump while playing - this is a significant timeline change
        // Still update refs but let the normal playback sync handle it
        logDualBuffer(
          'EDIT OPERATION with large jump - will sync on next frame',
          {
            diff,
            tolerance: playbackTolerance,
          },
        );
      }

      // TRACK STABILIZATION: Prevent rapid oscillation between tracks
      // If we're switching tracks too quickly (within TRACK_STABILIZATION_MS),
      // and it's the same source, skip the seek to let video play naturally
      const now = performance.now();
      const timeSinceLastChange = now - trackChangeTimeRef.current;

      if (
        isNewTrack &&
        !isNewSource &&
        timeSinceLastChange < TRACK_STABILIZATION_MS &&
        lastStableTrackIdRef.current !== undefined
      ) {
        logDualBuffer('Track change debounced (too rapid)', {
          timeSinceLastChange,
          threshold: TRACK_STABILIZATION_MS,
        });
        // Update refs but don't seek - let video continue playing
        prevTrackIdRef.current = activeTrack.id;
        prevSourceRef.current = currentSourceUrl;
        return;
      }

      // Update stabilization tracking
      trackChangeTimeRef.current = now;
      lastStableTrackIdRef.current = activeTrack.id;

      // Calculate target time for initial positioning
      // Use the correct source time for the current timeline frame
      const targetTime = calculateVideoTime(activeTrack, currentFrame, fps);

      logDualBuffer('Source/Track change detected - PROCESSING', {
        isNewTrack,
        isNewSource,
        currentNormalized: currentNormalized.substring(0, 50),
        activeVideoSrc: activeVideoSrc.substring(0, 50),
        targetTime,
        currentFrame,
        readyState: activeVideo.readyState,
      });

      // =====================================================================
      // CASE 1: SAME SOURCE, NEW TRACK - Check if video needs repositioning
      // This handles cut segments from the same video file.
      //
      // KEY INSIGHT: For same-source, AVOID seeking as much as possible.
      // Seeking causes buffering/stutter. Instead:
      // 1. If video is playing and within reasonable range, let it play
      // 2. Only seek for large jumps (e.g., truly rearranged segments)
      // 3. When paused (editing), be very tolerant - don't seek on every edit
      // =====================================================================
      if (currentNormalized === activeVideoSrc && activeVideoSrc !== '') {
        const currentTime = activeVideo.currentTime;
        const diff = Math.abs(currentTime - targetTime);
        const isVideoPlaying =
          !activeVideo.paused && activeVideo.readyState >= 2;

        // PROFESSIONAL EDITOR BEHAVIOR:
        // - During playback: moderate tolerance, let video play naturally
        // - When paused (editing): very high tolerance, don't disrupt edits
        // - Only seek on explicit user action (play, scrub)
        const playingTolerance = 1.0; // 1 second during playback
        const pausedTolerance = 10.0; // 10 seconds when paused - almost never auto-seek

        const tolerance = isVideoPlaying ? playingTolerance : pausedTolerance;

        if (diff <= tolerance) {
          // Video is close enough - let it continue naturally
          // The scrubbing effect will handle explicit seeks when user scrubs
          logDualBuffer('SAME SOURCE - within tolerance, preserving state', {
            targetTime,
            currentTime,
            diff,
            tolerance,
            isVideoPlaying,
          });
          prevTrackIdRef.current = activeTrack.id;
          prevSourceRef.current = currentSourceUrl;
          return;
        }

        // Only seek for truly large jumps (more than 10 seconds when paused)
        // This handles cases like jumping to a completely different part of the video
        logDualBuffer('SAME SOURCE - large jump detected, seeking', {
          targetTime,
          currentTime,
          diff,
          currentFrame,
          isVideoPlaying,
        });

        // Set seek in progress to prevent other effects from interfering
        seekInProgressRef.current = true;

        // Perform the seek to the expected time for this frame
        activeVideo.currentTime = targetTime;

        // Wait for the video to be ready after seeking, then confirm
        const confirmSeekComplete = () => {
          // Use requestVideoFrameCallback for frame-accurate confirmation
          if ('requestVideoFrameCallback' in activeVideo) {
            (
              activeVideo as HTMLVideoElement & {
                requestVideoFrameCallback: (cb: () => void) => number;
              }
            ).requestVideoFrameCallback(() => {
              logDualBuffer('Seek complete - frame ready', {
                currentTime: activeVideo.currentTime,
                readyState: activeVideo.readyState,
              });
              seekInProgressRef.current = false;
            });
          } else {
            requestAnimationFrame(() => {
              seekInProgressRef.current = false;
            });
          }
        };

        // If video is already ready enough, confirm immediately
        if (activeVideo.readyState >= MIN_READY_STATE) {
          confirmSeekComplete();
        } else {
          // Wait for video to buffer after seek
          const onCanPlay = () => {
            activeVideo.removeEventListener('canplay', onCanPlay);
            confirmSeekComplete();
          };
          activeVideo.addEventListener('canplay', onCanPlay);
        }

        prevTrackIdRef.current = activeTrack.id;
        prevSourceRef.current = currentSourceUrl;
        return;
      }

      // =====================================================================
      // CASE 2: PRELOAD READY (different source) - Swap immediately
      // The preload effect has already loaded and prepared this video
      // =====================================================================
      const case2SourceMatch = currentNormalized === preloadVideoSrc;
      const case2Ready = isPreloadReady();
      logTransition('CASE 2 check', {
        currentNormalized: currentNormalized.substring(0, 60),
        preloadVideoSrc: preloadVideoSrc.substring(0, 60),
        sourceMatch: case2SourceMatch,
        isReady: case2Ready,
      });

      if (case2SourceMatch && case2Ready) {
        logTransition('CASE 2: Preload ready - swapping immediately', {
          source: currentSourceUrl.substring(0, 50),
          preloadReadyState: preloadVideo?.readyState,
          activeSlot,
        });

        // CRITICAL: Use double RAF for paused preload videos
        // requestVideoFrameCallback only works for playing videos
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            logTransition(
              'CASE 2: Frame ready (double RAF) - executing swap',
              {},
            );
            swapVideos();
          });
        });

        prevTrackIdRef.current = activeTrack.id;
        prevSourceRef.current = currentSourceUrl;
        return;
      }

      // =====================================================================
      // CASE 3: INITIAL LOAD - Load directly on active video
      // =====================================================================
      if (activeVideoSrc === '') {
        logDualBuffer('INITIAL LOAD - loading on active', {
          url: currentSourceUrl.substring(0, 50),
          targetTime,
        });

        if (activeSlot === 'A') {
          sourceARef.current = currentSourceUrl;
          setReadyA(false);
        } else {
          sourceBRef.current = currentSourceUrl;
          setReadyB(false);
        }

        activeVideo.src = currentSourceUrl;
        activeVideo.currentTime = targetTime;
        activeVideo.preload = 'auto';
        activeVideo.load();

        prevTrackIdRef.current = activeTrack.id;
        prevSourceRef.current = currentSourceUrl;
        return;
      }

      // =====================================================================
      // CASE 4: DIFFERENT SOURCE - Use polling to wait for preload ready
      //
      // KEY FIX: We use polling instead of event listeners because:
      // 1. The preloadSource effect may have already loaded this video
      // 2. canplay events may have already fired before we add listeners
      // 3. We need cancellation for rapid track changes
      // =====================================================================
      if (preloadVideo) {
        // Increment swap ID to cancel any pending operations
        const currentSwapId = ++pendingSwapIdRef.current;
        case4PollActiveRef.current = true;

        // Check if preload already has this source loaded
        const preloadVideoNormalized = normalizeSourceUrl(preloadVideo.src);
        const preloadAlreadyHasSource =
          preloadVideoNormalized === currentNormalized;
        const preloadAlreadyReady =
          preloadAlreadyHasSource && preloadVideo.readyState >= MIN_READY_STATE;

        logTransition('CASE 4: Different source detected', {
          url: currentSourceUrl.substring(0, 50),
          targetTime,
          preloadAlreadyHasSource,
          preloadAlreadyReady,
          preloadReadyState: preloadVideo.readyState,
          swapId: currentSwapId,
        });

        // Helper function to execute swap when video is ready
        const executeSwap = () => {
          // Check for cancellation
          if (pendingSwapIdRef.current !== currentSwapId) {
            logTransition('CASE 4: Swap cancelled (stale swapId)', {
              currentSwapId,
              activeSwapId: pendingSwapIdRef.current,
            });
            return;
          }

          // Ensure correct time
          if (Math.abs(preloadVideo.currentTime - targetTime) > 0.1) {
            logTransition('CASE 4: Correcting preload time', {
              current: preloadVideo.currentTime,
              target: targetTime,
            });
            preloadVideo.currentTime = targetTime;
          }

          // Mark as ready
          if (activeSlot === 'A') {
            setReadyB(true);
          } else {
            setReadyA(true);
          }

          case4PollActiveRef.current = false;

          logTransition('CASE 4: Executing swap', {
            swapId: currentSwapId,
            readyState: preloadVideo.readyState,
            time: preloadVideo.currentTime,
          });

          swapVideos();
        };

        // PATH 1: Preload video is already ready - swap immediately after frame decode
        if (preloadAlreadyReady) {
          logTransition('CASE 4: Preload already ready - executing swap', {
            readyState: preloadVideo.readyState,
          });

          // CRITICAL: Use double RAF for paused videos (preload is always paused)
          // requestVideoFrameCallback only works for playing videos
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              executeSwap();
            });
          });

          prevTrackIdRef.current = activeTrack.id;
          prevSourceRef.current = currentSourceUrl;
          return;
        }

        // PATH 2: Need to load or wait for loading - use polling
        if (!preloadAlreadyHasSource) {
          // Set up preload slot tracking
          if (activeSlot === 'A') {
            sourceBRef.current = currentSourceUrl;
            setReadyB(false);
          } else {
            sourceARef.current = currentSourceUrl;
            setReadyA(false);
          }

          // Preload is always muted
          preloadVideo.muted = true;
          preloadVideo.volume = 0;

          // Load the new source
          preloadVideo.src = currentSourceUrl;
          preloadVideo.currentTime = targetTime;
          preloadVideo.preload = 'auto';
          preloadVideo.load();

          logTransition('CASE 4: Loading new source on preload video', {});
        } else {
          logTransition('CASE 4: Source already loading, will poll for ready', {
            readyState: preloadVideo.readyState,
          });
        }

        // Poll for ready state (handles both fresh loads and already-loading videos)
        let pollCount = 0;
        const maxPolls = 300; // ~5 seconds at 60fps

        const pollForReady = () => {
          pollCount++;

          // Check for cancellation
          if (pendingSwapIdRef.current !== currentSwapId) {
            logTransition('CASE 4: Polling cancelled (stale swapId)', {
              pollCount,
              currentSwapId,
              activeSwapId: pendingSwapIdRef.current,
            });
            case4PollActiveRef.current = false;
            return;
          }

          // Check ready state
          if (preloadVideo.readyState >= MIN_READY_STATE) {
            logTransition('CASE 4: Video ready after polling', {
              pollCount,
              readyState: preloadVideo.readyState,
              paused: preloadVideo.paused,
            });

            // CRITICAL FIX: requestVideoFrameCallback only fires for PLAYING videos
            // For paused videos (which preload always is), use double RAF instead
            // This ensures the frame is rendered before we swap
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                logTransition(
                  'CASE 4: Frame ready (double RAF) - executing swap',
                  {},
                );
                executeSwap();
              });
            });
            return;
          }

          // Timeout protection
          if (pollCount >= maxPolls) {
            logTransition('CASE 4: Polling timeout - forcing swap anyway', {
              readyState: preloadVideo.readyState,
            });
            case4PollActiveRef.current = false;
            executeSwap();
            return;
          }

          // Continue polling
          requestAnimationFrame(pollForReady);
        };

        // Start polling
        requestAnimationFrame(pollForReady);
      }

      prevTrackIdRef.current = activeTrack.id;
      prevSourceRef.current = currentSourceUrl;
    }, [
      currentSourceUrl,
      activeTrack?.id, // Only track ID, not the whole object
      activeSlot,
      getActiveVideo,
      getPreloadVideo,
      isPreloadReady,
      swapVideos,
      // NOTE: currentFrame and fps are used inside but NOT in deps
      // We only want this effect to run on track/source changes
      // The current frame value is read when the effect runs
    ]);

    // =========================================================================
    // EFFECT: Segment-aware preloading with lookahead
    // =========================================================================
    useEffect(() => {
      if (!activeTrack || !isPlaying || !virtualTimelineRef.current) return;

      const virtualTimeline = virtualTimelineRef.current;

      // Get upcoming transitions within lookahead window
      const upcomingTransitions = virtualTimeline.getTransitionsWithin(
        currentFrame,
        preloadLookaheadFrames,
      );

      for (const transition of upcomingTransitions) {
        const framesUntilTransition = transition.transitionFrame - currentFrame;

        // Start preloading when within threshold
        if (framesUntilTransition <= preloadThresholdFrames) {
          if (transition.isSameSource) {
            // Same source transitions: DON'T pre-buffer on preload video
            // This causes thrashing with many small segments. Instead, we'll
            // handle same-source transitions by just seeking the active video
            // when the track actually changes - the data is already buffered
            // since it's the same video file.
            logDualBuffer(
              'Same-source transition upcoming (no preload needed)',
              {
                to: transition.enterSegment.trackId,
                targetTime: transition.enterSegment.sourceStartTime,
                framesUntil: framesUntilTransition,
              },
            );
          } else {
            // Different source - preload the next video
            const nextUrl = transition.enterSegment.sourceUrl;
            if (nextUrl && nextUrl !== getPreloadSource()) {
              preloadSource(nextUrl, transition.enterSegment.sourceStartTime);
            }
          }
        }
      }

      // Also check for segments that will start (for cold starts without transitions)
      const upcomingSegments = virtualTimeline.getUpcomingSegments(
        currentFrame,
        preloadLookaheadFrames,
      );

      for (const upcoming of upcomingSegments) {
        if (
          upcoming.framesUntilStart <= preloadThresholdFrames &&
          upcoming.requiresSourceChange
        ) {
          const url = upcoming.segment.sourceUrl;
          if (url && url !== getPreloadSource()) {
            preloadSource(url, upcoming.segment.sourceStartTime);
          }
        }
      }
    }, [
      activeTrack,
      currentFrame,
      isPlaying,
      preloadThresholdFrames,
      preloadLookaheadFrames,
      getPreloadSource,
      preloadSource,
      activeSlot,
      getActiveVideo,
      getPreloadVideo,
    ]);

    // =========================================================================
    // EFFECT: Legacy preload (fallback for simple cases)
    // =========================================================================
    useEffect(() => {
      if (!activeTrack || !isPlaying) return;

      // Skip if virtual timeline is handling preloading
      if (virtualTimelineRef.current) return;

      const framesUntilEnd = activeTrack.endFrame - currentFrame;

      if (framesUntilEnd <= preloadThresholdFrames && framesUntilEnd > 0) {
        const nextTrack = findNextVideoTrack(
          allTracks,
          currentFrame,
          activeTrack.id,
        );

        if (nextTrack) {
          const nextUrl = getVideoSource(nextTrack);
          if (nextUrl && nextUrl !== getPreloadSource()) {
            const startTime = nextTrack.sourceStartTime || 0;
            preloadSource(nextUrl, startTime);
          }
        }
      }
    }, [
      activeTrack,
      allTracks,
      currentFrame,
      isPlaying,
      preloadThresholdFrames,
      getPreloadSource,
      preloadSource,
    ]);

    // =========================================================================
    // EFFECT: Sync playback state (play/pause, audio)
    // =========================================================================
    useEffect(() => {
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

      logDualBuffer('Playback sync effect', {
        isPlaying,
        activeSlot,
        activeVideoSrc: activeVideo?.src?.substring(0, 50),
        activeVideoReadyState: activeVideo?.readyState,
        activeVideoPaused: activeVideo?.paused,
        activeVideoCurrentTime: activeVideo?.currentTime?.toFixed(2),
        handleAudio,
        isMuted,
        volume,
      });

      enforceAudioState();

      // Preload must always be muted and paused
      if (preloadVideo) {
        preloadVideo.muted = true;
        preloadVideo.volume = 0;
        if (!preloadVideo.paused) {
          preloadVideo.pause();
        }
      }

      if (!activeVideo) return;

      try {
        if (isPlaying) {
          if (activeVideo.paused && activeVideo.readyState >= MIN_READY_STATE) {
            // PROFESSIONAL EDITOR BEHAVIOR:
            // When playback starts, ensure we're at the correct position
            // This handles the case where user edited while paused
            if (activeTrack) {
              const targetTime = calculateVideoTime(
                activeTrack,
                currentFrame,
                fps,
              );
              const currentTime = activeVideo.currentTime;
              const diff = Math.abs(currentTime - targetTime);

              // If we're more than 100ms off, seek before playing
              if (diff > 0.1) {
                logDualBuffer('Play start: Syncing to correct position', {
                  currentTime,
                  targetTime,
                  diff,
                });
                activeVideo.currentTime = targetTime;
              }
            }

            logDualBuffer('Starting playback', {
              readyState: activeVideo.readyState,
            });
            activeVideo.play().catch((err) => {
              logDualBuffer('Play error', { error: err.message });
            });
          }
        } else {
          if (!activeVideo.paused) {
            activeVideo.pause();
          }
        }

        activeVideo.playbackRate = Math.max(0.25, Math.min(playbackRate, 4));
      } catch (err) {
        console.warn('[DualBuffer] Playback sync error:', err);
      }
    }, [
      isPlaying,
      isMuted,
      volume,
      playbackRate,
      handleAudio,
      getActiveVideo,
      getPreloadVideo,
      activeSlot,
      enforceAudioState,
      activeTrack,
      currentFrame,
      fps,
    ]);

    // =========================================================================
    // EFFECT: Mute both videos if handleAudio is false
    // =========================================================================
    useEffect(() => {
      if (!handleAudio) {
        const videoA = videoARef.current;
        const videoB = videoBRef.current;

        if (videoA) {
          videoA.muted = true;
          videoA.volume = 0;
        }
        if (videoB) {
          videoB.muted = true;
          videoB.volume = 0;
        }
      }
    }, [handleAudio]);

    // =========================================================================
    // EFFECT: SCRUBBING SYNC - Timeline drives video when paused
    //
    // CRITICAL FIX FOR TC#6 (Cross-Source Scrubbing):
    // When scrubbing to a DIFFERENT source, we must:
    // 1. HOLD the current frame (don't hide/clear it)
    // 2. Pre-decode the target frame on the preload video
    // 3. Only swap AFTER the new frame is decoded
    // 4. Cancel previous scrub operations on new scrub
    //
    // This prevents black frames during cross-source scrubbing.
    // =========================================================================
    useEffect(() => {
      // Only run when NOT playing - during playback, video drives timeline
      if (isPlaying) {
        return;
      }

      const video = getActiveVideo();
      const preloadVideo = getPreloadVideo();
      if (!video || !activeTrack) return;

      // Must be paused
      if (!video.paused) {
        return;
      }

      // Check if we're within the track's frame range
      const isWithinTrackRange =
        currentFrame >= activeTrack.startFrame &&
        currentFrame < activeTrack.endFrame;

      if (!isWithinTrackRange) {
        return;
      }

      // Calculate the target video time for the current frame
      const targetTime = calculateVideoTime(activeTrack, currentFrame, fps);
      const currentVideoTime = video.currentTime;
      const tolerance = 1.5 / fps; // 1.5 frame tolerance to reduce jitter
      const diff = Math.abs(currentVideoTime - targetTime);

      // Check if this is a CROSS-SOURCE scrub
      const activeVideoSrc = normalizeSourceUrl(video.src);
      const targetSource = normalizeSourceUrl(currentSourceUrl);
      const isCrossSourceScrub =
        activeVideoSrc !== '' &&
        targetSource !== '' &&
        activeVideoSrc !== targetSource;

      // =====================================================================
      // CROSS-SOURCE SCRUBBING - CAPCUT-STYLE LATENCY MASKING
      // =====================================================================
      // Strategy:
      // 1. IMMEDIATELY show last known frame (don't change visualSlot)
      // 2. Trigger decode for target frame in background
      // 3. When frame arrives, swap instantly
      // 4. Never block UI waiting for decode
      // =====================================================================
      if (isCrossSourceScrub) {
        logScrubbing('Cross-source scrub detected', {
          from: activeVideoSrc.substring(0, 40),
          to: targetSource.substring(0, 40),
          targetTime,
          currentFrame,
        });

        // Cancel any pending cross-source scrub
        if (crossSourceScrubDebounceRef.current) {
          clearTimeout(crossSourceScrubDebounceRef.current);
        }

        // Store the pending scrub target
        pendingScrubTargetRef.current = {
          source: targetSource,
          time: targetTime,
          frame: currentFrame,
        };

        // CAPCUT-STYLE: Don't change visual slot yet - keep showing last frame
        // The visual slot will only change when the new frame is decoded
        logFrameHold('Cross-source scrub: Holding visual slot', {
          currentVisualSlot: visualSlot,
        });

        // Debounce rapid scrubbing to prevent decode thrashing
        crossSourceScrubDebounceRef.current = setTimeout(() => {
          if (!preloadVideo) return;

          const pending = pendingScrubTargetRef.current;
          if (!pending || pending.source !== targetSource) {
            // Target changed, abort
            return;
          }

          logScrubbing('Executing cross-source scrub (debounced)', {
            source: pending.source.substring(0, 40),
            time: pending.time,
          });

          // Increment swap ID to cancel any other pending operations
          const scrubSwapId = ++pendingSwapIdRef.current;

          // Set up deferred source commit - source is "pending" until frame decoded
          const preloadSlot = activeSlot === 'A' ? 'B' : 'A';
          deferredSourceRef.current = {
            slot: preloadSlot,
            source: pending.source,
            time: pending.time,
            committed: false,
          };

          if (preloadSlot === 'A') {
            sourceARef.current = pending.source;
            setReadyA(false);
            frameConfirmedReadyRef.current.A = false;
          } else {
            sourceBRef.current = pending.source;
            setReadyB(false);
            frameConfirmedReadyRef.current.B = false;
          }

          // Check if preload already has this source
          const preloadSrc = normalizeSourceUrl(preloadVideo.src);
          if (preloadSrc !== pending.source) {
            preloadVideo.muted = true;
            preloadVideo.volume = 0;
            preloadVideo.src = pending.source;
          }
          preloadVideo.currentTime = pending.time;
          preloadVideo.preload = 'auto';

          if (preloadSrc !== pending.source) {
            preloadVideo.load();
          }

          // Poll for ready state, then swap
          const pollForReadyAndSwap = () => {
            // Check for cancellation
            if (pendingSwapIdRef.current !== scrubSwapId) {
              logScrubbing('Cross-source scrub cancelled (stale)', {});
              deferredSourceRef.current = null;
              return;
            }

            if (preloadVideo.readyState >= MIN_READY_STATE) {
              logScrubbing('Cross-source scrub: preload ready, swapping', {
                readyState: preloadVideo.readyState,
              });

              // Mark as ready
              if (preloadSlot === 'A') {
                setReadyA(true);
                frameConfirmedReadyRef.current.A = true;
              } else {
                setReadyB(true);
                frameConfirmedReadyRef.current.B = true;
              }

              // CRITICAL: Wait for frame to be decoded before swap
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  // Double-check we haven't been cancelled
                  if (pendingSwapIdRef.current !== scrubSwapId) {
                    deferredSourceRef.current = null;
                    return;
                  }

                  // Mark deferred source as committed
                  if (deferredSourceRef.current) {
                    deferredSourceRef.current.committed = true;
                  }

                  logFrameHold(
                    'Cross-source scrub: Frame ready, committing visual',
                    {},
                  );

                  // Now safe to swap - frame is decoded
                  // swapVideos will update both activeSlot AND visualSlot
                  swapVideos();
                  pendingScrubTargetRef.current = null;
                  deferredSourceRef.current = null;
                });
              });
            } else {
              // Continue polling
              requestAnimationFrame(pollForReadyAndSwap);
            }
          };

          requestAnimationFrame(pollForReadyAndSwap);
        }, CROSS_SOURCE_SCRUB_DEBOUNCE_MS);

        // Don't do same-source seeking below
        return () => {
          if (crossSourceScrubDebounceRef.current) {
            clearTimeout(crossSourceScrubDebounceRef.current);
          }
        };
      }

      // =====================================================================
      // SAME-SOURCE SCRUBBING - Simple seek on active video
      // =====================================================================

      // Skip if already at target (within tolerance)
      if (diff <= tolerance) {
        return;
      }

      // Skip if we just seeked to this frame
      if (
        lastSeekFrameRef.current === currentFrame &&
        seekInProgressRef.current
      ) {
        return;
      }

      // Skip if a seek is in progress
      if (seekInProgressRef.current) {
        return;
      }

      // Ready to seek
      if (video.readyState < 2) {
        return;
      }

      lastSeekFrameRef.current = currentFrame;
      seekInProgressRef.current = true;

      logScrubbing('Same-source scrubbing to frame', {
        frame: currentFrame,
        target: targetTime.toFixed(3),
        current: currentVideoTime.toFixed(3),
        diff: diff.toFixed(3),
      });

      // Perform the seek
      video.currentTime = targetTime;

      // Use a single cleanup mechanism
      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        video.removeEventListener('seeked', onSeeked);
        seekInProgressRef.current = false;
      };

      const onSeeked = () => {
        logScrubbing('Same-source scrub complete', {
          actual: video.currentTime.toFixed(3),
        });
        cleanup();
      };

      video.addEventListener('seeked', onSeeked);

      // Timeout protection
      const timeoutId = setTimeout(cleanup, 200);

      // Cleanup on unmount or re-run
      return () => {
        clearTimeout(timeoutId);
        cleanup();
      };
    }, [
      currentFrame,
      fps,
      activeTrack,
      isPlaying,
      getActiveVideo,
      getPreloadVideo,
      activeSlot,
      currentSourceUrl,
      swapVideos,
    ]);

    // =========================================================================
    // EFFECT: Seek during playback (user clicked on timeline while playing)
    //
    // This handles large jumps during playback - when the user clicks on
    // a different position on the timeline while video is playing.
    // =========================================================================
    useEffect(() => {
      // Only run when playing
      if (!isPlaying) {
        return;
      }

      const video = getActiveVideo();
      if (!video || !activeTrack || video.paused) return;

      // Check if we're within the track's frame range
      const isWithinTrackRange =
        currentFrame >= activeTrack.startFrame &&
        currentFrame < activeTrack.endFrame;

      if (!isWithinTrackRange) {
        return;
      }

      const targetTime = calculateVideoTime(activeTrack, currentFrame, fps);
      const currentVideoTime = video.currentTime;
      const diff = Math.abs(currentVideoTime - targetTime);

      // Only seek for LARGE jumps (more than 0.5 seconds)
      // Small differences are normal during playback
      const jumpThreshold = 0.5;

      if (diff > jumpThreshold && video.readyState >= 2) {
        // Skip if already seeking
        if (seekInProgressRef.current) {
          return;
        }

        seekInProgressRef.current = true;

        logScrubbing('Playback jump detected', {
          frame: currentFrame,
          target: targetTime.toFixed(3),
          current: currentVideoTime.toFixed(3),
          diff: diff.toFixed(3),
        });

        video.currentTime = targetTime;

        // Clear seek flag after a short delay
        setTimeout(() => {
          seekInProgressRef.current = false;
        }, 100);
      }
    }, [currentFrame, fps, activeTrack, isPlaying, getActiveVideo]);

    // =========================================================================
    // EFFECT: Stop audio when jumping outside the active track range
    // =========================================================================
    useEffect(() => {
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

      if (!activeTrack) {
        if (activeVideo && !activeVideo.paused) activeVideo.pause();
        if (preloadVideo && !preloadVideo.paused) preloadVideo.pause();
        muteAll();
        return;
      }

      const isWithinActiveRange =
        currentFrame >= activeTrack.startFrame &&
        currentFrame < activeTrack.endFrame;

      if (!isWithinActiveRange) {
        if (activeVideo && !activeVideo.paused) activeVideo.pause();
        if (preloadVideo && !preloadVideo.paused) preloadVideo.pause();
        muteAll();
      }
    }, [activeTrack, currentFrame, getActiveVideo, getPreloadVideo, muteAll]);

    // =========================================================================
    // EFFECT: Timeline sync during playback (video → timeline)
    // Uses requestVideoFrameCallback for frame-accurate sync
    // =========================================================================
    useEffect(() => {
      const video = getActiveVideo();
      if (!video || !activeTrack || !isPlaying || !onFrameUpdate) return;

      let handle: number;

      const syncFrame = (
        _now: DOMHighResTimeStamp,
        metadata: VideoFrameCallbackMetadata,
      ) => {
        // Don't update timeline if we're in the middle of a seek
        if (seekInProgressRef.current || frameUpdateInProgressRef.current) {
          handle = video.requestVideoFrameCallback(syncFrame);
          return;
        }

        if (!video.paused && video.readyState >= 2) {
          const sourceStartTime = activeTrack.sourceStartTime || 0;
          const elapsedFrames =
            (metadata.mediaTime - sourceStartTime) * fps +
            activeTrack.startFrame;
          const newFrame = Math.floor(elapsedFrames);

          // Prevent feedback loops
          if (newFrame !== lastSeekFrameRef.current) {
            frameUpdateInProgressRef.current = true;
            onFrameUpdate(newFrame);

            requestAnimationFrame(() => {
              frameUpdateInProgressRef.current = false;
            });
          }
        }
        handle = video.requestVideoFrameCallback(syncFrame);
      };

      handle = video.requestVideoFrameCallback(syncFrame);
      return () => video.cancelVideoFrameCallback(handle);
    }, [
      activeTrack,
      isPlaying,
      fps,
      onFrameUpdate,
      getActiveVideo,
      activeSlot,
    ]);

    // =========================================================================
    // EVENT HANDLERS
    // =========================================================================
    const handleVideoAMetadata = useCallback(() => {
      setReadyA(true);
      enforceAudioState();

      // Seek to correct position after metadata loads
      if (activeSlot === 'A' && activeTrack) {
        const video = videoARef.current;
        if (video) {
          const targetTime = calculateVideoTime(activeTrack, currentFrame, fps);
          video.currentTime = targetTime;
        }
      }

      if (activeSlot === 'A' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [
      activeSlot,
      onLoadedMetadata,
      enforceAudioState,
      activeTrack,
      currentFrame,
      fps,
    ]);

    const handleVideoBMetadata = useCallback(() => {
      setReadyB(true);
      enforceAudioState();

      // Seek to correct position after metadata loads
      if (activeSlot === 'B' && activeTrack) {
        const video = videoBRef.current;
        if (video) {
          const targetTime = calculateVideoTime(activeTrack, currentFrame, fps);
          video.currentTime = targetTime;
        }
      }

      if (activeSlot === 'B' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [
      activeSlot,
      onLoadedMetadata,
      enforceAudioState,
      activeTrack,
      currentFrame,
      fps,
    ]);

    const handleVideoACanPlay = useCallback(() => {
      setReadyA(true);
      enforceAudioState();

      // Mark frame as confirmed ready
      frameConfirmedReadyRef.current.A = true;

      if (activeSlot === 'A') {
        const video = videoARef.current;
        if (video && onActiveVideoChange) {
          onActiveVideoChange(video);
        }
        if (video && isPlaying && video.paused) {
          video.play().catch(() => {
            // Ignore play errors during can play
          });
        }

        // CAPCUT-STYLE: Commit visual slot now that frame is ready
        // This handles the case where activeSlot changed before frame was decoded
        if (visualSlot !== 'A') {
          logFrameHold('VideoA canPlay: Committing deferred visual slot', {});
          setVisualSlot('A');
        }
      }

      // Check if there's a pending visual commit for slot A
      if (
        pendingVisualCommitRef.current?.targetSlot === 'A' &&
        videoARef.current?.readyState >= 2
      ) {
        logFrameHold('VideoA canPlay: Executing pending visual commit', {});
        pendingVisualCommitRef.current = null;
        setVisualSlot('A');
      }
    }, [
      activeSlot,
      visualSlot,
      onActiveVideoChange,
      isPlaying,
      enforceAudioState,
    ]);

    const handleVideoBCanPlay = useCallback(() => {
      setReadyB(true);
      enforceAudioState();

      // Mark frame as confirmed ready
      frameConfirmedReadyRef.current.B = true;

      if (activeSlot === 'B') {
        const video = videoBRef.current;
        if (video && onActiveVideoChange) {
          onActiveVideoChange(video);
        }
        if (video && isPlaying && video.paused) {
          video.play().catch(() => {
            // Ignore play errors during can play
          });
        }

        // CAPCUT-STYLE: Commit visual slot now that frame is ready
        if (visualSlot !== 'B') {
          logFrameHold('VideoB canPlay: Committing deferred visual slot', {});
          setVisualSlot('B');
        }
      }

      // Check if there's a pending visual commit for slot B
      if (
        pendingVisualCommitRef.current?.targetSlot === 'B' &&
        videoBRef.current?.readyState >= 2
      ) {
        logFrameHold('VideoB canPlay: Executing pending visual commit', {});
        pendingVisualCommitRef.current = null;
        setVisualSlot('B');
      }
    }, [
      activeSlot,
      visualSlot,
      onActiveVideoChange,
      isPlaying,
      enforceAudioState,
    ]);

    // =========================================================================
    // STALL RECOVERY HANDLERS - Fix black screen on long videos after rotation
    // =========================================================================
    // When video stalls (waiting event), we mark it as not ready.
    // When video resumes (playing event), we re-confirm the visual slot.
    // This ensures proper recovery after buffering, especially for long videos.
    // =========================================================================

    const handleVideoAWaiting = useCallback(() => {
      logFrameHold('VideoA waiting: Video stalled, marking not ready', {});
      // Mark frame as not confirmed ready - video is buffering
      frameConfirmedReadyRef.current.A = false;
      // Don't change readyA state to avoid triggering source reload
      // The visualSlot will be updated when canPlay fires again
    }, []);

    const handleVideoBWaiting = useCallback(() => {
      logFrameHold('VideoB waiting: Video stalled, marking not ready', {});
      // Mark frame as not confirmed ready - video is buffering
      frameConfirmedReadyRef.current.B = false;
      // Don't change readyB state to avoid triggering source reload
      // The visualSlot will be updated when canPlay fires again
    }, []);

    const handleVideoAPlaying = useCallback(() => {
      logFrameHold('VideoA playing: Video resumed', {});
      // Mark frame as confirmed ready
      frameConfirmedReadyRef.current.A = true;
      setReadyA(true);

      // CRITICAL: If this is the active slot and visual slot doesn't match,
      // commit the visual slot now that video is playing
      if (activeSlot === 'A' && visualSlot !== 'A') {
        logFrameHold('VideoA playing: Recovering visual slot after stall', {});
        setVisualSlot('A');
      }
    }, [activeSlot, visualSlot]);

    const handleVideoBPlaying = useCallback(() => {
      logFrameHold('VideoB playing: Video resumed', {});
      // Mark frame as confirmed ready
      frameConfirmedReadyRef.current.B = true;
      setReadyB(true);

      // CRITICAL: If this is the active slot and visual slot doesn't match,
      // commit the visual slot now that video is playing
      if (activeSlot === 'B' && visualSlot !== 'B') {
        logFrameHold('VideoB playing: Recovering visual slot after stall', {});
        setVisualSlot('B');
      }
    }, [activeSlot, visualSlot]);

    // =========================================================================
    // SEEKED HANDLER - Ensure visual slot sync after seeking on long videos
    // =========================================================================
    // When video finishes seeking (especially on long videos), ensure the
    // visual slot is properly synchronized with the active slot.
    // This prevents black screen issues after rotation/transform changes.
    // =========================================================================

    const handleVideoASeeked = useCallback(() => {
      const video = videoARef.current;
      if (!video) return;

      // Capture current slot values at start to avoid type narrowing issues in async callbacks
      const currentActiveSlot: 'A' | 'B' = activeSlot;
      const currentVisualSlot: 'A' | 'B' = visualSlot;

      logFrameHold('VideoA seeked: Seek complete', {
        readyState: video.readyState,
        currentTime: video.currentTime.toFixed(3),
      });

      // If video is ready after seek and this is the active slot,
      // ensure visual slot is synced
      if (video.readyState >= 2 && currentActiveSlot === 'A') {
        frameConfirmedReadyRef.current.A = true;
        if (currentVisualSlot !== 'A') {
          // Use double RAF to ensure frame is decoded before showing
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Re-check activeSlot in case it changed during async operations
              if (currentActiveSlot === 'A') {
                logFrameHold(
                  'VideoA seeked: Syncing visual slot after seek',
                  {},
                );
                setVisualSlot('A');
              }
            });
          });
        }
      }
    }, [activeSlot, visualSlot]);

    const handleVideoBSeeked = useCallback(() => {
      const video = videoBRef.current;
      if (!video) return;

      // Capture current slot values at start to avoid type narrowing issues in async callbacks
      const currentActiveSlot: 'A' | 'B' = activeSlot;
      const currentVisualSlot: 'A' | 'B' = visualSlot;

      logFrameHold('VideoB seeked: Seek complete', {
        readyState: video.readyState,
        currentTime: video.currentTime.toFixed(3),
      });

      // If video is ready after seek and this is the active slot,
      // ensure visual slot is synced
      if (video.readyState >= 2 && currentActiveSlot === 'B') {
        frameConfirmedReadyRef.current.B = true;
        if (currentVisualSlot !== 'B') {
          // Use double RAF to ensure frame is decoded before showing
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              // Re-check activeSlot in case it changed during async operations
              if (currentActiveSlot === 'B') {
                logFrameHold(
                  'VideoB seeked: Syncing visual slot after seek',
                  {},
                );
                setVisualSlot('B');
              }
            });
          });
        }
      }
    }, [activeSlot, visualSlot]);

    // =========================================================================
    // RENDER
    // =========================================================================

    // CAPCUT-STYLE VISUAL SLOT STRATEGY:
    // =========================================================================
    // We use TWO separate slot concepts:
    //
    // 1. activeSlot: LOGICAL state - which video SHOULD be playing
    //    - Controls audio routing
    //    - Controls playback state
    //    - Updates immediately on source change
    //
    // 2. visualSlot: VISUAL state - which video is ACTUALLY shown
    //    - Controls opacity (what user sees)
    //    - Only updates when frame is CONFIRMED decoded
    //    - This is the key to preventing black frames
    //
    // The visual slot LAGS behind the active slot until a frame is ready.
    // This means we ALWAYS show the last valid frame, never black.
    // =========================================================================

    return (
      <div
        className={className}
        style={{
          position: 'relative',
          width,
          height,
          overflow: 'hidden',
          // Transparent background - the parent container should handle any background
          backgroundColor: 'transparent',
        }}
      >
        {/*
          CAPCUT-STYLE FRAME HOLD:
          - Both videos are always rendered (visibility: visible)
          - VISUAL slot controls opacity (not active slot!)
          - Visual slot only changes when frame is confirmed decoded
          - This guarantees no black frame can ever appear
        */}
        <video
          key="dual-buffer-video-A-stable"
          ref={videoARef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            // CRITICAL: Use visualSlot for opacity, not activeSlot
            // This ensures we only show the video when frame is decoded
            opacity: visualSlot === 'A' ? 1 : 0,
            pointerEvents: activeSlot === 'A' ? 'auto' : 'none',
            zIndex: visualSlot === 'A' ? 2 : 1,
            // CRITICAL: Always keep visible to prevent repaint/black flash
            visibility: 'visible',
          }}
          playsInline
          controls={false}
          preload="auto"
          muted={!(activeSlot === 'A' && handleAudio && !isMuted)}
          onLoadedMetadata={handleVideoAMetadata}
          onCanPlay={handleVideoACanPlay}
          onWaiting={handleVideoAWaiting}
          onPlaying={handleVideoAPlaying}
          onSeeked={handleVideoASeeked}
        />

        <video
          key="dual-buffer-video-B-stable"
          ref={videoBRef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            // CRITICAL: Use visualSlot for opacity, not activeSlot
            opacity: visualSlot === 'B' ? 1 : 0,
            pointerEvents: activeSlot === 'B' ? 'auto' : 'none',
            zIndex: visualSlot === 'B' ? 2 : 1,
            // CRITICAL: Always keep visible to prevent repaint/black flash
            visibility: 'visible',
          }}
          playsInline
          controls={false}
          preload="auto"
          muted={!(activeSlot === 'B' && handleAudio && !isMuted)}
          onLoadedMetadata={handleVideoBMetadata}
          onCanPlay={handleVideoBCanPlay}
          onWaiting={handleVideoBWaiting}
          onPlaying={handleVideoBPlaying}
          onSeeked={handleVideoBSeeked}
        />
      </div>
    );
  },
);

DualBufferVideo.displayName = 'DualBufferVideo';

export default DualBufferVideo;
