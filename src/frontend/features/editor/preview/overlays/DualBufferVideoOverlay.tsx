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

// Configuration
const PRELOAD_THRESHOLD_FRAMES = 45;
const MIN_READY_STATE = 3; // HAVE_FUTURE_DATA
const DEBUG_DUAL_BUFFER = false;

function logDualBuffer(message: string, data?: unknown) {
  if (DEBUG_DUAL_BUFFER) {
    console.log(`[DualBuffer] ${message}`, data || '');
  }
}

// =============================================================================
// HELPERS
// =============================================================================

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

    // SEEK TRACKING: Prevent feedback loops during seek
    const seekInProgressRef = useRef(false);
    const lastSeekFrameRef = useRef<number>(-1);

    // Track if we're currently updating frame from video (to prevent circular updates)
    const frameUpdateInProgressRef = useRef(false);

    // Current source URL
    const currentSourceUrl = useMemo(
      () => getVideoSource(activeTrack),
      [activeTrack?.previewUrl, activeTrack?.source],
    );

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

    // =========================================================================
    // SEEK TO - Direct seek method
    // =========================================================================
    const seekTo = useCallback(
      (time: number) => {
        const video = getActiveVideo();
        if (video && video.readyState >= 2) {
          seekInProgressRef.current = true;
          video.currentTime = time;
          requestAnimationFrame(() => {
            seekInProgressRef.current = false;
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
    // SWAP VIDEOS
    // =========================================================================
    const swapVideos = useCallback(() => {
      if (swapLockRef.current) return;
      swapLockRef.current = true;

      logDualBuffer('Swapping videos', { from: activeSlot });

      const oldActive = getActiveVideo();
      const newActive = getPreloadVideo();

      // Mute and pause old active
      if (oldActive) {
        oldActive.muted = true;
        oldActive.volume = 0;
        if (!oldActive.paused) {
          oldActive.pause();
        }
      }

      const newSlot = activeSlot === 'A' ? 'B' : 'A';
      setActiveSlot(newSlot);

      if (newActive && isPlaying && newActive.readyState >= MIN_READY_STATE) {
        newActive.play().catch(() => {
          // Ignore play errors during swap
        });
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

        return new Promise((resolve) => {
          const check = () => {
            if (preloadVideo.readyState >= MIN_READY_STATE) {
              preloadVideo.muted = true;
              preloadVideo.volume = 0;

              if (activeSlot === 'A') {
                setReadyB(true);
              } else {
                setReadyA(true);
              }
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          setTimeout(check, 50);
        });
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
      ],
    );

    // =========================================================================
    // EFFECT: Handle source changes
    // =========================================================================
    useEffect(() => {
      if (!currentSourceUrl) return;

      const activeSource = getActiveSource();

      if (activeSource === currentSourceUrl) {
        return;
      }

      const isRealSourceChange = prevSourceRef.current !== currentSourceUrl;
      prevSourceRef.current = currentSourceUrl;

      if (!isRealSourceChange) {
        return;
      }

      if (getPreloadSource() === currentSourceUrl && isPreloadReady()) {
        swapVideos();
        return;
      }

      const activeVideo = getActiveVideo();
      if (activeSlot === 'A') {
        sourceARef.current = currentSourceUrl;
        setReadyA(false);
      } else {
        sourceBRef.current = currentSourceUrl;
        setReadyB(false);
      }

      if (activeVideo) {
        activeVideo.src = currentSourceUrl;
        activeVideo.load();
      }
    }, [
      currentSourceUrl,
      activeSlot,
      getActiveSource,
      getPreloadSource,
      getActiveVideo,
      isPreloadReady,
      swapVideos,
    ]);

    // =========================================================================
    // EFFECT: Preload next clip during playback
    // =========================================================================
    useEffect(() => {
      if (!activeTrack || !isPlaying) return;

      const framesUntilEnd = activeTrack.endFrame - currentFrame;

      if (framesUntilEnd <= PRELOAD_THRESHOLD_FRAMES && framesUntilEnd > 0) {
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
      getPreloadSource,
      preloadSource,
    ]);

    // =========================================================================
    // EFFECT: Sync playback state (play/pause, audio)
    // =========================================================================
    useEffect(() => {
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

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
            activeVideo.play().catch(() => {
              // Ignore play errors during playback sync
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
    // EFFECT: Enforce audio on mount and prop changes
    // =========================================================================
    useEffect(() => {
      enforceAudioState();
    }, [enforceAudioState]);

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
      if (isPlaying && !seekInProgressRef.current) {
        // Don't seek during continuous playback
        // The requestVideoFrameCallback below handles timeline updates
        return;
      }

      // CASE 2: Paused or seeking - timeline drives video
      // Only seek if there's a significant difference
      if (diff > tolerance && video.readyState >= 2) {
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
        style={{ position: 'relative', width, height, overflow: 'hidden' }}
      >
        <video
          key="dual-buffer-video-A-stable"
          ref={videoARef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            opacity: activeSlot === 'A' ? 1 : 0,
            pointerEvents: activeSlot === 'A' ? 'auto' : 'none',
            zIndex: activeSlot === 'A' ? 1 : 0,
            visibility: activeSlot === 'A' ? 'visible' : 'hidden',
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
            zIndex: activeSlot === 'B' ? 1 : 0,
            visibility: activeSlot === 'B' ? 'visible' : 'hidden',
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
