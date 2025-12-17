/**
 * SelectionHitTestLayer - Unified hit-testing for z-index aware element selection
 *
 * This invisible layer captures clicks and determines which element should be selected
 * based on cursor position and z-index ordering (higher trackRowIndex = higher priority).
 *
 * Key features:
 * - Works with canvas-rendered video elements
 * - Respects z-index stacking order
 * - Supports Shift+Click cycle selection for overlapping elements
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
  onHover?: (trackId: string | null) => void;
  actualWidth: number;
  actualHeight: number;
  baseVideoWidth: number;
  baseVideoHeight: number;
  panX: number;
  panY: number;
  renderScale: number;
  interactionMode: 'select' | 'pan' | 'text-edit';
  disabled?: boolean;
}

interface ElementBounds {
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
 */
const calculateElementBounds = (
  track: VideoTrack,
  actualWidth: number,
  actualHeight: number,
  baseVideoWidth: number,
  baseVideoHeight: number,
  renderScale: number,
  allTracks: VideoTrack[],
): ElementBounds | null => {
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
 */
const isPointInRotatedRect = (
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

export const SelectionHitTestLayer: React.FC<SelectionHitTestLayerProps> = ({
  tracks,
  currentFrame,
  selectedTrackIds,
  onSelect,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  panX,
  panY,
  renderScale,
  interactionMode,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTrackId, setHoveredTrackId] = useState<string | null>(null);
  const lastCycleClickRef = useRef<{
    x: number;
    y: number;
    time: number;
    index: number;
  } | null>(null);

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
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || interactionMode !== 'select') return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const elementsAtPoint = getElementsAtPoint(x, y);

      // Check if we clicked on a video track that's not in the DOM
      // (rendered via canvas by FrameDrivenCompositor)
      const videoElementsAtPoint = elementsAtPoint.filter(
        (b) => b.track.type === 'video',
      );

      // If there are no video elements and no elements at all, let the event pass through
      if (elementsAtPoint.length === 0) {
        return;
      }

      // Check if the topmost element is already selected (let transform handle it)
      const topElement = elementsAtPoint[0];
      if (selectedTrackIds.includes(topElement.trackId)) {
        // Already selected - let existing transform boundaries handle drag
        return;
      }

      // If the topmost element is NOT a video, let the DOM handle it
      // (non-video elements have their own click handlers)
      if (topElement.track.type !== 'video') {
        // Check if there's a video underneath that should be selected instead via shift+click
        if (!e.shiftKey) {
          return; // Let the non-video element's handler deal with it
        }
      }

      // Handle selection for video elements or shift+click cycling
      e.stopPropagation();
      e.preventDefault();

      // Shift+Click: Cycle through overlapping elements
      if (e.shiftKey && elementsAtPoint.length > 1) {
        const now = Date.now();
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

      // Normal click on video: Select topmost video element
      if (videoElementsAtPoint.length > 0) {
        onSelect(videoElementsAtPoint[0].trackId);
      } else {
        onSelect(topElement.trackId);
      }

      // Reset cycle tracking for non-shift clicks
      lastCycleClickRef.current = null;
    },
    [disabled, interactionMode, getElementsAtPoint, selectedTrackIds, onSelect],
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
        // This layer is above content but below transform handles
        zIndex: 500,
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
