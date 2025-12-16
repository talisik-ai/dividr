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
const MAX_SEEK_VERIFY_ATTEMPTS = 30; // ~500ms at 60fps

const DEBUG_DUAL_BUFFER = true; // ENABLED FOR DEBUGGING

function logDualBuffer(message: string, data?: unknown) {
  if (DEBUG_DUAL_BUFFER) {
    console.log(`[DualBuffer] ${message}`, data || '');
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
 * Seek to a specific time and wait for frame decode verification.
 * Uses requestVideoFrameCallback for frame-accurate seeking.
 */
async function seekWithVerification(
  video: HTMLVideoElement,
  targetTime: number,
  tolerance: number = SEEK_TOLERANCE,
): Promise<boolean> {
  return new Promise((resolve) => {
    video.currentTime = targetTime;

    let attempts = 0;

    const verifyFrame = () => {
      attempts++;

      // Check if we're close enough
      if (Math.abs(video.currentTime - targetTime) <= tolerance) {
        resolve(true);
        return;
      }

      // Timeout protection
      if (attempts >= MAX_SEEK_VERIFY_ATTEMPTS) {
        logDualBuffer('Seek verification timeout', {
          target: targetTime,
          actual: video.currentTime,
        });
        resolve(false);
        return;
      }

      // Keep checking using requestVideoFrameCallback if available
      if ('requestVideoFrameCallback' in video) {
        (
          video as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback(verifyFrame);
      } else {
        requestAnimationFrame(verifyFrame);
      }
    };

    // Start verification
    if ('requestVideoFrameCallback' in video) {
      (
        video as HTMLVideoElement & {
          requestVideoFrameCallback: (cb: () => void) => number;
        }
      ).requestVideoFrameCallback(verifyFrame);
    } else {
      // Fallback for browsers without requestVideoFrameCallback
      const videoEl = video as HTMLVideoElement;
      const onSeeked = () => {
        videoEl.removeEventListener('seeked', onSeeked);
        verifyFrame();
      };
      videoEl.addEventListener('seeked', onSeeked);
    }
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

    // Virtual Timeline for segment-aware transitions
    const virtualTimelineRef = useRef<VirtualTimelineManager | null>(null);

    // Current source URL
    const currentSourceUrl = useMemo(
      () => getVideoSource(activeTrack),
      [activeTrack?.previewUrl, activeTrack?.source],
    );

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
          seekInProgressRef.current = true;
          await seekWithVerification(video, time);
          seekInProgressRef.current = false;
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
    // =========================================================================
    const swapVideos = useCallback(async () => {
      if (swapLockRef.current) return;
      swapLockRef.current = true;

      logDualBuffer('Swapping videos', { from: activeSlot });

      const oldActive = getActiveVideo();
      const newActive = getPreloadVideo();

      // CRITICAL: Ensure the new video has a decoded frame before swapping
      if (newActive) {
        // First, wait for minimum ready state
        if (newActive.readyState < MIN_READY_STATE) {
          await waitForReadyState(newActive, MIN_READY_STATE);
        }

        // Then verify a frame is actually decoded using requestVideoFrameCallback
        await new Promise<void>((resolve) => {
          if ('requestVideoFrameCallback' in newActive) {
            (
              newActive as HTMLVideoElement & {
                requestVideoFrameCallback: (cb: () => void) => number;
              }
            ).requestVideoFrameCallback(() => resolve());
          } else {
            // Fallback: use double RAF to ensure paint
            requestAnimationFrame(() => {
              requestAnimationFrame(() => resolve());
            });
          }
        });
      }

      // Now that the new frame is ready, do the swap
      const newSlot = activeSlot === 'A' ? 'B' : 'A';
      setActiveSlot(newSlot);

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

      logDualBuffer('Track/Source check', {
        prevTrackId: prevTrackIdRef.current,
        currentTrackId: activeTrack.id,
        prevSource: prevSourceRef.current?.substring(0, 50),
        currentSource: currentSourceUrl.substring(0, 50),
        isNewTrack,
        isNewSource,
        activeVideoSrc: activeVideoSrc.substring(0, 50),
      });

      // If neither track nor source changed, do nothing
      if (!isNewTrack && !isNewSource) {
        return;
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
      // =====================================================================
      if (currentNormalized === activeVideoSrc && activeVideoSrc !== '') {
        const currentTime = activeVideo.currentTime;
        const diff = Math.abs(currentTime - targetTime);
        const isVideoPlaying =
          !activeVideo.paused && activeVideo.readyState >= 2;

        // For playing video, use a much larger tolerance (500ms = ~15 frames at 30fps)
        // This lets the video continue playing smoothly through track changes
        // Only force a seek if we're really far off (true rearrangement)
        const playingTolerance = 0.5; // 500ms during playback
        const pausedTolerance = 1.0 / fps; // 1 frame when paused (for scrubbing)

        const tolerance = isVideoPlaying ? playingTolerance : pausedTolerance;

        if (diff <= tolerance) {
          // Video is close enough - let it continue playing naturally
          logDualBuffer('SAME SOURCE - within tolerance, continuing playback', {
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

        logDualBuffer('SAME SOURCE NEW TRACK - large jump, seeking', {
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
      // =====================================================================
      if (currentNormalized === preloadVideoSrc && isPreloadReady()) {
        logDualBuffer('PRELOAD READY - swapping', {});
        swapVideos();
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
      // CASE 4: DIFFERENT SOURCE - Preload then swap
      // Keep current video visible until new one has a decoded frame
      // =====================================================================
      if (preloadVideo) {
        logDualBuffer('DIFFERENT SOURCE - preload then swap', {
          url: currentSourceUrl.substring(0, 50),
          targetTime,
        });

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

        // Wait for video to be ready with a decoded frame, then swap
        const handleReady = () => {
          preloadVideo.removeEventListener('canplay', handleReady);
          preloadVideo.removeEventListener('canplaythrough', handleReady);

          // Mark as ready
          if (activeSlot === 'A') {
            setReadyB(true);
          } else {
            setReadyA(true);
          }

          // CRITICAL: Wait for actual frame decode before swapping
          if ('requestVideoFrameCallback' in preloadVideo) {
            (
              preloadVideo as HTMLVideoElement & {
                requestVideoFrameCallback: (cb: () => void) => number;
              }
            ).requestVideoFrameCallback(() => {
              logDualBuffer('Frame decoded - swapping now', {});
              swapVideos();
            });
          } else {
            // Fallback: double RAF for paint
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                swapVideos();
              });
            });
          }
        };

        preloadVideo.addEventListener('canplay', handleReady);
        preloadVideo.addEventListener('canplaythrough', handleReady);
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
    // EFFECT: BIDIRECTIONAL SYNC - Video ↔ Timeline
    //
    // This is the CRITICAL effect for seek synchronization.
    //
    // During PLAYBACK: Video drives timeline via requestVideoFrameCallback
    // During SEEKING (paused or scrubbing): Timeline drives video via currentTime
    // =========================================================================
    useEffect(() => {
      const video = getActiveVideo();
      if (!video || !activeTrack) return;

      // Calculate the target video time for the current frame
      const targetTime = calculateVideoTime(activeTrack, currentFrame, fps);
      const currentVideoTime = video.currentTime;
      const tolerance = 1 / fps; // One frame tolerance
      const diff = Math.abs(currentVideoTime - targetTime);

      // Check if we're within the track's frame range
      const isWithinTrackRange =
        currentFrame >= activeTrack.startFrame &&
        currentFrame < activeTrack.endFrame;

      if (!isWithinTrackRange) {
        return; // Don't sync if frame is outside this track's range
      }

      // CASE 1: During playback - let video drive timeline
      // Check BOTH the isPlaying state AND the actual video paused state
      // (isPlaying can flicker due to React state updates)
      const videoIsActuallyPlaying = !video.paused && video.readyState >= 2;
      if ((isPlaying || videoIsActuallyPlaying) && !seekInProgressRef.current) {
        // Don't seek during continuous playback
        // The requestVideoFrameCallback below handles timeline updates
        return;
      }

      // CASE 2: Paused or seeking - timeline drives video
      // Only seek if there's a significant difference AND video is truly paused
      if (diff > tolerance && video.readyState >= 2 && video.paused) {
        // Check if this is a new seek position (not a feedback loop)
        if (lastSeekFrameRef.current !== currentFrame) {
          lastSeekFrameRef.current = currentFrame;
          seekInProgressRef.current = true;

          logDualBuffer('Seeking video to match timeline', {
            currentFrame,
            targetTime,
            currentVideoTime,
            diff,
          });

          video.currentTime = targetTime;

          // Clear seek flag after browser processes the seek
          requestAnimationFrame(() => {
            seekInProgressRef.current = false;
          });
        }
      }
    }, [currentFrame, fps, activeTrack, isPlaying, getActiveVideo, activeSlot]);

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
      }
    }, [activeSlot, onActiveVideoChange, isPlaying, enforceAudioState]);

    const handleVideoBCanPlay = useCallback(() => {
      setReadyB(true);
      enforceAudioState();

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
      }
    }, [activeSlot, onActiveVideoChange, isPlaying, enforceAudioState]);

    // =========================================================================
    // RENDER
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
          CRITICAL: We keep both videos visible (visibility: visible) to prevent
          repaint flashes. Only use opacity and z-index for switching.
          The inactive video stays rendered but hidden behind the active one.
        */}
        <video
          key="dual-buffer-video-A-stable"
          ref={videoARef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            opacity: activeSlot === 'A' ? 1 : 0,
            pointerEvents: activeSlot === 'A' ? 'auto' : 'none',
            zIndex: activeSlot === 'A' ? 2 : 1,
            // Keep both visible to prevent repaint - use opacity for hiding
            visibility: 'visible',
          }}
          playsInline
          controls={false}
          preload="auto"
          muted={!(activeSlot === 'A' && handleAudio && !isMuted)}
          onLoadedMetadata={handleVideoAMetadata}
          onCanPlay={handleVideoACanPlay}
        />

        <video
          key="dual-buffer-video-B-stable"
          ref={videoBRef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            opacity: activeSlot === 'B' ? 1 : 0,
            pointerEvents: activeSlot === 'B' ? 'auto' : 'none',
            zIndex: activeSlot === 'B' ? 2 : 1,
            // Keep both visible to prevent repaint - use opacity for hiding
            visibility: 'visible',
          }}
          playsInline
          controls={false}
          preload="auto"
          muted={!(activeSlot === 'B' && handleAudio && !isMuted)}
          onLoadedMetadata={handleVideoBMetadata}
          onCanPlay={handleVideoBCanPlay}
        />
      </div>
    );
  },
);

DualBufferVideo.displayName = 'DualBufferVideo';

export default DualBufferVideo;
