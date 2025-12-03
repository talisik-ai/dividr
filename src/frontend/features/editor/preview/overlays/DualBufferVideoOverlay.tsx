/**
 * Dual-Buffer Video System - AUDIO FIX VERSION
 *
 * CRITICAL AUDIO FIXES:
 * 1. Only the ACTIVE video slot (A or B) can have audio - the other is ALWAYS muted
 * 2. Preload video is ALWAYS muted and paused
 * 3. Audio state is enforced on EVERY render and effect
 * 4. Added explicit audio control methods
 * 5. Removed any code that could cause audio leakage
 *
 * AUDIO RULE: At any given moment, exactly ONE video element should have audio.
 * The preload video NEVER has audio, even momentarily.
 */

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
  /** Force mute all video elements */
  muteAll: () => void;
  /** Get current audio state */
  getAudioState: () => AudioState;
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
   * CRITICAL: Whether this component should control audio output.
   * - true: Active video element will have audio (when not muted)
   * - false: ALL video elements are muted (audio comes from elsewhere, e.g., AudioOverlay)
   */
  handleAudio?: boolean;
}

// Configuration
const PRELOAD_THRESHOLD_FRAMES = 45;
const MIN_READY_STATE = 3;
const DEBUG_AUDIO = true;

function logAudio(message: string, data?: any) {
  if (DEBUG_AUDIO) {
    console.log(`[DualBuffer:Audio] ${message}`, data || '');
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
    // STABLE REFS - Never change
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

    // Current source URL
    const currentSourceUrl = useMemo(
      () => getVideoSource(activeTrack),
      [activeTrack?.previewUrl, activeTrack?.source],
    );

    // =========================================================================
    // CRITICAL: Audio enforcement function
    // This MUST be called whenever audio state could change
    // =========================================================================
    const enforceAudioState = useCallback(() => {
      const videoA = videoARef.current;
      const videoB = videoBRef.current;

      // RULE: Preload video is ALWAYS muted, no exceptions
      const preloadVideo = activeSlot === 'A' ? videoB : videoA;
      const activeVideo = activeSlot === 'A' ? videoA : videoB;

      if (preloadVideo) {
        preloadVideo.muted = true;
        preloadVideo.volume = 0;
      }

      if (activeVideo) {
        if (!handleAudio) {
          // This component doesn't handle audio - mute everything
          activeVideo.muted = true;
          activeVideo.volume = 0;
        } else {
          // This component handles audio - apply global mute/volume to active only
          activeVideo.muted = isMuted;
          activeVideo.volume = isMuted ? 0 : Math.min(volume, 1);
        }
      }

      logAudio('Audio state enforced', {
        activeSlot,
        handleAudio,
        isMuted,
        volume,
        videoA: videoA ? { muted: videoA.muted, volume: videoA.volume } : null,
        videoB: videoB ? { muted: videoB.muted, volume: videoB.volume } : null,
      });
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
    // MUTE ALL - Emergency stop
    // =========================================================================
    const muteAll = useCallback(() => {
      logAudio('MUTE ALL called');
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
    // SWAP VIDEOS
    // =========================================================================
    const swapVideos = useCallback(() => {
      if (swapLockRef.current) return;
      swapLockRef.current = true;

      logAudio('Swapping videos', { from: activeSlot });

      const oldActive = getActiveVideo();
      const newActive = getPreloadVideo();

      // Step 1: Mute and pause old active FIRST
      if (oldActive) {
        oldActive.muted = true;
        oldActive.volume = 0;
        if (!oldActive.paused) {
          oldActive.pause();
        }
      }

      // Step 2: Swap the slot
      const newSlot = activeSlot === 'A' ? 'B' : 'A';
      setActiveSlot(newSlot);

      // Step 3: Configure new active (audio will be set by enforceAudioState)
      if (newActive && isPlaying && newActive.readyState >= MIN_READY_STATE) {
        newActive.play().catch(() => {});
      }

      // Step 4: Notify parent
      if (newActive && onActiveVideoChange) {
        onActiveVideoChange(newActive);
      }

      // Step 5: Unlock after next frame
      requestAnimationFrame(() => {
        swapLockRef.current = false;
        // Enforce audio state after swap completes
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

        logAudio('Preloading source', { url: url.substring(0, 50), startTime });

        lastPreloadUrlRef.current = url;

        // Update source ref
        if (activeSlot === 'A') {
          sourceBRef.current = url;
          setReadyB(false);
        } else {
          sourceARef.current = url;
          setReadyA(false);
        }

        // CRITICAL: Preload video is ALWAYS muted
        preloadVideo.muted = true;
        preloadVideo.volume = 0;
        preloadVideo.src = url;
        preloadVideo.currentTime = startTime;
        preloadVideo.preload = 'auto';
        preloadVideo.load();

        return new Promise((resolve) => {
          const check = () => {
            if (preloadVideo.readyState >= MIN_READY_STATE) {
              // Ensure still muted after loading
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
      ],
    );

    // =========================================================================
    // EFFECT: Handle source changes
    // =========================================================================
    useEffect(() => {
      if (!currentSourceUrl) return;

      const activeSource = getActiveSource();

      // Same source - no action needed
      if (activeSource === currentSourceUrl) {
        return;
      }

      // Check if this is a same-source segment transition
      const isRealSourceChange = prevSourceRef.current !== currentSourceUrl;
      prevSourceRef.current = currentSourceUrl;

      if (!isRealSourceChange) {
        // Same source file, different segment - video continues
        return;
      }

      // Check if preload has our source ready
      if (getPreloadSource() === currentSourceUrl && isPreloadReady()) {
        swapVideos();
        return;
      }

      // Need to load directly into active
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
    // EFFECT: Preload next clip
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
    // EFFECT: Sync playback state - AUDIO CRITICAL
    // =========================================================================
    useEffect(() => {
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

      // CRITICAL: Always enforce audio state first
      enforceAudioState();

      // CRITICAL: Preload video must ALWAYS be muted and paused
      if (preloadVideo) {
        preloadVideo.muted = true;
        preloadVideo.volume = 0;
        if (!preloadVideo.paused) {
          preloadVideo.pause();
        }
      }

      if (!activeVideo) return;

      try {
        // Control playback
        if (isPlaying) {
          if (activeVideo.paused && activeVideo.readyState >= MIN_READY_STATE) {
            activeVideo.play().catch(() => {});
          }
        } else {
          if (!activeVideo.paused) {
            activeVideo.pause();
          }
        }

        // Playback rate
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
    // EFFECT: Enforce audio state on mount and whenever audio props change
    // =========================================================================
    useEffect(() => {
      enforceAudioState();
    }, [enforceAudioState]);

    // =========================================================================
    // EFFECT: Timeline sync using requestVideoFrameCallback
    // =========================================================================
    useEffect(() => {
      const video = getActiveVideo();
      if (!video || !activeTrack || !isPlaying || !onFrameUpdate) return;

      let handle: number;

      const syncFrame = (
        _now: DOMHighResTimeStamp,
        metadata: VideoFrameCallbackMetadata,
      ) => {
        if (!video.paused && video.readyState >= 2) {
          const sourceStartTime = activeTrack.sourceStartTime || 0;
          const elapsedFrames =
            (metadata.mediaTime - sourceStartTime) * fps +
            activeTrack.startFrame;
          const newFrame = Math.floor(elapsedFrames);
          onFrameUpdate(newFrame);
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
      // Ensure audio state on metadata load
      enforceAudioState();
      if (activeSlot === 'A' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [activeSlot, onLoadedMetadata, enforceAudioState]);

    const handleVideoBMetadata = useCallback(() => {
      setReadyB(true);
      // Ensure audio state on metadata load
      enforceAudioState();
      if (activeSlot === 'B' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [activeSlot, onLoadedMetadata, enforceAudioState]);

    const handleVideoACanPlay = useCallback(() => {
      setReadyA(true);
      // Ensure audio state
      enforceAudioState();

      if (activeSlot === 'A') {
        const video = videoARef.current;
        if (video && onActiveVideoChange) {
          onActiveVideoChange(video);
        }
        if (video && isPlaying && video.paused) {
          video.play().catch(() => {});
        }
      }
    }, [activeSlot, onActiveVideoChange, isPlaying, enforceAudioState]);

    const handleVideoBCanPlay = useCallback(() => {
      setReadyB(true);
      // Ensure audio state
      enforceAudioState();

      if (activeSlot === 'B') {
        const video = videoBRef.current;
        if (video && onActiveVideoChange) {
          onActiveVideoChange(video);
        }
        if (video && isPlaying && video.paused) {
          video.play().catch(() => {});
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
        {/* 
            CRITICAL AUDIO RULES:
            1. Only the ACTIVE slot has muted={false} (when handleAudio is true and not globally muted)
            2. The INACTIVE slot is ALWAYS muted={true}
            3. Audio state is enforced in effects, not just in JSX
          */}
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
          // AUDIO: Muted unless this is active slot AND we handle audio AND not globally muted
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
          // AUDIO: Muted unless this is active slot AND we handle audio AND not globally muted
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
