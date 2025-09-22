import { Loader2 } from 'lucide-react';
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
import {
  default as VideoSpriteSheetGenerator,
  SpriteSheet,
  SpriteSheetThumbnail,
} from '../../../Utility/VideoSpriteSheetGenerator';

// Debounce utility for zoom operations
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Memoized calculation helpers to prevent recreation on every render
const calculatePixelsPerSecond = (frameWidth: number, fps: number): number => {
  return frameWidth * fps;
};

const calculateThumbnailInterval = (
  thumbnails: SpriteSheetThumbnail[],
): number => {
  return thumbnails.length > 1
    ? thumbnails[1].timestamp - thumbnails[0].timestamp
    : 0.5;
};

const calculateDisplayWidth = (
  pixelsPerSecond: number,
  interval: number,
): number => {
  return Math.max(120, pixelsPerSecond * interval * 1.01);
};

interface VideoSpriteSheetStripProps {
  track: VideoTrack;
  frameWidth: number;
  width: number;
  height: number;
  zoomLevel: number;
}

interface SpriteSheetStripState {
  spriteSheets: SpriteSheet[];
  isLoading: boolean;
  error: string | null;
  lastGeneratedZoom: number;
}

export const VideoSpriteSheetStrip: React.FC<VideoSpriteSheetStripProps> =
  React.memo(
    ({ track, frameWidth, width, height, zoomLevel }) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const [state, setState] = useState<SpriteSheetStripState>({
        spriteSheets: [],
        isLoading: false,
        error: null,
        lastGeneratedZoom: 0,
      });

      // Always call useDebounce to maintain hook order, but use different values
      const debouncedZoomLevel = useDebounce(zoomLevel, 150);

      // Use immediate zoom level for seamless experience when sprites exist
      const activeZoomLevel =
        state.spriteSheets.length > 0 ? zoomLevel : debouncedZoomLevel;

      // Get FPS from timeline state and sprite sheet getter
      const fps = useVideoEditorStore((state) => state.timeline.fps);
      const getSpriteSheetsBySource = useVideoEditorStore(
        (state) => state.getSpriteSheetsBySource,
      );

      // Memoize expensive calculations that don't change with zoom
      const trackMetrics = useMemo(
        () => ({
          durationFrames: track.endFrame - track.startFrame,
          durationSeconds: (track.endFrame - track.startFrame) / fps,
          trackStartTime: track.sourceStartTime || 0,
        }),
        [track.startFrame, track.endFrame, track.sourceStartTime, fps],
      );

      // Memoize zoom-independent values
      const zoomIndependentMetrics = useMemo(
        () => ({
          pixelsPerSecond: calculatePixelsPerSecond(frameWidth, fps),
        }),
        [frameWidth, fps],
      );

      // Use pre-calculated duration from trackMetrics
      const { durationSeconds, trackStartTime } = trackMetrics;

      // Calculate all thumbnails from sprite sheets
      const allThumbnails = useMemo(() => {
        return state.spriteSheets.flatMap((sheet) => sheet.thumbnails);
      }, [state.spriteSheets]);

      // Optimized visible thumbnails calculation with separated concerns
      const thumbnailPositions = useMemo(() => {
        if (allThumbnails.length === 0) return [];

        const thumbnailInterval = calculateThumbnailInterval(allThumbnails);
        const thumbnailDisplayWidth = calculateDisplayWidth(
          zoomIndependentMetrics.pixelsPerSecond,
          thumbnailInterval,
        );

        // Pre-calculate thumbnail positions (zoom-independent)
        return allThumbnails.map((thumbnail) => {
          const thumbnailTimeInTrack = thumbnail.timestamp - trackStartTime;
          const thumbnailFrameInTrack = thumbnailTimeInTrack * fps;
          const thumbnailRelativeToTrack = thumbnailFrameInTrack * frameWidth;

          return {
            thumbnail,
            x: thumbnailRelativeToTrack,
            displayWidth: thumbnailDisplayWidth,
            timeInTrack: thumbnailTimeInTrack,
          };
        });
      }, [
        allThumbnails,
        trackStartTime,
        fps,
        frameWidth,
        zoomIndependentMetrics.pixelsPerSecond,
      ]);

      // Ultra-optimized visibility calculation for seamless zoom
      const visibleElements = useMemo(() => {
        if (thumbnailPositions.length === 0) return [];

        // For zoom operations with existing sprites, use minimal recalculation
        const tolerance = 0.1;
        const buffer = 150; // Larger buffer for smoother experience
        const leftBound = -buffer;
        const rightBound = width + buffer;

        // Optimized filtering - exit early when possible
        const visible = [];
        let startFound = false;

        for (const element of thumbnailPositions) {
          const { timeInTrack, x, displayWidth } = element;

          // Quick viewport culling
          if (x + displayWidth < leftBound) {
            continue; // Before viewport
          }

          if (x > rightBound) {
            if (startFound) break; // Past viewport and already found start
            continue;
          }

          startFound = true;

          // Range checks (minimal when sprites exist)
          if (
            timeInTrack >= -tolerance &&
            timeInTrack <= durationSeconds + tolerance
          ) {
            visible.push(element);
          }
        }

        return visible;
      }, [thumbnailPositions, durationSeconds, width]);

      // Optimized sprite sheet generation - removed zoomLevel dependency to prevent regeneration on zoom
      const generateSpriteSheets = useCallback(async () => {
        if (!track.source || track.type !== 'video') return;

        const videoPath = track.tempFilePath || track.source;

        // Handle blob URLs
        if (videoPath.startsWith('blob:')) {
          console.warn(
            'Cannot generate sprite sheets from blob URL:',
            track.name,
          );
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Blob URLs not supported for sprite sheets',
          }));
          return;
        }

        // First, check for preloaded sprite sheets from media library
        const preloadedSpriteSheets = getSpriteSheetsBySource(track.source);
        if (
          preloadedSpriteSheets?.success &&
          preloadedSpriteSheets.spriteSheets.length > 0
        ) {
          console.log(
            '📸 Using preloaded sprite sheets from media library for',
            track.name,
          );
          setState((prev) => ({
            ...prev,
            spriteSheets: preloadedSpriteSheets.spriteSheets,
            isLoading: false,
            error: null,
            lastGeneratedZoom: zoomLevel, // Only update zoom tracking, don't depend on it
          }));
          return;
        }

        // Check cache second (fallback)
        try {
          const cacheResult =
            await VideoSpriteSheetGenerator.getCachedSpriteSheets({
              videoPath,
              duration: durationSeconds,
              fps,
              sourceStartTime: trackStartTime,
              thumbWidth: 120,
              thumbHeight: 68,
            });

          if (cacheResult && cacheResult.success) {
            console.log('📸 Using cached sprite sheets for', track.name);
            setState((prev) => ({
              ...prev,
              spriteSheets: cacheResult.spriteSheets,
              isLoading: false,
              error: null,
              lastGeneratedZoom: zoomLevel,
            }));
            return;
          }
        } catch (cacheError) {
          console.warn('⚠️ Cache check failed:', cacheError);
          // Continue with generation if cache fails
        }

        // Skip if already loading
        if (state.isLoading) {
          console.log('📸 Already generating sprite sheets, skipping...');
          return;
        }

        console.log('📸 Generating new sprite sheets for', track.name);

        setState((prev) => ({
          ...prev,
          isLoading: true,
          error: null,
        }));

        try {
          const result = await VideoSpriteSheetGenerator.generateForTrack(
            track,
            fps,
          );

          if (result.success) {
            setState((prev) => ({
              ...prev,
              spriteSheets: result.spriteSheets,
              isLoading: false,
              lastGeneratedZoom: zoomLevel,
            }));
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: result.error || 'Failed to generate sprite sheets',
            }));
          }
        } catch (error) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          }));
        }
      }, [
        track.source,
        track.tempFilePath,
        track.type,
        track.name,
        durationSeconds,
        trackStartTime,
        fps,
        getSpriteSheetsBySource,
        // Removed zoomLevel dependency to prevent regeneration on zoom
      ]);

      // Generate sprite sheets on mount and when dependencies change
      // Use debounced zoom level to prevent excessive regeneration
      useEffect(() => {
        generateSpriteSheets();
      }, [generateSpriteSheets]);

      // Minimal zoom tracking - no expensive operations for existing sprites
      useEffect(() => {
        // Only update zoom tracking when sprites exist, never regenerate for zoom changes
        if (
          state.spriteSheets.length > 0 &&
          Math.abs(activeZoomLevel - state.lastGeneratedZoom) > 1
        ) {
          setState((prev) => ({
            ...prev,
            lastGeneratedZoom: activeZoomLevel,
          }));
        }
      }, [activeZoomLevel, state.lastGeneratedZoom, state.spriteSheets.length]);

      // Render sprite sheet strip
      return (
        <div
          ref={containerRef}
          className="absolute top-0 left-0 overflow-hidden"
          style={{ width, height }}
        >
          {/* Loading state - positioned at the start */}
          {state.isLoading && (
            <div className="absolute top-0 left-0 flex items-center space-x-2 px-2 py-1 bg-gray-900/90 backdrop-blur-sm rounded-r border border-gray-700/50 z-10">
              <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
              <span className="text-blue-400 text-xs font-medium">
                Generating sprites...
              </span>
            </div>
          )}

          {/* Error state - positioned at the start */}
          {state.error && (
            <div className="absolute top-0 left-0 flex items-center space-x-2 px-2 py-1 bg-red-900/90 backdrop-blur-sm rounded-r border border-red-700/50 z-10">
              <div className="w-2 h-2 rounded-full bg-red-400"></div>
              <span className="text-red-200 text-xs font-medium">
                {state.error.includes('requires app restart')
                  ? 'Restart required'
                  : 'Generation failed'}
              </span>
            </div>
          )}

          {/* Background gradient to ensure visibility */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20"
            style={{ zIndex: 1 }}
          />

          {/* Sprite sheet thumbnails container */}
          <div className="relative w-full h-full" style={{ zIndex: 0 }}>
            {/* Background fill for areas without sprites */}
            <div
              className="absolute inset-0 bg-gray-800"
              style={{ zIndex: -1 }}
            />
            {useMemo(
              () =>
                visibleElements.map(({ thumbnail, x, displayWidth }) => {
                  const spriteSheet = state.spriteSheets[thumbnail.sheetIndex];
                  if (!spriteSheet) return null;

                  return (
                    <SpriteSheetThumbnailComponent
                      key={thumbnail.id}
                      thumbnail={thumbnail}
                      spriteSheet={spriteSheet}
                      x={x}
                      displayWidth={displayWidth}
                      displayHeight={height}
                    />
                  );
                }),
              [visibleElements, state.spriteSheets, height],
            )}
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
      // Optimized memoization - more granular and zoom-optimized

      // Track identity and source changes always trigger re-render
      if (
        prevProps.track.id !== nextProps.track.id ||
        prevProps.track.source !== nextProps.track.source
      ) {
        return false;
      }

      // Critical track timing changes
      const trackTimingChanged =
        prevProps.track.startFrame !== nextProps.track.startFrame ||
        prevProps.track.endFrame !== nextProps.track.endFrame ||
        prevProps.track.sourceStartTime !== nextProps.track.sourceStartTime;

      if (trackTimingChanged) {
        return false;
      }

      // Dimensions that affect layout
      const dimensionsChanged =
        prevProps.frameWidth !== nextProps.frameWidth ||
        prevProps.height !== nextProps.height;

      if (dimensionsChanged) {
        return false;
      }

      // Width changes for viewport culling (less sensitive)
      const significantWidthChange =
        Math.abs(prevProps.width - nextProps.width) > 50;

      if (significantWidthChange) {
        return false;
      }

      // Ultra-aggressive zoom threshold for seamless zoom when sprites exist
      // If sprites are loaded, allow much more zoom tolerance
      const hasSprites = prevProps.track.id === nextProps.track.id; // Assume sprites exist if same track
      const zoomThreshold = hasSprites ? 2.0 : 0.5; // Much higher threshold when sprites exist

      const significantZoomChange =
        Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) > zoomThreshold;

      if (significantZoomChange) {
        return false;
      }

      // If none of the above triggered, the component can skip re-rendering
      return true;
    },
  );

interface SpriteSheetThumbnailProps {
  thumbnail: SpriteSheetThumbnail;
  spriteSheet: SpriteSheet;
  x: number;
  displayWidth: number;
  displayHeight: number;
}

const SpriteSheetThumbnailComponent: React.FC<SpriteSheetThumbnailProps> =
  React.memo(
    ({ thumbnail, spriteSheet, x, displayWidth, displayHeight }) => {
      const [hasError, setHasError] = useState(false);

      const handleError = useCallback(() => {
        setHasError(true);
      }, []);

      // Minimal validation for maximum performance during zoom
      // Trust the sprite sheet generation process - only check for obvious errors
      if (thumbnail.x < 0 || thumbnail.y < 0) {
        return null;
      }

      return (
        <div
          className="absolute top-0 overflow-hidden"
          style={{
            transform: `translate3d(${x}px, 0, 0)`, // Hardware acceleration
            width: displayWidth,
            height: displayHeight,
            willChange: 'transform', // Optimize for transforms
          }}
        >
          {hasError ? (
            <div className="w-full h-full bg-gray-700 flex items-center justify-center">
              <span className="text-xs text-gray-400">✕</span>
            </div>
          ) : (
            <div
              className="w-full h-full bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${spriteSheet.url})`,
                // Optimized scaling calculation
                backgroundSize: `${(spriteSheet.width * displayWidth) / thumbnail.width}px ${(spriteSheet.height * displayHeight) / thumbnail.height}px`,
                backgroundPosition: `-${(thumbnail.x * displayWidth) / thumbnail.width}px -${(thumbnail.y * displayHeight) / thumbnail.height}px`,
                // Removed filter for better performance during zoom
                imageRendering:
                  'optimizeSpeed' as React.CSSProperties['imageRendering'], // Faster rendering
                willChange: 'auto', // Let browser optimize
              }}
            >
              {/* Hidden preload image for error handling */}
              <img
                src={spriteSheet.url}
                alt=""
                className="hidden"
                onError={handleError}
                loading="lazy" // Lazy load for better performance
              />
            </div>
          )}
        </div>
      );
    },
    (prevProps, nextProps) => {
      // Ultra-aggressive memoization for zoom performance

      // Only re-render for identity changes
      if (
        prevProps.thumbnail.id !== nextProps.thumbnail.id ||
        prevProps.spriteSheet.id !== nextProps.spriteSheet.id
      ) {
        return false;
      }

      // Size changes (but with tolerance for minor changes)
      const significantSizeChange =
        Math.abs(prevProps.displayWidth - nextProps.displayWidth) > 2 ||
        Math.abs(prevProps.displayHeight - nextProps.displayHeight) > 2;

      if (significantSizeChange) {
        return false;
      }

      // Position changes with very high threshold for smooth zoom
      const significantPositionChange =
        Math.abs(prevProps.x - nextProps.x) > 10;

      if (significantPositionChange) {
        return false;
      }

      // Allow component to skip re-render for smooth zoom experience
      return true;
    },
  );

SpriteSheetThumbnailComponent.displayName = 'SpriteSheetThumbnailComponent';
VideoSpriteSheetStrip.displayName = 'VideoSpriteSheetStrip';

export default VideoSpriteSheetStrip;
