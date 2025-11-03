import React from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { ImageTransformBoundary } from '../components/ImageTransformBoundary';
import { OverlayRenderProps } from '../core/types';
import { getTrackZIndex } from '../utils/trackUtils';

/**
 * Image overlay component - renders all active image tracks with transform controls
 */

export interface ImageOverlayProps extends OverlayRenderProps {
  activeImages: VideoTrack[];
  allTracks: VideoTrack[];
  selectedTrackIds: string[];
  onTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      width?: number;
      height?: number;
    },
  ) => void;
  onSelect: (trackId: string) => void;
  onRotationStateChange: (isRotating: boolean) => void;
  onDragStateChange: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
}

export const ImageOverlay: React.FC<ImageOverlayProps> = ({
  activeImages,
  allTracks,
  selectedTrackIds,
  previewScale,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  onTransformUpdate,
  onSelect,
  onRotationStateChange,
  onDragStateChange,
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
        const isSelected = selectedTrackIds.includes(track.id);

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

        return (
          <ImageTransformBoundary
            key={track.id}
            track={track}
            isSelected={isSelected}
            previewScale={previewScale}
            videoWidth={baseVideoWidth}
            videoHeight={baseVideoHeight}
            onTransformUpdate={onTransformUpdate}
            onSelect={onSelect}
            onRotationStateChange={onRotationStateChange}
            onDragStateChange={onDragStateChange}
          >
            <div
              className="relative"
              style={{
                width: `${imageTransform.width || defaultWidth}px`,
                height: `${imageTransform.height || defaultHeight}px`,
                opacity:
                  track.textStyle?.opacity !== undefined
                    ? track.textStyle.opacity / 100
                    : 1,
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
          </ImageTransformBoundary>
        );
      })}
    </div>
  );
};
