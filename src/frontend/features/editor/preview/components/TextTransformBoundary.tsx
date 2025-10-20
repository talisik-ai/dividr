/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';

interface TextTransformBoundaryProps {
  track: VideoTrack;
  isSelected: boolean;
  previewScale: number;
  videoWidth: number;
  videoHeight: number;
  onTransformUpdate: (
    trackId: string,
    transform: { x?: number; y?: number; scale?: number; rotation?: number },
  ) => void;
  onSelect: (trackId: string) => void;
  children: React.ReactNode;
}

type HandleType =
  | 'tl'
  | 'tr'
  | 'bl'
  | 'br'
  | 't'
  | 'r'
  | 'b'
  | 'l'
  | 'rotate'
  | null;

export const TextTransformBoundary: React.FC<TextTransformBoundaryProps> = ({
  track,
  isSelected,
  previewScale,
  videoWidth,
  videoHeight,
  onTransformUpdate,
  onSelect,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [initialTransform, setInitialTransform] = useState<{
    x: number;
    y: number;
    scale: number;
    rotation: number;
  } | null>(null);
  // Future: Track shift and alt key states for aspect ratio lock and center scaling
  // const [shiftPressed, setShiftPressed] = useState(false);
  // const [altPressed, setAltPressed] = useState(false);

  // Convert normalized coordinates to pixel coordinates for rendering
  // Normalized: -1 to 1 where 0 is center
  // Pixels: relative to video center
  const normalizedToPixels = useCallback(
    (normalized: { x: number; y: number }) => {
      return {
        x: normalized.x * (videoWidth / 2),
        y: normalized.y * (videoHeight / 2),
      };
    },
    [videoWidth, videoHeight],
  );

  // Convert pixel coordinates to normalized coordinates for storage
  const pixelsToNormalized = useCallback(
    (pixels: { x: number; y: number }) => {
      return {
        x: pixels.x / (videoWidth / 2),
        y: pixels.y / (videoHeight / 2),
      };
    },
    [videoWidth, videoHeight],
  );

  // Get current transform from track (normalized coordinates: -1 to 1 where 0 is center)
  const rawTransform = track.textTransform || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
  };

  // Migration: If coordinates appear to be in pixel space (abs value > 2), convert to normalized
  // This ensures backward compatibility with existing text elements
  const normalizedTransform = React.useMemo(() => {
    if (Math.abs(rawTransform.x) > 2 || Math.abs(rawTransform.y) > 2) {
      // These are likely pixel coordinates, convert to normalized
      const normalized = pixelsToNormalized({
        x: rawTransform.x,
        y: rawTransform.y,
      });
      // Auto-migrate by updating the track
      onTransformUpdate(track.id, {
        x: normalized.x,
        y: normalized.y,
      });
      return {
        ...rawTransform,
        x: normalized.x,
        y: normalized.y,
      };
    }
    return rawTransform;
  }, [
    rawTransform.x,
    rawTransform.y,
    rawTransform.scale,
    rawTransform.rotation,
    pixelsToNormalized,
    onTransformUpdate,
    track.id,
  ]);

  // Clamp normalized coordinates to keep text within video bounds
  const clampNormalized = useCallback(
    (normalized: { x: number; y: number }) => {
      return {
        x: Math.max(-1, Math.min(1, normalized.x)),
        y: Math.max(-1, Math.min(1, normalized.y)),
      };
    },
    [],
  );

  // Get pixel-based transform for rendering
  // Convert normalized to pixels using base video dimensions, then scale by previewScale
  const pixelPosition = normalizedToPixels({
    x: normalizedTransform.x,
    y: normalizedTransform.y,
  });

  const transform = {
    x: pixelPosition.x * previewScale, // Scale position by preview zoom
    y: pixelPosition.y * previewScale, // Scale position by preview zoom
    scale: normalizedTransform.scale,
    rotation: normalizedTransform.rotation,
  };

  // Future: Track shift and alt key states
  // useEffect(() => {
  //   const handleKeyDown = (e: KeyboardEvent) => {
  //     if (e.key === 'Shift') setShiftPressed(true);
  //     if (e.key === 'Alt') setAltPressed(true);
  //   };

  //   const handleKeyUp = (e: KeyboardEvent) => {
  //     if (e.key === 'Shift') setShiftPressed(false);
  //     if (e.key === 'Alt') setAltPressed(false);
  //   };

  //   window.addEventListener('keydown', handleKeyDown);
  //   window.addEventListener('keyup', handleKeyUp);

  //   return () => {
  //     window.removeEventListener('keydown', handleKeyDown);
  //     window.removeEventListener('keyup', handleKeyUp);
  //   };
  // }, []);

  // Handle mouse down on the text element (start dragging)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Always stop propagation to prevent other text elements from being affected
      e.stopPropagation();
      e.preventDefault();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      // Don't start drag if clicking on a handle
      const target = e.target as HTMLElement;
      if (target.classList.contains('transform-handle')) {
        return;
      }

      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
    },
    [isSelected, track.id, transform, onSelect],
  );

  // Handle mouse down on scale handles
  const handleScaleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandleType) => {
      if (!isSelected) return;

      e.stopPropagation();
      e.preventDefault();
      setIsScaling(true);
      setActiveHandle(handle);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
    },
    [isSelected, transform],
  );

  // Handle mouse down on rotation handle
  const handleRotateMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelected) return;

      e.stopPropagation();
      e.preventDefault();
      setIsRotating(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
    },
    [isSelected, transform],
  );

  // Handle mouse move for all interactions
  useEffect(() => {
    if (!isDragging && !isScaling && !isRotating) return;
    if (!dragStart || !initialTransform) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      if (isDragging) {
        // Adjust movement based on preview scale for consistent feel
        // Divide by previewScale to normalize movement
        const normalizedDeltaX = deltaX / previewScale;
        const normalizedDeltaY = deltaY / previewScale;

        // Calculate new pixel position
        const newPixelX = initialTransform.x + normalizedDeltaX;
        const newPixelY = initialTransform.y + normalizedDeltaY;

        // Convert to normalized coordinates and clamp to bounds
        const normalizedPos = pixelsToNormalized({
          x: newPixelX,
          y: newPixelY,
        });
        const clampedPos = clampNormalized(normalizedPos);

        onTransformUpdate(track.id, {
          x: clampedPos.x,
          y: clampedPos.y,
        });
      } else if (isScaling && activeHandle) {
        // Calculate scale based on handle and delta
        // Normalize the scaling sensitivity based on preview scale
        const scaleSensitivity = 200 * previewScale; // Adjust sensitivity with zoom
        const scaleFactor = 1 + deltaY / scaleSensitivity;
        let newScale = initialTransform.scale * scaleFactor;

        // Clamp scale between 0.1 and 5
        newScale = Math.max(0.1, Math.min(5, newScale));

        onTransformUpdate(track.id, {
          scale: newScale,
        });
      } else if (isRotating) {
        // Calculate rotation based on mouse position
        const containerRect = containerRef.current?.getBoundingClientRect();
        if (!containerRect) return;

        const centerX = containerRect.left + containerRect.width / 2;
        const centerY = containerRect.top + containerRect.height / 2;

        const angle =
          Math.atan2(e.clientY - centerY, e.clientX - centerX) *
          (180 / Math.PI);
        const rotation = angle + 90; // Adjust for handle position

        onTransformUpdate(track.id, {
          rotation,
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsScaling(false);
      setIsRotating(false);
      setActiveHandle(null);
      setDragStart(null);
      setInitialTransform(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    isScaling,
    isRotating,
    dragStart,
    initialTransform,
    activeHandle,
    track.id,
    previewScale,
    onTransformUpdate,
    pixelsToNormalized,
    clampNormalized,
  ]);

  // Get cursor style based on interaction mode
  const getCursorStyle = () => {
    if (isDragging) return 'grabbing';
    if (isScaling) return 'nwse-resize';
    if (isRotating) return 'grab';
    if (isSelected) return 'move';
    return 'pointer';
  };

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
        transformOrigin: 'center center',
        cursor: getCursorStyle(),
        pointerEvents: 'auto',
        zIndex: isSelected ? 1000 : 1, // Selected elements on top
        userSelect: 'none', // Prevent text selection during drag
        WebkitUserSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Content */}
      <div className="relative" style={{ pointerEvents: 'auto' }}>
        {children}
      </div>

      {/* Selection Boundary */}
      {isSelected && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            border: '2px solid #3b82f6',
            borderRadius: '4px',
            boxShadow: '0 0 0 1px rgba(59, 130, 246, 0.2)',
          }}
        >
          {/* Corner Handles */}
          {['tl', 'tr', 'bl', 'br'].map((handle) => (
            <div
              key={handle}
              className="transform-handle absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full pointer-events-auto cursor-nwse-resize hover:scale-125 transition-transform"
              style={{
                ...(handle === 'tl' && { top: -6, left: -6 }),
                ...(handle === 'tr' && { top: -6, right: -6 }),
                ...(handle === 'bl' && { bottom: -6, left: -6 }),
                ...(handle === 'br' && { bottom: -6, right: -6 }),
              }}
              onMouseDown={(e) => handleScaleMouseDown(e, handle as HandleType)}
            />
          ))}

          {/* Edge Handles */}
          {['t', 'r', 'b', 'l'].map((handle) => (
            <div
              key={handle}
              className="transform-handle absolute w-3 h-3 bg-white border-2 border-blue-500 rounded-full pointer-events-auto hover:scale-125 transition-transform"
              style={{
                ...(handle === 't' && {
                  top: -6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  cursor: 'ns-resize',
                }),
                ...(handle === 'r' && {
                  right: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'ew-resize',
                }),
                ...(handle === 'b' && {
                  bottom: -6,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  cursor: 'ns-resize',
                }),
                ...(handle === 'l' && {
                  left: -6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  cursor: 'ew-resize',
                }),
              }}
              onMouseDown={(e) => handleScaleMouseDown(e, handle as HandleType)}
            />
          ))}

          {/* Rotation Handle */}
          <div
            className="transform-handle absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full pointer-events-auto cursor-grab hover:scale-125 transition-transform"
            style={{
              top: -30,
              left: '50%',
              transform: 'translateX(-50%)',
            }}
            onMouseDown={handleRotateMouseDown}
          >
            {/* Rotation line connecting to top edge */}
            <div
              className="absolute w-0.5 bg-blue-500"
              style={{
                height: '20px',
                left: '50%',
                top: '100%',
                transform: 'translateX(-50%)',
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
