/* eslint-disable @typescript-eslint/no-explicit-any */
import { RefreshCw } from 'lucide-react';
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
  onTextUpdate?: (trackId: string, newText: string) => void;
  children: React.ReactNode;
  appliedStyle?: React.CSSProperties;
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
  onTextUpdate,
  children,
  appliedStyle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
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
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Fixed handle size in pixels (consistent across all zoom levels)
  const HANDLE_SIZE = 10;
  const HANDLE_OFFSET = HANDLE_SIZE / 2;
  const ROTATION_HANDLE_DISTANCE = 30;

  // Convert normalized coordinates to pixel coordinates for rendering
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
    scale: 0.2,
    rotation: 0,
  };

  // Migration: If coordinates appear to be in pixel space, convert to normalized
  const normalizedTransform = React.useMemo(() => {
    if (Math.abs(rawTransform.x) > 2 || Math.abs(rawTransform.y) > 2) {
      const normalized = pixelsToNormalized({
        x: rawTransform.x,
        y: rawTransform.y,
      });
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
  const pixelPosition = normalizedToPixels({
    x: normalizedTransform.x,
    y: normalizedTransform.y,
  });

  const transform = {
    x: pixelPosition.x * previewScale,
    y: pixelPosition.y * previewScale,
    scale: normalizedTransform.scale,
    rotation: normalizedTransform.rotation,
  };

  // Handle double-click to enter edit mode
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      setIsEditing(true);
      // Focus the editable div after a short delay to ensure it's rendered
      setTimeout(() => {
        if (editableRef.current) {
          editableRef.current.focus();
          // Select all text
          const range = document.createRange();
          range.selectNodeContents(editableRef.current);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        }
      }, 50);
    },
    [isSelected, track.id, onSelect],
  );

  // Handle blur to exit edit mode
  const handleBlur = useCallback(() => {
    if (editableRef.current && onTextUpdate) {
      const newText = editableRef.current.innerText;
      onTextUpdate(track.id, newText);
    }
    setIsEditing(false);
  }, [track.id, onTextUpdate]);

  // Handle Enter key to save and exit edit mode
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      editableRef.current?.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsEditing(false);
    }
  }, []);

  // Track container size changes to update boundary dimensions
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Also update on transform changes
  useEffect(() => {
    if (containerRef.current) {
      setContainerSize({
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight,
      });
    }
  }, [transform.scale, transform.rotation, track.textContent, previewScale]);

  // Handle mouse down on the text element (start dragging)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      // Don't start drag if clicking on a handle or in edit mode
      const target = e.target as HTMLElement;
      if (target.classList.contains('transform-handle') || isEditing) {
        return;
      }

      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
    },
    [isSelected, track.id, transform, onSelect, isEditing],
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
        // Convert screen delta to video coordinate delta
        const normalizedDeltaX = deltaX / previewScale;
        const normalizedDeltaY = deltaY / previewScale;

        // Add delta to initial position (already in screen pixels)
        const newPixelX = initialTransform.x / previewScale + normalizedDeltaX;
        const newPixelY = initialTransform.y / previewScale + normalizedDeltaY;

        // Convert to normalized coordinates
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
        const scaleSensitivity = 200;
        let scaleFactor = 1;

        // Calculate scale factor based on handle type and direction
        switch (activeHandle) {
          case 'tl': // Top-left: drag up/left to grow, down/right to shrink
            scaleFactor = 1 - (deltaX + deltaY) / (2 * scaleSensitivity);
            break;
          case 'tr': // Top-right: drag up/right to grow, down/left to shrink
            scaleFactor = 1 + (deltaX - deltaY) / (2 * scaleSensitivity);
            break;
          case 'bl': // Bottom-left: drag down/left to grow, up/right to shrink
            scaleFactor = 1 + (-deltaX + deltaY) / (2 * scaleSensitivity);
            break;
          case 'br': // Bottom-right: drag down/right to grow, up/left to shrink
            scaleFactor = 1 + (deltaX + deltaY) / (2 * scaleSensitivity);
            break;
          case 't': // Top edge: drag up to grow, down to shrink
            scaleFactor = 1 - deltaY / scaleSensitivity;
            break;
          case 'r': // Right edge: drag right to grow, left to shrink
            scaleFactor = 1 + deltaX / scaleSensitivity;
            break;
          case 'b': // Bottom edge: drag down to grow, up to shrink
            scaleFactor = 1 + deltaY / scaleSensitivity;
            break;
          case 'l': // Left edge: drag left to grow, right to shrink
            scaleFactor = 1 - deltaX / scaleSensitivity;
            break;
        }

        let newScale = initialTransform.scale * scaleFactor;
        newScale = Math.max(0.1, Math.min(5, newScale));

        onTransformUpdate(track.id, {
          scale: newScale,
        });
      } else if (isRotating) {
        const boundaryRect = boundaryRef.current?.getBoundingClientRect();
        if (!boundaryRect) return;

        const centerX = boundaryRect.left + boundaryRect.width / 2;
        const centerY = boundaryRect.top + boundaryRect.height / 2;

        // Calculate current angle from center to mouse
        const currentAngle =
          Math.atan2(e.clientY - centerY, e.clientX - centerX) *
          (180 / Math.PI);

        // Calculate initial angle from center to drag start
        const initialAngle =
          Math.atan2(dragStart.y - centerY, dragStart.x - centerX) *
          (180 / Math.PI);

        // Calculate the angle delta and add to initial rotation
        const angleDelta = currentAngle - initialAngle;
        const newRotation = initialTransform.rotation + angleDelta;

        onTransformUpdate(track.id, {
          rotation: newRotation,
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

  // Get cursor style based on interaction mode and active handle
  const getCursorStyle = () => {
    if (isEditing) return 'text';
    if (isDragging) return 'grabbing';
    if (isScaling) {
      switch (activeHandle) {
        case 'tl':
        case 'br':
          return 'nwse-resize';
        case 'tr':
        case 'bl':
          return 'nesw-resize';
        case 't':
        case 'b':
          return 'ns-resize';
        case 'l':
        case 'r':
          return 'ew-resize';
        default:
          return 'nwse-resize';
      }
    }
    if (isRotating) return 'grab';
    if (isSelected) return 'move';
    return 'pointer';
  };

  // Handles are now rendered outside the text's scale transform
  // Apply minimal compensation only for extreme zoom out (< 0.5)
  // This keeps handles at reasonable size without over-scaling at normal zoom levels
  const handleScale = previewScale < 0.5 ? 0.5 : 1;

  return (
    <>
      {/* Text Content Container */}
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
          zIndex: isSelected ? 1000 : 1,
          userSelect: isEditing ? 'text' : 'none',
          WebkitUserSelect: isEditing ? 'text' : 'none',
        }}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Content */}
        <div
          ref={contentRef}
          className="relative"
          style={{ pointerEvents: 'auto' }}
        >
          {isEditing ? (
            <div
              ref={editableRef}
              contentEditable
              suppressContentEditableWarning
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              style={{
                outline: 'none',
                minWidth: '20px',
                minHeight: '20px',
                // Preserve all existing text styles during editing
                ...appliedStyle,
                // Override specific properties for editing
                cursor: 'text',
                userSelect: 'text',
                WebkitUserSelect: 'text',
              }}
            >
              {track.textContent}
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      {/* Selection Boundary - Rendered separately to avoid scale transform */}
      {isSelected && !isEditing && containerSize.width > 0 && (
        <div
          ref={boundaryRef}
          className="absolute pointer-events-none"
          style={{
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg)`,
            transformOrigin: 'center center',
            width: `${containerSize.width * transform.scale}px`,
            height: `${containerSize.height * transform.scale}px`,
            border: `${2 * handleScale}px solid #F45513`,
            borderRadius: `${4 * handleScale}px`,
            zIndex: isSelected ? 1001 : 2,
          }}
        >
          {/* Corner Handles */}
          {['tl', 'tr', 'bl', 'br'].map((handle) => {
            const getCursorForHandle = (h: string) => {
              if (h === 'tl' || h === 'br') return 'nwse-resize';
              if (h === 'tr' || h === 'bl') return 'nesw-resize';
              return 'nwse-resize';
            };

            return (
              <div
                key={handle}
                className="transform-handle absolute rounded-full pointer-events-auto hover:scale-125 transition-transform bg-white dark:bg-primary"
                style={{
                  width: `${HANDLE_SIZE * handleScale}px`,
                  height: `${HANDLE_SIZE * handleScale}px`,
                  cursor: getCursorForHandle(handle),
                  ...(handle === 'tl' && {
                    top: `-${HANDLE_OFFSET * handleScale}px`,
                    left: `-${HANDLE_OFFSET * handleScale}px`,
                  }),
                  ...(handle === 'tr' && {
                    top: `-${HANDLE_OFFSET * handleScale}px`,
                    right: `-${HANDLE_OFFSET * handleScale}px`,
                  }),
                  ...(handle === 'bl' && {
                    bottom: `-${HANDLE_OFFSET * handleScale}px`,
                    left: `-${HANDLE_OFFSET * handleScale}px`,
                  }),
                  ...(handle === 'br' && {
                    bottom: `-${HANDLE_OFFSET * handleScale}px`,
                    right: `-${HANDLE_OFFSET * handleScale}px`,
                  }),
                }}
                onMouseDown={(e) =>
                  handleScaleMouseDown(e, handle as HandleType)
                }
              />
            );
          })}

          {/* Edge Handles - Left and Right only (as partial height lines) */}
          {['r', 'l'].map((handle) => (
            <div
              key={handle}
              className="transform-handle absolute pointer-events-auto hover:opacity-80 transition-opacity"
              style={{
                width: `${5 * handleScale}px`,
                height: '40%',
                backgroundColor: 'white',
                borderRadius: `${999 * handleScale}px`,
                cursor: 'ew-resize',
                ...(handle === 'r' && {
                  right: `-${3 * handleScale}px`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }),
                ...(handle === 'l' && {
                  left: `-${3 * handleScale}px`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }),
              }}
              onMouseDown={(e) => handleScaleMouseDown(e, handle as HandleType)}
            />
          ))}

          {/* Rotation Handle - Bottom with RefreshCw icon */}
          <div
            className="transform-handle absolute pointer-events-auto cursor-grab hover:scale-110 transition-transform flex items-center justify-center"
            style={{
              width: `${20 * handleScale}px`,
              height: `${20 * handleScale}px`,
              bottom: `-${ROTATION_HANDLE_DISTANCE * handleScale}px`,
              left: '50%',
              transform: `translateX(-50%)`,
              backgroundColor: '#F45513',
              borderRadius: '50%',
            }}
            onMouseDown={handleRotateMouseDown}
          >
            <RefreshCw
              size={12 * handleScale}
              color="white"
              strokeWidth={2.5}
            />
          </div>
        </div>
      )}
    </>
  );
};
