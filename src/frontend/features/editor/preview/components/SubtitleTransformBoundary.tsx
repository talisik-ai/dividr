/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';

interface SubtitleTransformBoundaryProps {
  track: VideoTrack;
  isSelected: boolean;
  isActive: boolean; // Whether subtitle is visible at current playback time
  previewScale: number;
  videoWidth: number;
  videoHeight: number;
  actualWidth: number;
  actualHeight: number;
  panX: number;
  panY: number;
  zIndexOverlay: number;
  renderScale?: number; // The actual render scale from coordinate system (baseScale)
  isTextEditMode?: boolean; // Whether text edit mode is active globally
  onTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
    },
  ) => void;
  onSelect: (trackId: string) => void;
  onTextUpdate?: (trackId: string, newText: string) => void;
  onDragStateChange?: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
  children: React.ReactNode;
}

// Default subtitle position: bottom-aligned with ~7% padding from bottom
const DEFAULT_SUBTITLE_Y = 0.7; // Normalized coordinate (0.7 = 70% down from center)

export const SubtitleTransformBoundary: React.FC<
  SubtitleTransformBoundaryProps
> = ({
  track,
  isSelected,
  isActive,
  previewScale,
  videoWidth,
  videoHeight,
  actualWidth,
  actualHeight,
  panX,
  panY,
  zIndexOverlay,
  renderScale,
  isTextEditMode = false,
  onTransformUpdate,
  onSelect,
  onTextUpdate,
  onDragStateChange,
  children,
}) => {
  // Use renderScale if provided (from coordinate system), otherwise fall back to previewScale
  const effectiveRenderScale = renderScale ?? previewScale;
  const containerRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const hasMigratedRef = useRef(false); // Track if we've already migrated coordinates
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [initialTransform, setInitialTransform] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

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
  // Default to bottom-aligned position if not set
  const rawTransform = track.subtitleTransform || {
    x: 0,
    y: DEFAULT_SUBTITLE_Y,
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
      });
      return normalized;
    }
    return rawTransform;
  }, [
    rawTransform.x,
    rawTransform.y,
    pixelsToNormalized,
    onTransformUpdate,
    track.id,
  ]);

  // Convert to screen pixels for rendering
  const transform = React.useMemo(() => {
    const pixels = normalizedToPixels(normalizedTransform);
    return {
      x: pixels.x * effectiveRenderScale,
      y: pixels.y * effectiveRenderScale,
    };
  }, [normalizedTransform, normalizedToPixels, effectiveRenderScale]);

  // Allow positioning beyond video bounds for professional editing behavior
  // Content will be clipped by the overlay container, but handles remain accessible
  const clampNormalized = useCallback((pos: { x: number; y: number }) => {
    // No clamping - allow elements to move outside the visible canvas
    // This matches behavior of professional tools like CapCut, Premiere Pro, Figma
    return pos;
  }, []);

  // Measure container size
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [children]);

  // Helper to enter edit mode
  const enterEditMode = useCallback(() => {
    setIsEditing(true);
    // Focus the editable element after a brief delay
    setTimeout(() => {
      if (editableRef.current) {
        editableRef.current.focus();
        // Select all text
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableRef.current);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }, 10);
  }, []);

  // Handle mouse down on the subtitle element (start dragging)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      // Don't start drag if in edit mode or text edit mode is active
      if (isEditing || isTextEditMode) {
        return;
      }

      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
    },
    [isSelected, track.id, transform, onSelect, isEditing, isTextEditMode],
  );

  // Handle single click - enters edit mode when text edit mode is active
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle single clicks in text edit mode
      if (!isTextEditMode) return;

      e.stopPropagation();
      e.preventDefault();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      // Enter edit mode immediately on single click when in text edit mode
      enterEditMode();
    },
    [isTextEditMode, isSelected, track.id, onSelect, enterEditMode],
  );

  // Handle double-click for inline editing (when not in text edit mode)
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelected) return;

      e.stopPropagation();
      e.preventDefault();

      // Don't allow double-click edit when in text edit mode (single click is used instead)
      if (isTextEditMode) {
        return;
      }

      enterEditMode();
    },
    [isSelected, isTextEditMode, enterEditMode],
  );

  // Handle mouse move for dragging
  useEffect(() => {
    if (!isDragging) return;
    if (!dragStart || !initialTransform) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

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
        const halfWidth = containerSize.width / 2;
        const halfHeight = containerSize.height / 2;

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
          width: containerSize.width,
          height: containerSize.height,
        });
      }

      onTransformUpdate(track.id, {
        x: clampedPos.x,
        y: clampedPos.y,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setDragStart(null);
      setInitialTransform(null);
      onDragStateChange?.(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    dragStart,
    initialTransform,
    effectiveRenderScale,
    videoWidth,
    videoHeight,
    containerSize,
    pixelsToNormalized,
    clampNormalized,
    onTransformUpdate,
    onDragStateChange,
    track.id,
  ]);

  // Handle text editing completion
  const handleBlur = useCallback(() => {
    if (!editableRef.current) return;

    const newText = editableRef.current.innerText.trim();
    if (newText && newText !== track.subtitleText) {
      onTextUpdate?.(track.id, newText);
    }
    setIsEditing(false);
  }, [track.id, track.subtitleText, onTextUpdate]);

  // Handle keyboard events in edit mode
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Enter without shift: save and exit
        e.preventDefault();
        handleBlur();
      } else if (e.key === 'Escape') {
        // Escape: cancel and revert
        e.preventDefault();
        if (editableRef.current && track.subtitleText) {
          editableRef.current.innerText = track.subtitleText;
        }
        setIsEditing(false);
      }
    },
    [handleBlur, track.subtitleText],
  );

  // Get cursor style based on state
  const getCursor = () => {
    if (isEditing) return 'text';
    if (isTextEditMode && isSelected) return 'text'; // Show text cursor when in text edit mode
    if (isDragging) return 'grabbing';
    if (isSelected) return 'grab';
    return 'pointer';
  };

  // Content component
  const contentComponent = (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px)`,
        transformOrigin: 'center center',
        cursor: getCursor(),
        pointerEvents: 'auto',
        display: 'inline-block',
        userSelect: isEditing ? 'text' : 'none',
        WebkitUserSelect: isEditing ? 'text' : 'none',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div
        ref={editableRef}
        contentEditable={isEditing}
        suppressContentEditableWarning
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          outline: 'none',
          pointerEvents: isEditing ? 'auto' : 'none',
          position: 'relative',
        }}
      >
        {children}
      </div>
    </div>
  );

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible', // Allow transform handles to extend beyond canvas
        zIndex: zIndexOverlay, // 1500 - ensures subtitles render above images but below text
      }}
    >
      {/* Content clipping layer - clips subtitle content but not selection boundary */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: actualWidth,
          height: actualHeight,
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          overflow: 'hidden', // Clip content outside canvas
          pointerEvents: 'none',
        }}
      >
        {contentComponent}
      </div>

      {/* Selection Boundary - Rendered separately like TextTransformBoundary */}
      {/* IMPORTANT: Must render with high z-index outside clipping context for off-canvas interactivity */}
      {/* Hide boundary when in text edit mode to prevent dragging */}
      {isSelected &&
        !isEditing &&
        !isTextEditMode &&
        containerSize.width > 0 && (
          <div
            ref={boundaryRef}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px)`,
              transformOrigin: 'center center',
              width: `${containerSize.width}px`,
              height: `${containerSize.height}px`,
              border: '2px solid #F45513',
              zIndex: 10000, // Very high z-index to ensure boundary is always on top and interactive
              pointerEvents: 'auto', // Allow boundary to capture drag events for off-canvas dragging
              cursor: getCursor(), // Show appropriate cursor
            }}
            onMouseDown={handleMouseDown}
          />
        )}
    </div>
  );
};
