import { useCallback, useEffect, useRef } from 'react';

interface AutoScrollConfig {
  enabled: boolean;
  mouseX: number;
  mouseY: number;
  scrollElement: HTMLElement | null;
  threshold?: number;
  speed?: number;
  onScroll?: (newScrollX: number, newScrollY: number) => void;
  /** Enable horizontal auto-scroll (default: true) */
  enableHorizontal?: boolean;
  /** Enable vertical auto-scroll (default: false) */
  enableVertical?: boolean;
}

interface AutoScrollResult {
  isScrolling: boolean;
  scrollDeltaX: number;
  scrollDeltaY: number;
  /** @deprecated Use scrollDeltaX instead */
  scrollDelta: number;
}

/**
 * useAutoScroll - Custom hook for auto-scrolling during drag operations
 *
 * Automatically scrolls the timeline when the cursor approaches the edges
 * during drag operations. Supports both horizontal and vertical scrolling.
 * Provides smooth, continuous scrolling with configurable threshold and speed.
 * Features acceleration - the longer the cursor stays near the edge,
 * the faster the scroll becomes for a natural feel.
 *
 * @param config - Configuration object
 * @param config.enabled - Whether auto-scroll is active
 * @param config.mouseX - Current mouse X position (clientX)
 * @param config.mouseY - Current mouse Y position (clientY)
 * @param config.scrollElement - The scrollable timeline element
 * @param config.threshold - Distance from edge to trigger scroll (default: 50px)
 * @param config.speed - Base scroll speed multiplier (default: 1.0)
 * @param config.onScroll - Callback when scroll position changes
 * @param config.enableHorizontal - Enable horizontal auto-scroll (default: true)
 * @param config.enableVertical - Enable vertical auto-scroll (default: false)
 * @returns Object with isScrolling flag and current scroll deltas
 */
export const useAutoScroll = ({
  enabled,
  mouseX,
  mouseY,
  scrollElement,
  threshold = 50,
  speed = 1.0,
  onScroll,
  enableHorizontal = true,
  enableVertical = false,
}: AutoScrollConfig): AutoScrollResult => {
  const animationFrameRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const isScrollingRef = useRef<boolean>(false);
  const scrollDeltaXRef = useRef<number>(0);
  const scrollDeltaYRef = useRef<number>(0);
  const scrollStartTimeRef = useRef<number>(0);
  const accelerationMultiplierRef = useRef<number>(1.0);

  // Calculate scroll deltas based on mouse position with acceleration
  const calculateScrollDeltas = useCallback(
    (accelerationMultiplier: number): { deltaX: number; deltaY: number } => {
      if (!scrollElement) return { deltaX: 0, deltaY: 0 };

      const rect = scrollElement.getBoundingClientRect();
      let deltaX = 0;
      let deltaY = 0;

      // Horizontal scroll calculation
      if (enableHorizontal) {
        const relativeX = mouseX - rect.left;
        const viewportWidth = rect.width;

        if (relativeX < threshold) {
          // Near left edge - scroll left
          const intensity = 1 - relativeX / threshold;
          deltaX = -intensity * 15 * speed * accelerationMultiplier;
        } else if (relativeX > viewportWidth - threshold) {
          // Near right edge - scroll right
          const intensity =
            (relativeX - (viewportWidth - threshold)) / threshold;
          deltaX = intensity * 15 * speed * accelerationMultiplier;
        }
      }

      // Vertical scroll calculation
      if (enableVertical) {
        const relativeY = mouseY - rect.top;
        const viewportHeight = rect.height;

        if (relativeY < threshold) {
          // Near top edge - scroll up
          const intensity = 1 - relativeY / threshold;
          deltaY = -intensity * 15 * speed * accelerationMultiplier;
        } else if (relativeY > viewportHeight - threshold) {
          // Near bottom edge - scroll down
          const intensity =
            (relativeY - (viewportHeight - threshold)) / threshold;
          deltaY = intensity * 15 * speed * accelerationMultiplier;
        }
      }

      return { deltaX, deltaY };
    },
    [
      mouseX,
      mouseY,
      scrollElement,
      threshold,
      speed,
      enableHorizontal,
      enableVertical,
    ],
  );

  useEffect(() => {
    if (!enabled || !scrollElement) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        isScrollingRef.current = false;
        scrollDeltaXRef.current = 0;
        scrollDeltaYRef.current = 0;
        scrollStartTimeRef.current = 0;
        accelerationMultiplierRef.current = 1.0;
      }
      return;
    }

    const { deltaX, deltaY } = calculateScrollDeltas(
      accelerationMultiplierRef.current,
    );
    scrollDeltaXRef.current = deltaX;
    scrollDeltaYRef.current = deltaY;

    // Only scroll if we have a delta in either direction
    if (deltaX !== 0 || deltaY !== 0) {
      isScrollingRef.current = true;

      const animate = (timestamp: number) => {
        if (!enabled || !scrollElement) {
          animationFrameRef.current = null;
          isScrollingRef.current = false;
          scrollStartTimeRef.current = 0;
          accelerationMultiplierRef.current = 1.0;
          return;
        }

        // Initialize scroll start time on first frame
        if (scrollStartTimeRef.current === 0) {
          scrollStartTimeRef.current = timestamp;
        }

        // Calculate acceleration based on how long we've been scrolling
        const scrollDuration = (timestamp - scrollStartTimeRef.current) / 1000;
        const maxAcceleration = 2.5;
        const accelerationDuration = 2.0;
        const progress = Math.min(scrollDuration / accelerationDuration, 1.0);
        accelerationMultiplierRef.current =
          1.0 + (maxAcceleration - 1.0) * progress * progress;

        // Recalculate deltas with acceleration
        const currentDeltas = calculateScrollDeltas(
          accelerationMultiplierRef.current,
        );
        scrollDeltaXRef.current = currentDeltas.deltaX;
        scrollDeltaYRef.current = currentDeltas.deltaY;

        if (currentDeltas.deltaX === 0 && currentDeltas.deltaY === 0) {
          animationFrameRef.current = null;
          isScrollingRef.current = false;
          scrollStartTimeRef.current = 0;
          accelerationMultiplierRef.current = 1.0;
          return;
        }

        // Throttle to ~60fps for smooth scrolling
        const elapsed = timestamp - lastScrollTimeRef.current;
        if (elapsed < 16) {
          animationFrameRef.current = requestAnimationFrame(animate);
          return;
        }

        lastScrollTimeRef.current = timestamp;

        // Calculate new scroll positions
        const currentScrollX = scrollElement.scrollLeft;
        const currentScrollY = scrollElement.scrollTop;
        const maxScrollX =
          scrollElement.scrollWidth - scrollElement.clientWidth;
        const maxScrollY =
          scrollElement.scrollHeight - scrollElement.clientHeight;

        const newScrollX = Math.max(
          0,
          Math.min(currentScrollX + currentDeltas.deltaX, maxScrollX),
        );
        const newScrollY = Math.max(
          0,
          Math.min(currentScrollY + currentDeltas.deltaY, maxScrollY),
        );

        let scrollChanged = false;

        // Only update if position actually changed
        if (enableHorizontal && Math.abs(newScrollX - currentScrollX) > 0.1) {
          scrollElement.scrollLeft = newScrollX;
          scrollChanged = true;
        }

        if (enableVertical && Math.abs(newScrollY - currentScrollY) > 0.1) {
          scrollElement.scrollTop = newScrollY;
          scrollChanged = true;
        }

        // Notify parent of scroll change
        if (scrollChanged && onScroll) {
          onScroll(newScrollX, newScrollY);
        }

        // Continue animation
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      // Start animation if not already running
      if (!animationFrameRef.current) {
        lastScrollTimeRef.current = performance.now();
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    } else {
      // Stop animation when outside threshold zones and reset acceleration
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        isScrollingRef.current = false;
        scrollStartTimeRef.current = 0;
        accelerationMultiplierRef.current = 1.0;
      }
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        isScrollingRef.current = false;
      }
    };
  }, [
    enabled,
    mouseX,
    mouseY,
    scrollElement,
    threshold,
    speed,
    onScroll,
    calculateScrollDeltas,
    enableHorizontal,
    enableVertical,
  ]);

  return {
    isScrolling: isScrollingRef.current,
    scrollDeltaX: scrollDeltaXRef.current,
    scrollDeltaY: scrollDeltaYRef.current,
    // Backward compatibility
    scrollDelta: scrollDeltaXRef.current,
  };
};
