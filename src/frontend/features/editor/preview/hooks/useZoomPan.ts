import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_ZOOM_SCALE, MIN_ZOOM_SCALE, ZOOM_FACTOR } from '../core/constants';
import { PanState, PinchState } from '../core/types';

/**
 * Hook for managing zoom and pan interactions
 */

export interface UseZoomPanProps {
  containerRef: React.RefObject<HTMLDivElement>;
  previewScale: number;
  panX: number;
  panY: number;
  interactionMode: 'select' | 'pan' | 'text-edit';
  setPreviewScale: (scale: number) => void;
  setPreviewPan: (x: number, y: number) => void;
  setPreviewInteractionMode: (
    mode: 'select' | 'pan' | 'text-edit',
  ) => void;
  hasContent: boolean;
}

export function useZoomPan({
  containerRef,
  previewScale,
  panX,
  panY,
  interactionMode,
  setPreviewScale,
  setPreviewPan,
  setPreviewInteractionMode,
  hasContent,
}: UseZoomPanProps) {
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<PanState | null>(null);
  const pinchStateRef = useRef<PinchState | null>(null);

  // Auto-reset pan and mode when zooming out
  useEffect(() => {
    if (previewScale <= 1) {
      // When zooming to 100% or below, reset pan to center
      if (panX !== 0 || panY !== 0) {
        setPreviewPan(0, 0);
      }

      // Auto-switch to select mode when zooming out
      if (interactionMode === 'pan') {
        setPreviewInteractionMode('select');
      }
    }
  }, [
    previewScale,
    panX,
    panY,
    interactionMode,
    setPreviewPan,
    setPreviewInteractionMode,
  ]);

  // Pan handlers
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      // Only enable panning when in pan mode and zoomed in
      if (interactionMode !== 'pan') return;
      if (previewScale <= 1) return;

      // Don't start panning if there's no content
      if (!hasContent) return;

      setIsPanning(true);
      panStartRef.current = {
        isPanning: true,
        startX: e.clientX,
        startY: e.clientY,
        panX: panX,
        panY: panY,
      };
    },
    [interactionMode, previewScale, panX, panY, hasContent],
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;

      const deltaX = e.clientX - panStartRef.current.startX;
      const deltaY = e.clientY - panStartRef.current.startY;

      const newPanX = panStartRef.current.panX + deltaX;
      const newPanY = panStartRef.current.panY + deltaY;

      setPreviewPan(newPanX, newPanY);
    },
    [isPanning, setPreviewPan],
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Wheel zoom handler with cursor-based pivot
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Support both Ctrl+Scroll and Alt+Scroll for zooming
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      // Get cursor position relative to container
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Calculate cursor position in preview space (accounting for current pan)
      const previewCenterX = rect.width / 2;
      const previewCenterY = rect.height / 2;

      // Position relative to center, accounting for current pan
      const relativeX = cursorX - previewCenterX - panX;
      const relativeY = cursorY - previewCenterY - panY;

      // Determine zoom direction and factor
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const oldScale = previewScale;
      const newScale = Math.max(
        MIN_ZOOM_SCALE,
        Math.min(oldScale * zoomFactor, MAX_ZOOM_SCALE),
      );

      // If scale didn't actually change (hit limits), don't adjust pan
      if (newScale === oldScale) return;

      // Calculate new pan to keep cursor point stationary
      // The point under the cursor should remain in the same visual position
      const scaleDelta = newScale / oldScale - 1;
      const newPanX = panX - relativeX * scaleDelta;
      const newPanY = panY - relativeY * scaleDelta;

      // Apply zoom and adjust pan
      setPreviewScale(newScale);
      setPreviewPan(newPanX, newPanY);
    },
    [containerRef, previewScale, panX, panY, setPreviewScale, setPreviewPan],
  );

  // Pinch zoom handlers for touchpad/touchscreen
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Start pinch gesture
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );

        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        pinchStateRef.current = {
          initialDistance: distance,
          initialScale: previewScale,
          centerX,
          centerY,
        };
      }
    },
    [previewScale],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStateRef.current) {
        e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        // Calculate scale change
        const scaleChange = distance / pinchStateRef.current.initialDistance;
        const newScale = Math.max(
          MIN_ZOOM_SCALE,
          Math.min(
            pinchStateRef.current.initialScale * scaleChange,
            MAX_ZOOM_SCALE,
          ),
        );

        // Calculate cursor position relative to container
        const cursorX = centerX - rect.left;
        const cursorY = centerY - rect.top;

        // Position relative to center
        const previewCenterX = rect.width / 2;
        const previewCenterY = rect.height / 2;
        const relativeX = cursorX - previewCenterX - panX;
        const relativeY = cursorY - previewCenterY - panY;

        // Calculate new pan to keep pinch center stationary
        const oldScale = previewScale;
        if (newScale !== oldScale) {
          const scaleDelta = newScale / oldScale - 1;
          const newPanX = panX - relativeX * scaleDelta;
          const newPanY = panY - relativeY * scaleDelta;

          setPreviewScale(newScale);
          setPreviewPan(newPanX, newPanY);
        }
      }
    },
    [containerRef, previewScale, panX, panY, setPreviewScale, setPreviewPan],
  );

  const handleTouchEnd = useCallback(() => {
    pinchStateRef.current = null;
  }, []);

  // Add global mouse up listener for panning
  useEffect(() => {
    if (!isPanning) return;

    const handleGlobalMouseUp = () => {
      handlePanEnd();
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isPanning, handlePanEnd]);

  return {
    isPanning,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
}
