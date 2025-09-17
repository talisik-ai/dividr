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
} from './VideoSpriteSheetGenerator';

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

      // Get FPS from timeline state
      const fps = useVideoEditorStore((state) => state.timeline.fps);

      // Calculate duration in seconds
      const durationSeconds = useMemo(() => {
        const durationFrames = track.endFrame - track.startFrame;
        return durationFrames / fps;
      }, [track.startFrame, track.endFrame, fps]);

      // Calculate all thumbnails from sprite sheets
      const allThumbnails = useMemo(() => {
        return state.spriteSheets.flatMap((sheet) => sheet.thumbnails);
      }, [state.spriteSheets]);

      // Calculate visible thumbnails with proper track-relative positioning
      const visibleElements = useMemo(() => {
        if (allThumbnails.length === 0) return [];

        // Calculate proper positioning for timeline coverage
        const pixelsPerSecond = frameWidth * fps;

        // Calculate the interval between thumbnails in the sprite sheet
        const thumbnailInterval =
          allThumbnails.length > 1
            ? allThumbnails[1].timestamp - allThumbnails[0].timestamp
            : 0.5; // fallback

        // Calculate thumbnail width to fill the timeline properly
        // Ensure proper coverage without gaps
        const thumbnailDisplayWidth = Math.max(
          120,
          pixelsPerSecond * thumbnailInterval * 1.01, // Slight overlap to prevent gaps
        );

        // Track positioning: calculate track's absolute position
        const trackStartTime = track.sourceStartTime || 0; // Start time in source video

        return allThumbnails
          .map((thumbnail) => {
            // Calculate position relative to the track container (not timeline)
            const thumbnailTimeInTrack = thumbnail.timestamp - trackStartTime;
            const thumbnailFrameInTrack = thumbnailTimeInTrack * fps;
            const thumbnailRelativeToTrack = thumbnailFrameInTrack * frameWidth;

            // Only show thumbnails that belong to this track's timerange
            // Add small tolerance to prevent edge case filtering
            const tolerance = 0.1; // 100ms tolerance
            const isInTrackRange =
              thumbnailTimeInTrack >= -tolerance &&
              thumbnailTimeInTrack <= durationSeconds + tolerance;

            // Additional check: don't show thumbnails that would extend past track end
            const thumbnailEndTime =
              thumbnailTimeInTrack + thumbnailDisplayWidth / (frameWidth * fps);
            const doesNotExceedTrack =
              thumbnailEndTime <= durationSeconds + tolerance;

            // Viewport culling based on track-relative coordinates
            const isVisible =
              isInTrackRange &&
              doesNotExceedTrack &&
              thumbnailRelativeToTrack >= -thumbnailDisplayWidth &&
              thumbnailRelativeToTrack <= width + thumbnailDisplayWidth;

            return {
              thumbnail,
              x: thumbnailRelativeToTrack, // Position relative to track container
              displayWidth: thumbnailDisplayWidth,
              isVisible,
              timeInTrack: thumbnailTimeInTrack,
            };
          })
          .filter((element) => element.isVisible); // Only return visible elements
      }, [
        allThumbnails,
        frameWidth,
        fps,
        width,
        track.startFrame,
        track.sourceStartTime,
        durationSeconds,
      ]);

      // Generate sprite sheets when track or zoom changes significantly
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

        // Check cache first (now async)
        try {
          const cacheResult =
            await VideoSpriteSheetGenerator.getCachedSpriteSheets({
              videoPath,
              duration: durationSeconds,
              fps,
              sourceStartTime: track.sourceStartTime || 0,
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
        track.sourceStartTime,
        track.type,
        track.name,
        durationSeconds,
        fps,
        zoomLevel,
        // Note: Removed state dependencies to prevent circular updates
      ]);

      // Generate sprite sheets on mount and when dependencies change
      useEffect(() => {
        generateSpriteSheets();
      }, [generateSpriteSheets]);

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
            {visibleElements.map(({ thumbnail, x, displayWidth }) => {
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
      // More intelligent memoization for track-relative positioning
      const significantZoomChange =
        Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) > 0.2;

      // Check if track position or timing has changed
      const trackPositionChanged =
        prevProps.track.startFrame !== nextProps.track.startFrame ||
        prevProps.track.endFrame !== nextProps.track.endFrame ||
        prevProps.track.sourceStartTime !== nextProps.track.sourceStartTime;

      return (
        prevProps.track.id === nextProps.track.id &&
        prevProps.track.source === nextProps.track.source &&
        !trackPositionChanged &&
        prevProps.frameWidth === nextProps.frameWidth &&
        prevProps.width === nextProps.width &&
        prevProps.height === nextProps.height &&
        !significantZoomChange
      );
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

      // Enhanced validation to prevent black padding/empty space rendering
      const isValidPosition =
        thumbnail.x >= 0 &&
        thumbnail.y >= 0 &&
        thumbnail.x + thumbnail.width <= spriteSheet.width &&
        thumbnail.y + thumbnail.height <= spriteSheet.height &&
        thumbnail.x < spriteSheet.width &&
        thumbnail.y < spriteSheet.height;

      // Additional check: ensure the thumbnail position corresponds to an actual frame
      const thumbnailRow = Math.floor(thumbnail.y / thumbnail.height);
      const thumbnailCol = Math.floor(thumbnail.x / thumbnail.width);
      const thumbnailIndex =
        thumbnailRow * spriteSheet.thumbnailsPerRow + thumbnailCol;
      const isWithinFrameCount = thumbnailIndex < spriteSheet.thumbnails.length;

      // Also check if the thumbnail is within the actual sprite sheet grid bounds
      const isWithinGridBounds =
        thumbnailCol < spriteSheet.thumbnailsPerRow &&
        thumbnailRow < spriteSheet.thumbnailsPerColumn;

      // Extra strict validation: only render if this exact thumbnail exists in the metadata
      const thumbnailExists = spriteSheet.thumbnails.some(
        (t) => t.x === thumbnail.x && t.y === thumbnail.y,
      );

      // Don't render if ANY validation fails - prevents any possible black areas
      if (
        !isValidPosition ||
        !isWithinFrameCount ||
        !isWithinGridBounds ||
        !thumbnailExists
      ) {
        return null;
      }

      return (
        <div
          className="absolute top-0 overflow-hidden"
          style={{
            left: x,
            width: displayWidth,
            height: displayHeight,
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
                // Improved scaling calculation for better sprite positioning
                backgroundSize: `${(spriteSheet.width * displayWidth) / thumbnail.width}px ${(spriteSheet.height * displayHeight) / thumbnail.height}px`,
                backgroundPosition: `-${(thumbnail.x * displayWidth) / thumbnail.width}px -${(thumbnail.y * displayHeight) / thumbnail.height}px`,
                filter: 'brightness(0.95) contrast(1.05)', // Better visibility
                imageRendering:
                  'high-quality' as React.CSSProperties['imageRendering'], // Better quality for scaled images
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
      // Optimize thumbnail component re-renders
      const positionChange = Math.abs(prevProps.x - nextProps.x);
      const sizeChange =
        prevProps.displayWidth !== nextProps.displayWidth ||
        prevProps.displayHeight !== nextProps.displayHeight;

      return (
        prevProps.thumbnail.id === nextProps.thumbnail.id &&
        prevProps.spriteSheet.id === nextProps.spriteSheet.id &&
        prevProps.spriteSheet.url === nextProps.spriteSheet.url &&
        positionChange < 3 && // Only re-render for significant position changes
        !sizeChange
      );
    },
  );

SpriteSheetThumbnailComponent.displayName = 'SpriteSheetThumbnailComponent';
VideoSpriteSheetStrip.displayName = 'VideoSpriteSheetStrip';

export default VideoSpriteSheetStrip;
