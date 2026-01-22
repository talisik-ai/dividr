/* eslint-disable @typescript-eslint/no-explicit-any */
import { RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../stores/videoEditor/index';

interface TextTransformBoundaryProps {
  track: VideoTrack;
  isSelected: boolean;
  previewScale: number;
  videoWidth: number;
  videoHeight: number;
  renderScale?: number; // The actual render scale from coordinate system (baseScale)
  isTextEditMode?: boolean; // Whether text edit mode is active globally
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
    options?: { skipRecord?: boolean },
  ) => void;
  onSelect: (trackId: string) => void;
  onTextUpdate?: (trackId: string, newText: string) => void;
  onRotationStateChange?: (isRotating: boolean) => void;
  onDragStateChange?: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
  onEditModeChange?: (isEditing: boolean) => void; // Callback when edit mode changes
  autoEnterEditMode?: boolean; // Whether to automatically enter edit mode on mount
  onEditStarted?: () => void; // Callback when auto-edit mode is triggered
  children: React.ReactNode;
  appliedStyle?: React.CSSProperties;
  clipContent?: boolean; // Whether to clip content to canvas bounds
  clipWidth?: number; // Width of the clipping area
  clipHeight?: number; // Height of the clipping area
  disableScaleTransform?: boolean; // Whether to disable CSS scale transform (for vector-sharp text)
  boundaryOnly?: boolean; // Whether to only render the boundary, not the content
  contentOnly?: boolean; // Whether to only render the content, not the boundary
  disableAutoSizeUpdates?: boolean; // Skip auto width/height sync when rendering boundaries only
  /**
   * Callback to check if another element should receive this interaction.
   * Used for proper spatial hit-testing when elements overlap.
   * Returns the trackId that should receive the click, or null if this element should handle it.
   */
  getTopElementAtPoint?: (screenX: number, screenY: number) => string | null;
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
  renderScale,
  isTextEditMode = false,
  interactionMode = 'select',
  onTransformUpdate,
  onSelect,
  onTextUpdate,
  onRotationStateChange,
  onDragStateChange,
  onEditModeChange,
  autoEnterEditMode = false,
  onEditStarted,
  children,
  appliedStyle,
  clipContent = false,
  clipWidth,
  clipHeight,
  disableScaleTransform = false,
  boundaryOnly = false,
  contentOnly = false,
  disableAutoSizeUpdates = false,
  getTopElementAtPoint,
}) => {
  // Use renderScale if provided (from coordinate system), otherwise fall back to previewScale
  // This ensures consistent positioning across different container sizes
  const effectiveRenderScale = renderScale ?? previewScale;
  const containerRef = useRef<HTMLDivElement>(null);
  const boundaryRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const editableRef = useRef<HTMLDivElement>(null);
  const hasMigratedRef = useRef(false); // Track if we've already migrated coordinates
  const dragDelayTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Delay before starting drag to allow double-click
  const lastClickTimeRef = useRef<number>(0); // Track last click time for double-click detection
  const transformDragStartedRef = useRef(false); // Track if we've started transform drag for playback pause
  const [isDragging, setIsDragging] = useState(false);
  const [isPendingDrag, setIsPendingDrag] = useState(false); // Track if drag is pending (waiting for delay)
  const [isScaling, setIsScaling] = useState(false);
  const [isResizingWidth, setIsResizingWidth] = useState(false); // Width-only resize (left/right handles)
  const [isRotating, setIsRotating] = useState(false);
  // Track if user has explicitly set a width via left/right handles
  // This prevents auto-size from overwriting user-defined width
  const hasUserDefinedWidthRef = useRef(false);
  // Track current width during drag for immediate visual feedback
  // This bypasses ResizeObserver delay for responsive boundary updates
  const [currentDragWidth, setCurrentDragWidth] = useState<number | null>(null);

  // Get playback control methods
  const startDraggingTransform = useVideoEditorStore(
    (state) => state.startDraggingTransform,
  );
  const endDraggingTransform = useVideoEditorStore(
    (state) => state.endDraggingTransform,
  );

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
    width?: number; // Initial width for width-resize operations
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
    scale: 0.2,
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
      // Skip recording for migration - it's a system-generated coordinate fix
      onTransformUpdate(
        track.id,
        {
          x: normalized.x,
          y: normalized.y,
          width: rawTransform.width,
          height: rawTransform.height,
        },
        { skipRecord: true },
      );
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
  // Convert from normalized coordinates to video space, then scale to screen space
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

  // Helper to enter edit mode
  const enterEditMode = useCallback(
    (selectAllText = false) => {
      // boundaryOnly instances cannot enter edit mode - they don't render content
      if (boundaryOnly) return;

      setIsEditing(true);
      onEditModeChange?.(true);

      // Focus the editable div after a short delay to ensure it's rendered
      setTimeout(() => {
        if (editableRef.current) {
          editableRef.current.focus();
          if (selectAllText) {
            const range = document.createRange();
            range.selectNodeContents(editableRef.current);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
      }, 10);
    },
    [onEditModeChange, boundaryOnly],
  );

  // Auto-enter edit mode when requested (for newly created text)
  useEffect(() => {
    if (autoEnterEditMode && isSelected && !isEditing) {
      // Small delay to ensure the component is fully rendered
      const timer = setTimeout(() => {
        enterEditMode(true); // Select all text so user can type to replace
        onEditStarted?.(); // Notify parent that edit mode has started
      }, 50);

      return () => clearTimeout(timer);
    }
  }, [autoEnterEditMode, isSelected, isEditing, enterEditMode, onEditStarted]);

  // Handle double-click to enter edit mode (works in both Text Tool and Selection Tool modes)
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      // Cancel any pending drag operation
      if (dragDelayTimeoutRef.current) {
        clearTimeout(dragDelayTimeoutRef.current);
        dragDelayTimeoutRef.current = null;
      }
      setIsPendingDrag(false);
      setIsDragging(false);
      setDragStart(null);

      // CRITICAL: End any active transform drag before entering edit mode
      // This ensures the undo group is properly closed before text editing starts
      if (transformDragStartedRef.current) {
        transformDragStartedRef.current = false;
        endDraggingTransform();
      }

      // If not selected, select first then enter edit mode
      if (!isSelected) {
        onSelect(track.id);
        setTimeout(() => {
          enterEditMode(true);
        }, 50);
        return;
      }

      // Enter edit mode on double-click, select all text for immediate typing
      enterEditMode(true);
    },
    [isSelected, track.id, onSelect, enterEditMode, endDraggingTransform],
  );

  // Handle single click - enters edit mode ONLY when text edit mode is active
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only handle single clicks in text edit mode (not pan mode)
      if (!isTextEditMode || interactionMode === 'pan') return;

      e.stopPropagation();
      e.preventDefault();

      // End any active transform drag before entering edit mode
      // This ensures any undo group is properly closed
      if (transformDragStartedRef.current) {
        transformDragStartedRef.current = false;
        endDraggingTransform();
      }

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      // Enter edit mode and select all text on single click in Text Tool mode
      enterEditMode(true);
    },
    [
      isTextEditMode,
      isSelected,
      track.id,
      onSelect,
      endDraggingTransform,
      enterEditMode,
      interactionMode,
    ],
  );

  // Handle blur to exit edit mode
  const handleBlur = useCallback(() => {
    if (editableRef.current && onTextUpdate) {
      const newText = editableRef.current.innerText.trim();
      onTextUpdate(track.id, newText);
    }
    setIsEditing(false);
    onEditModeChange?.(false);
  }, [track.id, onTextUpdate, onEditModeChange]);

  // Handle Enter key to save and exit edit mode, ESC to cancel
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        editableRef.current?.blur();
      } else if (e.key === 'Escape') {
        // Escape: cancel and revert to original text
        e.preventDefault();
        if (editableRef.current && track.textContent) {
          editableRef.current.innerText = track.textContent;
        }
        setIsEditing(false);
        onEditModeChange?.(false);
      }
    },
    [onEditModeChange, track.textContent],
  );

  // Track content size changes to update boundary dimensions
  // CRITICAL: We observe contentRef (the actual text), NOT containerRef (the transform wrapper)
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

  // Also update on content changes (but NOT on renderScale changes)
  useEffect(() => {
    if (contentRef.current) {
      setContainerSize({
        width: contentRef.current.offsetWidth,
        height: contentRef.current.offsetHeight,
      });
    }
  }, [track.textContent]);

  // Update dimensions in the store when content size changes
  // CRITICAL: Skip updates when renderScale changes to prevent dimension recalculation on fullscreen toggle
  // CRITICAL: Skip WIDTH updates when user has explicitly set width via left/right handles
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

      // Check if width or height needs updating
      const widthChanged = Math.abs(currentWidth - videoSpaceWidth) > threshold;
      const heightChanged =
        Math.abs(currentHeight - videoSpaceHeight) > threshold;

      // If user has defined width via left/right handles, don't auto-update width
      // But still update height so container adjusts to text reflow
      // IMPORTANT: Pass skipRecord: true to prevent these automatic dimension
      // recalculations from creating undo entries
      if (hasUserDefinedWidthRef.current) {
        // Only update height when user has defined width
        if (heightChanged) {
          onTransformUpdate(
            track.id,
            { height: videoSpaceHeight },
            { skipRecord: true },
          );
        }
      } else {
        // Normal behavior: update both width and height
        if (widthChanged || heightChanged) {
          onTransformUpdate(
            track.id,
            { width: videoSpaceWidth, height: videoSpaceHeight },
            { skipRecord: true },
          );
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
    disableAutoSizeUpdates,
  ]);

  // Handle mouse down on the text element (start dragging with delay to allow double-click)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only allow interaction in select mode or text-edit mode (not pan mode)
      if (interactionMode === 'pan') {
        e.stopPropagation();
        return;
      }

      // PRIORITY: Handle transform handles first
      // Transform handles of a selected element must ALWAYS work,
      // regardless of what other elements are at this position.
      // This ensures handles are not blocked by spatial hit-testing.
      const target = e.target as HTMLElement;
      if (target.classList.contains('transform-handle')) {
        // Let the handle's own mouseDown handler take over
        // Don't do any spatial hit-testing - handles are authoritative
        return;
      }

      // If in edit mode, don't process drag or hit-testing
      if (isEditing) {
        return;
      }

      // CRITICAL: Check if another element should receive this click
      // This enables proper spatial hit-testing - a higher z-index element
      // visible at this position should be selected instead
      // NOTE: This only applies to content area clicks, not handles (checked above)
      if (getTopElementAtPoint) {
        const topElementId = getTopElementAtPoint(e.clientX, e.clientY);
        if (topElementId && topElementId !== track.id) {
          // Another element is above this one at the cursor position
          // Select that element instead of handling this click
          e.stopPropagation();
          e.preventDefault();
          onSelect(topElementId);
          return;
        }
      }

      // Track click time BEFORE any early returns for accurate double-click detection
      const now = Date.now();
      const timeSinceLastClick = now - lastClickTimeRef.current;
      lastClickTimeRef.current = now;

      // Check if this is a double-click (second click within 300ms)
      if (timeSinceLastClick < 300) {
        // Cancel any pending drag
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

        // Skip edit mode if boundaryOnly - let the content layer handle it
        if (boundaryOnly) return;

        e.stopPropagation();
        enterEditMode(true);
        return;
      }

      // For single clicks, stop propagation
      e.stopPropagation();

      if (!isSelected) {
        onSelect(track.id);
        return;
      }

      // At this point we're clicking on the content area (not a handle, not editing)

      // Set up pending drag state immediately so we can track mouse movement
      setDragStart({ x: e.clientX, y: e.clientY });
      setInitialTransform(transform);
      setIsPendingDrag(true);

      // Pause playback if playing (pause immediately, not after delay)
      if (!transformDragStartedRef.current) {
        transformDragStartedRef.current = true;
        startDraggingTransform();
      }

      // Start actual drag after a short delay (allows double-click to interrupt)
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
      interactionMode,
      enterEditMode,
      startDraggingTransform,
      boundaryOnly,
      getTopElementAtPoint,
    ],
  );

  // Handle mouse down on scale handles (corners)
  const handleScaleMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandleType) => {
      // Only allow transform handles in select mode
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

  // Handle mouse down on width resize handles (left/right edges)
  // This resizes the text container width WITHOUT scaling font size
  // Text will reflow/wrap based on the new width
  const handleWidthResizeMouseDown = useCallback(
    (e: React.MouseEvent, handle: HandleType) => {
      // Only allow transform handles in select mode
      if (interactionMode !== 'select' || !isSelected) return;

      e.stopPropagation();
      e.preventDefault();
      setIsResizingWidth(true);
      setActiveHandle(handle);
      setDragStart({ x: e.clientX, y: e.clientY });

      // Mark that user has explicitly set a width
      // This prevents auto-size from overwriting it
      hasUserDefinedWidthRef.current = true;

      // Store current width for delta calculations
      // Use containerSize.width as the current rendered width (in screen pixels)
      const currentWidthScreen = containerSize.width;
      const currentWidthVideo = currentWidthScreen / effectiveRenderScale;

      // Set immediate drag width for visual feedback (in screen pixels)
      setCurrentDragWidth(currentWidthScreen);

      setInitialTransform({
        ...transform,
        width: currentWidthVideo,
      });

      // Pause playback if playing
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

  // Handle mouse down on rotation handle
  const handleRotateMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only allow transform handles in select mode
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
    if (
      !isDragging &&
      !isScaling &&
      !isResizingWidth &&
      !isRotating &&
      !isPendingDrag
    )
      return;
    if (!dragStart || !initialTransform) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // If drag is pending and user moves mouse significantly, start drag immediately
      if (isPendingDrag) {
        const movementThreshold = 5; // pixels
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

          // Pause playback if playing (when drag is confirmed)
          if (!transformDragStartedRef.current) {
            transformDragStartedRef.current = true;
            startDraggingTransform();
          }
        }
        return; // Don't process drag until it's confirmed
      }

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

          // Add edge snap points - always include scale
          const actualWidth = containerSize.width * transform.scale;
          const actualHeight = containerSize.height * transform.scale;
          const halfWidth = actualWidth / 2;
          const halfHeight = actualHeight / 2;

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
          // Always include scale in actual dimensions
          const actualWidth = containerSize.width * transform.scale;
          const actualHeight = containerSize.height * transform.scale;
          onDragStateChange(true, {
            x: newPixelX,
            y: newPixelY,
            width: actualWidth,
            height: actualHeight,
          });
        }

        // Only update position during drag - width/height remain unchanged
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
        // Only prevent zero/negative scale - no artificial upper limit
        // This matches professional editors that allow very large/small text
        newScale = Math.max(0.01, newScale);

        // Only update scale - width/height will be recalculated by the ResizeObserver effect
        onTransformUpdate(track.id, {
          scale: newScale,
        });
      } else if (isResizingWidth && activeHandle) {
        // Width-only resize for left/right handles
        // This changes container width WITHOUT scaling font size
        // Text will naturally reflow/wrap based on the new width
        const initialWidth =
          initialTransform.width || containerSize.width / effectiveRenderScale;

        // Calculate new width based on handle and delta
        // Convert delta from screen pixels to video space
        // IMPORTANT: Divide by transform.scale so visual change matches drag distance
        // This ensures 50px drag = 50px visual change, regardless of scale
        const videoDelta = deltaX / effectiveRenderScale / transform.scale;
        let newWidth: number;
        let xAdjustment = 0; // Position adjustment to keep opposite edge fixed

        if (activeHandle === 'r') {
          // Right handle: drag right to widen, left to narrow
          // LEFT edge should stay fixed, so adjust X position
          newWidth = initialWidth + videoDelta;
          // When width increases, center moves right by half the width change
          xAdjustment = (newWidth - initialWidth) / 2;
        } else {
          // Left handle: drag left to widen, right to narrow
          // RIGHT edge should stay fixed, so adjust X position
          newWidth = initialWidth - videoDelta;
          // When width increases, center moves left by half the width change
          xAdjustment = -(newWidth - initialWidth) / 2;
        }

        // Clamp width to reasonable bounds (min 50px, max 3x video width)
        const minWidth = 50;
        const maxWidth = videoWidth * 3;
        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

        // Recalculate X adjustment if width was clamped
        if (clampedWidth !== newWidth) {
          if (activeHandle === 'r') {
            xAdjustment = (clampedWidth - initialWidth) / 2;
          } else {
            xAdjustment = -(clampedWidth - initialWidth) / 2;
          }
          newWidth = clampedWidth;
        }

        // Update drag width for immediate visual feedback (in screen pixels)
        // This is used for boundary dimensions and content width during drag
        setCurrentDragWidth(newWidth * effectiveRenderScale);

        // Calculate new X position in video space, then convert to normalized
        const initialVideoX = initialTransform.x / effectiveRenderScale;
        const newVideoX = initialVideoX + xAdjustment;
        const normalizedX = newVideoX / (videoWidth / 2);

        // Update width AND position - height will be auto-calculated by content reflow
        // Position adjustment ensures the opposite edge stays fixed during resize
        onTransformUpdate(track.id, {
          width: newWidth,
          x: normalizedX,
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

        // Only update rotation - width/height remain unchanged during rotation
        // This prevents auto-scaling when rotating elements
        onTransformUpdate(track.id, {
          rotation: newRotation,
        });
      }
    };

    const handleMouseUp = () => {
      // Clear any pending drag timeout
      if (dragDelayTimeoutRef.current) {
        clearTimeout(dragDelayTimeoutRef.current);
        dragDelayTimeoutRef.current = null;
      }

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
      setIsPendingDrag(false);
      setIsScaling(false);
      setIsResizingWidth(false);
      setIsRotating(false);
      setActiveHandle(null);
      setDragStart(null);
      setInitialTransform(null);
      setCurrentDragWidth(null); // Clear drag width feedback
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    isPendingDrag,
    isScaling,
    isResizingWidth,
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
    disableScaleTransform,
    startDraggingTransform,
    endDraggingTransform,
  ]);

  // Get cursor style based on interaction mode and active handle
  const getCursorStyle = () => {
    if (isEditing) return 'text';
    if (isTextEditMode && isSelected) return 'text'; // Show text cursor when in text edit mode
    if (isDragging) return 'grabbing';
    if (isResizingWidth) return 'ew-resize'; // Width resize cursor for left/right handles
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

  // Content component - may be wrapped in clipping layer
  // Scale is ALWAYS applied to support corner handle scaling
  // This matches industry-standard behavior (CapCut, Canva, Figma)
  const contentTransform = `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) scale(${transform.scale}) rotate(${transform.rotation}deg)`;

  // Determine pointer events based on interaction mode
  // Pan Tool: disable all interactions
  // Text Tool: keep text interactive (allow editing text)
  // Select Tool: enable all interactions
  const shouldDisablePointerEvents = interactionMode === 'pan';

  // Calculate the user-defined width constraint for text wrapping
  // Only apply width constraint if user has explicitly resized using left/right handles
  // This allows text to flow naturally until user constrains it
  // During active resize, use currentDragWidth for immediate feedback
  // Otherwise, use stored width from transform (scaled from video space to screen pixels)
  const userDefinedWidth = (() => {
    // During active width resize, use the drag width for immediate feedback
    if (isResizingWidth && currentDragWidth !== null) {
      return currentDragWidth;
    }
    // After resize, use the stored width
    if (hasUserDefinedWidthRef.current && normalizedTransform.width) {
      return normalizedTransform.width * effectiveRenderScale;
    }
    return undefined;
  })();

  const contentComponent = (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: '50%',
        top: '50%',
        transform: contentTransform,
        transformOrigin: 'center center',
        cursor: getCursorStyle(),
        pointerEvents: shouldDisablePointerEvents ? 'none' : 'auto',
        zIndex: isSelected ? 1000 : 1,
        userSelect: isEditing ? 'text' : 'auto',
        WebkitUserSelect: isEditing ? 'text' : 'auto',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      {/* Content */}
      <div
        ref={contentRef}
        className="relative"
        data-text-element="true"
        style={{
          pointerEvents: 'auto',
          // Apply user-defined width for text wrapping when set via left/right handles
          // This causes text to reflow within the specified width
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
              ...appliedStyle,
              cursor: 'text',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              // Apply width constraint when user has set it via left/right handles
              ...(userDefinedWidth && {
                width: `${userDefinedWidth}px`,
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'pre-wrap',
              }),
            }}
          >
            {track.textContent}
          </div>
        ) : userDefinedWidth && React.isValidElement(children) ? (
          // When user has defined width, clone children and override its
          // inline styles to force text wrapping within the constrained width.
          // This overrides wordBreak: 'keep-all' and overflowWrap: 'normal'
          // that are set on the text content in UnifiedOverlayRenderer.
          React.cloneElement(
            children as React.ReactElement<{ style?: React.CSSProperties }>,
            {
              style: {
                ...(children.props as { style?: React.CSSProperties }).style,
                width: '100%',
                maxWidth: '100%',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              },
            },
          )
        ) : (
          children
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Text Content Container - with optional clipping wrapper */}
      {shouldRenderContent && clipContent && clipWidth && clipHeight ? (
        <div
          className="absolute pointer-events-none"
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
      {/* Hide transform handles only when actively editing text, not when text edit mode is active */}
      {/* Only show transform handles in select mode */}
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
              transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px) rotate(${transform.rotation}deg)`,
              transformOrigin: 'center center',
              // Boundary dimensions ALWAYS include scale to match content scaling
              // During width resize, use currentDragWidth for immediate visual feedback
              width: `${(isResizingWidth && currentDragWidth !== null ? currentDragWidth : containerSize.width) * transform.scale}px`,
              height: `${containerSize.height * transform.scale}px`,
              border: `${2 * handleScale}px solid #F45513`,
              borderRadius: `${4 * handleScale}px`,
              zIndex: 10000, // Very high z-index to ensure handles are always on top and interactive
              pointerEvents: 'auto', // Allow boundary to capture drag events for off-canvas dragging
              cursor: getCursorStyle(), // Show appropriate cursor
            }}
            onMouseDown={handleMouseDown}
            onDoubleClick={boundaryOnly ? undefined : handleDoubleClick}
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
            {/* These resize container WIDTH only, causing text to reflow/wrap */}
            {/* This matches industry-standard text behavior (CapCut, Premiere, Figma) */}
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
