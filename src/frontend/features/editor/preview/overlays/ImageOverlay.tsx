import React from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { OverlayRenderProps } from '../core/types';
import { getTrackZIndex } from '../utils/trackUtils';

/**
 * Image overlay component - renders all active image tracks
 */

export interface ImageOverlayProps extends OverlayRenderProps {
  activeImages: VideoTrack[];
  allTracks: VideoTrack[];
}

export const ImageOverlay: React.FC<ImageOverlayProps> = ({
  activeImages,
  allTracks,
  previewScale,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
}) => {
  if (activeImages.length === 0) return null;

  // Sort images by their index in the tracks array to maintain layer order
  // Lower index = rendered first = appears behind higher index tracks
  const sortedImages = [...activeImages].sort((a, b) => {
    const indexA = allTracks.findIndex((t) => t.id === a.id);
    const indexB = allTracks.findIndex((t) => t.id === b.id);
    return indexA - indexB;
  });

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'hidden', // Clip images that go outside video canvas
        zIndex:
          sortedImages.length > 0
            ? Math.max(...sortedImages.map((t) => getTrackZIndex(t, allTracks)))
            : 200,
      }}
    >
      {sortedImages.map((track) => {
        const imageUrl = track.previewUrl || track.source;

        // Calculate adaptive image dimensions that fit canvas while preserving aspect ratio
        let defaultWidth = baseVideoWidth;
        let defaultHeight = baseVideoHeight;

        if (track.width && track.height) {
          const imageAspectRatio = track.width / track.height;
          const canvasAspectRatio = baseVideoWidth / baseVideoHeight;

          if (imageAspectRatio > canvasAspectRatio) {
            // Image is wider than canvas - fit to width
            defaultWidth = baseVideoWidth;
            defaultHeight = baseVideoWidth / imageAspectRatio;
          } else {
            // Image is taller than canvas - fit to height
            defaultHeight = baseVideoHeight;
            defaultWidth = baseVideoHeight * imageAspectRatio;
          }
        }

        // Get image transform properties (default to centered, adaptive-fit if not set)
        const imageTransform = track.textTransform || {
          x: 0, // Centered
          y: 0, // Centered
          scale: 1, // 100% scale
          rotation: 0, // No rotation
          width: defaultWidth, // Adaptive width
          height: defaultHeight, // Adaptive height
        };

        // Calculate position in pixels (from normalized coordinates)
        const pixelX = imageTransform.x * (baseVideoWidth / 2);
        const pixelY = imageTransform.y * (baseVideoHeight / 2);

        // Calculate scaled dimensions
        const scaledWidth =
          (imageTransform.width || defaultWidth) * imageTransform.scale;
        const scaledHeight =
          (imageTransform.height || defaultHeight) * imageTransform.scale;

        // Apply preview scale for zoom responsiveness
        const displayWidth = scaledWidth * previewScale;
        const displayHeight = scaledHeight * previewScale;
        const displayX = pixelX * previewScale;
        const displayY = pixelY * previewScale;

        return (
          <div
            key={track.id}
            className="absolute pointer-events-auto"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${displayX}px, ${displayY}px) rotate(${imageTransform.rotation}deg)`,
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              opacity:
                track.textStyle?.opacity !== undefined
                  ? track.textStyle.opacity / 100
                  : 1,
              zIndex: getTrackZIndex(track, allTracks),
            }}
          >
            <img
              src={imageUrl}
              alt={track.name}
              className="w-full h-full object-contain"
              style={{
                userSelect: 'none',
                pointerEvents: 'none',
              }}
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
};
