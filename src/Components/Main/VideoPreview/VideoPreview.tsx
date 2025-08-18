import { motion } from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FaSquarePlus } from 'react-icons/fa6';
import { useVideoEditorStore } from '../../../Store/videoEditorStore';

interface VideoPreviewProps {
  className?: string;
}

interface VideoElement {
  id: string;
  element: HTMLVideoElement;
  isLoaded: boolean;
  isBuffering: boolean;
  lastSeekTime: number | null;
}

// Remotion-inspired media time calculation
const calculateMediaTime = (
  currentFrame: number,
  startFrame: number,
  fps: number,
  playbackRate: number,
) => {
  const framesSinceStart = currentFrame - startFrame;
  const expectedFrame = framesSinceStart * playbackRate;
  return (expectedFrame * (1000 / fps)) / 1000;
};

// Remotion-inspired seeking logic
const shouldSeek = (
  currentTime: number,
  targetTime: number,
  isPlaying: boolean,
) => {
  const seekThreshold = isPlaying ? 0.15 : 0.01;
  const timeDiff = Math.abs(currentTime - targetTime);
  return timeDiff > seekThreshold && timeDiff < 3; // Don't seek if too far apart
};

// Custom hook for video buffering state (inspired by Remotion's useMediaBuffering)
const useVideoBuffering = (
  videoElement: HTMLVideoElement | null,
  pauseWhenBuffering: boolean,
) => {
  const [isBuffering, setIsBuffering] = useState(false);

  useEffect(() => {
    if (!videoElement || !pauseWhenBuffering) return;

    const handleWaiting = () => setIsBuffering(true);
    const handleCanPlay = () => setIsBuffering(false);
    const handleLoadedData = () => setIsBuffering(false);

    // Check initial ready state
    if (videoElement.readyState < videoElement.HAVE_FUTURE_DATA) {
      setIsBuffering(true);
    }

    videoElement.addEventListener('waiting', handleWaiting);
    videoElement.addEventListener('canplay', handleCanPlay);
    videoElement.addEventListener('loadeddata', handleLoadedData);

    return () => {
      videoElement.removeEventListener('waiting', handleWaiting);
      videoElement.removeEventListener('canplay', handleCanPlay);
      videoElement.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [videoElement, pauseWhenBuffering]);

  return isBuffering;
};

// Custom hook for frame-based video rendering (inspired by Remotion's onVideoFrame)
const useVideoFrameCallback = (
  videoElement: HTMLVideoElement | null,
  onFrame: (frame: CanvasImageSource) => void,
  enabled: boolean,
) => {
  useEffect(() => {
    if (!videoElement || !enabled) return;

    let animationId: number;

    const captureFrame = () => {
      if (videoElement.readyState >= 2) {
        onFrame(videoElement);
      }
      animationId = requestAnimationFrame(captureFrame);
    };

    captureFrame();

    return () => cancelAnimationFrame(animationId);
  }, [videoElement, onFrame, enabled]);
};

export const VideoPreview: React.FC<VideoPreviewProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElementsRef = useRef<Map<string, VideoElement>>(new Map());
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [loadingTracks, setLoadingTracks] = useState<Set<string>>(new Set());
  const [bufferingTracks, setBufferingTracks] = useState<Set<string>>(
    new Set(),
  );
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const renderFrameRef = useRef<number>(0);

  const { preview, timeline, tracks, setPreviewScale, playback } =
    useVideoEditorStore();

  // Container size management (unchanged)
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setContainerSize({ width: clientWidth, height: clientHeight });
      }
    };

    const debouncedUpdateSize = () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(updateSize, 16);
    };

    let resizeObserver: ResizeObserver | null = null;
    updateSize();

    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (resizeTimeoutRef.current) {
            clearTimeout(resizeTimeoutRef.current);
          }
          setContainerSize({ width, height });
        }
      });
      resizeObserver.observe(containerRef.current);
    } else {
      window.addEventListener('resize', debouncedUpdateSize);
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        setTimeout(updateSize, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      } else {
        window.removeEventListener('resize', debouncedUpdateSize);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const calculateContentScale = useCallback(() => {
    if (!containerSize.width || !containerSize.height)
      return { scaleX: 1, scaleY: 1 };

    const scaleX = containerSize.width / preview.canvasWidth;
    const scaleY = containerSize.height / preview.canvasHeight;
    return { scaleX, scaleY };
  }, [containerSize, preview.canvasWidth, preview.canvasHeight]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setPreviewScale(
          Math.max(0.1, Math.min(preview.previewScale * zoomFactor, 5)),
        );
      }
    },
    [preview.previewScale, setPreviewScale],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Enhanced video element management with buffering support
  useEffect(() => {
    const videoElements = videoElementsRef.current;
    const currentTrackIds = new Set(tracks.map((track) => track.id));

    // Remove video elements for tracks that no longer exist
    for (const [trackId, videoElement] of videoElements.entries()) {
      if (!currentTrackIds.has(trackId)) {
        videoElement.element.remove();
        videoElements.delete(trackId);
      }
    }

    // Create video elements for new video/image tracks
    tracks.forEach((track) => {
      if (
        (track.type === 'video' || track.type === 'image') &&
        !videoElements.has(track.id) &&
        track.previewUrl
      ) {
        const videoElement = document.createElement('video');
        videoElement.style.display = 'none';
        videoElement.muted = false;
        videoElement.preload = 'metadata';
        videoElement.crossOrigin = 'anonymous';
        videoElement.volume = 0.8;

        // Enhanced loading handlers with buffering state
        const handleLoadedData = () => {
          videoElements.set(track.id, {
            id: track.id,
            element: videoElement,
            isLoaded: true,
            isBuffering: false,
            lastSeekTime: null,
          });
          setLoadingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(track.id);
            return newSet;
          });

          // Seek to avoid black frames, but use better logic
          if (videoElement.duration > 2) {
            videoElement.currentTime = 2;
          }

          console.log(`✅ Video loaded: ${track.name}`);
        };

        const handleError = (e: Event) => {
          console.error(`❌ Failed to load: ${track.name}`);
          setLoadingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(track.id);
            return newSet;
          });
          setBufferingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(track.id);
            return newSet;
          });
        };

        // Add buffering event listeners
        const handleWaiting = () => {
          setBufferingTracks((prev) => new Set(prev).add(track.id));
        };

        const handleCanPlay = () => {
          setBufferingTracks((prev) => {
            const newSet = new Set(prev);
            newSet.delete(track.id);
            return newSet;
          });
        };

        videoElement.addEventListener('loadeddata', handleLoadedData);
        videoElement.addEventListener('error', handleError);
        videoElement.addEventListener('waiting', handleWaiting);
        videoElement.addEventListener('canplay', handleCanPlay);

        setLoadingTracks((prev) => new Set(prev).add(track.id));
        videoElement.src = track.previewUrl;
        document.body.appendChild(videoElement);

        videoElements.set(track.id, {
          id: track.id,
          element: videoElement,
          isLoaded: false,
          isBuffering: false,
          lastSeekTime: null,
        });
      }
    });

    return () => {
      for (const videoElement of videoElements.values()) {
        videoElement.element.remove();
      }
      videoElements.clear();
    };
  }, [tracks]);

  const getActiveTracksAtFrame = useCallback(
    (frame: number) => {
      return tracks.filter(
        (track) =>
          track.visible && frame >= track.startFrame && frame < track.endFrame,
      );
    },
    [tracks],
  );

  // Enhanced video synchronization with Remotion-inspired logic
  useEffect(() => {
    const videoElements = videoElementsRef.current;

    tracks.forEach((track) => {
      const videoElement = videoElements.get(track.id);
      if (videoElement && videoElement.isLoaded) {
        // Use Remotion-inspired media time calculation
        const targetTime = calculateMediaTime(
          timeline.currentFrame,
          track.startFrame,
          timeline.fps,
          playback.playbackRate,
        );

        const isTrackActive =
          track.visible &&
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame;

        if (
          isTrackActive &&
          targetTime >= 0 &&
          targetTime <= track.duration / timeline.fps
        ) {
          // Use improved seeking logic
          if (
            shouldSeek(
              videoElement.element.currentTime,
              targetTime,
              playback.isPlaying,
            )
          ) {
            videoElement.element.currentTime = targetTime;
            videoElement.lastSeekTime = performance.now();
          }
        }
      }
    });
  }, [timeline.currentFrame, timeline.fps, tracks, playback.playbackRate]);

  // Enhanced playback synchronization with buffering awareness
  useEffect(() => {
    const videoElements = videoElementsRef.current;
    const anyBuffering = bufferingTracks.size > 0;

    tracks.forEach((track) => {
      const videoElement = videoElements.get(track.id);
      if (videoElement && videoElement.isLoaded) {
        const isTrackActive =
          track.visible &&
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame;

        // Don't play if any video is buffering (Remotion-inspired behavior)
        if (isTrackActive && playback.isPlaying && !anyBuffering) {
          videoElement.element.play().catch((e) => {
            console.log('Autoplay prevented for', track.name);
          });
        } else {
          videoElement.element.pause();
        }

        // Sync volume and playback rate
        videoElement.element.volume = playback.muted
          ? 0
          : playback.volume * 0.8;
        videoElement.element.muted = playback.muted;
        videoElement.element.playbackRate = playback.playbackRate;
      }
    });
  }, [
    timeline.currentFrame,
    timeline.fps,
    tracks,
    playback.isPlaying,
    playback.volume,
    playback.muted,
    playback.playbackRate,
    bufferingTracks.size,
  ]);

  // Enhanced rendering with frame-based updates
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const canvasWidth = containerSize.width || preview.canvasWidth;
    const canvasHeight = containerSize.height || preview.canvasHeight;

    if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    const { scaleX, scaleY } = calculateContentScale();

    ctx.save();
    ctx.scale(scaleX, scaleY);
    ctx.fillStyle = preview.backgroundColor;
    ctx.fillRect(0, 0, preview.canvasWidth, preview.canvasHeight);

    const activeTracks = getActiveTracksAtFrame(timeline.currentFrame);
    const videoElements = videoElementsRef.current;

    activeTracks.forEach((track) => {
      const progress =
        (timeline.currentFrame - track.startFrame) /
        (track.endFrame - track.startFrame);

      if (track.type === 'video' || track.type === 'image') {
        const videoElement = videoElements.get(track.id);

        if (
          videoElement &&
          videoElement.isLoaded &&
          !videoElement.isBuffering
        ) {
          const video = videoElement.element;
          const width = track.width || preview.canvasWidth;
          const height = track.height || preview.canvasHeight;
          const x = track.offsetX || (preview.canvasWidth - width) / 2;
          const y = track.offsetY || (preview.canvasHeight - height) / 2;

          try {
            ctx.drawImage(video, x, y, width, height);
          } catch (error) {
            console.error(
              `❌ Failed to draw video frame for ${track.name}:`,
              error,
            );
            // Fallback rendering
            ctx.fillStyle = track.color || '#000000';
            ctx.globalAlpha = 0.8;
            ctx.fillRect(x, y, width, height);
          }
        }
      }
    });

    ctx.restore();
  }, [
    containerSize,
    preview,
    timeline.currentFrame,
    calculateContentScale,
    getActiveTracksAtFrame,
  ]);

  // Animation loop for rendering
  useEffect(() => {
    const animate = () => {
      renderFrame();
      renderFrameRef.current = requestAnimationFrame(animate);
    };

    renderFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
      }
    };
  }, [renderFrame]);

  return (
    <div
      ref={containerRef}
      className={`relative bg-gray-900 overflow-hidden ${className || ''}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={{
          transform: `scale(${preview.previewScale})`,
          transformOrigin: 'center',
        }}
      />

      {/* Loading indicator */}
      {loadingTracks.size > 0 && (
        <div className="absolute top-4 right-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded text-sm">
          Loading {loadingTracks.size} track{loadingTracks.size > 1 ? 's' : ''}
          ...
        </div>
      )}

      {/* Buffering indicator */}
      {bufferingTracks.size > 0 && (
        <div className="absolute top-4 left-4 bg-yellow-600 bg-opacity-75 text-white px-3 py-1 rounded text-sm">
          Buffering {bufferingTracks.size} track
          {bufferingTracks.size > 1 ? 's' : ''}...
        </div>
      )}

      {/* Add media button when no tracks */}
      {tracks.length === 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="text-center text-gray-400">
            <FaSquarePlus className="mx-auto mb-4 text-6xl" />
            <p className="text-lg">Drop media files here or click to add</p>
          </div>
        </motion.div>
      )}
    </div>
  );
};
