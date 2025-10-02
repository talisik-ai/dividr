import {
  default as VideoSpriteSheetGenerator,
  SpriteSheet,
  SpriteSheetThumbnail,
} from '@/backend/ffmpeg/videoSpriteSheetGenerator';
import { Loader2 } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVideoEditorStore, VideoTrack } from '../stores/VideoEditorStore';

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

interface ThumbnailTile {
  thumbnail: SpriteSheetThumbnail;
  x: number;
  width: number;
  repeatIndex: number;
  timestamp: number; // Exact timestamp this tile represents
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

      const debouncedZoomLevel = useDebounce(zoomLevel, 150);
      const activeZoomLevel =
        state.spriteSheets.length > 0 ? zoomLevel : debouncedZoomLevel;

      const fps = useVideoEditorStore((state) => state.timeline.fps);
      const getSpriteSheetsBySource = useVideoEditorStore(
        (state) => state.getSpriteSheetsBySource,
      );

      const trackMetrics = useMemo(
        () => ({
          durationFrames: track.endFrame - track.startFrame,
          durationSeconds: (track.endFrame - track.startFrame) / fps,
          trackStartTime: track.sourceStartTime || 0,
        }),
        [track.startFrame, track.endFrame, track.sourceStartTime, fps],
      );

      const zoomIndependentMetrics = useMemo(
        () => ({
          pixelsPerSecond: calculatePixelsPerSecond(frameWidth, fps),
        }),
        [frameWidth, fps],
      );

      const { durationSeconds, trackStartTime } = trackMetrics;

      const allThumbnails = useMemo(() => {
        return state.spriteSheets.flatMap((sheet) => sheet.thumbnails);
      }, [state.spriteSheets]);

      // Calculate native thumbnail display width to maintain aspect ratio
      const nativeThumbnailMetrics = useMemo(() => {
        if (allThumbnails.length === 0) {
          return { width: 120, height: 68, displayWidth: (120 / 68) * height };
        }
        const thumb = allThumbnails[0];
        return {
          width: thumb.width,
          height: thumb.height,
          displayWidth: (thumb.width / thumb.height) * height,
        };
      }, [allThumbnails, height]);

      // Generate tiles with accurate timestamp positioning
      const thumbnailTiles = useMemo(() => {
        if (allThumbnails.length === 0) return [];

        const tiles: ThumbnailTile[] = [];
        const thumbnailInterval = calculateThumbnailInterval(allThumbnails);
        const pixelsPerSecond = zoomIndependentMetrics.pixelsPerSecond;
        const nativeDisplayWidth = nativeThumbnailMetrics.displayWidth;

        // Calculate how much timeline space each thumbnail's time interval occupies
        const timeIntervalPixels = pixelsPerSecond * thumbnailInterval;

        // Calculate how many tiles needed to fill the time interval
        const tilesPerThumbnail = Math.ceil(
          timeIntervalPixels / nativeDisplayWidth,
        );

        for (let i = 0; i < allThumbnails.length; i++) {
          const thumbnail = allThumbnails[i];
          const thumbnailTimeInTrack = thumbnail.timestamp - trackStartTime;

          // Skip thumbnails outside track range
          if (
            thumbnailTimeInTrack < -0.1 ||
            thumbnailTimeInTrack > durationSeconds + 0.1
          ) {
            continue;
          }

          // Calculate end time for this thumbnail's coverage
          const nextThumbnail = allThumbnails[i + 1];
          const coverageEndTime = nextThumbnail
            ? nextThumbnail.timestamp - trackStartTime
            : durationSeconds;

          // Generate tiles to fill the thumbnail's time interval
          for (let tileIndex = 0; tileIndex < tilesPerThumbnail; tileIndex++) {
            // Calculate EXACT timestamp for this tile
            const tileTimestamp =
              thumbnailTimeInTrack +
              (tileIndex * nativeDisplayWidth) / pixelsPerSecond;

            // Stop if we've exceeded this thumbnail's coverage
            if (tileTimestamp >= coverageEndTime) break;

            // Calculate EXACT pixel position from timestamp
            const tileX = tileTimestamp * fps * frameWidth;

            // Calculate width (may be clipped at the end)
            const remainingTime = coverageEndTime - tileTimestamp;
            const remainingPixels = remainingTime * pixelsPerSecond;
            const tileWidth = Math.min(nativeDisplayWidth, remainingPixels);

            // Only add tiles with meaningful width
            if (tileWidth > 1) {
              tiles.push({
                thumbnail,
                x: tileX,
                width: tileWidth,
                repeatIndex: tileIndex,
                timestamp: tileTimestamp,
              });
            }
          }
        }

        return tiles;
      }, [
        allThumbnails,
        trackStartTime,
        durationSeconds,
        fps,
        frameWidth,
        zoomIndependentMetrics.pixelsPerSecond,
        nativeThumbnailMetrics.displayWidth,
      ]);

      // Efficient viewport culling - only render visible tiles
      const visibleTiles = useMemo(() => {
        const buffer = 200;
        const leftBound = -buffer;
        const rightBound = width + buffer;

        // Binary search optimization for large tile arrays
        if (thumbnailTiles.length > 100) {
          // Find first visible tile using binary search
          let left = 0;
          let right = thumbnailTiles.length - 1;
          let firstVisible = 0;

          while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            const tile = thumbnailTiles[mid];
            if (tile.x + tile.width < leftBound) {
              left = mid + 1;
            } else {
              firstVisible = mid;
              right = mid - 1;
            }
          }

          // Collect visible tiles from first visible onwards
          const visible: ThumbnailTile[] = [];
          for (let i = firstVisible; i < thumbnailTiles.length; i++) {
            const tile = thumbnailTiles[i];
            if (tile.x > rightBound) break;
            visible.push(tile);
          }
          return visible;
        }

        // Linear search for small arrays
        return thumbnailTiles.filter((tile) => {
          const tileRight = tile.x + tile.width;
          return tileRight >= leftBound && tile.x <= rightBound;
        });
      }, [thumbnailTiles, width]);

      const generateSpriteSheets = useCallback(async () => {
        if (!track.source || track.type !== 'video') return;

        const videoPath = track.tempFilePath || track.source;

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

        const preloadedSpriteSheets = getSpriteSheetsBySource(track.source);
        if (
          preloadedSpriteSheets?.success &&
          preloadedSpriteSheets.spriteSheets.length > 0
        ) {
          setState((prev) => ({
            ...prev,
            spriteSheets: preloadedSpriteSheets.spriteSheets,
            isLoading: false,
            error: null,
            lastGeneratedZoom: zoomLevel,
          }));
          return;
        }

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
        }

        if (state.isLoading) return;

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
      ]);

      useEffect(() => {
        generateSpriteSheets();
      }, [generateSpriteSheets]);

      useEffect(() => {
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

      return (
        <div
          ref={containerRef}
          className="absolute top-0 left-0 overflow-hidden"
          style={{ width, height }}
        >
          {state.isLoading && (
            <div className="absolute top-0 left-0 flex items-center space-x-2 px-2 py-1 bg-gray-900/90 backdrop-blur-sm rounded-r border border-gray-700/50 z-10">
              <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
              <span className="text-blue-400 text-xs font-medium">
                Generating sprites...
              </span>
            </div>
          )}

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

          <div
            className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20"
            style={{ zIndex: 1 }}
          />

          <div className="relative w-full h-full" style={{ zIndex: 0 }}>
            <div
              className="absolute inset-0 bg-gray-800"
              style={{ zIndex: -1 }}
            />

            {/* Render only visible tiles with exact timestamp positioning */}
            {visibleTiles.map((tile) => {
              const spriteSheet = state.spriteSheets[tile.thumbnail.sheetIndex];
              if (!spriteSheet) return null;

              return (
                <SpriteThumbnailTile
                  key={`${tile.thumbnail.id}-${tile.repeatIndex}`}
                  tile={tile}
                  spriteSheet={spriteSheet}
                  height={height}
                />
              );
            })}
          </div>

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
      if (
        prevProps.track.id !== nextProps.track.id ||
        prevProps.track.source !== nextProps.track.source
      ) {
        return false;
      }

      const trackTimingChanged =
        prevProps.track.startFrame !== nextProps.track.startFrame ||
        prevProps.track.endFrame !== nextProps.track.endFrame ||
        prevProps.track.sourceStartTime !== nextProps.track.sourceStartTime;

      if (trackTimingChanged) {
        return false;
      }

      const dimensionsChanged =
        prevProps.frameWidth !== nextProps.frameWidth ||
        prevProps.height !== nextProps.height;

      if (dimensionsChanged) {
        return false;
      }

      const significantWidthChange =
        Math.abs(prevProps.width - nextProps.width) > 50;

      if (significantWidthChange) {
        return false;
      }

      const hasSprites = prevProps.track.id === nextProps.track.id;
      const zoomThreshold = hasSprites ? 2.0 : 0.5;

      const significantZoomChange =
        Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) > zoomThreshold;

      if (significantZoomChange) {
        return false;
      }

      return true;
    },
  );

interface SpriteThumbnailTileProps {
  tile: ThumbnailTile;
  spriteSheet: SpriteSheet;
  height: number;
}

const SpriteThumbnailTile: React.FC<SpriteThumbnailTileProps> = React.memo(
  ({ tile, spriteSheet, height }) => {
    const [hasError, setHasError] = useState(false);

    const handleError = useCallback(() => {
      setHasError(true);
    }, []);

    const { thumbnail, x, width } = tile;

    if (thumbnail.x < 0 || thumbnail.y < 0 || width <= 0) {
      return null;
    }

    // Calculate scaling to maintain aspect ratio
    const scale = height / thumbnail.height;
    const scaledSpriteWidth = spriteSheet.width * scale;
    const scaledSpriteHeight = spriteSheet.height * scale;
    const thumbnailOffsetX = thumbnail.x * scale;
    const thumbnailOffsetY = thumbnail.y * scale;

    return (
      <div
        className="absolute top-0 overflow-hidden"
        style={{
          transform: `translate3d(${x}px, 0, 0)`,
          width: width,
          height: height,
          willChange: 'transform',
        }}
      >
        {hasError ? (
          <div className="w-full h-full bg-gray-700 flex items-center justify-center">
            <span className="text-xs text-gray-400">✕</span>
          </div>
        ) : (
          <div
            className="w-full h-full bg-no-repeat"
            style={{
              backgroundImage: `url(${spriteSheet.url})`,
              backgroundSize: `${scaledSpriteWidth}px ${scaledSpriteHeight}px`,
              backgroundPosition: `-${thumbnailOffsetX}px -${thumbnailOffsetY}px`,
              imageRendering: 'auto',
              willChange: 'auto',
              contain: 'layout style paint',
            }}
          >
            <img
              src={spriteSheet.url}
              alt=""
              className="hidden"
              onError={handleError}
              loading="lazy"
            />
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    if (
      prevProps.tile.thumbnail.id !== nextProps.tile.thumbnail.id ||
      prevProps.tile.repeatIndex !== nextProps.tile.repeatIndex ||
      prevProps.spriteSheet.id !== nextProps.spriteSheet.id
    ) {
      return false;
    }

    const significantPositionChange =
      Math.abs(prevProps.tile.x - nextProps.tile.x) > 5;
    const significantWidthChange =
      Math.abs(prevProps.tile.width - nextProps.tile.width) > 2;
    const heightChanged = prevProps.height !== nextProps.height;

    if (significantPositionChange || significantWidthChange || heightChanged) {
      return false;
    }

    return true;
  },
);

SpriteThumbnailTile.displayName = 'SpriteThumbnailTile';
VideoSpriteSheetStrip.displayName = 'VideoSpriteSheetStrip';

export default VideoSpriteSheetStrip;
