import { useCallback, useEffect, useRef } from 'react';

interface AutoScrollConfig {
  enabled: boolean;
  mouseX: number;
  mouseY: number;
  scrollElement: HTMLElement | null;
  threshold?: number;
  speed?: number;
  onScroll?: (newScrollX: number) => void;
}

interface AutoScrollResult {
  isScrolling: boolean;
  scrollDelta: number;
}

/**
 * useAutoScroll - Custom hook for auto-scrolling during drag operations
 *
 * Automatically scrolls the timeline when the cursor approaches the left or right edges
 * during drag operations. Provides smooth, continuous scrolling with configurable
 * threshold and speed. Features acceleration - the longer the cursor stays near the edge,
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
 * @returns Object with isScrolling flag and current scrollDelta
 */
export const useAutoScroll = ({
  enabled,
  mouseX,
  mouseY,
  scrollElement,
  threshold = 50,
  speed = 1.0,
  onScroll,
}: AutoScrollConfig): AutoScrollResult => {
  const animationFrameRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const isScrollingRef = useRef<boolean>(false);
  const scrollDeltaRef = useRef<number>(0);
  const scrollStartTimeRef = useRef<number>(0);
  const accelerationMultiplierRef = useRef<number>(1.0);

  // Calculate scroll delta based on mouse position with acceleration
  const calculateScrollDelta = useCallback(
    (accelerationMultiplier: number) => {
      if (!scrollElement) return 0;

      const rect = scrollElement.getBoundingClientRect();
      const relativeX = mouseX - rect.left;
      const viewportWidth = rect.width;

      let delta = 0;

      if (relativeX < threshold) {
        // Near left edge - scroll left
        const intensity = 1 - relativeX / threshold;
        delta = -intensity * 15 * speed * accelerationMultiplier; // Negative = scroll left
      } else if (relativeX > viewportWidth - threshold) {
        // Near right edge - scroll right
        const intensity = (relativeX - (viewportWidth - threshold)) / threshold;
        delta = intensity * 15 * speed * accelerationMultiplier; // Positive = scroll right
      }

      return delta;
    },
    [mouseX, scrollElement, threshold, speed],
  );

  useEffect(() => {
    if (!enabled || !scrollElement) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        isScrollingRef.current = false;
        scrollDeltaRef.current = 0;
        scrollStartTimeRef.current = 0;
        accelerationMultiplierRef.current = 1.0;
      }
      return;
    }

    const scrollDelta = calculateScrollDelta(accelerationMultiplierRef.current);
    scrollDeltaRef.current = scrollDelta;

    // Only scroll if we have a delta
    if (scrollDelta !== 0) {
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
        const scrollDuration = (timestamp - scrollStartTimeRef.current) / 1000; // seconds
        // Gradually increase speed over 2 seconds, max 2.5x speed
        // Uses easeInQuad for smooth acceleration
        const maxAcceleration = 2.5;
        const accelerationDuration = 2.0; // seconds to reach max speed
        const progress = Math.min(scrollDuration / accelerationDuration, 1.0);
        accelerationMultiplierRef.current =
          1.0 + (maxAcceleration - 1.0) * progress * progress;

        // Recalculate delta with acceleration
        const currentDelta = calculateScrollDelta(
          accelerationMultiplierRef.current,
        );
        scrollDeltaRef.current = currentDelta;

        if (currentDelta === 0) {
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

        // Calculate new scroll position
        const currentScrollX = scrollElement.scrollLeft;
        const maxScrollX =
          scrollElement.scrollWidth - scrollElement.clientWidth;
        const newScrollX = Math.max(
          0,
          Math.min(currentScrollX + currentDelta, maxScrollX),
        );

        // Only update if position actually changed
        if (Math.abs(newScrollX - currentScrollX) > 0.1) {
          scrollElement.scrollLeft = newScrollX;

          // Notify parent of scroll change
          if (onScroll) {
            onScroll(newScrollX);
          }
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
    calculateScrollDelta,
  ]);

  return {
    isScrolling: isScrollingRef.current,
    scrollDelta: scrollDeltaRef.current,
  };
};
