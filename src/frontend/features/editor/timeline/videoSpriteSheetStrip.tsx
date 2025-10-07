import {
  SpriteSheet,
  SpriteSheetThumbnail,
  default as VideoSpriteSheetGenerator,
} from '@/backend/ffmpeg/videoSpriteSheetGenerator';
import { Loader2 } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';

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
}

// Hybrid tile structure - maintains tiling concept but optimized for rendering
interface HybridTile {
  id: string;
  thumbnail: SpriteSheetThumbnail;
  startX: number;
  endX: number;
  tileStartX: number; // Where this specific tile starts
  tileWidth: number; // Width of this specific tile
  repeatIndex: number; // Which repeat of the thumbnail this is
  clipOffset: number; // How much to offset the background for partial tiles
}

// GPU-accelerated sprite renderer component
const GPUAcceleratedSprite: React.FC<{
  tile: HybridTile;
  spriteSheet: SpriteSheet;
  height: number;
  viewportOffset: number;
}> = React.memo(
  ({ tile, spriteSheet, height, viewportOffset }) => {
    const { thumbnail, tileStartX, tileWidth, clipOffset } = tile;

    // Calculate display metrics
    const scale = height / thumbnail.height;
    const spriteWidth = spriteSheet.width * scale;
    const spriteHeight = spriteSheet.height * scale;
    const thumbnailWidth = thumbnail.width * scale;
    const bgY = thumbnail.y * scale;

    // Use transform for positioning (GPU accelerated)
    const transform = `translate3d(${tileStartX - viewportOffset}px, 0, 0)`;

    return (
      <div
        className="absolute top-0"
        style={{
          transform,
          width: `${tileWidth}px`,
          height: `${height}px`,
          willChange: 'transform',
          contain: 'layout style paint',
          overflow: 'hidden',
        }}
      >
        <div
          className="absolute"
          style={{
            width: `${thumbnailWidth}px`,
            height: `${height}px`,
            left: `-${clipOffset}px`,
            backgroundImage: `url(${spriteSheet.url})`,
            backgroundSize: `${spriteWidth}px ${spriteHeight}px`,
            backgroundPosition: `-${thumbnail.x * scale}px -${bgY}px`,
            imageRendering: 'auto',
          }}
        />
      </div>
    );
  },
  (prev, next) => {
    // Only re-render if actual visual changes
    return (
      prev.tile.id === next.tile.id &&
      Math.abs(prev.tile.tileStartX - next.tile.tileStartX) < 1 &&
      Math.abs(prev.tile.tileWidth - next.tile.tileWidth) < 1 &&
      prev.viewportOffset === next.viewportOffset &&
      prev.height === next.height
    );
  },
);

export const VideoSpriteSheetStrip: React.FC<VideoSpriteSheetStripProps> =
  React.memo(
    ({ track, frameWidth, width, height, zoomLevel }) => {
      const containerRef = useRef<HTMLDivElement>(null);
      const [state, setState] = useState<SpriteSheetStripState>({
        spriteSheets: [],
        isLoading: false,
        error: null,
      });

      // Viewport state for culling
      const [viewportBounds, setViewportBounds] = useState({
        start: 0,
        end: width,
      });
      const rafRef = useRef<number>(0);

      const fps = useVideoEditorStore((state) => state.timeline.fps);
      const getSpriteSheetsBySource = useVideoEditorStore(
        (state) => state.getSpriteSheetsBySource,
      );

      const trackMetrics = useMemo(
        () => ({
          durationFrames: track.endFrame - track.startFrame,
          durationSeconds: (track.endFrame - track.startFrame) / fps,
          trackStartTime: track.sourceStartTime || 0,
          pixelsPerSecond: frameWidth * fps,
        }),
        [
          track.startFrame,
          track.endFrame,
          track.sourceStartTime,
          fps,
          frameWidth,
        ],
      );

      // Hybrid tile generation - maintains tiling logic but optimized
      const hybridTiles = useMemo(() => {
        const { spriteSheets } = state;
        if (spriteSheets.length === 0) return [];

        const tiles: HybridTile[] = [];
        const allThumbnails = spriteSheets.flatMap((sheet) => sheet.thumbnails);

        if (allThumbnails.length === 0) return [];

        const { trackStartTime, durationSeconds, pixelsPerSecond } =
          trackMetrics;

        // Get first thumbnail to calculate native display width
        const firstThumb = allThumbnails[0];
        const aspectRatio = firstThumb.width / firstThumb.height;
        const nativeDisplayWidth = aspectRatio * height;

        // Generate tiles with proper tiling (not stretching)
        for (let i = 0; i < allThumbnails.length; i++) {
          const thumbnail = allThumbnails[i];
          const thumbnailTimeInTrack = thumbnail.timestamp - trackStartTime;

          // Skip if outside track bounds
          if (
            thumbnailTimeInTrack < -0.1 ||
            thumbnailTimeInTrack > durationSeconds + 0.1
          ) {
            continue;
          }

          // Calculate coverage for this thumbnail
          const nextThumbnail = allThumbnails[i + 1];
          const coverageEndTime = nextThumbnail
            ? nextThumbnail.timestamp - trackStartTime
            : durationSeconds;

          // Calculate how many pixels this thumbnail's time interval covers
          const intervalPixels =
            (coverageEndTime - thumbnailTimeInTrack) * pixelsPerSecond;

          // Calculate how many tiles we need to fill this interval
          // Add small epsilon to ensure we don't miss the last tile due to floating point errors
          const tilesNeeded = Math.ceil(
            intervalPixels / nativeDisplayWidth + 0.0001,
          );

          // Calculate the start position for this thumbnail's coverage
          const coverageStartX = thumbnailTimeInTrack * pixelsPerSecond;

          // Generate individual tiles (similar to Version A's approach)
          for (let tileIndex = 0; tileIndex < tilesNeeded; tileIndex++) {
            // Calculate this tile's position directly from coverage start
            // This avoids accumulating floating-point errors
            const tileStartX = coverageStartX + tileIndex * nativeDisplayWidth;

            // Calculate the tile's end position
            const tileEndX = Math.min(
              tileStartX + nativeDisplayWidth,
              coverageEndTime * pixelsPerSecond,
            );

            // Calculate tile width from positions
            const tileWidth = tileEndX - tileStartX;

            // Stop if we've exceeded this thumbnail's coverage
            if (tileStartX >= coverageEndTime * pixelsPerSecond) break;

            // Only add tiles with meaningful width
            if (tileWidth > 0.5) {
              tiles.push({
                id: `${thumbnail.id}-${tileIndex}`,
                thumbnail,
                startX: coverageStartX,
                endX: coverageEndTime * pixelsPerSecond,
                tileStartX,
                tileWidth,
                repeatIndex: tileIndex,
                clipOffset: 0, // For partial tiles at edges, we could calculate clip offset
              });
            }
          }
        }

        return tiles;
      }, [state.spriteSheets, trackMetrics, height, fps, frameWidth]);

      // High-performance viewport culling with buffer zone
      const visibleTiles = useMemo(() => {
        // Increase buffer significantly for fast scrolling/zooming
        const buffer = width * 1.5; // 150% buffer for smooth continuous scrolling
        const leftBound = Math.max(0, viewportBounds.start - buffer);
        const rightBound = viewportBounds.end + buffer;

        // If no tiles, return empty array
        if (hybridTiles.length === 0) return [];

        // Binary search for first visible tile
        let left = 0;
        let right = hybridTiles.length - 1;
        let firstVisible = 0;

        while (left <= right) {
          const mid = Math.floor((left + right) / 2);
          const tile = hybridTiles[mid];
          if (tile.tileStartX + tile.tileWidth < leftBound) {
            left = mid + 1;
          } else {
            firstVisible = mid;
            right = mid - 1;
          }
        }

        // Collect visible tiles with safety margin
        const visible: HybridTile[] = [];
        for (
          let i = Math.max(0, firstVisible - 1);
          i < hybridTiles.length;
          i++
        ) {
          const tile = hybridTiles[i];
          // Include tiles that are even partially visible
          if (tile.tileStartX > rightBound) break;
          if (tile.tileStartX + tile.tileWidth >= leftBound) {
            visible.push(tile);
          }
        }

        return visible;
      }, [hybridTiles, viewportBounds, width]);

      // Update viewport bounds on scroll/zoom - more responsive for continuous scrolling
      useEffect(() => {
        const updateViewport = () => {
          if (containerRef.current) {
            const parent = containerRef.current.parentElement;
            if (parent) {
              const scrollLeft = parent.scrollLeft || 0;
              setViewportBounds({
                start: scrollLeft,
                end: scrollLeft + parent.clientWidth,
              });
            }
          }
        };

        // Use direct updates for scroll (no RAF throttling) to be more responsive
        const handleScroll = () => {
          updateViewport();
        };

        const parent = containerRef.current?.parentElement;
        if (parent) {
          parent.addEventListener('scroll', handleScroll, { passive: true });
          updateViewport(); // Initial update
        }

        return () => {
          if (parent) parent.removeEventListener('scroll', handleScroll);
          if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
      }, []);

      // Update viewport when width changes (zoom level changes)
      useEffect(() => {
        const updateViewport = () => {
          if (containerRef.current) {
            const parent = containerRef.current.parentElement;
            if (parent) {
              const scrollLeft = parent.scrollLeft || 0;
              setViewportBounds({
                start: scrollLeft,
                end: scrollLeft + parent.clientWidth,
              });
            }
          }
        };
        updateViewport();
      }, [width, zoomLevel]);

      // Sprite sheet generation (unchanged from Version B)
      const generateSpriteSheets = useCallback(async () => {
        if (!track.source || track.type !== 'video') return;

        const videoPath = track.tempFilePath || track.source;
        if (videoPath.startsWith('blob:')) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Blob URLs not supported',
          }));
          return;
        }

        // Check preloaded sheets first
        const preloaded = getSpriteSheetsBySource(track.source);
        if (preloaded?.success && preloaded.spriteSheets.length > 0) {
          setState({
            spriteSheets: preloaded.spriteSheets,
            isLoading: false,
            error: null,
          });
          return;
        }

        // Check cache
        try {
          const cached = await VideoSpriteSheetGenerator.getCachedSpriteSheets({
            videoPath,
            duration: trackMetrics.durationSeconds,
            fps,
            sourceStartTime: trackMetrics.trackStartTime,
            thumbWidth: 120,
            thumbHeight: 68,
          });

          if (cached?.success) {
            setState({
              spriteSheets: cached.spriteSheets,
              isLoading: false,
              error: null,
            });
            return;
          }
        } catch (err) {
          console.warn('Cache check failed:', err);
        }

        // Generate if needed
        if (state.isLoading) return;

        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
          const result = await VideoSpriteSheetGenerator.generateForTrack(
            track,
            fps,
          );

          if (result.success) {
            setState({
              spriteSheets: result.spriteSheets,
              isLoading: false,
              error: null,
            });
          } else {
            setState((prev) => ({
              ...prev,
              isLoading: false,
              error: result.error || 'Generation failed',
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
        trackMetrics,
        fps,
        getSpriteSheetsBySource,
        state.isLoading,
      ]);

      useEffect(() => {
        generateSpriteSheets();
      }, [generateSpriteSheets]);

      // Render with GPU acceleration
      return (
        <div
          ref={containerRef}
          className="absolute top-0 left-0 overflow-hidden"
          style={{
            width,
            height,
            transform: 'translateZ(0)', // Force GPU layer
            willChange: 'transform',
          }}
        >
          {/* Status indicators */}
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
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-200 text-xs font-medium">
                {state.error.includes('restart')
                  ? 'Restart required'
                  : 'Failed'}
              </span>
            </div>
          )}

          {/* Background */}
          <div className="absolute inset-0 bg-gray-800" />

          {/* GPU-accelerated sprite container */}
          <div
            className="absolute inset-0"
            style={{
              transform: 'translateZ(0)',
              willChange: 'contents',
            }}
          >
            {visibleTiles.map((tile) => {
              const sheet = state.spriteSheets[tile.thumbnail.sheetIndex];
              if (!sheet) return null;

              return (
                <GPUAcceleratedSprite
                  key={tile.id}
                  tile={tile}
                  spriteSheet={sheet}
                  height={height}
                  viewportOffset={viewportBounds.start}
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
    // Optimized memo comparison
    (prevProps, nextProps) => {
      // Skip re-render for small changes
      const significantChange =
        prevProps.track.id !== nextProps.track.id ||
        prevProps.track.source !== nextProps.track.source ||
        prevProps.track.startFrame !== nextProps.track.startFrame ||
        prevProps.track.endFrame !== nextProps.track.endFrame ||
        prevProps.track.sourceStartTime !== nextProps.track.sourceStartTime ||
        Math.abs(prevProps.frameWidth - nextProps.frameWidth) > 0.5 ||
        prevProps.height !== nextProps.height ||
        Math.abs(prevProps.width - nextProps.width) > 100 ||
        Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) > 2.0;

      return !significantChange;
    },
  );

GPUAcceleratedSprite.displayName = 'GPUAcceleratedSprite';
VideoSpriteSheetStrip.displayName = 'VideoSpriteSheetStrip';

export default VideoSpriteSheetStrip;
