import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoEditorStore } from '../../../store/videoEditorStore';
import { useVideoBlobManager } from '../../../hooks/useVideoBlobManager';

interface VideoBlobPreviewProps {
  className?: string;
}

/**
 * Optimized Video Preview using Blob caching strategy
 * Replaces the canvas-based rendering with pre-generated video blobs
 */
export const VideoBlobPreview: React.FC<VideoBlobPreviewProps> = ({
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const {
    tracks,
    timeline,
    playback,
    preview,
    textStyle,
    getTextStyleForSubtitle,
    importMediaFromDrop,
  } = useVideoEditorStore();

  // Helper function to get active subtitle tracks at current frame
  const getActiveSubtitleTracks = useCallback(() => {
    const currentFrame = timeline.currentFrame;
    return tracks.filter(
      (track) =>
        track.type === 'subtitle' &&
        track.visible &&
        currentFrame >= track.startFrame &&
        currentFrame <= track.endFrame &&
        track.subtitleText,
    );
  }, [tracks, timeline.currentFrame]);

  // Convert current frame to time
  const currentTime = timeline.currentFrame / timeline.fps;

  // Container size management for proper scaling
  useEffect(() => {
    const updateContainerSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateContainerSize();

    const resizeObserver = new ResizeObserver(updateContainerSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Calculate content scale for proper video sizing
  const calculateContentScale = useCallback(() => {
    const containerAspect = containerSize.width / containerSize.height;
    const videoAspect = preview.canvasWidth / preview.canvasHeight;

    let scaleX = 1;
    let scaleY = 1;
    let actualWidth = preview.canvasWidth;
    let actualHeight = preview.canvasHeight;

    if (containerSize.width > 0 && containerSize.height > 0) {
      if (containerAspect > videoAspect) {
        // Container is wider, scale by height
        scaleY = containerSize.height / preview.canvasHeight;
        scaleX = scaleY;
        actualWidth = preview.canvasWidth * scaleX;
        actualHeight = containerSize.height;
      } else {
        // Container is taller, scale by width
        scaleX = containerSize.width / preview.canvasWidth;
        scaleY = scaleX;
        actualWidth = containerSize.width;
        actualHeight = preview.canvasHeight * scaleY;
      }

      // Apply user preview scale
      scaleX *= preview.previewScale;
      scaleY *= preview.previewScale;
      actualWidth *= preview.previewScale;
      actualHeight *= preview.previewScale;
    }

    return { scaleX, scaleY, actualWidth, actualHeight };
  }, [
    containerSize,
    preview.canvasWidth,
    preview.canvasHeight,
    preview.previewScale,
  ]);

  // Drag and drop functionality
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await importMediaFromDrop(files);
      }
    },
    [importMediaFromDrop],
  );

  // Initialize blob manager with simplified configuration
  const {
    getCurrentBlob,
    getBlobForTime,
    preloadAdjacentSegments,
    cacheSize,
    isGenerating,
  } = useVideoBlobManager(tracks, currentTime, timeline.fps, {
    debounceTimeout: 2000, // Faster response for testing
    segmentDuration: 5, // Shorter segments for better responsiveness
    maxCacheSize: 8, // Smaller cache to avoid memory issues
    preloadRadius: 10, // Smaller preload radius
  });

  // Immediate effect: ensure current segment blob is generated and video src is updated
  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (!video) return;

    // Calculate current segment boundaries
    const segmentDuration = 5;
    const segmentStart =
      Math.floor(currentTime / segmentDuration) * segmentDuration;
    const timeRange = {
      start: segmentStart,
      end: segmentStart + segmentDuration,
    };
    console.log(
      '[BlobPreview] Timeline/frame changed. Current time:',
      currentTime,
      'Segment:',
      timeRange,
    );

    async function ensureCurrentBlob() {
      setError(null);
      setIsLoading(true);
      const currentBlob = getCurrentBlob();
      if (currentBlob) {
        // Use cached blob
        if (video.src !== currentBlob.url) {
          console.log(
            '[BlobPreview] Using cached blob for segment',
            timeRange,
            'URL:',
            currentBlob.url,
          );
          video.src = currentBlob.url;
        }
        // Seek to the correct position within the blob
        const blobOffset = currentTime - currentBlob.timeRange.start;
        const targetTime = Math.max(0, Math.min(blobOffset, 5));
        if (Math.abs(video.currentTime - targetTime) > 0.2) {
          console.log(
            '[BlobPreview] Seeking video to',
            targetTime,
            'within segment',
            timeRange,
          );
          video.currentTime = targetTime;
        }
        setIsLoading(false);
        if (playback.isPlaying && video.paused) {
          console.log('[BlobPreview] Resuming playback after blob ready');
          video.play().catch(() => {
            /* hello */
          });
        }
      } else {
        // Generate blob for current time range immediately (no debounce)
        console.log(
          '[BlobPreview] No cached blob for segment',
          timeRange,
          '- generating new blob',
        );
        try {
          const blobData = await getBlobForTime(timeRange);
          if (blobData && video === videoRef.current && !cancelled) {
            console.log(
              '[BlobPreview] New blob generated for segment',
              timeRange,
              'URL:',
              blobData.url,
            );
            video.src = blobData.url;
            const blobOffset = currentTime - blobData.timeRange.start;
            video.currentTime = Math.max(
              0,
              Math.min(blobOffset, segmentDuration),
            );
            setIsLoading(false);
            if (playback.isPlaying && video.paused) {
              console.log(
                '[BlobPreview] Resuming playback after new blob ready',
              );
              video.play().catch(() => {
                /*hello */
              });
            }
          }
        } catch (err) {
          if (!cancelled) {
            console.log(
              '[BlobPreview] Error generating blob for segment',
              timeRange,
              err,
            );
            setError(
              err instanceof Error ? err.message : 'Failed to load video blob',
            );
            setIsLoading(false);
          }
        }
      }
    }
    ensureCurrentBlob();
    return () => {
      cancelled = true;
    };
  }, [currentTime, getCurrentBlob, getBlobForTime, playback.isPlaying]);

  // Debounced effect: preload adjacent segments
  useEffect(() => {
    if (!isGenerating) {
      const timeoutId = setTimeout(() => {
        preloadAdjacentSegments();
      }, 1000); // Preload after 1 second of inactivity
      return () => clearTimeout(timeoutId);
    }
  }, [isGenerating, preloadAdjacentSegments, currentTime]);

  // Resume playback after loading finishes if playback.isPlaying is true
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!isLoading && playback.isPlaying) {
      video.play().catch(console.error);
    }
  }, [isLoading, playback.isPlaying]);

  // Handle video element events
  const handleVideoLoadStart = useCallback(() => {
    setIsLoading(true);
  }, []);

  const handleVideoCanPlay = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const handleVideoError = useCallback(
    (event: React.SyntheticEvent<HTMLVideoElement>) => {
      const video = event.currentTarget;
      setError(`Video error: ${video.error?.message || 'Unknown error'}`);
      setIsLoading(false);
    },
    [],
  );

  // Handle video seeking completion
  const handleVideoSeeked = useCallback(() => {
    // Video has finished seeking, no additional action needed
    // The main effect handles playback state synchronization
  }, []);

  const { actualWidth, actualHeight } = calculateContentScale();

  return (
    <div
      ref={containerRef}
      className={`relative bg-primary dark:bg-primary-dark overflow-hidden ${className}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        style={{
          width: actualWidth,
          height: actualHeight,
          maxWidth: '100%',
          maxHeight: '100%',
        }}
        onLoadStart={handleVideoLoadStart}
        onCanPlay={handleVideoCanPlay}
        onError={handleVideoError}
        onSeeked={handleVideoSeeked}
        playsInline
        muted={playback.muted}
      />

      {/* Subtitle Overlay - Exact match to original implementation */}
      {(() => {
        const activeSubtitles = getActiveSubtitleTracks();

        if (activeSubtitles.length === 0) {
          return null;
        }

        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              width: actualWidth,
              height: actualHeight,
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="relative w-full h-full"
              style={{
                width: actualWidth,
                height: actualHeight,
              }}
            >
              {activeSubtitles.map((track) => {
                const appliedStyle = getTextStyleForSubtitle(
                  textStyle.activeStyle,
                );

                return (
                  <div
                    key={track.id}
                    className="text-white text-center absolute bottom-5 left-0 right-0"
                    style={{
                      // Match FFmpeg's ASS subtitle styling with applied text styles
                      fontSize: `${Math.max(18, actualHeight * 0.045)}px`, // Slightly larger for better visibility
                      fontFamily: appliedStyle.fontFamily, // Apply selected font family
                      fontWeight: appliedStyle.fontWeight, // Apply selected font weight
                      fontStyle: appliedStyle.fontStyle, // Apply selected font style
                      textTransform: appliedStyle.textTransform, // Apply text transform
                      lineHeight: '1.2', // Slightly more line height for readability
                      textShadow: 'none', // No outline to match FFmpeg output
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap', // Preserve line breaks exactly like FFmpeg
                      color: '#FFFFFF', // Pure white, FFmpeg default
                      backgroundColor: 'rgba(0, 0, 0, 0.5)',
                      padding: '2px 0',
                      margin: '0 auto', // Center horizontally
                      textAlign: 'center', // Center alignment matching Alignment=2
                      position: 'relative',
                      display: 'inline-block', // Make background fit text width
                      maxWidth: '90%', // Prevent overflow
                    }}
                  >
                    {track.subtitleText}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Drag and Drop Overlay */}
      {dragActive && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-30 border-2 border-blue-400 border-dashed flex items-center justify-center z-10">
          <div className="text-white text-center">
            <div className="text-4xl mb-2">📁</div>
            <div className="text-lg font-bold">Drop media files here</div>
            <div className="text-sm opacity-75">
              Support: MP4, MOV, AVI, MP3, WAV, SRT, VTT
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-primary bg-opacity-50 flex items-center justify-center">
          <div className="flex flex-col items-center text-white">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mb-2"></div>
            <span className="text-sm">Generating preview...</span>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {error && (
        <div className="absolute inset-0 bg-red-900 bg-opacity-50 flex items-center justify-center">
          <div className="text-white text-center p-4">
            <div className="text-sm font-bold mb-2">Preview Error</div>
            <div className="text-xs">{error}</div>
            <button
              onClick={() => {
                // Re-trigger the immediate effect to retry
                const video = videoRef.current;
                if (video) {
                  const currentBlob = getCurrentBlob();
                  if (currentBlob) {
                    video.src = currentBlob.url;
                    const blobOffset =
                      currentTime - currentBlob.timeRange.start;
                    video.currentTime = Math.max(0, Math.min(blobOffset, 5));
                  } else {
                    const segmentDuration = 5;
                    const segmentStart =
                      Math.floor(currentTime / segmentDuration) *
                      segmentDuration;
                    const timeRange = {
                      start: segmentStart,
                      end: segmentStart + segmentDuration,
                    };
                    getBlobForTime(timeRange)
                      .then((blobData) => {
                        if (blobData && video === videoRef.current) {
                          video.src = blobData.url;
                          const blobOffset =
                            currentTime - blobData.timeRange.start;
                          video.currentTime = Math.max(
                            0,
                            Math.min(blobOffset, segmentDuration),
                          );
                        }
                      })
                      .catch((err) => {
                        setError(
                          err instanceof Error
                            ? err.message
                            : 'Failed to retry video blob',
                        );
                      });
                  }
                }
              }}
              className="mt-2 px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Debug Info (development only) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="absolute top-2 left-2 bg-primary bg-opacity-75 text-white text-xs p-2 rounded">
          <div>Cache Size: {cacheSize}</div>
          <div>Generating: {isGenerating ? 'Yes' : 'No'}</div>
          <div>Current Time: {currentTime.toFixed(2)}s</div>
          <div>Frame: {timeline.currentFrame}</div>
        </div>
      )}

      {/* Performance Indicator */}
      {isGenerating && (
        <div className="absolute top-2 right-2 bg-yellow-600 text-white text-xs px-2 py-1 rounded">
          Optimizing...
        </div>
      )}
    </div>
  );
};
