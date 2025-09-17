import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';
import VideoThumbnailGenerator, {
  VideoThumbnail,
} from '../../../Utils/VideoThumbnailGenerator';

interface VideoThumbnailStripProps {
  track: VideoTrack;
  frameWidth: number;
  width: number;
  height: number;
  scrollX: number;
  zoomLevel: number;
}

interface ThumbnailStripState {
  thumbnails: VideoThumbnail[];
  isLoading: boolean;
  error: string | null;
  lastGeneratedZoom: number;
  progress?: {
    current: number;
    total: number;
    stage: string;
  };
}

export const VideoThumbnailStrip: React.FC<VideoThumbnailStripProps> =
  React.memo(
    ({ track, frameWidth, width, height, scrollX, zoomLevel }) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const [state, setState] = useState<ThumbnailStripState>({
        thumbnails: [],
        isLoading: false,
        error: null,
        lastGeneratedZoom: 0,
      });

      // Get FPS from timeline state
      const fps = useVideoEditorStore((state) => state.timeline.fps);

      // Calculate duration in seconds
      const durationSeconds = useMemo(() => {
        const durationFrames = track.endFrame - track.startFrame;
        return durationFrames / fps;
      }, [track.startFrame, track.endFrame, fps]);

      // Calculate optimal thumbnail parameters based on zoom (with stable cache key)
      const thumbnailParams = useMemo(() => {
        // Round zoomLevel to reduce cache fragmentation
        const roundedZoom = Math.round(zoomLevel * 10) / 10;

        const { intervalSeconds, estimatedCount } =
          VideoThumbnailGenerator.calculateOptimalThumbnailCount(
            durationSeconds,
            frameWidth,
            window.innerWidth,
            roundedZoom,
          );

        return {
          intervalSeconds,
          estimatedCount,
          thumbnailWidth: Math.min(
            160,
            Math.max(80, frameWidth * intervalSeconds * 30),
          ), // Responsive width
          thumbnailHeight: Math.floor(
            (Math.min(160, Math.max(80, frameWidth * intervalSeconds * 30)) *
              9) /
              16,
          ), // 16:9 aspect ratio
          roundedZoom,
        };
      }, [durationSeconds, frameWidth, zoomLevel]);

      // Generate thumbnails when track or zoom changes significantly
      const generateThumbnails = useCallback(async () => {
        if (!track.source || track.type !== 'video') return;

        // Determine the actual video file path to use
        // Priority: tempFilePath -> source (for FFmpeg processing)
        const videoPath = track.tempFilePath || track.source;

        // Handle blob URLs (won't work with FFmpeg, but avoid errors)
        if (videoPath.startsWith('blob:')) {
          console.warn('Cannot generate thumbnails from blob URL:', track.name);
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Blob URLs not supported for thumbnails',
          }));
          return;
        }

        // Create options for cache key generation
        const options = {
          videoPath,
          duration: durationSeconds,
          fps,
          intervalSeconds: thumbnailParams.intervalSeconds,
          width: thumbnailParams.thumbnailWidth,
          height: thumbnailParams.thumbnailHeight,
          sourceStartTime: track.sourceStartTime || 0,
        };

        // Check if we already have cached thumbnails for these exact parameters
        const cachedThumbnails =
          VideoThumbnailGenerator.getCachedThumbnails(options);
        if (cachedThumbnails && cachedThumbnails.length > 0) {
          console.log('📸 Using cached thumbnails for', track.name);
          setState((prev) => ({
            ...prev,
            thumbnails: cachedThumbnails,
            isLoading: false,
            error: null,
            lastGeneratedZoom: thumbnailParams.roundedZoom,
          }));
          return;
        }

        // Check if we're already loading this exact configuration
        if (state.isLoading) {
          console.log('📸 Already generating thumbnails, skipping...');
          return;
        }

        console.log(
          '📸 Generating new thumbnails for',
          track.name,
          'at zoom',
          thumbnailParams.roundedZoom,
        );

        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
          progress: {
            current: 0,
            total: Math.ceil(durationSeconds / thumbnailParams.intervalSeconds),
            stage: 'Initializing FFmpeg...',
          },
        }));

        try {
          // Update progress for FFmpeg execution
          setState((prev) => ({
            ...prev,
            progress: prev.progress
              ? {
                  ...prev.progress,
                  stage: 'Extracting frames...',
                }
              : undefined,
          }));

          const result = await VideoThumbnailGenerator.generateThumbnails({
            videoPath,
            duration: durationSeconds,
            fps,
            intervalSeconds: thumbnailParams.intervalSeconds,
            width: thumbnailParams.thumbnailWidth,
            height: thumbnailParams.thumbnailHeight,
            sourceStartTime: track.sourceStartTime || 0, // Start from track's source position
          });

          if (result.success) {
            setState((prev) => ({
              ...prev,
              thumbnails: result.thumbnails,
              isLoading: false,
              lastGeneratedZoom: zoomLevel,
              progress: undefined,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: result.error || 'Failed to generate thumbnails',
              progress: undefined,
            }));
          }
        } catch (error) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
            progress: undefined,
          }));
        }
      }, [
        track.source,
        track.tempFilePath,
        track.sourceStartTime,
        track.type,
        track.name,
        durationSeconds,
        thumbnailParams.intervalSeconds,
        thumbnailParams.roundedZoom,
        fps,
        // Note: Removed state dependencies to prevent circular updates
      ]);

      // Generate thumbnails on mount and when dependencies change
      useEffect(() => {
        generateThumbnails();
      }, [generateThumbnails]);

      // Calculate visible thumbnails based on viewport
      const visibleThumbnails = useMemo(() => {
        if (state.thumbnails.length === 0) return [];

        const viewportStart = scrollX;
        const viewportEnd = scrollX + window.innerWidth;
        const bufferSize = window.innerWidth * 0.5; // 50% buffer

        return state.thumbnails.filter((thumbnail) => {
          const thumbnailX = thumbnail.timestamp * frameWidth * 30; // Convert timestamp to pixels
          const thumbnailEnd = thumbnailX + thumbnailParams.thumbnailWidth;

          return (
            thumbnailEnd >= viewportStart - bufferSize &&
            thumbnailX <= viewportEnd + bufferSize
          );
        });
      }, [
        state.thumbnails,
        scrollX,
        frameWidth,
        thumbnailParams.thumbnailWidth,
      ]);

      // Render loading state
      if (state.isLoading) {
        const progressPercent = state.progress
          ? Math.round((state.progress.current / state.progress.total) * 100)
          : 0;

        return (
          <div
            className="absolute top-0 left-0 flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-sm border border-gray-700/50"
            style={{ width, height }}
          >
            <div className="flex items-center space-x-2 mb-1">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400"></div>
              <span className="text-blue-400 text-xs font-medium">
                {state.progress
                  ? `${progressPercent}%`
                  : 'Generating thumbnails...'}
              </span>
            </div>
            <div className="text-gray-400 text-xs text-center">
              {state.progress
                ? `${state.progress.stage} (${state.progress.current}/${state.progress.total})`
                : 'Using FFmpeg to extract frames'}
            </div>
            {state.progress && (
              <div className="mt-2 w-16 h-1 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-400 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            )}
          </div>
        );
      }

      // Render error state
      if (state.error) {
        const isRestartRequired = state.error.includes('requires app restart');
        return (
          <div
            className="absolute top-0 left-0 flex flex-col items-center justify-center bg-red-900/70 text-xs text-red-200 p-2"
            style={{ width, height }}
          >
            <div className="flex items-center space-x-2 mb-1">
              <div className="w-3 h-3 rounded-full bg-red-400"></div>
              <span className="font-medium">
                {isRestartRequired ? 'Restart Required' : 'Generation Failed'}
              </span>
            </div>
            <div className="text-center text-gray-300 leading-tight">
              {isRestartRequired
                ? 'Restart app to enable FFmpeg thumbnails'
                : 'Using video preview instead'}
            </div>
          </div>
        );
      }

      // Render thumbnail strip
      return (
        <div
          ref={containerRef}
          className="absolute top-0 left-0 overflow-hidden"
          style={{ width, height }}
        >
          {/* Background gradient to ensure visibility */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20"
            style={{ zIndex: 1 }}
          />

          {/* Thumbnail container */}
          <div className="relative w-full h-full" style={{ zIndex: 0 }}>
            {visibleThumbnails.map((thumbnail, index) => {
              const thumbnailX = thumbnail.timestamp * frameWidth * 30;
              const relativeX = thumbnailX - scrollX;

              return (
                <ThumbnailImage
                  key={thumbnail.id}
                  thumbnail={thumbnail}
                  x={relativeX}
                  width={thumbnailParams.thumbnailWidth}
                  height={height}
                  index={index}
                />
              );
            })}
          </div>

          {/* Track name overlay */}
          <div
            className="absolute bottom-1 left-2 text-white text-xs font-medium pointer-events-none"
            style={{
              zIndex: 2,
              textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
            }}
          >
            {track.name}
          </div>
        </div>
      );
    },
    (prevProps, nextProps) => {
      return (
        prevProps.track.id === nextProps.track.id &&
        prevProps.track.source === nextProps.track.source &&
        prevProps.track.startFrame === nextProps.track.startFrame &&
        prevProps.track.endFrame === nextProps.track.endFrame &&
        prevProps.frameWidth === nextProps.frameWidth &&
        prevProps.width === nextProps.width &&
        prevProps.height === nextProps.height &&
        Math.abs(prevProps.scrollX - nextProps.scrollX) < 50 && // Only re-render for significant scroll changes
        Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) < 0.1 // Only re-render for significant zoom changes
      );
    },
  );

interface ThumbnailImageProps {
  thumbnail: VideoThumbnail;
  x: number;
  width: number;
  height: number;
  index: number;
}

const ThumbnailImage: React.FC<ThumbnailImageProps> = React.memo(
  ({ thumbnail, x, width, height, index }) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef<HTMLImageElement>(null);

    const handleLoad = useCallback(() => {
      setIsLoaded(true);
      setHasError(false);
    }, []);

    const handleError = useCallback(() => {
      setHasError(true);
      setIsLoaded(false);
    }, []);

    // Use intersection observer for lazy loading
    useEffect(() => {
      const img = imgRef.current;
      if (!img) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting && !img.src) {
              img.src = thumbnail.url;
            }
          });
        },
        {
          rootMargin: '50px',
          threshold: 0.1,
        },
      );

      observer.observe(img);

      return () => {
        observer.disconnect();
      };
    }, [thumbnail.url]);

    return (
      <div
        className="absolute top-0"
        style={{
          left: x,
          width,
          height,
          transform: `translateX(${x < 0 ? Math.abs(x) : 0}px)`, // Clip left edge if necessary
        }}
      >
        {hasError ? (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <span className="text-xs text-gray-400">✕</span>
          </div>
        ) : (
          <img
            ref={imgRef}
            onLoad={handleLoad}
            onError={handleError}
            alt={`Thumbnail at ${thumbnail.timestamp}s`}
            className={`w-full h-full object-cover transition-opacity duration-200 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              filter: 'brightness(0.9)', // Slightly darken for better text visibility
            }}
          />
        )}

        {/* Loading placeholder */}
        {!isLoaded && !hasError && (
          <div className="absolute inset-0 bg-gray-800 animate-pulse">
            <div className="w-full h-full bg-gradient-to-r from-gray-700 via-gray-600 to-gray-700 bg-[length:200%_100%] animate-shimmer"></div>
          </div>
        )}
      </div>
    );
  },
);

ThumbnailImage.displayName = 'ThumbnailImage';
VideoThumbnailStrip.displayName = 'VideoThumbnailStrip';

// Remove default export to fix linting warning
