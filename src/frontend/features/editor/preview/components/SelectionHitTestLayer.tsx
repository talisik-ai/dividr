/**
 * SelectionHitTestLayer - Unified hit-testing for z-index aware element selection
 *
 * This invisible layer captures clicks and determines which element should be selected
 * based on cursor position and z-index ordering (higher trackRowIndex = higher priority).
 *
 * CRITICAL FIX: Selection must use SPATIAL hit-testing first, then z-index prioritization.
 * This prevents higher z-index elements from blocking selection of visible, non-overlapping
 * elements below them. This matches CapCut/Premiere Pro/After Effects interaction rules.
 *
 * Key features:
 * - Spatial hit-testing: only elements under cursor compete for selection
 * - Z-index prioritization: among hit elements, highest z-index wins
 * - Works with ALL element types (video, image, text, subtitle)
 * - Supports Shift+Click cycle selection for overlapping elements
 * - Supports double-click for text editing
 * - Provides hover highlighting feedback
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { getTrackZIndex } from '../utils/trackUtils';

export interface SelectionHitTestLayerProps {
  tracks: VideoTrack[];
  currentFrame: number;
  selectedTrackIds: string[];
  onSelect: (trackId: string) => void;
  onDeselect?: () => void;
  onHover?: (trackId: string | null) => void;
  onDoubleClick?: (trackId: string) => void;
  actualWidth: number;
  actualHeight: number;
  baseVideoWidth: number;
  baseVideoHeight: number;
  panX: number;
  panY: number;
  renderScale: number;
  interactionMode: 'select' | 'pan' | 'text-edit';
  disabled?: boolean;
  globalSubtitlePosition?: { x: number; y: number };
}

export interface ElementBounds {
  trackId: string;
  track: VideoTrack;
  zIndex: number;
  // Bounds in screen coordinates (after transforms)
  left: number;
  top: number;
  right: number;
  bottom: number;
  // Center point for rotation calculations
  centerX: number;
  centerY: number;
  rotation: number;
}

/**
 * Calculate element bounds in screen coordinates
 * Handles all element types including subtitles with global positioning
 * EXPORTED for use by transform boundaries for hit-testing
 */
export const calculateElementBounds = (
  track: VideoTrack,
  actualWidth: number,
  actualHeight: number,
  baseVideoWidth: number,
  baseVideoHeight: number,
  renderScale: number,
  allTracks: VideoTrack[],
  globalSubtitlePosition?: { x: number; y: number },
): ElementBounds | null => {
  // Subtitles use global position instead of per-track transform
  if (track.type === 'subtitle') {
    const position = globalSubtitlePosition || { x: 0, y: 0 };

    // Subtitle dimensions are estimated based on text content
    // This is approximate but sufficient for hit-testing
    const estimatedWidth = Math.min(baseVideoWidth * 0.9, 600) * renderScale;
    const estimatedHeight = 100 * renderScale;

    // Position from center (normalized coords converted to pixels)
    const offsetX = position.x * (actualWidth / 2);
    const offsetY = position.y * (actualHeight / 2);

    const centerX = actualWidth / 2 + offsetX;
    const centerY = actualHeight / 2 + offsetY;

    const halfWidth = estimatedWidth / 2;
    const halfHeight = estimatedHeight / 2;

    return {
      trackId: track.id,
      track,
      zIndex: getTrackZIndex(track, allTracks),
      left: centerX - halfWidth,
      top: centerY - halfHeight,
      right: centerX + halfWidth,
      bottom: centerY + halfHeight,
      centerX,
      centerY,
      rotation: 0,
    };
  }

  const transform = track.textTransform || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    width: track.width || baseVideoWidth,
    height: track.height || baseVideoHeight,
  };

  // Element dimensions in render space
  const elementWidth =
    (transform.width || track.width || baseVideoWidth) *
    renderScale *
    transform.scale;
  const elementHeight =
    (transform.height || track.height || baseVideoHeight) *
    renderScale *
    transform.scale;

  // Position from center (normalized coords converted to pixels)
  const offsetX = transform.x * (actualWidth / 2);
  const offsetY = transform.y * (actualHeight / 2);

  // Center of the element
  const centerX = actualWidth / 2 + offsetX;
  const centerY = actualHeight / 2 + offsetY;

  // Bounds (before rotation)
  const halfWidth = elementWidth / 2;
  const halfHeight = elementHeight / 2;

  return {
    trackId: track.id,
    track,
    zIndex: getTrackZIndex(track, allTracks),
    left: centerX - halfWidth,
    top: centerY - halfHeight,
    right: centerX + halfWidth,
    bottom: centerY + halfHeight,
    centerX,
    centerY,
    rotation: transform.rotation || 0,
  };
};

/**
 * Check if a point is inside a potentially rotated rectangle
 * EXPORTED for use by transform boundaries for hit-testing
 */
export const isPointInRotatedRect = (
  pointX: number,
  pointY: number,
  bounds: ElementBounds,
): boolean => {
  const { centerX, centerY, left, top, right, bottom, rotation } = bounds;

  // If no rotation, simple bounds check
  if (rotation === 0) {
    return (
      pointX >= left && pointX <= right && pointY >= top && pointY <= bottom
    );
  }

  // Rotate point around center in opposite direction
  const rad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const dx = pointX - centerX;
  const dy = pointY - centerY;

  const rotatedX = centerX + dx * cos - dy * sin;
  const rotatedY = centerY + dx * sin + dy * cos;

  // Now check against unrotated bounds
  return (
    rotatedX >= left &&
    rotatedX <= right &&
    rotatedY >= top &&
    rotatedY <= bottom
  );
};

/**
 * Get the topmost element at a given point among a set of tracks.
 * Used by transform boundaries to check if another element should receive the click.
 *
 * @returns The track ID of the topmost element at the point, or null if no element is hit
 */
export const getTopElementAtPoint = (
  x: number,
  y: number,
  tracks: VideoTrack[],
  currentFrame: number,
  actualWidth: number,
  actualHeight: number,
  baseVideoWidth: number,
  baseVideoHeight: number,
  renderScale: number,
  globalSubtitlePosition?: { x: number; y: number },
): string | null => {
  const visualTypes: VideoTrack['type'][] = [
    'video',
    'image',
    'text',
    'subtitle',
  ];

  // Get active visual tracks sorted by z-index descending (topmost first)
  const activeVisualTracks = tracks
    .filter(
      (track) =>
        visualTypes.includes(track.type) &&
        track.visible &&
        currentFrame >= track.startFrame &&
        currentFrame < track.endFrame,
    )
    .sort((a, b) => getTrackZIndex(b, tracks) - getTrackZIndex(a, tracks));

  // Calculate bounds for all active tracks
  for (const track of activeVisualTracks) {
    const bounds = calculateElementBounds(
      track,
      actualWidth,
      actualHeight,
      baseVideoWidth,
      baseVideoHeight,
      renderScale,
      tracks,
      globalSubtitlePosition,
    );

    if (bounds && isPointInRotatedRect(x, y, bounds)) {
      return track.id;
    }
  }

  return null;
};

export const SelectionHitTestLayer: React.FC<SelectionHitTestLayerProps> = ({
  tracks,
  currentFrame,
  selectedTrackIds,
  onSelect,
  onDeselect,
  onDoubleClick,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  panX,
  panY,
  renderScale,
  interactionMode,
  disabled = false,
  globalSubtitlePosition,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const lastCycleClickRef = useRef<{
    x: number;
    y: number;
    time: number;
    index: number;
  } | null>(null);
  const lastClickRef = useRef<{ time: number; trackId: string | null }>({
    time: 0,
    trackId: null,
  });

  // Get active visual tracks at current frame, sorted by z-index (descending for hit-testing)
  const activeVisualTracks = useMemo(() => {
    const visualTypes: VideoTrack['type'][] = [
      'video',
      'image',
      'text',
      'subtitle',
    ];

    return tracks
      .filter(
        (track) =>
          visualTypes.includes(track.type) &&
          track.visible &&
          currentFrame >= track.startFrame &&
          currentFrame < track.endFrame,
      )
      .sort((a, b) => {
        // Sort descending: higher z-index first for hit-testing (topmost first)
        return getTrackZIndex(b, tracks) - getTrackZIndex(a, tracks);
      });
  }, [tracks, currentFrame]);

  // Pre-calculate bounds for all active tracks
  const elementBounds = useMemo(() => {
    return activeVisualTracks
      .map((track) =>
        calculateElementBounds(
          track,
          actualWidth,
          actualHeight,
          baseVideoWidth,
          baseVideoHeight,
          renderScale,
          tracks,
          globalSubtitlePosition,
        ),
      )
      .filter((bounds): bounds is ElementBounds => bounds !== null);
  }, [
    activeVisualTracks,
    actualWidth,
    actualHeight,
    baseVideoWidth,
    baseVideoHeight,
    renderScale,
    tracks,
    globalSubtitlePosition,
  ]);

  // Find all elements at a given point, sorted by z-index (topmost first)
  const getElementsAtPoint = useCallback(
    (x: number, y: number): ElementBounds[] => {
      return elementBounds.filter((bounds) =>
        isPointInRotatedRect(x, y, bounds),
      );
    },
    [elementBounds],
  );

  // Handle mouse move for hover detection
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || interactionMode !== 'select') {
        if (hoveredTrackId) {
          setHoveredTrackId(null);
        }
        return;
      }

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const elementsAtPoint = getElementsAtPoint(x, y);
      const topElement = elementsAtPoint[0];

      const newHoveredId = topElement?.trackId || null;
      if (newHoveredId !== hoveredTrackId) {
        setHoveredTrackId(newHoveredId);
      }
    },
    [disabled, interactionMode, hoveredTrackId, getElementsAtPoint],
  );

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (hoveredTrackId) {
      setHoveredTrackId(null);
    }
  }, [hoveredTrackId]);

  // Handle mousedown for selection (more responsive than click)
  // CRITICAL: This is the primary selection handler for ALL element types.
  // Selection algorithm:
  // 1. Spatial hit-test: find all elements under the cursor
  // 2. Z-index prioritization: among hit elements, select the highest z-index one
  // This prevents higher z-index elements from blocking selection of visible,
  // non-overlapping elements below them.
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || interactionMode !== 'select') return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // SPATIAL HIT-TEST: Only elements whose bounds contain the cursor can be selected
      const elementsAtPoint = getElementsAtPoint(x, y);

      // If no elements are under the cursor, deselect all and stop propagation
      // This handles clicking on empty space to deselect
      if (elementsAtPoint.length === 0) {
        if (selectedTrackIds.length > 0) {
          e.stopPropagation();
          e.preventDefault();
          onDeselect?.();
        }
        return;
      }

      // Get the topmost element among those that were hit
      // (elementsAtPoint is already sorted by z-index descending)
      const topElement = elementsAtPoint[0];

      // Double-click detection for text editing
      const now = Date.now();
      const lastClick = lastClickRef.current;
      const isDoubleClick =
        now - lastClick.time < 300 && lastClick.trackId === topElement.trackId;

      // Update last click tracking
      lastClickRef.current = { time: now, trackId: topElement.trackId };

      // Handle double-click for text/subtitle editing
      if (
        isDoubleClick &&
        (topElement.track.type === 'text' ||
          topElement.track.type === 'subtitle')
      ) {
        e.stopPropagation();
        e.preventDefault();
        // First ensure the element is selected
        if (!selectedTrackIds.includes(topElement.trackId)) {
          onSelect(topElement.trackId);
        }
        // Then trigger double-click handler for edit mode
        onDoubleClick?.(topElement.trackId);
        return;
      }

      // If the topmost hit element is already selected, let the transform boundary handle it
      // This allows dragging already-selected elements
      if (selectedTrackIds.includes(topElement.trackId)) {
        // Don't stop propagation - let the existing transform boundary handle drag
        return;
      }

      // CRITICAL: Stop propagation to prevent DOM z-index stacking from taking over
      // Without this, higher z-index full-size wrapper divs would intercept the click
      e.stopPropagation();
      e.preventDefault();

      // Shift+Click: Cycle through overlapping elements at this point
      if (e.shiftKey && elementsAtPoint.length > 1) {
        const last = lastCycleClickRef.current;

        // Check if this is a continuation of the same cycle click
        const isSameCycle =
          last &&
          Math.abs(last.x - x) < 5 &&
          Math.abs(last.y - y) < 5 &&
          now - last.time < 1000;

        let cycleIndex = 0;
        if (isSameCycle) {
          cycleIndex = (last.index + 1) % elementsAtPoint.length;
        }

        lastCycleClickRef.current = { x, y, time: now, index: cycleIndex };
        onSelect(elementsAtPoint[cycleIndex].trackId);
        return;
      }

      // Normal click: Select the topmost element that was spatially hit
      onSelect(topElement.trackId);

      // Reset cycle tracking for non-shift clicks
      lastCycleClickRef.current = null;
    },
    [
      disabled,
      interactionMode,
      getElementsAtPoint,
      selectedTrackIds,
      onSelect,
      onDeselect,
      onDoubleClick,
    ],
  );

  // Don't render if disabled or not in select mode
  if (disabled || interactionMode !== 'select') {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        // CRITICAL: Must be above all track wrapper divs (which are at z-index 1000+)
        // but below transform boundary layer (which is at z-index 10000)
        // This ensures spatial hit-testing happens BEFORE DOM z-index stacking
        zIndex: 9000,
        // Capture pointer events for hit-testing
        pointerEvents: 'auto',
        cursor: hoveredTrackId ? 'pointer' : 'default',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      data-testid="selection-hit-test-layer"
    />
  );
};

export default SelectionHitTestLayer;
