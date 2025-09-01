import { useCallback, useRef, useEffect } from 'react';
import { VideoTrack } from '../store/videoEditorStore';

// Blob cache entry interface
interface VideoBlobCache {
  blobId: string;
  timeRange: { start: number; end: number };
  blob: Blob;
  editHash: string;
  createdAt: number;
  accessCount: number;
  url: string; // Object URL for video element
}

// Configuration for blob generation
interface BlobConfig {
  segmentDuration: number; // Duration of each blob segment (seconds)
  debounceTimeout: number; // Debounce time for edit changes (ms)
  maxCacheSize: number; // Maximum cached blobs
  preloadRadius: number; // Seconds to preload around current position
}

// Time range interface
interface TimeRange {
  start: number; // Start time in seconds
  end: number; // End time in seconds
}

const DEFAULT_CONFIG: BlobConfig = {
  segmentDuration: 5, // Shorter 5-second segments for better responsiveness
  debounceTimeout: 2000, // Reduced to 2 seconds for faster response
  maxCacheSize: 12, // Smaller cache (1 minute total)
  preloadRadius: 10, // Smaller preload radius
};

/**
 * Advanced Video Blob Manager Hook
 * Optimizes video preview by generating cached video blobs instead of real-time rendering
 */
export const useVideoBlobManager = (
  tracks: VideoTrack[],
  currentTime: number,
  fps: number,
  config: Partial<BlobConfig> = {},
) => {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const blobCache = useRef<Map<string, VideoBlobCache>>(new Map());
  const generationQueue = useRef<Set<string>>(new Set());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const lastTracksHash = useRef<string>('');
  const lastCurrentTime = useRef<number>(currentTime);

  // Generate a stable hash for tracks to detect actual changes
  const generateTracksHash = useCallback((tracks: VideoTrack[]): string => {
    const sortedTracks = [...tracks]
      .filter((track) => track.type !== 'subtitle') // Exclude subtitles as they don't affect video blobs
      .sort((a, b) => a.id.localeCompare(b.id)); // Stable sort

    const hashData = sortedTracks.map((track) => ({
      id: track.id,
      startFrame: track.startFrame,
      endFrame: track.endFrame,
      visible: track.visible,
      volume: track.volume,
      previewUrl: track.previewUrl,
      offsetX: track.offsetX,
      offsetY: track.offsetY,
      width: track.width,
      height: track.height,
    }));

    return btoa(JSON.stringify(hashData));
  }, []);

  // Generate a hash for the current edit state
  const generateEditHash = useCallback(
    (tracks: VideoTrack[], timeRange: TimeRange): string => {
      const relevantTracks = tracks.filter(
        (track) =>
          track.visible &&
          track.type !== 'subtitle' && // Subtitles don't affect video blobs
          !(
            track.endFrame / fps < timeRange.start ||
            track.startFrame / fps > timeRange.end
          ),
      );

      const hashData = {
        tracks: relevantTracks.map((track) => ({
          id: track.id,
          startFrame: track.startFrame,
          endFrame: track.endFrame,
          visible: track.visible,
          volume: track.volume,
          previewUrl: track.previewUrl,
          offsetX: track.offsetX,
          offsetY: track.offsetY,
          width: track.width,
          height: track.height,
        })),
        timeRange,
      };

      return btoa(JSON.stringify(hashData));
    },
    [fps],
  );

  // Generate time segments for efficient blob caching
  const getTimeSegments = useCallback(
    (currentTime: number): TimeRange[] => {
      const { segmentDuration, preloadRadius } = fullConfig;
      const segments: TimeRange[] = [];

      // Current segment
      const currentSegmentStart =
        Math.floor(currentTime / segmentDuration) * segmentDuration;
      segments.push({
        start: currentSegmentStart,
        end: currentSegmentStart + segmentDuration,
      });

      // Preload segments around current position
      const preloadStart = currentTime - preloadRadius;
      const preloadEnd = currentTime + preloadRadius;

      for (
        let start =
          Math.floor(preloadStart / segmentDuration) * segmentDuration;
        start < preloadEnd;
        start += segmentDuration
      ) {
        if (start !== currentSegmentStart && start >= 0) {
          segments.push({
            start,
            end: start + segmentDuration,
          });
        }
      }

      return segments;
    },
    [fullConfig],
  );

  // Generate video blob for a specific time range
  const generateVideoBlob = useCallback(
    async (timeRange: TimeRange, tracks: VideoTrack[]): Promise<Blob> => {
      // Filter tracks that are active in this time range
      const activeTracks = tracks.filter(
        (track) =>
          track.visible &&
          track.type !== 'subtitle' && // Subtitles are handled as overlays
          !(
            track.endFrame / fps < timeRange.start ||
            track.startFrame / fps > timeRange.end
          ),
      );

      if (activeTracks.length === 0) {
        // Create empty video blob for the time range
        return createEmptyVideoBlob(timeRange.end - timeRange.start);
      }

      try {
        // Strategy 1: Use Canvas Stream + MediaRecorder (Browser-based)
        if (
          typeof MediaRecorder !== 'undefined' &&
          MediaRecorder.isTypeSupported('video/webm')
        ) {
          return await generateBlobFromCanvas(timeRange, activeTracks);
        }

        // Strategy 2: FFmpeg integration (disabled - would need custom implementation)
        // if (window.electronAPI?.generateVideoSegment) {
        //   return await generateBlobFromFFmpeg(timeRange, activeTracks);
        // }

        // Strategy 3: Fallback to frame capture sequence
        return await generateBlobFromFrameSequence(timeRange);
      } catch (error) {
        console.error('Video blob generation failed:', error);
        // Return empty blob as fallback
        return createEmptyVideoBlob(timeRange.end - timeRange.start);
      }
    },
    [fps],
  );

  // Helper function to create a black video blob
  const createBlackVideoBlob = useCallback(
    (duration: number, width: number, height: number): Promise<Blob> => {
      return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(new Blob([], { type: 'video/webm' }));
          return;
        }

        // Create a simple black frame
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            resolve(blob || new Blob([], { type: 'video/webm' }));
          },
          'image/webp',
          0.8,
        );
      });
    },
    [],
  );

  // Generate blob using Canvas Stream + MediaRecorder with actual track rendering
  const generateBlobFromCanvas = useCallback(
    async (timeRange: TimeRange, tracks: VideoTrack[]): Promise<Blob> => {
      return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = 800; // Match your preview dimensions
        canvas.height = 540;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Filter tracks active in this time range
        const activeTracks = tracks.filter(
          (track) =>
            track.visible &&
            track.type !== 'subtitle' &&
            track.previewUrl &&
            !(
              track.endFrame / fps < timeRange.start ||
              track.startFrame / fps > timeRange.end
            ),
        );

        if (activeTracks.length === 0) {
          // Return black video blob for empty segments
          createBlackVideoBlob(
            timeRange.end - timeRange.start,
            canvas.width,
            canvas.height,
          )
            .then(resolve)
            .catch(reject);
          return;
        }

        // Load video elements for active tracks
        const videoElements = new Map<string, HTMLVideoElement>();
        const loadPromises = activeTracks.map((track) => {
          return new Promise<void>((loadResolve) => {
            const video = document.createElement('video');
            video.crossOrigin = 'anonymous';
            video.muted = true;
            video.preload = 'metadata';

            video.onloadeddata = () => {
              videoElements.set(track.id, video);
              loadResolve();
            };

            video.onerror = () => {
              console.warn(`Failed to load track ${track.name}, skipping`);
              loadResolve(); // Don't fail entire generation for one track
            };

            if (track.previewUrl) {
              video.src = track.previewUrl;
            } else {
              loadResolve(); // Skip tracks without preview URL
            }
          });
        });

        Promise.all(loadPromises)
          .then(() => {
            // Check if MediaRecorder is supported
            if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
              reject(new Error('MediaRecorder not supported'));
              return;
            }

            // Create video stream from canvas
            const stream = canvas.captureStream(fps);
            const mediaRecorder = new MediaRecorder(stream, {
              mimeType: 'video/webm;codecs=vp8',
              videoBitsPerSecond: 1500000, // 1.5 Mbps for good balance
            });

            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                chunks.push(event.data);
              }
            };

            mediaRecorder.onstop = () => {
              const blob = new Blob(chunks, { type: 'video/webm' });
              // Cleanup video elements
              videoElements.forEach((video) => {
                video.src = '';
                video.load();
              });
              resolve(blob);
            };

            mediaRecorder.onerror = (error) => {
              // Cleanup video elements
              videoElements.forEach((video) => {
                video.src = '';
                video.load();
              });
              reject(error);
            };

            // Start recording
            mediaRecorder.start();

            // Render frames for the time range
            const duration = timeRange.end - timeRange.start;
            const totalFrames = Math.ceil(duration * fps);
            let currentFrame = 0;

            const renderNextFrame = () => {
              if (currentFrame >= totalFrames) {
                mediaRecorder.stop();
                return;
              }

              const currentTime = timeRange.start + currentFrame / fps;

              // Clear canvas with black background
              ctx.fillStyle = '#000000';
              ctx.fillRect(0, 0, canvas.width, canvas.height);

              // Render each active track
              activeTracks.forEach((track) => {
                const video = videoElements.get(track.id);
                if (!video) return;

                // Calculate track time relative to its start
                const trackTime = currentTime - track.startFrame / fps;

                // Only render if track is active at this time
                if (trackTime >= 0 && trackTime <= track.duration / fps) {
                  try {
                    // Seek video to correct time
                    if (Math.abs(video.currentTime - trackTime) > 0.1) {
                      video.currentTime = Math.max(0, trackTime);
                    }

                    // Calculate dimensions and position
                    const width = track.width || canvas.width;
                    const height = track.height || canvas.height;
                    const x = track.offsetX || (canvas.width - width) / 2;
                    const y = track.offsetY || (canvas.height - height) / 2;

                    // Draw video frame if ready
                    if (video.readyState >= video.HAVE_CURRENT_DATA) {
                      ctx.drawImage(video, x, y, width, height);
                    }
                  } catch (error) {
                    console.warn(`Error rendering track ${track.name}:`, error);
                  }
                }
              });

              currentFrame++;
              setTimeout(renderNextFrame, 1000 / fps); // Maintain fps timing
            };

            renderNextFrame();
          })
          .catch(reject);
      });
    },
    [fps, createBlackVideoBlob],
  );

  // Generate blob using existing FFmpeg integration (disabled)
  // const generateBlobFromFFmpeg = useCallback(
  //   async (timeRange: TimeRange, tracks: VideoTrack[]): Promise<Blob> => {
  //     // This would interface with your existing Electron FFmpeg integration
  //     const segmentData = await window.electronAPI.invoke('generateVideoSegment', {
  //       startTime: timeRange.start,
  //       duration: timeRange.end - timeRange.start,
  //       tracks: tracks.map((track) => ({
  //         id: track.id,
  //         previewUrl: track.previewUrl,
  //         startTime: track.startFrame / fps,
  //         endTime: track.endFrame / fps,
  //         volume: track.volume,
  //       })),
  //       outputFormat: 'mp4',
  //       quality: 'medium',
  //     });
  //     return new Blob([segmentData], { type: 'video/mp4' });
  //   },
  //   [fps],
  // );

  // Generate blob from frame sequence (fallback) - use createBlackVideoBlob
  const generateBlobFromFrameSequence = useCallback(
    async (timeRange: TimeRange): Promise<Blob> => {
      // Use the black video blob helper as fallback
      const duration = timeRange.end - timeRange.start;
      return createBlackVideoBlob(duration, 800, 540);
    },
    [createBlackVideoBlob],
  );

  // Create empty video blob for timeline gaps - use createBlackVideoBlob
  const createEmptyVideoBlob = useCallback(
    (duration: number): Promise<Blob> => {
      return createBlackVideoBlob(duration, 800, 540);
    },
    [createBlackVideoBlob],
  );

  // Get or generate blob for time range (stable function)
  const getBlobForTime = useCallback(
    async (
      timeRange: TimeRange,
      currentTracks: VideoTrack[],
    ): Promise<VideoBlobCache | null> => {
      const editHash = generateEditHash(currentTracks, timeRange);
      const blobId = `${timeRange.start}-${timeRange.end}-${editHash}`;

      // Check cache first
      const cached = blobCache.current.get(blobId);
      if (cached) {
        cached.accessCount++;
        return cached;
      }

      // Prevent duplicate generation
      if (generationQueue.current.has(blobId)) {
        return null;
      }

      generationQueue.current.add(blobId);

      try {
        const blob = await generateVideoBlob(timeRange, currentTracks);
        const url = URL.createObjectURL(blob);

        const cacheEntry: VideoBlobCache = {
          blobId,
          timeRange,
          blob,
          editHash,
          createdAt: Date.now(),
          accessCount: 1,
          url,
        };

        blobCache.current.set(blobId, cacheEntry);
        return cacheEntry;
      } finally {
        generationQueue.current.delete(blobId);
      }
    },
    [generateEditHash, generateVideoBlob],
  ); // Removed tracks from dependencies

  // Invalidate blobs when tracks change
  const invalidateBlobs = useCallback((affectedRange?: TimeRange) => {
    const toDelete: string[] = [];

    blobCache.current.forEach((cache, blobId) => {
      if (!affectedRange) {
        // Invalidate all
        toDelete.push(blobId);
      } else {
        // Check if ranges overlap
        const rangesOverlap = !(
          cache.timeRange.end < affectedRange.start ||
          cache.timeRange.start > affectedRange.end
        );

        if (rangesOverlap) {
          toDelete.push(blobId);
        }
      }
    });

    // Clean up URLs and remove from cache
    toDelete.forEach((blobId) => {
      const cache = blobCache.current.get(blobId);
      if (cache) {
        URL.revokeObjectURL(cache.url);
        blobCache.current.delete(blobId);
      }
    });
  }, []);

  // Debounced blob generation on track changes (stable function)
  const scheduleGeneration = useCallback(
    (
      currentTracks: VideoTrack[],
      currentTimeValue: number,
      forceInvalidate = false,
    ) => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        if (forceInvalidate) {
          // Invalidate potentially affected blobs
          invalidateBlobs();
        }

        // Trigger generation for current segments
        const segments = getTimeSegments(currentTimeValue);
        segments.forEach((segment) => {
          getBlobForTime(segment, currentTracks).catch(console.error);
        });
      }, fullConfig.debounceTimeout);
    },
    [
      invalidateBlobs,
      getTimeSegments,
      getBlobForTime,
      fullConfig.debounceTimeout,
    ],
  );

  // Cache management
  const evictLeastUsed = useCallback(() => {
    if (blobCache.current.size <= fullConfig.maxCacheSize) return;

    const caches = Array.from(blobCache.current.values());
    caches.sort(
      (a, b) => a.accessCount - b.accessCount || a.createdAt - b.createdAt,
    );

    const toEvict = caches.slice(0, caches.length - fullConfig.maxCacheSize);
    toEvict.forEach((cache) => {
      URL.revokeObjectURL(cache.url);
      blobCache.current.delete(cache.blobId);
    });
  }, [fullConfig.maxCacheSize]);

  // Effect to handle track changes with proper change detection
  useEffect(() => {
    const currentTracksHash = generateTracksHash(tracks);
    const currentTimeChanged =
      Math.abs(lastCurrentTime.current - currentTime) > 1; // Only trigger on significant time changes (>1 second)
    const tracksChanged = lastTracksHash.current !== currentTracksHash;

    // Update refs
    lastCurrentTime.current = currentTime;

    if (tracksChanged) {
      console.log('🔄 Tracks changed, scheduling blob regeneration');
      lastTracksHash.current = currentTracksHash;
      scheduleGeneration(tracks, currentTime, true); // Force invalidate on track changes
    } else if (currentTimeChanged) {
      // Only schedule generation for new time segments, don't invalidate existing blobs
      scheduleGeneration(tracks, currentTime, false);
    }

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [tracks, currentTime, generateTracksHash, scheduleGeneration]);

  // Effect to manage cache size
  useEffect(() => {
    evictLeastUsed();
  }, [blobCache.current.size, evictLeastUsed]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      blobCache.current.forEach((cache) => {
        URL.revokeObjectURL(cache.url);
      });
      blobCache.current.clear();
    };
  }, []);

  // Get current blob for playback
  const getCurrentBlob = useCallback((): VideoBlobCache | null => {
    const currentSegment = getTimeSegments(currentTime)[0];
    if (!currentSegment) return null;

    const editHash = generateEditHash(tracks, currentSegment);
    const blobId = `${currentSegment.start}-${currentSegment.end}-${editHash}`;

    return blobCache.current.get(blobId) || null;
  }, [currentTime, tracks, getTimeSegments, generateEditHash]);

  // Preload adjacent segments (stable function)
  const preloadAdjacentSegments = useCallback(() => {
    // Only preload if not currently generating to avoid overwhelming the system
    if (generationQueue.current.size > 2) {
      return; // Skip preloading if already busy
    }

    const segments = getTimeSegments(currentTime);
    segments.slice(1).forEach((segment) => {
      getBlobForTime(segment, tracks).catch(console.error);
    });
  }, [currentTime, getTimeSegments, getBlobForTime, tracks]);

  // Wrapper function for easier component usage
  const getBlobForTimeWrapper = useCallback(
    async (timeRange: TimeRange): Promise<VideoBlobCache | null> => {
      return getBlobForTime(timeRange, tracks);
    },
    [getBlobForTime, tracks],
  );

  return {
    // Core functions
    getCurrentBlob,
    getBlobForTime: getBlobForTimeWrapper,
    invalidateBlobs,
    preloadAdjacentSegments,

    // State
    cacheSize: blobCache.current.size,
    isGenerating: generationQueue.current.size > 0,

    // Configuration
    config: fullConfig,
  };
};
