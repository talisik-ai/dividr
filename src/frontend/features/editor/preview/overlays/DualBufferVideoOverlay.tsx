/**
 * Dual-Buffer Video System for Seamless Cross-Clip Transitions - FIXED VERSION
 *
 * KEY FIXES:
 * 1. Video elements are rendered with STABLE keys that never change
 * 2. Source changes are handled via src attribute updates, NOT remounts
 * 3. Preload logic is more aggressive and handles edge cases
 * 4. Reduced console logging to prevent performance issues
 *
 * This system maintains TWO video elements:
 * 1. Active video - currently playing/visible
 * 2. Preload video - loading the next clip in background
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
}

export interface BufferStatus {
  activeSource: string | null;
  activeReadyState: number;
  activeCurrentTime: number;
  preloadSource: string | null;
  preloadReadyState: number;
  preloadCurrentTime: number;
  isPreloadReady: boolean;
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
  width: number;
  height: number;
  className?: string;
  objectFit?: 'contain' | 'cover' | 'fill';
}

// Preload threshold in frames
const PRELOAD_THRESHOLD_FRAMES = 45; // ~1.5 seconds at 30fps (increased for more buffer time)

// Minimum ready state to consider video "ready"
const MIN_READY_STATE = 3; // HAVE_FUTURE_DATA

// Debug logging (set to false in production)
const DEBUG_DUAL_BUFFER = false;

function logDualBuffer(message: string, data?: any) {
  if (DEBUG_DUAL_BUFFER) {
    console.log(`[DualBuffer] ${message}`, data || '');
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getVideoSource(track: VideoTrack | undefined): string | undefined {
  if (!track) return undefined;

  if (track.previewUrl && track.previewUrl.trim()) {
    return track.previewUrl;
  }

  if (track.source && track.source.trim()) {
    const sourcePath = track.source.trim();
    if (sourcePath.startsWith('http://') || sourcePath.startsWith('https://')) {
      return sourcePath;
    }
    const encodedPath = encodeURIComponent(sourcePath);
    return `http://localhost:3001/${encodedPath}`;
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

  const nextTracks = videoTracks.filter(
    (t) => t.id !== currentTrackId && t.startFrame >= currentTrack.endFrame - 1,
  );

  return nextTracks[0];
}

function calculateVideoStartTime(
  track: VideoTrack,
  frame: number,
  fps: number,
): number {
  const relativeFrame = Math.max(0, frame - track.startFrame);
  const trackTime = relativeFrame / fps;
  return (track.sourceStartTime || 0) + trackTime;
}

// =============================================================================
// DUAL BUFFER VIDEO COMPONENT
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
      width,
      height,
      className,
      objectFit = 'contain',
    },
    ref,
  ) => {
    // =========================================================================
    // REFS - These are STABLE and never change
    // =========================================================================
    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);

    // Track which video slot is active
    const [activeVideoSlot, setActiveVideoSlot] = useState<'A' | 'B'>('A');

    // Track sources - these change, but video elements don't remount
    const videoASourceRef = useRef<string | null>(null);
    const videoBSourceRef = useRef<string | null>(null);

    // Track ready states
    const [videoAReady, setVideoAReady] = useState(false);
    const [videoBReady, setVideoBReady] = useState(false);

    // Prevent swap loops
    const swapInProgressRef = useRef(false);
    const lastPreloadedSourceRef = useRef<string | null>(null);

    // Track previous source to detect changes
    const prevSourceUrlRef = useRef<string | undefined>(undefined);

    // =========================================================================
    // COMPUTED VALUES
    // =========================================================================
    const currentSourceUrl = useMemo(
      () => getVideoSource(activeTrack),
      [activeTrack?.previewUrl, activeTrack?.source],
    );

    // =========================================================================
    // VIDEO ACCESS METHODS
    // =========================================================================
    const getActiveVideo = useCallback(() => {
      return activeVideoSlot === 'A' ? videoARef.current : videoBRef.current;
    }, [activeVideoSlot]);

    const getPreloadVideo = useCallback(() => {
      return activeVideoSlot === 'A' ? videoBRef.current : videoARef.current;
    }, [activeVideoSlot]);

    const getActiveSource = useCallback(() => {
      return activeVideoSlot === 'A'
        ? videoASourceRef.current
        : videoBSourceRef.current;
    }, [activeVideoSlot]);

    const getPreloadSource = useCallback(() => {
      return activeVideoSlot === 'A'
        ? videoBSourceRef.current
        : videoASourceRef.current;
    }, [activeVideoSlot]);

    const isActiveReady = useCallback(() => {
      return activeVideoSlot === 'A' ? videoAReady : videoBReady;
    }, [activeVideoSlot, videoAReady, videoBReady]);

    const isPreloadReady = useCallback(() => {
      return activeVideoSlot === 'A' ? videoBReady : videoAReady;
    }, [activeVideoSlot, videoAReady, videoBReady]);

    // =========================================================================
    // SWAP VIDEOS
    // =========================================================================
    const swapVideos = useCallback(() => {
      if (swapInProgressRef.current) return;
      swapInProgressRef.current = true;

      logDualBuffer('Swapping videos', {
        from: activeVideoSlot,
        to: activeVideoSlot === 'A' ? 'B' : 'A',
      });

      setActiveVideoSlot((prev) => (prev === 'A' ? 'B' : 'A'));

      requestAnimationFrame(() => {
        swapInProgressRef.current = false;
      });
    }, [activeVideoSlot]);

    // =========================================================================
    // PRELOAD SOURCE
    // =========================================================================
    const preloadSource = useCallback(
      async (url: string, startTime = 0): Promise<void> => {
        const preloadVideo = getPreloadVideo();
        if (!preloadVideo) return;

        // Don't re-preload the same source
        if (lastPreloadedSourceRef.current === url) {
          return;
        }

        logDualBuffer('Preloading source', {
          url: url.substring(0, 50),
          startTime,
        });

        lastPreloadedSourceRef.current = url;

        // Update source ref
        if (activeVideoSlot === 'A') {
          videoBSourceRef.current = url;
          setVideoBReady(false);
        } else {
          videoASourceRef.current = url;
          setVideoAReady(false);
        }

        // Set source and preload
        preloadVideo.src = url;
        preloadVideo.currentTime = startTime;
        preloadVideo.preload = 'auto';
        preloadVideo.load();

        return new Promise((resolve) => {
          const checkReady = () => {
            if (preloadVideo.readyState >= MIN_READY_STATE) {
              logDualBuffer('Preload ready');
              if (activeVideoSlot === 'A') {
                setVideoBReady(true);
              } else {
                setVideoAReady(true);
              }
              resolve();
            } else {
              requestAnimationFrame(checkReady);
            }
          };
          setTimeout(checkReady, 50);
        });
      },
      [activeVideoSlot, getPreloadVideo],
    );

    // =========================================================================
    // CHECK IF SOURCE IS READY
    // =========================================================================
    const isSourceReady = useCallback(
      (url: string): boolean => {
        if (videoASourceRef.current === url && videoAReady) return true;
        if (videoBSourceRef.current === url && videoBReady) return true;
        return false;
      },
      [videoAReady, videoBReady],
    );

    // =========================================================================
    // GET BUFFER STATUS
    // =========================================================================
    const getBufferStatus = useCallback((): BufferStatus => {
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

      return {
        activeSource: getActiveSource(),
        activeReadyState: activeVideo?.readyState || 0,
        activeCurrentTime: activeVideo?.currentTime || 0,
        preloadSource: getPreloadSource(),
        preloadReadyState: preloadVideo?.readyState || 0,
        preloadCurrentTime: preloadVideo?.currentTime || 0,
        isPreloadReady: isPreloadReady(),
      };
    }, [
      getActiveVideo,
      getPreloadVideo,
      getActiveSource,
      getPreloadSource,
      isPreloadReady,
    ]);

    // =========================================================================
    // EXPOSE REF METHODS
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
      }),
      [
        getActiveVideo,
        getPreloadVideo,
        swapVideos,
        preloadSource,
        isSourceReady,
        getBufferStatus,
      ],
    );

    // =========================================================================
    // HANDLE SOURCE CHANGES
    // =========================================================================
    useEffect(() => {
      if (!currentSourceUrl) return;

      const activeSource = getActiveSource();
      const preloadSourceUrl = getPreloadSource();
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

      // If source hasn't changed, no action needed
      if (activeSource === currentSourceUrl) {
        // Just ensure video is playing if it should be
        if (
          isPlaying &&
          activeVideo?.paused &&
          activeVideo.readyState >= MIN_READY_STATE
        ) {
          activeVideo.play().catch(() => {});
        }
        return;
      }

      // Check if this is a same-source segment transition (track ID changed but source is same)
      const isSameSource = prevSourceUrlRef.current === currentSourceUrl;
      prevSourceUrlRef.current = currentSourceUrl;

      if (isSameSource) {
        // Same source file, different segment - NO action needed
        // The video is already playing the correct content
        logDualBuffer('Same-source segment transition, no swap needed');
        return;
      }

      // Different source file - check if we can swap to preload
      if (preloadSourceUrl === currentSourceUrl && isPreloadReady()) {
        logDualBuffer('Swapping to preloaded source');
        swapVideos();

        if (onActiveVideoChange && preloadVideo) {
          onActiveVideoChange(preloadVideo);
        }
        return;
      }

      // Need to load directly into active video (may cause brief flash)
      logDualBuffer('Loading source directly into active');

      if (activeVideoSlot === 'A') {
        videoASourceRef.current = currentSourceUrl;
        setVideoAReady(false);
      } else {
        videoBSourceRef.current = currentSourceUrl;
        setVideoBReady(false);
      }

      if (activeVideo) {
        activeVideo.src = currentSourceUrl;
        activeVideo.load();
      }
    }, [
      currentSourceUrl,
      activeVideoSlot,
      getActiveSource,
      getPreloadSource,
      getActiveVideo,
      getPreloadVideo,
      isActiveReady,
      isPreloadReady,
      swapVideos,
      onActiveVideoChange,
      isPlaying,
    ]);

    // =========================================================================
    // PRELOAD NEXT CLIP
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
          const nextSourceUrl = getVideoSource(nextTrack);
          const currentPreloadSource = getPreloadSource();

          // Only preload if different from current preload
          if (nextSourceUrl && nextSourceUrl !== currentPreloadSource) {
            const startTime = calculateVideoStartTime(
              nextTrack,
              nextTrack.startFrame,
              fps,
            );
            preloadSource(nextSourceUrl, startTime);
          }
        }
      }
    }, [
      activeTrack,
      allTracks,
      currentFrame,
      fps,
      isPlaying,
      getPreloadSource,
      preloadSource,
    ]);

    // =========================================================================
    // SYNC PLAYBACK STATE
    // =========================================================================
    useEffect(() => {
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

      // CRITICAL: Always mute and pause the PRELOAD video to prevent double audio
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
            activeVideo.play().catch(() => {});
          }
        } else {
          if (!activeVideo.paused) {
            activeVideo.pause();
          }
        }

        // Only the ACTIVE video should have audio
        activeVideo.muted = isMuted;
        activeVideo.volume = isMuted ? 0 : Math.min(volume, 1);
        activeVideo.playbackRate = Math.max(0.25, Math.min(playbackRate, 4));
      } catch (err) {
        console.warn('[DualBuffer] Playback sync error:', err);
      }
    }, [
      isPlaying,
      isMuted,
      volume,
      playbackRate,
      getActiveVideo,
      getPreloadVideo,
      activeVideoSlot,
    ]);

    // =========================================================================
    // VIDEO EVENT HANDLERS
    // =========================================================================
    const handleVideoAMetadata = useCallback(() => {
      logDualBuffer('Video A metadata loaded');
      if (activeVideoSlot === 'A' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [activeVideoSlot, onLoadedMetadata]);

    const handleVideoBMetadata = useCallback(() => {
      logDualBuffer('Video B metadata loaded');
      if (activeVideoSlot === 'B' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [activeVideoSlot, onLoadedMetadata]);

    const handleVideoACanPlay = useCallback(() => {
      setVideoAReady(true);
      if (activeVideoSlot === 'A' && onActiveVideoChange && videoARef.current) {
        onActiveVideoChange(videoARef.current);
      }
    }, [activeVideoSlot, onActiveVideoChange]);

    const handleVideoBCanPlay = useCallback(() => {
      setVideoBReady(true);
      if (activeVideoSlot === 'B' && onActiveVideoChange && videoBRef.current) {
        onActiveVideoChange(videoBRef.current);
      }
    }, [activeVideoSlot, onActiveVideoChange]);

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
        }}
      >
        {/* 
            CRITICAL: These video elements have STABLE keys that NEVER change.
            React will never unmount/remount them. Only the src attribute changes.
            
            IMPORTANT: Preload video (inactive) is always muted to prevent double audio.
          */}
        <video
          key="dual-buffer-video-A"
          ref={videoARef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            opacity: activeVideoSlot === 'A' ? 1 : 0,
            pointerEvents: activeVideoSlot === 'A' ? 'auto' : 'none',
            zIndex: activeVideoSlot === 'A' ? 1 : 0,
            // Use visibility hidden instead of display:none to keep video decoding
            visibility: activeVideoSlot === 'A' ? 'visible' : 'hidden',
          }}
          playsInline
          controls={false}
          preload="auto"
          muted={activeVideoSlot !== 'A' || isMuted} // Mute if not active or globally muted
          onLoadedMetadata={handleVideoAMetadata}
          onCanPlay={handleVideoACanPlay}
        />

        <video
          key="dual-buffer-video-B"
          ref={videoBRef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            opacity: activeVideoSlot === 'B' ? 1 : 0,
            pointerEvents: activeVideoSlot === 'B' ? 'auto' : 'none',
            zIndex: activeVideoSlot === 'B' ? 1 : 0,
            visibility: activeVideoSlot === 'B' ? 'visible' : 'hidden',
          }}
          playsInline
          controls={false}
          preload="auto"
          muted={activeVideoSlot !== 'B' || isMuted} // Mute if not active or globally muted
          onLoadedMetadata={handleVideoBMetadata}
          onCanPlay={handleVideoBCanPlay}
        />
      </div>
    );
  },
);

DualBufferVideo.displayName = 'DualBufferVideo';

export default DualBufferVideo;
