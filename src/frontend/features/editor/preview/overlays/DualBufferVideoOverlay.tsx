/**
 * Dual-Buffer Video System for Seamless Cross-Clip Transitions
 *
 * This system maintains TWO video elements:
 * 1. Active video - currently playing/visible
 * 2. Preload video - loading the next clip in background
 *
 * When transitioning between clips:
 * - The preload video is already buffered and ready
 * - We instantly swap which video is visible
 * - The old active video becomes the new preload buffer
 *
 * This eliminates black frames during cross-clip transitions.
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
import {
  useBlackFrameDetection,
  usePlaybackStateTracking,
  useSegmentTransitionTracking,
  useVideoElementTracking,
} from '../hooks/useVideoPlaybackDiagnostics';

// =============================================================================
// TYPES
// =============================================================================

export interface DualBufferVideoRef {
  /** Get the currently active video element */
  getActiveVideo: () => HTMLVideoElement | null;
  /** Get the preload video element */
  getPreloadVideo: () => HTMLVideoElement | null;
  /** Force swap the active and preload videos */
  swapVideos: () => void;
  /** Preload a specific source URL */
  preloadSource: (url: string, startTime?: number) => Promise<void>;
  /** Check if a source is preloaded and ready */
  isSourceReady: (url: string) => boolean;
  /** Get current buffer status */
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
  /** Current active video track */
  activeTrack: VideoTrack | undefined;
  /** All tracks for preload prediction */
  allTracks: VideoTrack[];
  /** Current frame for timeline sync */
  currentFrame: number;
  /** Frames per second */
  fps: number;
  /** Is timeline playing */
  isPlaying: boolean;
  /** Is audio muted */
  isMuted: boolean;
  /** Volume level */
  volume: number;
  /** Playback rate */
  playbackRate: number;
  /** Callback when metadata loads */
  onLoadedMetadata?: () => void;
  /** Callback when active video changes */
  onActiveVideoChange?: (video: HTMLVideoElement) => void;
  /** Video dimensions */
  width: number;
  height: number;
  /** CSS class */
  className?: string;
  /** Object fit style */
  objectFit?: 'contain' | 'cover' | 'fill';
}

// Preload threshold in frames (start preloading when this close to clip end)
const PRELOAD_THRESHOLD_FRAMES = 30; // ~1 second at 30fps

// Minimum ready state to consider video "ready"
const MIN_READY_STATE = 3; // HAVE_FUTURE_DATA

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get video source URL from track
 */
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

/**
 * Find the next video track that will play after the current one
 */
function findNextVideoTrack(
  allTracks: VideoTrack[],
  currentFrame: number,
  currentTrackId: string | undefined,
): VideoTrack | undefined {
  // Get all video tracks sorted by start frame
  const videoTracks = allTracks
    .filter((t) => t.type === 'video' && t.visible && t.previewUrl)
    .sort((a, b) => a.startFrame - b.startFrame);

  // Find the next track that starts after current position
  // or the track that contains frames after the current track ends
  const currentTrack = videoTracks.find((t) => t.id === currentTrackId);

  if (!currentTrack) {
    // No current track, find the first one that covers current frame or comes after
    return videoTracks.find((t) => t.endFrame > currentFrame);
  }

  // Find tracks that start after current track ends
  const nextTracks = videoTracks.filter(
    (t) => t.id !== currentTrackId && t.startFrame >= currentTrack.endFrame - 1,
  );

  if (nextTracks.length > 0) {
    return nextTracks[0];
  }

  return undefined;
}

/**
 * Calculate the start time within a video file for a given frame
 */
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
    // Refs for both video elements
    const videoARef = useRef<HTMLVideoElement>(null);
    const videoBRef = useRef<HTMLVideoElement>(null);

    // Track which video is currently active (A or B)
    const [activeVideoSlot, setActiveVideoSlot] = useState<'A' | 'B'>('A');

    // Track sources for each video slot
    const [videoASource, setVideoASource] = useState<string | null>(null);
    const [videoBSource, setVideoBSource] = useState<string | null>(null);

    // Track ready state for each video
    const [videoAReady, setVideoAReady] = useState(false);
    const [videoBReady, setVideoBReady] = useState(false);

    // Track if we're in the middle of a swap
    const swapInProgressRef = useRef(false);

    // Track the last preloaded source to avoid duplicate preloads
    const lastPreloadedSourceRef = useRef<string | null>(null);

    // Track metadata loaded state per source URL
    const metadataLoadedRef = useRef<Set<string>>(new Set());

    // Get current source URL
    const currentSourceUrl = useMemo(
      () => getVideoSource(activeTrack),
      [activeTrack?.previewUrl, activeTrack?.source],
    );

    // Get active and preload video refs based on current slot
    const getActiveVideo = useCallback(() => {
      return activeVideoSlot === 'A' ? videoARef.current : videoBRef.current;
    }, [activeVideoSlot]);

    // Create a dynamic ref object for active video (for diagnostics hooks)
    // This ref object always points to the currently active video element
    const activeVideoRef = useMemo(() => {
      return {
        get current() {
          return activeVideoSlot === 'A'
            ? videoARef.current
            : videoBRef.current;
        },
      } as React.RefObject<HTMLVideoElement>;
    }, [activeVideoSlot]);

    const getPreloadVideo = useCallback(() => {
      return activeVideoSlot === 'A' ? videoBRef.current : videoARef.current;
    }, [activeVideoSlot]);

    const getActiveSource = useCallback(() => {
      return activeVideoSlot === 'A' ? videoASource : videoBSource;
    }, [activeVideoSlot, videoASource, videoBSource]);

    const getPreloadSource = useCallback(() => {
      return activeVideoSlot === 'A' ? videoBSource : videoASource;
    }, [activeVideoSlot, videoASource, videoBSource]);

    const isActiveReady = useCallback(() => {
      return activeVideoSlot === 'A' ? videoAReady : videoBReady;
    }, [activeVideoSlot, videoAReady, videoBReady]);

    const isPreloadReady = useCallback(() => {
      return activeVideoSlot === 'A' ? videoBReady : videoAReady;
    }, [activeVideoSlot, videoAReady, videoBReady]);

    // Swap active and preload videos
    const swapVideos = useCallback(() => {
      if (swapInProgressRef.current) return;
      swapInProgressRef.current = true;

      console.log('[DualBuffer] Swapping videos', {
        from: activeVideoSlot,
        to: activeVideoSlot === 'A' ? 'B' : 'A',
      });

      setActiveVideoSlot((prev) => (prev === 'A' ? 'B' : 'A'));

      // Reset swap flag after a short delay
      requestAnimationFrame(() => {
        swapInProgressRef.current = false;
      });
    }, [activeVideoSlot]);

    // Preload a source into the preload video
    const preloadSource = useCallback(
      async (url: string, startTime = 0): Promise<void> => {
        const preloadVideo = getPreloadVideo();
        if (!preloadVideo) return;

        // Don't preload if already preloading this source
        if (lastPreloadedSourceRef.current === url) {
          console.log(
            '[DualBuffer] Source already preloading:',
            url.substring(0, 50),
          );
          return;
        }

        console.log('[DualBuffer] Preloading source:', {
          url: url.substring(0, 50),
          startTime,
          slot: activeVideoSlot === 'A' ? 'B' : 'A',
        });

        lastPreloadedSourceRef.current = url;

        // Update the preload slot's source state
        if (activeVideoSlot === 'A') {
          setVideoBSource(url);
          setVideoBReady(false);
        } else {
          setVideoASource(url);
          setVideoAReady(false);
        }

        // Set source and preload
        preloadVideo.src = url;
        preloadVideo.currentTime = startTime;
        preloadVideo.preload = 'auto';

        // Return a promise that resolves when ready
        return new Promise((resolve) => {
          const checkReady = () => {
            if (preloadVideo.readyState >= MIN_READY_STATE) {
              console.log('[DualBuffer] Preload ready:', url.substring(0, 50));
              if (activeVideoSlot === 'A') {
                setVideoBReady(true);
              } else {
                setVideoAReady(true);
              }
              resolve();
            } else {
              // Keep checking
              requestAnimationFrame(checkReady);
            }
          };

          // Start checking after a short delay
          preloadVideo.load();
          setTimeout(checkReady, 50);
        });
      },
      [activeVideoSlot, getPreloadVideo],
    );

    // Check if a source is ready in either buffer
    const isSourceReady = useCallback(
      (url: string): boolean => {
        if (videoASource === url && videoAReady) return true;
        if (videoBSource === url && videoBReady) return true;
        return false;
      },
      [videoASource, videoBSource, videoAReady, videoBReady],
    );

    // Get buffer status
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

    // Expose methods via ref
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

    // Handle source changes - determine if we need to swap or load
    useEffect(() => {
      if (!currentSourceUrl) return;

      const activeSource = getActiveSource();
      const preloadSource = getPreloadSource();
      const activeVideo = getActiveVideo();
      const preloadVideo = getPreloadVideo();

      console.log('[DualBuffer] Source change check:', {
        currentSourceUrl: currentSourceUrl.substring(0, 50),
        activeSource: activeSource?.substring(0, 50),
        preloadSource: preloadSource?.substring(0, 50),
        activeReady: isActiveReady(),
        preloadReady: isPreloadReady(),
      });

      // If current source matches active, no action needed
      if (activeSource === currentSourceUrl) {
        return;
      }

      // If current source matches preload and it's ready, swap!
      if (preloadSource === currentSourceUrl && isPreloadReady()) {
        console.log('[DualBuffer] Swapping to preloaded source');
        swapVideos();

        // Notify about active video change
        if (onActiveVideoChange && preloadVideo) {
          onActiveVideoChange(preloadVideo);
        }
        return;
      }

      // Otherwise, we need to load into active (this may cause a brief flash)
      // This happens when preload prediction was wrong or user seeked
      console.log(
        '[DualBuffer] Loading source directly into active (may flash)',
      );

      if (activeVideoSlot === 'A') {
        setVideoASource(currentSourceUrl);
        setVideoAReady(false);
      } else {
        setVideoBSource(currentSourceUrl);
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
    ]);

    // Preload next clip when approaching end of current clip
    useEffect(() => {
      if (!activeTrack || !isPlaying) return;

      const framesUntilEnd = activeTrack.endFrame - currentFrame;

      // Check if we should preload the next clip
      if (framesUntilEnd <= PRELOAD_THRESHOLD_FRAMES && framesUntilEnd > 0) {
        const nextTrack = findNextVideoTrack(
          allTracks,
          currentFrame,
          activeTrack.id,
        );

        if (nextTrack) {
          const nextSourceUrl = getVideoSource(nextTrack);
          const preloadSourceUrl = getPreloadSource();

          // Only preload if it's a different source and not already preloading
          if (nextSourceUrl && nextSourceUrl !== preloadSourceUrl) {
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

    // Sync playback state to active video
    useEffect(() => {
      const activeVideo = getActiveVideo();
      if (!activeVideo) return;

      try {
        if (isPlaying) {
          if (activeVideo.paused && activeVideo.readyState >= MIN_READY_STATE) {
            activeVideo.play().catch(console.warn);
          }
        } else {
          if (!activeVideo.paused) {
            activeVideo.pause();
          }
        }

        activeVideo.muted = isMuted;
        activeVideo.volume = Math.min(volume, 1);
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
      activeVideoSlot,
    ]);

    // Handle metadata loaded for video A
    const handleVideoAMetadata = useCallback(() => {
      const video = videoARef.current;
      if (!video || !videoASource) return;

      // Check if already processed
      if (metadataLoadedRef.current.has(videoASource)) {
        console.log(
          '[DualBuffer] Metadata already loaded for A:',
          videoASource.substring(0, 50),
        );
        return;
      }

      metadataLoadedRef.current.add(videoASource);
      console.log('[DualBuffer] Metadata loaded for A:', {
        source: videoASource.substring(0, 50),
        duration: video.duration,
        dimensions: `${video.videoWidth}x${video.videoHeight}`,
      });

      if (activeVideoSlot === 'A' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [videoASource, activeVideoSlot, onLoadedMetadata]);

    // Handle metadata loaded for video B
    const handleVideoBMetadata = useCallback(() => {
      const video = videoBRef.current;
      if (!video || !videoBSource) return;

      // Check if already processed
      if (metadataLoadedRef.current.has(videoBSource)) {
        console.log(
          '[DualBuffer] Metadata already loaded for B:',
          videoBSource.substring(0, 50),
        );
        return;
      }

      metadataLoadedRef.current.add(videoBSource);
      console.log('[DualBuffer] Metadata loaded for B:', {
        source: videoBSource.substring(0, 50),
        duration: video.duration,
        dimensions: `${video.videoWidth}x${video.videoHeight}`,
      });

      if (activeVideoSlot === 'B' && onLoadedMetadata) {
        onLoadedMetadata();
      }
    }, [videoBSource, activeVideoSlot, onLoadedMetadata]);

    // Handle canplay for video A
    const handleVideoACanPlay = useCallback(() => {
      console.log('[DualBuffer] Video A can play');
      setVideoAReady(true);

      if (activeVideoSlot === 'A' && onActiveVideoChange && videoARef.current) {
        onActiveVideoChange(videoARef.current);
      }
    }, [activeVideoSlot, onActiveVideoChange]);

    // Handle canplay for video B
    const handleVideoBCanPlay = useCallback(() => {
      console.log('[DualBuffer] Video B can play');
      setVideoBReady(true);

      if (activeVideoSlot === 'B' && onActiveVideoChange && videoBRef.current) {
        onActiveVideoChange(videoBRef.current);
      }
    }, [activeVideoSlot, onActiveVideoChange]);

    // =============================================================================
    // VIDEO PLAYBACK DIAGNOSTICS INTEGRATION
    // =============================================================================

    // Track video element A events
    useVideoElementTracking(
      videoARef,
      activeTrack?.id,
      videoASource || undefined,
      'A',
    );

    // Track video element B events
    useVideoElementTracking(
      videoBRef,
      activeTrack?.id,
      videoBSource || undefined,
      'B',
    );

    // Track segment transitions
    useSegmentTransitionTracking(
      activeTrack?.id,
      currentSourceUrl,
      currentFrame,
      isPlaying,
      activeVideoRef as React.RefObject<HTMLVideoElement>,
      fps,
    );

    // Track playback state for active video
    usePlaybackStateTracking(
      isPlaying,
      currentFrame,
      activeTrack?.id,
      currentSourceUrl,
      activeVideoRef as React.RefObject<HTMLVideoElement>,
    );

    // Detect black frames on active video
    useBlackFrameDetection(
      activeVideoRef as React.RefObject<HTMLVideoElement>,
      isPlaying,
      currentFrame,
      fps,
    );

    // =============================================================================
    // RENDER
    // =============================================================================

    // Render both videos, only active one is visible
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
        {/* Video A */}
        <video
          ref={videoARef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            opacity: activeVideoSlot === 'A' ? 1 : 0,
            pointerEvents: activeVideoSlot === 'A' ? 'auto' : 'none',
            zIndex: activeVideoSlot === 'A' ? 1 : 0,
          }}
          src={videoASource || undefined}
          playsInline
          controls={false}
          preload="auto"
          onLoadedMetadata={handleVideoAMetadata}
          onCanPlay={handleVideoACanPlay}
        />

        {/* Video B */}
        <video
          ref={videoBRef}
          className="absolute inset-0 w-full h-full"
          style={{
            objectFit,
            opacity: activeVideoSlot === 'B' ? 1 : 0,
            pointerEvents: activeVideoSlot === 'B' ? 'auto' : 'none',
            zIndex: activeVideoSlot === 'B' ? 1 : 0,
          }}
          src={videoBSource || undefined}
          playsInline
          controls={false}
          preload="auto"
          onLoadedMetadata={handleVideoBMetadata}
          onCanPlay={handleVideoBCanPlay}
        />
      </div>
    );
  },
);

DualBufferVideo.displayName = 'DualBufferVideo';

export default DualBufferVideo;
