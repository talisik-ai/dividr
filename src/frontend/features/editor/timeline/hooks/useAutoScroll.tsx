import { useCallback, useEffect, useRef } from 'react';

interface AutoScrollConfig {
  enabled: boolean;
  mouseX: number;
  mouseY: number;
  scrollElement: HTMLElement | null;
  /** Distance from edge to trigger scroll (default: 80px) */
  threshold?: number;
  /** Base scroll speed multiplier (default: 1.0) */
  speed?: number;
  onScroll?: (newScrollX: number, newScrollY: number) => void;
  /** Enable horizontal auto-scroll (default: true) */
  enableHorizontal?: boolean;
  /** Enable vertical auto-scroll (default: false) */
  enableVertical?: boolean;
  /** Vertical threshold override (default: uses threshold) */
  verticalThreshold?: number;
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
 */
export const useAutoScroll = ({
  enabled,
  mouseX,
  mouseY,
  scrollElement,
  threshold = 80,
  speed = 1.0,
  onScroll,
  enableHorizontal = true,
  enableVertical = false,
  verticalThreshold,
}: AutoScrollConfig): AutoScrollResult => {
  const animationFrameRef = useRef<number | null>(null);
  const lastScrollTimeRef = useRef<number>(0);
  const isScrollingRef = useRef<boolean>(false);
  const scrollDeltaXRef = useRef<number>(0);
  const scrollDeltaYRef = useRef<number>(0);
  const scrollStartTimeRef = useRef<number>(0);
  const accelerationMultiplierRef = useRef<number>(1.0);

  // Use separate threshold for vertical if provided
  const effectiveVerticalThreshold = verticalThreshold ?? threshold;

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

        if (relativeX >= 0 && relativeX < threshold) {
          // Near left edge - scroll left
          const intensity = Math.pow(1 - relativeX / threshold, 1.5); // Eased intensity
          deltaX = -intensity * 18 * speed * accelerationMultiplier;
        } else if (
          relativeX > viewportWidth - threshold &&
          relativeX <= viewportWidth
        ) {
          // Near right edge - scroll right
          const intensity = Math.pow(
            (relativeX - (viewportWidth - threshold)) / threshold,
            1.5,
          );
          deltaX = intensity * 18 * speed * accelerationMultiplier;
        }
      }

      // Vertical scroll calculation with extended top zone into ruler area
      if (enableVertical) {
        const relativeY = mouseY - rect.top;
        const viewportHeight = rect.height;

        // TOP threshold - negative value extends INTO the ruler area above tracks
        // -50 means trigger starts 50px ABOVE the tracks container (in ruler area)
        // The zone extends from -50px (in ruler) to +30px (inside tracks)
        const topTriggerStart = -50; // How far above tracks container to start triggering
        const topTriggerEnd = 30; // How far inside tracks container to stop triggering
        const topTriggerRange = topTriggerEnd - topTriggerStart; // Total trigger zone size

        // BOTTOM threshold - normal positive value
        const bottomThreshold = 100;

        // Top zone: from topTriggerStart (negative, in ruler) to topTriggerEnd (inside tracks)
        if (relativeY >= topTriggerStart && relativeY < topTriggerEnd) {
          // Calculate intensity: 1.0 at topTriggerStart, 0.0 at topTriggerEnd
          const intensity = Math.pow(
            1 - (relativeY - topTriggerStart) / topTriggerRange,
            1.5,
          );
          deltaY = -intensity * 12 * speed * accelerationMultiplier;
        }
        // Bottom zone: normal behavior
        else if (
          relativeY > viewportHeight - bottomThreshold &&
          relativeY <= viewportHeight
        ) {
          const intensity = Math.pow(
            (relativeY - (viewportHeight - bottomThreshold)) / bottomThreshold,
            1.5,
          );
          deltaY = intensity * 12 * speed * accelerationMultiplier;
        }
      }

      return { deltaX, deltaY };
    },
    [
      mouseX,
      mouseY,
      scrollElement,
      threshold,
      effectiveVerticalThreshold,
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
        const maxAcceleration = 3.0; // Increased max acceleration
        const accelerationDuration = 1.5; // Faster ramp-up
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
          onScroll(
            enableHorizontal ? newScrollX : currentScrollX,
            enableVertical ? newScrollY : currentScrollY,
          );
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
    effectiveVerticalThreshold,
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
