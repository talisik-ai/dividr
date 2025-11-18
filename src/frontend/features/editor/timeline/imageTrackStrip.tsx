import React, { useEffect, useMemo, useRef, useState } from 'react';
import { VideoTrack } from '../stores/videoEditor/index';

interface ImageTrackStripProps {
  track: VideoTrack;
  frameWidth: number;
  width: number;
  height: number;
  zoomLevel: number;
}

interface ImageTile {
  id: string;
  startX: number;
  width: number;
  clipOffset: number; // For partial tiles at edges
  repeatIndex: number;
}

// GPU-accelerated image tile component
const GPUAcceleratedImageTile: React.FC<{
  tile: ImageTile;
  imageUrl: string;
  height: number;
  tileNativeWidth: number;
  viewportOffset: number;
}> = React.memo(
  ({ tile, imageUrl, height, tileNativeWidth, viewportOffset }) => {
    const { startX, width: tileWidth, clipOffset } = tile;

    // Use transform for positioning (GPU accelerated)
    const transform = `translate3d(${startX - viewportOffset}px, 0, 0)`;

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
            width: `${tileNativeWidth}px`,
            height: `${height}px`,
            left: `-${clipOffset}px`,
            backgroundImage: `url(${imageUrl})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'left center',
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
      Math.abs(prev.tile.startX - next.tile.startX) < 1 &&
      Math.abs(prev.tile.width - next.tile.width) < 1 &&
      Math.abs(prev.viewportOffset - next.viewportOffset) < 1 &&
      prev.height === next.height &&
      prev.imageUrl === next.imageUrl
    );
  },
);

GPUAcceleratedImageTile.displayName = 'GPUAcceleratedImageTile';

export const ImageTrackStrip: React.FC<ImageTrackStripProps> = React.memo(
  ({ track, width, height, zoomLevel }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState<string | null>(null);
    const [imageDimensions, setImageDimensions] = useState<{
      width: number;
      height: number;
    } | null>(null);

    // Viewport state for culling
    const [viewportBounds, setViewportBounds] = useState({
      start: 0,
      end: width,
    });
    const rafRef = useRef<number>(0);

    // Get the image URL from track
    const imageUrl = useMemo(() => {
      return track.previewUrl || track.source;
    }, [track.previewUrl, track.source]);

    // Load image and get dimensions
    useEffect(() => {
      if (!imageUrl) {
        setImageError('No image source');
        return;
      }

      setImageLoaded(false);
      setImageError(null);

      const img = new Image();

      img.onload = () => {
        setImageDimensions({
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setImageLoaded(true);
      };

      img.onerror = () => {
        setImageError('Failed to load image');
        setImageLoaded(false);
      };

      img.src = imageUrl;

      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }, [imageUrl]);

    // Calculate native display width based on image aspect ratio
    const tileNativeWidth = useMemo(() => {
      if (!imageDimensions) return height; // Default to square

      const aspectRatio = imageDimensions.width / imageDimensions.height;
      return aspectRatio * height;
    }, [imageDimensions, height]);

    // Generate tiles for seamless repetition across track width
    const imageTiles = useMemo(() => {
      if (!imageLoaded || !imageDimensions || tileNativeWidth <= 0) return [];

      const tiles: ImageTile[] = [];

      // Calculate how many tiles we need to fill the entire track width
      const tilesNeeded = Math.ceil(width / tileNativeWidth + 0.0001);

      for (let i = 0; i < tilesNeeded; i++) {
        const tileStartX = i * tileNativeWidth;
        const tileEndX = Math.min(tileStartX + tileNativeWidth, width);
        const tileWidth = tileEndX - tileStartX;

        // Only add tiles with meaningful width
        if (tileWidth > 0.5) {
          tiles.push({
            id: `${track.id}-tile-${i}`,
            startX: tileStartX,
            width: tileWidth,
            clipOffset: 0,
            repeatIndex: i,
          });
        }
      }

      return tiles;
    }, [imageLoaded, imageDimensions, tileNativeWidth, width, track.id]);

    // High-performance viewport culling with buffer zone
    const visibleTiles = useMemo(() => {
      // Increase buffer significantly for fast scrolling/zooming
      const buffer = width * 1.5; // 150% buffer for smooth continuous scrolling
      const leftBound = Math.max(0, viewportBounds.start - buffer);
      const rightBound = viewportBounds.end + buffer;

      // If no tiles, return empty array
      if (imageTiles.length === 0) return [];

      // Binary search for first visible tile
      let left = 0;
      let right = imageTiles.length - 1;
      let firstVisible = 0;

      while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const tile = imageTiles[mid];
        if (tile.startX + tile.width < leftBound) {
          left = mid + 1;
        } else {
          firstVisible = mid;
          right = mid - 1;
        }
      }

      // Collect visible tiles with safety margin
      const visible: ImageTile[] = [];
      for (let i = Math.max(0, firstVisible - 1); i < imageTiles.length; i++) {
        const tile = imageTiles[i];
        // Include tiles that are even partially visible
        if (tile.startX > rightBound) break;
        if (tile.startX + tile.width >= leftBound) {
          visible.push(tile);
        }
      }

      return visible;
    }, [imageTiles, viewportBounds, width]);

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
        {/* Loading state */}
        {!imageLoaded && !imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-gray-900/90 backdrop-blur-sm rounded border border-gray-700/50">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-blue-400 text-xs font-medium">
                Loading image...
              </span>
            </div>
          </div>
        )}

        {/* Error state */}
        {imageError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="flex items-center space-x-2 px-3 py-1.5 bg-red-900/90 backdrop-blur-sm rounded border border-red-700/50">
              <div className="w-2 h-2 rounded-full bg-red-400" />
              <span className="text-red-200 text-xs font-medium">
                {imageError}
              </span>
            </div>
          </div>
        )}

        {/* Background */}
        <div className="absolute inset-0 bg-gray-800" />

        {/* GPU-accelerated image tile container */}
        {imageLoaded && (
          <div
            className="absolute inset-0"
            style={{
              transform: 'translateZ(0)',
              willChange: 'contents',
            }}
          >
            {visibleTiles.map((tile) => (
              <GPUAcceleratedImageTile
                key={tile.id}
                tile={tile}
                imageUrl={imageUrl}
                height={height}
                tileNativeWidth={tileNativeWidth}
                viewportOffset={viewportBounds.start}
              />
            ))}
          </div>
        )}

        {/* Track name overlay */}
        <div
          className="absolute bottom-1 left-2 text-white text-xs font-medium pointer-events-none whitespace-nowrap overflow-hidden"
          style={{
            zIndex: 2,
            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
            maxWidth: `calc(${width}px - 16px)`,
          }}
        >
          {track.name}
        </div>
      </div>
    );
  },
  // Optimized memo comparison
  (prevProps, nextProps) => {
    // Re-render on any significant change
    const significantChange =
      prevProps.track.id !== nextProps.track.id ||
      prevProps.track.source !== nextProps.track.source ||
      prevProps.track.previewUrl !== nextProps.track.previewUrl ||
      prevProps.track.startFrame !== nextProps.track.startFrame ||
      prevProps.track.endFrame !== nextProps.track.endFrame ||
      prevProps.frameWidth !== nextProps.frameWidth ||
      prevProps.height !== nextProps.height ||
      prevProps.width !== nextProps.width ||
      prevProps.zoomLevel !== nextProps.zoomLevel;

    return !significantChange;
  },
);

ImageTrackStrip.displayName = 'ImageTrackStrip';

export default ImageTrackStrip;
