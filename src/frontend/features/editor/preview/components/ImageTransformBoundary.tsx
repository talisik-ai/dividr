/* eslint-disable @typescript-eslint/no-explicit-any */
import { RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../stores/videoEditor/index';

interface ImageTransformBoundaryProps {
  track: VideoTrack;
  isSelected: boolean;
  previewScale: number;
  videoWidth: number;
  videoHeight: number;
  renderScale?: number; // The actual render scale from coordinate system (baseScale)
  interactionMode?: 'select' | 'pan' | 'text-edit'; // Current interaction mode
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
  onRotationStateChange?: (isRotating: boolean) => void;
  onDragStateChange?: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
  children: React.ReactNode;
  clipContent?: boolean; // Whether to clip content to canvas bounds
  clipWidth?: number; // Width of the clipping area
  clipHeight?: number; // Height of the clipping area
  boundaryOnly?: boolean; // Whether to only render the boundary, not the content
  contentOnly?: boolean; // Whether to only render the content, not the boundary
  disableAutoSizeUpdates?: boolean; // Skip auto width/height sync when rendering boundaries only
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

export const ImageTransformBoundary: React.FC<ImageTransformBoundaryProps> = ({
  track,
  isSelected,
  previewScale,
  videoWidth,
  videoHeight,
  renderScale,
  interactionMode = 'select',
  onTransformUpdate,
  onSelect,
  onRotationStateChange,
  onDragStateChange,
  children,
  clipContent = false,
  clipWidth,
  clipHeight,
  boundaryOnly = false,
  contentOnly = false,
  disableAutoSizeUpdates = false,
}) => {
  // Use renderScale if provided (from coordinate system), otherwise fall back to previewScale
  const effectiveRenderScale = renderScale ?? previewScale;
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); // Ref to the actual image content (before scale transform)
  const boundaryRef = useRef<HTMLDivElement>(null);
  const hasMigratedRef = useRef(false); // Track if we've already migrated coordinates
  const transformDragStartedRef = useRef(false); // Track if we've started transform drag for playback pause
  const [isDragging, setIsDragging] = useState(false);
  const [isScaling, setIsScaling] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  // Get playback control methods
  const startDraggingTransform = useVideoEditorStore(
    (state) => state.startDraggingTransform,
  );
  const endDraggingTransform = useVideoEditorStore(
    (state) => state.endDraggingTransform,
  );
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

  const shouldRenderBoundary = isSelected && !contentOnly;
  const shouldRenderContent = !boundaryOnly;

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
    scale: 1,
    rotation: 0,
    width: 0,
    height: 0,
  };

  // Migration: If coordinates appear to be in pixel space, convert to normalized
  // ONLY run this migration once per track to avoid interfering with drag operations
  const normalizedTransform = React.useMemo(() => {
    // Check if coordinates need migration (look like pixel values > 2)
    const needsMigration =
      !hasMigratedRef.current &&
      (Math.abs(rawTransform.x) > 2 || Math.abs(rawTransform.y) > 2);

    if (needsMigration) {
      hasMigratedRef.current = true; // Mark as migrated
      const normalized = pixelsToNormalized({
        x: rawTransform.x,
        y: rawTransform.y,
      });
      onTransformUpdate(track.id, {
        x: normalized.x,
        y: normalized.y,
        width: rawTransform.width,
        height: rawTransform.height,
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
    rawTransform.width,
    rawTransform.height,
    pixelsToNormalized,
    onTransformUpdate,
    track.id,
  ]);

  // Allow positioning beyond video bounds for professional editing behavior
  // Content will be clipped by the overlay container, but handles remain accessible
  const clampNormalized = useCallback(
    (normalized: { x: number; y: number }) => {
      // No clamping - allow elements to move outside the visible canvas
      // This matches behavior of professional tools like CapCut, Premiere Pro, Figma
      return normalized;
    },
    [],
  );

  // Get pixel-based transform for rendering
  const pixelPosition = normalizedToPixels({
    x: normalizedTransform.x,
    y: normalizedTransform.y,
  });

  const transform = {
    x: pixelPosition.x * effectiveRenderScale,
    y: pixelPosition.y * effectiveRenderScale,
    scale: normalizedTransform.scale,
    rotation: normalizedTransform.rotation,
  };

  // Track content size changes to update boundary dimensions
  // CRITICAL: We observe contentRef (the actual image), NOT containerRef (the transform wrapper)
  // This gives us the intrinsic content size before scale transform is applied
  // Store the previous renderScale to detect when it changes
  const prevRenderScaleRef = useRef(effectiveRenderScale);

  useEffect(() => {
    if (!contentRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // This is the intrinsic content size (before scale transform)
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Update dimensions in the store when content size changes
  // CRITICAL: Skip updates when renderScale changes to prevent dimension recalculation on fullscreen toggle
  useEffect(() => {
    if (disableAutoSizeUpdates) return;

    // Detect if renderScale changed (e.g., entering/exiting fullscreen)
    const renderScaleChanged =
      prevRenderScaleRef.current !== effectiveRenderScale;
    prevRenderScaleRef.current = effectiveRenderScale;

    // Skip dimension updates when renderScale changes - this prevents auto-scaling on fullscreen toggle
    if (renderScaleChanged) {
      return;
    }

    if (containerSize.width > 0 && containerSize.height > 0) {
      const currentWidth = normalizedTransform.width || 0;
      const currentHeight = normalizedTransform.height || 0;

      // Calculate dimensions in video space (independent of render scale)
      // containerSize is now the INTRINSIC content size (from contentRef, not containerRef)
      // So we don't need to divide by scale - just convert directly to video space
      const videoSpaceWidth = containerSize.width / effectiveRenderScale;
      const videoSpaceHeight = containerSize.height / effectiveRenderScale;

      // Only update if the video-space dimensions have changed significantly
      const threshold = 1; // 1px tolerance in video space
      if (
        Math.abs(currentWidth - videoSpaceWidth) > threshold ||
        Math.abs(currentHeight - videoSpaceHeight) > threshold
      ) {
        onTransformUpdate(track.id, {
          width: videoSpaceWidth,
          height: videoSpaceHeight,
        });
      }
    }
  }, [
    containerSize.width,
    containerSize.height,
    normalizedTransform.width,
    normalizedTransform.height,
    track.id,
    onTransformUpdate,
    effectiveRenderScale,
    disableAutoSizeUpdates,
  ]);

  // Handle mouse down on the image element (start dragging)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only allow interaction in select mode
      if (interactionMode !== 'select') {
        e.stopPropagation();
        return;
      }

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

      // Pause playback if playing
      if (!transformDragStartedRef.current) {
        transformDragStartedRef.current = true;
        startDraggingTransform();
      }
    },
    [
      isSelected,
      track.id,
      transform,
      onSelect,
      startDraggingTransform,
      interactionMode,
    ],
  );

  // Handle mouse down on scale handles
  const handleScaleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandleType) => {
      // Only allow interaction in select mode
      if (interactionMode !== 'select' || !isSelected) return;

      e.stopPropagation();
      e.preventDefault();
      setIsScaling(true);
      setActiveHandle(handle);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);

      // Pause playback if playing
      if (!transformDragStartedRef.current) {
        transformDragStartedRef.current = true;
        startDraggingTransform();
      }
    },
    [isSelected, transform, startDraggingTransform, interactionMode],
  );

  // Handle mouse down on rotation handle
  const handleRotateMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only allow interaction in select mode
      if (interactionMode !== 'select' || !isSelected) return;

      e.stopPropagation();
      e.preventDefault();
      setIsRotating(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
      onRotationStateChange?.(true);

      // Pause playback if playing
      if (!transformDragStartedRef.current) {
        transformDragStartedRef.current = true;
        startDraggingTransform();
      }
    },
    [
      isSelected,
      transform,
      onRotationStateChange,
      startDraggingTransform,
      interactionMode,
    ],
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
        // initialTransform is in screen pixels, deltaX/Y is in screen pixels
        // We need to convert both to video space before adding
        const videoDeltaX = deltaX / effectiveRenderScale;
        const videoDeltaY = deltaY / effectiveRenderScale;

        // initialTransform is already scaled, so convert it back to video space first
        const initialVideoX = initialTransform.x / effectiveRenderScale;
        const initialVideoY = initialTransform.y / effectiveRenderScale;

        // Calculate new position in video space
        let newPixelX = initialVideoX + videoDeltaX;
        let newPixelY = initialVideoY + videoDeltaY;

        // Snapping logic - only when Shift or Ctrl is held
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          const snapTolerance = e.ctrlKey || e.metaKey ? 2 : 10; // Strong snap (Ctrl) vs soft snap (Shift)

          // Define snap points (in video pixel coordinates, centered at 0,0)
          const snapPoints = {
            horizontal: [0], // Center
            vertical: [0], // Center
          };

          // Add edge snap points
          const halfWidth = (containerSize.width * transform.scale) / 2;
          const halfHeight = (containerSize.height * transform.scale) / 2;

          // Video frame edges (in video pixel coordinates)
          snapPoints.horizontal.push(
            -videoHeight / 2 + halfHeight, // Top edge
            videoHeight / 2 - halfHeight, // Bottom edge
          );
          snapPoints.vertical.push(
            -videoWidth / 2 + halfWidth, // Left edge
            videoWidth / 2 - halfWidth, // Right edge
          );

          // Snap to horizontal points
          for (const snapY of snapPoints.horizontal) {
            if (Math.abs(newPixelY - snapY) < snapTolerance) {
              newPixelY = snapY;
              break;
            }
          }

          // Snap to vertical points
          for (const snapX of snapPoints.vertical) {
            if (Math.abs(newPixelX - snapX) < snapTolerance) {
              newPixelX = snapX;
              break;
            }
          }
        }

        // Convert to normalized coordinates
        const normalizedPos = pixelsToNormalized({
          x: newPixelX,
          y: newPixelY,
        });
        const clampedPos = clampNormalized(normalizedPos);

        // Notify parent of drag state for guide rendering
        if (onDragStateChange && containerSize.width > 0) {
          onDragStateChange(true, {
            x: newPixelX,
            y: newPixelY,
            width: containerSize.width * transform.scale,
            height: containerSize.height * transform.scale,
          });
        }

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
        let newRotation = initialTransform.rotation + angleDelta;

        // Snapping logic - only snap when Shift or Ctrl is held
        // Snap to 0°, 90°, 180°, 270° (nearest angle only)
        if (e.shiftKey || e.ctrlKey) {
          const snapThreshold = 5; // degrees
          const snapAngles = [0, 90, 180, 270];

          // Normalize rotation to 0-360 range for comparison
          const normalizedRotation = ((newRotation % 360) + 360) % 360;

          // Find the nearest snap angle
          let nearestAngle = null;
          let minDistance = Infinity;

          for (const snapAngle of snapAngles) {
            // Calculate the shortest distance considering the circular nature (0° = 360°)
            let distance = Math.abs(normalizedRotation - snapAngle);
            if (distance > 180) {
              distance = 360 - distance;
            }

            if (distance < minDistance) {
              minDistance = distance;
              nearestAngle = snapAngle;
            }
          }

          // Only snap if within threshold of the nearest angle
          if (nearestAngle !== null && minDistance <= snapThreshold) {
            const rotationCount = Math.floor(newRotation / 360);
            newRotation = rotationCount * 360 + nearestAngle;
          }
        }

        onTransformUpdate(track.id, {
          rotation: newRotation,
        });
      }
    };

    const handleMouseUp = () => {
      if (isRotating) {
        onRotationStateChange?.(false);
      }
      if (isDragging) {
        onDragStateChange?.(false);
      }

      // Resume playback if we paused it
      if (transformDragStartedRef.current) {
        transformDragStartedRef.current = false;
        endDraggingTransform();
      }

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
    effectiveRenderScale,
    onTransformUpdate,
    onRotationStateChange,
    onDragStateChange,
    pixelsToNormalized,
    clampNormalized,
    containerSize,
    transform.scale,
    videoWidth,
    videoHeight,
    endDraggingTransform,
  ]);

  // Get cursor style based on interaction mode and active handle
  const getCursorStyle = () => {
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

  // Handles are now rendered outside the image's scale transform
  // Apply minimal compensation only for extreme zoom out (< 0.5)
  // This keeps handles at reasonable size without over-scaling at normal zoom levels
  const handleScale = previewScale < 0.5 ? 0.5 : 1;

  // Determine pointer events based on interaction mode
  // Pan Tool: disable all interactions
  // Text Tool: disable image interactions (allow text tool to create text on top)
  // Select Tool: enable all interactions
  const shouldDisablePointerEvents =
    interactionMode === 'pan' || interactionMode === 'text-edit';

  // Content component - may be wrapped in clipping layer
  const contentComponent = (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`,
        transformOrigin: 'center center',
        cursor: getCursorStyle(),
        pointerEvents: shouldDisablePointerEvents ? 'none' : 'auto',
        zIndex: isSelected ? 1000 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Content wrapper for size observation */}
      <div
        ref={contentRef}
        className="relative"
        style={{ pointerEvents: shouldDisablePointerEvents ? 'none' : 'auto' }}
      >
        {children}
      </div>
    </div>
  );

  return (
    <>
      {/* Image Content Container - with optional clipping wrapper */}
      {shouldRenderContent && clipContent && clipWidth && clipHeight ? (
        <div
          className="absolute"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            width: clipWidth,
            height: clipHeight,
            overflow: 'hidden', // Clip content outside canvas
            zIndex: isSelected ? 999 : 1,
          }}
        >
          {contentComponent}
        </div>
      ) : (
        contentComponent
      )}

      {/* Selection Boundary - Rendered separately to avoid scale transform */}
      {/* IMPORTANT: Must render with high z-index outside clipping context for off-canvas interactivity */}
      {/* Only show transform handles in select mode */}
      {shouldRenderBoundary &&
        isSelected &&
        interactionMode === 'select' &&
        containerSize.width > 0 && (
          <div
            ref={boundaryRef}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg)`,
              transformOrigin: 'center center',
              // Boundary must match the actual rendered size (containerSize * scale)
              // containerSize is the base size before scale transform is applied
              width: `${containerSize.width * transform.scale}px`,
              height: `${containerSize.height * transform.scale}px`,
              border: `${2 * handleScale}px solid #F45513`,
              borderRadius: `${4 * handleScale}px`,
              zIndex: 10000, // Very high z-index to ensure handles are always on top and interactive
              pointerEvents: 'auto', // Allow boundary to capture drag events for off-canvas dragging
              cursor: getCursorStyle(), // Show appropriate cursor
            }}
            onMouseDown={handleMouseDown}
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
                onMouseDown={(e) =>
                  handleScaleMouseDown(e, handle as HandleType)
                }
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
