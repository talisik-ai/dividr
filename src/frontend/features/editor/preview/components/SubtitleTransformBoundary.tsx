/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../stores/videoEditor/index';

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
  interactionMode?: 'select' | 'pan' | 'text-edit'; // Current interaction mode
  onTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
      scale?: number;
      width?: number;
      height?: number;
    },
  ) => void;
  onSelect: (trackId: string) => void;
  onTextUpdate?: (trackId: string, newText: string) => void;
  onDragStateChange?: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
  onEditModeChange?: (isEditing: boolean) => void; // Callback when edit mode changes
  children: React.ReactNode;
  boundaryOnly?: boolean; // Whether to only render the boundary, not the content
  contentOnly?: boolean; // Whether to only render the content, not the boundary
  /**
   * Callback to check if another element should receive this interaction.
   * Used for proper spatial hit-testing when elements overlap.
   * Returns the trackId that should receive the click, or null if this element should handle it.
   */
  getTopElementAtPoint?: (screenX: number, screenY: number) => string | null;
}

// Handle types for subtitle: corner scaling, left/right width resize, NO rotation
type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'r' | 'l' | null;

// Default subtitle position: bottom-aligned with ~7% padding from bottom
const DEFAULT_SUBTITLE_Y = 0.7; // Normalized coordinate (0.7 = 70% down from center)

// Fixed handle size in pixels (consistent across all zoom levels)
const HANDLE_SIZE = 10;
const HANDLE_OFFSET = HANDLE_SIZE / 2;

export const SubtitleTransformBoundary: React.FC<
  SubtitleTransformBoundaryProps
> = ({
  track,
  isSelected,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  interactionMode = 'select',
  onTransformUpdate,
  onSelect,
  onTextUpdate,
  onDragStateChange,
  onEditModeChange,
  children,
  boundaryOnly = false,
  contentOnly = false,
  getTopElementAtPoint,
}) => {
  // Use renderScale if provided (from coordinate system), otherwise fall back to previewScale
  const effectiveRenderScale = renderScale ?? previewScale;
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const hasMigratedRef = useRef(false); // Track if we've already migrated coordinates
  const dragDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Delay before starting drag to allow double-click
  const lastClickTimeRef = useRef<number>(0); // Track last click time for double-click detection
  const transformDragStartedRef = useRef(false); // Track if we've started transform drag for playback pause
  const hasUserDefinedWidthRef = useRef(false); // Track if user has explicitly set width via handles
  const prevRenderScaleRef = useRef(effectiveRenderScale); // Track renderScale changes

  const [isDragging, setIsDragging] = useState(false);
  const [isPendingDrag, setIsPendingDrag] = useState(false); // Track if drag is pending (waiting for delay)
  const [isScaling, setIsScaling] = useState(false);
  const [isResizingWidth, setIsResizingWidth] = useState(false);
  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const [currentDragWidth, setCurrentDragWidth] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const shouldRenderBoundary = isSelected && !contentOnly;
  const shouldRenderContent = !boundaryOnly;

  // Get playback control methods
  const startDraggingTransform = useVideoEditorStore(
    (state) => state.startDraggingTransform,
  );
  const endDraggingTransform = useVideoEditorStore(
    (state) => state.endDraggingTransform,
  );
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [initialTransform, setInitialTransform] = useState<{
    x: number;
    y: number;
    scale: number;
    width?: number;
  } | null>(null);
  const [containerSize, setContainerSize] = useState<{
    width: number;
    height: number;
  }>({ width: 0, height: 0 });

  // Zoom compensation for handles - keeps handles at reasonable size
  const handleScale = previewScale < 0.5 ? 0.5 : 1;

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
    scale: 1,
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
    rawTransform.width,
    rawTransform.height,
    pixelsToNormalized,
    onTransformUpdate,
    track.id,
  ]);

  // Convert to screen pixels for rendering
  const transform = React.useMemo(() => {
    const pixels = normalizedToPixels({
      x: normalizedTransform.x,
      y: normalizedTransform.y,
    });
    return {
      x: pixels.x * effectiveRenderScale,
      y: pixels.y * effectiveRenderScale,
      scale: normalizedTransform.scale ?? 1,
    };
  }, [normalizedTransform, normalizedToPixels, effectiveRenderScale]);

  // Allow positioning beyond video bounds for professional editing behavior
  // Content will be clipped by the overlay container, but handles remain accessible
  const clampNormalized = useCallback((pos: { x: number; y: number }) => {
    // No clamping - allow elements to move outside the visible canvas
    // This matches behavior of professional tools like CapCut, Premiere Pro, Figma
    return pos;
  }, []);

  // Track content size changes to update boundary dimensions
  // CRITICAL: We observe contentRef (the actual content), NOT containerRef (the transform wrapper)
  // This matches TextTransformBoundary's measurement approach exactly
  useEffect(() => {
    if (!contentRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // contentRect gives intrinsic size (before any CSS transforms)
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(contentRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Also update on content changes (matches TextTransformBoundary pattern)
  // This forces re-measurement when subtitle text changes
  useEffect(() => {
    if (contentRef.current) {
      setContainerSize({
        width: contentRef.current.offsetWidth,
        height: contentRef.current.offsetHeight,
      });
    }
  }, [track.subtitleText]);

  // Update dimensions in the store when content size changes
  // Skip updates when renderScale changes to prevent dimension recalculation on fullscreen toggle
  // Skip WIDTH updates when user has explicitly set width via handles
  useEffect(() => {
    // Detect if renderScale changed (e.g., entering/exiting fullscreen)
    const renderScaleChanged =
      prevRenderScaleRef.current !== effectiveRenderScale;
    prevRenderScaleRef.current = effectiveRenderScale;

    // Skip dimension updates when renderScale changes
    if (renderScaleChanged) {
      return;
    }

    if (containerSize.width > 0 && containerSize.height > 0) {
      const currentWidth = normalizedTransform.width || 0;
      const currentHeight = normalizedTransform.height || 0;

      // For subtitle, store containerSize directly (not divided by renderScale)
      // because subtitle font-size doesn't scale with zoom level
      // This differs from TextTransformBoundary which uses CSS scale
      const newWidth = containerSize.width;
      const newHeight = containerSize.height;

      const threshold = 1; // 1px tolerance
      const widthChanged = Math.abs(currentWidth - newWidth) > threshold;
      const heightChanged = Math.abs(currentHeight - newHeight) > threshold;

      // If user has defined width via handles, don't auto-update width
      if (hasUserDefinedWidthRef.current) {
        if (heightChanged) {
          onTransformUpdate(track.id, {
            height: newHeight,
          });
        }
      } else {
        if (widthChanged || heightChanged) {
          onTransformUpdate(track.id, {
            width: newWidth,
            height: newHeight,
          });
        }
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
  ]);

  // Helper to enter edit mode
  const enterEditMode = useCallback(
    (selectAllText = false) => {
      // boundaryOnly instances cannot enter edit mode
      if (boundaryOnly) return;

      setIsEditing(true);
      // Notify parent that we're entering edit mode
      onEditModeChange?.(true);
      // Focus the editable element after a brief delay
      setTimeout(() => {
        if (editableRef.current) {
          editableRef.current.focus();
          // Only select all text if explicitly requested
          if (selectAllText) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(editableRef.current);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }, 10);
    },
    [onEditModeChange, boundaryOnly],
  );

  // Handle mouse down on the subtitle element (start dragging with delay to allow double-click)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only allow interaction in select mode or text-edit mode (not pan mode)
      if (interactionMode === 'pan') {
        e.stopPropagation();
        return;
      }

      // PRIORITY: Handle transform handles first
      const target = e.target as HTMLElement;
      if (target.classList.contains('transform-handle')) {
        // Let the handle's own mouseDown handler take over
        return;
      }

      // If in edit mode, don't process drag or hit-testing
      if (isEditing) {
        return;
      }

      // CRITICAL: Check if another element should receive this click
      // BUT skip this check when already selected - allow drag to proceed
      // This is necessary because subtitle uses synthetic "global-subtitle-transform" ID
      // but hit-test returns real subtitle track IDs
      if (!isSelected && getTopElementAtPoint) {
        const topElementId = getTopElementAtPoint(e.clientX, e.clientY);
        if (topElementId && topElementId !== track.id) {
          e.stopPropagation();
          e.preventDefault();
          onSelect(topElementId);
          return;
        }
      }

      // Track click time for double-click detection
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;
      lastClickTimeRef.current = now;

      // Check if this is a double-click (second click within 300ms)
      if (timeSinceLastClick < 300) {
        if (dragDelayTimeoutRef.current) {
          clearTimeout(dragDelayTimeoutRef.current);
          dragDelayTimeoutRef.current = null;
        }
        setIsPendingDrag(false);
        setIsDragging(false);
        setDragStart(null);

        if (!isSelected) {
          onSelect(track.id);
        }

        // Skip edit mode if boundaryOnly
        if (boundaryOnly) return;

        e.stopPropagation();
        enterEditMode(true);
        return;
      }

      e.stopPropagation();
      // Prevent text selection on other elements during drag
      e.preventDefault();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      // Set up pending drag state
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform({ ...transform, scale: transform.scale });
      setIsPendingDrag(true);

      // Pause playback if playing
      if (!transformDragStartedRef.current) {
        transformDragStartedRef.current = true;
        startDraggingTransform();
      }

      // Start actual drag after a short delay
      dragDelayTimeoutRef.current = setTimeout(() => {
        setIsDragging(true);
        setIsPendingDrag(false);
      }, 200);
    },
    [
      isSelected,
      track.id,
      transform,
      onSelect,
      isEditing,
      startDraggingTransform,
      interactionMode,
      enterEditMode,
      boundaryOnly,
      getTopElementAtPoint,
    ],
  );

  // Handle mouse down on scale handles (corners)
  const handleScaleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandleType) => {
      if (interactionMode !== 'select' || !isSelected) return;

      e.stopPropagation();
      e.preventDefault();
      setIsScaling(true);
      setActiveHandle(handle);
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform({ ...transform, scale: transform.scale });

      if (!transformDragStartedRef.current) {
        transformDragStartedRef.current = true;
        startDraggingTransform();
      }
    },
    [isSelected, transform, startDraggingTransform, interactionMode],
  );

  // Handle mouse down on width resize handles (left/right edges)
  const handleWidthResizeMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandleType) => {
      if (interactionMode !== 'select' || !isSelected) return;

      e.stopPropagation();
      e.preventDefault();
      setIsResizingWidth(true);
      setActiveHandle(handle);
      setDragStart({ x: e.clientX, y: e.clientY });

      // Mark that user has explicitly set a width
      hasUserDefinedWidthRef.current = true;

      // Store current width for delta calculations
      const currentWidthScreen = containerSize.width;
      const currentWidthVideo = currentWidthScreen / effectiveRenderScale;

      setCurrentDragWidth(currentWidthScreen);

      setInitialTransform({
        ...transform,
        width: currentWidthVideo,
      });

      if (!transformDragStartedRef.current) {
        transformDragStartedRef.current = true;
        startDraggingTransform();
      }
    },
    [
      isSelected,
      transform,
      containerSize.width,
      effectiveRenderScale,
      startDraggingTransform,
      interactionMode,
    ],
  );

  // Handle single click - enters edit mode when text edit mode is active
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isTextEditMode || interactionMode === 'pan') return;

      e.stopPropagation();
      e.preventDefault();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      enterEditMode(true);
    },
    [
      isTextEditMode,
      isSelected,
      track.id,
      onSelect,
      enterEditMode,
      interactionMode,
    ],
  );

  // Handle double-click for inline editing
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (dragDelayTimeoutRef.current) {
        clearTimeout(dragDelayTimeoutRef.current);
        dragDelayTimeoutRef.current = null;
      }
      setIsPendingDrag(false);
      setIsDragging(false);
      setDragStart(null);

      if (!isSelected) {
        onSelect(track.id);
        setTimeout(() => {
          enterEditMode(true);
        }, 50);
        return;
      }

      enterEditMode(true);
    },
    [isSelected, track.id, onSelect, enterEditMode],
  );

  // Handle mouse move for all interactions
  useEffect(() => {
    if (!isDragging && !isScaling && !isResizingWidth && !isPendingDrag) return;
    if (!dragStart || !initialTransform) return;

    // Prevent text selection on other elements during drag
    // Add global user-select: none to body
    const originalUserSelect = document.body.style.userSelect;
    const originalWebkitUserSelect = document.body.style.webkitUserSelect;
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      // Prevent text selection during drag
      e.preventDefault();

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // If drag is pending and user moves mouse significantly, start drag immediately
      if (isPendingDrag) {
        const movementThreshold = 5;
        if (
          Math.abs(deltaX) > movementThreshold ||
          Math.abs(deltaY) > movementThreshold
        ) {
          if (dragDelayTimeoutRef.current) {
            clearTimeout(dragDelayTimeoutRef.current);
            dragDelayTimeoutRef.current = null;
          }
          setIsDragging(true);
          setIsPendingDrag(false);

          if (!transformDragStartedRef.current) {
            transformDragStartedRef.current = true;
            startDraggingTransform();
          }
        }
        return;
      }

      if (isDragging) {
        // Convert screen delta to video coordinate delta
        const videoDeltaX = deltaX / effectiveRenderScale;
        const videoDeltaY = deltaY / effectiveRenderScale;

        const initialVideoX = initialTransform.x / effectiveRenderScale;
        const initialVideoY = initialTransform.y / effectiveRenderScale;

        let newPixelX = initialVideoX + videoDeltaX;
        let newPixelY = initialVideoY + videoDeltaY;

        // Snapping logic
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          const snapTolerance = e.ctrlKey || e.metaKey ? 2 : 10;

          const snapPoints = {
            horizontal: [0],
            vertical: [0],
          };

          // No transform.scale multiplication - font-based scaling means containerSize is already scaled
          const actualWidth = containerSize.width;
          const actualHeight = containerSize.height;
          const halfWidth = actualWidth / 2;
          const halfHeight = actualHeight / 2;

          snapPoints.horizontal.push(
            -videoHeight / 2 + halfHeight,
            videoHeight / 2 - halfHeight,
          );
          snapPoints.vertical.push(
            -videoWidth / 2 + halfWidth,
            videoWidth / 2 - halfWidth,
          );

          for (const snapY of snapPoints.horizontal) {
            if (Math.abs(newPixelY - snapY) < snapTolerance) {
              newPixelY = snapY;
              break;
            }
          }

          for (const snapX of snapPoints.vertical) {
            if (Math.abs(newPixelX - snapX) < snapTolerance) {
              newPixelX = snapX;
              break;
            }
          }
        }

        const normalizedPos = pixelsToNormalized({
          x: newPixelX,
          y: newPixelY,
        });
        const clampedPos = clampNormalized(normalizedPos);

        if (onDragStateChange && containerSize.width > 0) {
          // No transform.scale multiplication - font-based scaling means containerSize is already scaled
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
      } else if (isScaling && activeHandle) {
        // Scale calculation - same logic as TextTransformBoundary
        const scaleSensitivity = 200;
        let scaleFactor = 1;

        switch (activeHandle) {
          case 'tl':
            scaleFactor = 1 - (deltaX + deltaY) / (2 * scaleSensitivity);
            break;
          case 'tr':
            scaleFactor = 1 + (deltaX - deltaY) / (2 * scaleSensitivity);
            break;
          case 'bl':
            scaleFactor = 1 + (-deltaX + deltaY) / (2 * scaleSensitivity);
            break;
          case 'br':
            scaleFactor = 1 + (deltaX + deltaY) / (2 * scaleSensitivity);
            break;
        }

        let newScale = initialTransform.scale * scaleFactor;
        newScale = Math.max(0.01, newScale);

        onTransformUpdate(track.id, {
          scale: newScale,
        });
      } else if (isResizingWidth && activeHandle) {
        // Width-only resize - same logic as TextTransformBoundary
        const initialWidth =
          initialTransform.width || containerSize.width / effectiveRenderScale;

        const videoDelta = deltaX / effectiveRenderScale / transform.scale;
        let newWidth: number;
        let xAdjustment = 0;

        if (activeHandle === 'r') {
          newWidth = initialWidth + videoDelta;
          xAdjustment = (newWidth - initialWidth) / 2;
        } else {
          newWidth = initialWidth - videoDelta;
          xAdjustment = -(newWidth - initialWidth) / 2;
        }

        const minWidth = 50;
        const maxWidth = videoWidth * 3;
        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        if (clampedWidth !== newWidth) {
          if (activeHandle === 'r') {
            xAdjustment = (clampedWidth - initialWidth) / 2;
          } else {
            xAdjustment = -(clampedWidth - initialWidth) / 2;
          }
          newWidth = clampedWidth;
        }

        setCurrentDragWidth(newWidth * effectiveRenderScale);

        const initialVideoX = initialTransform.x / effectiveRenderScale;
        const newVideoX = initialVideoX + xAdjustment;
        const normalizedX = newVideoX / (videoWidth / 2);

        onTransformUpdate(track.id, {
          width: newWidth,
          x: normalizedX,
        });
      }
    };

    const handleMouseUp = () => {
      if (dragDelayTimeoutRef.current) {
        clearTimeout(dragDelayTimeoutRef.current);
        dragDelayTimeoutRef.current = null;
      }

      if (isDragging) {
        onDragStateChange?.(false);
      }

      if (transformDragStartedRef.current) {
        transformDragStartedRef.current = false;
        endDraggingTransform();
      }

      setIsDragging(false);
      setIsPendingDrag(false);
      setIsScaling(false);
      setIsResizingWidth(false);
      setActiveHandle(null);
      setDragStart(null);
      setInitialTransform(null);
      setCurrentDragWidth(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      // Restore original user-select values
      document.body.style.userSelect = originalUserSelect;
      document.body.style.webkitUserSelect = originalWebkitUserSelect;
    };
  }, [
    isDragging,
    isPendingDrag,
    isScaling,
    isResizingWidth,
    dragStart,
    initialTransform,
    activeHandle,
    track.id,
    effectiveRenderScale,
    onTransformUpdate,
    onDragStateChange,
    pixelsToNormalized,
    clampNormalized,
    containerSize,
    transform.scale,
    videoWidth,
    videoHeight,
    startDraggingTransform,
    endDraggingTransform,
  ]);

  // Handle text editing completion
  const handleBlur = useCallback(() => {
    if (!editableRef.current) return;

    const newText = editableRef.current.innerText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n');

    if (newText !== track.subtitleText) {
      onTextUpdate?.(track.id, newText);
    }
    setIsEditing(false);
    onEditModeChange?.(false);
  }, [track.id, track.subtitleText, onTextUpdate, onEditModeChange]);

  // Handle keyboard events in edit mode
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleBlur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (editableRef.current && track.subtitleText) {
          editableRef.current.innerText = track.subtitleText;
        }
        setIsEditing(false);
        onEditModeChange?.(false);
      }
    },
    [handleBlur, track.subtitleText, onEditModeChange],
  );

  // Get cursor style based on state
  const getCursor = () => {
    if (isEditing) return 'text';
    if (isTextEditMode && isSelected) return 'text';
    if (isDragging) return 'grabbing';
    if (isResizingWidth) return 'ew-resize';
    if (isScaling) {
      switch (activeHandle) {
        case 'tl':
        case 'br':
          return 'nwse-resize';
        case 'tr':
        case 'bl':
          return 'nesw-resize';
        default:
          return 'nwse-resize';
      }
    }
    if (isSelected) return 'grab';
    return 'pointer';
  };

  // Determine pointer events based on interaction mode
  const shouldDisablePointerEvents = interactionMode === 'pan';

  // Calculate the user-defined width constraint for text wrapping
  // Width is in screen space, CSS scale handles the visual scaling
  const userDefinedWidth = (() => {
    if (isResizingWidth && currentDragWidth !== null) {
      return currentDragWidth;
    }
    if (hasUserDefinedWidthRef.current && normalizedTransform.width) {
      return normalizedTransform.width * effectiveRenderScale;
    }
    return undefined;
  })();

  // Calculate boundary dimensions for subtitle
  // Unlike TextTransformBoundary, subtitle uses font-size scaling (not CSS scale)
  // So containerSize already reflects the visual size and doesn't need renderScale adjustment
  // We use stored dimensions to maintain stability across zoom changes
  const storedWidth = normalizedTransform.width || 0;
  const storedHeight = normalizedTransform.height || 0;
  // Use stored dimensions if available, otherwise fall back to containerSize
  // Don't multiply by effectiveRenderScale since subtitle content size is independent of zoom
  const boundaryWidth = storedWidth > 0 ? storedWidth : containerSize.width;
  const boundaryHeight = storedHeight > 0 ? storedHeight : containerSize.height;

  // Content transform - NO CSS scale for subtitles
  // Unlike TextTransformBoundary, subtitle scaling is handled via font-size multiplication
  // This preserves text quality at all scale levels (no blurring from CSS scale)
  const contentTransform = `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px)`;

  // Content component - simplified structure to match TextTransformBoundary
  // containerRef has transform, contentRef wraps content directly (measured for boundary)
  const contentComponent = (
    <div
      ref={containerRef}
      className="absolute"
      data-text-element="true"
      style={{
        left: '50%',
        top: '50%',
        transform: contentTransform,
        transformOrigin: 'center center',
        cursor: getCursor(),
        pointerEvents: shouldDisablePointerEvents ? 'none' : 'auto',
        userSelect: isEditing ? 'text' : 'none',
        WebkitUserSelect: isEditing ? 'text' : 'none',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* contentRef directly wraps content - matches TextTransformBoundary structure */}
      <div
        ref={contentRef}
        className="relative"
        data-subtitle-content="true"
        style={{
          pointerEvents: 'auto',
          // Width constraint for text wrapping (same pattern as TextTransformBoundary)
          ...(userDefinedWidth && {
            width: `${userDefinedWidth}px`,
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            whiteSpace: 'pre-wrap',
          }),
        }}
        onDoubleClick={handleDoubleClick}
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
              cursor: 'text',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              ...(userDefinedWidth && {
                width: `${userDefinedWidth}px`,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'pre-wrap',
              }),
            }}
          >
            {/* Show subtitle text when editing */}
            {(children as any)?.props?.children?.[0]?.props?.children || ''}
          </div>
        ) : userDefinedWidth ? (
          // When user has defined width, wrap children to force text wrapping
          <div
            className="subtitle-text-wrap-container"
            style={{ width: '100%', maxWidth: '100%' }}
          >
            <style>
              {`.subtitle-text-wrap-container,
                .subtitle-text-wrap-container * {
                  white-space: pre-wrap !important;
                  word-wrap: break-word !important;
                  overflow-wrap: break-word !important;
                  word-break: break-word !important;
                  width: 100% !important;
                  max-width: 100% !important;
                }`}
            </style>
            {children}
          </div>
        ) : (
          children
        )}
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
        overflow: 'visible',
        zIndex: zIndexOverlay,
      }}
    >
      {/* Content clipping layer */}
      {shouldRenderContent ? (
        <div
          className="absolute pointer-events-none"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          {contentComponent}
        </div>
      ) : (
        contentComponent
      )}

      {/* Selection Boundary with handles */}
      {shouldRenderBoundary &&
        isSelected &&
        !isEditing &&
        interactionMode === 'select' &&
        containerSize.width > 0 && (
          <div
            ref={boundaryRef}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px)`,
              transformOrigin: 'center center',
              // Boundary dimensions use stored video-space dimensions scaled to screen space
              // This prevents boundary from expanding/shrinking incorrectly when zooming
              width: `${isResizingWidth && currentDragWidth !== null ? currentDragWidth : boundaryWidth}px`,
              height: `${boundaryHeight}px`,
              border: `${2 * handleScale}px solid #F45513`,
              borderRadius: `${4 * handleScale}px`,
              zIndex: 10000,
              pointerEvents: 'auto',
              cursor: getCursor(),
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={boundaryOnly ? undefined : handleDoubleClick}
          >
            {/* Corner Handles for Scaling */}
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

            {/* Edge Handles - Left and Right only (for width resize) */}
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
                  handleWidthResizeMouseDown(e, handle as HandleType)
                }
              />
            ))}

            {/* NO Rotation Handle - explicitly excluded for subtitles */}
          </div>
        )}
    </div>
  );
};
