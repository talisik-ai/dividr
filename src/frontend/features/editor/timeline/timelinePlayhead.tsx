import { cn } from '@/frontend/utils/utils';
import React, { useCallback, useMemo } from 'react';

interface TimelinePlayheadProps {
  currentFrame: number;
  frameWidth: number;
  scrollX: number;
  visible: boolean;
  timelineScrollElement?: HTMLElement | null;
  onStartDrag?: (e: React.MouseEvent) => void;
  magneticSnapFrame?: number | null;
}

export const TimelinePlayhead: React.FC<TimelinePlayheadProps> = React.memo(
  ({
    currentFrame,
    frameWidth,
    scrollX,
    visible,
    timelineScrollElement,
    onStartDrag,
    magneticSnapFrame,
  }) => {
    if (!visible) return null;

    // Check if playhead is snapping (magneticSnapFrame matches currentFrame)
    const isSnapping =
      magneticSnapFrame !== null && magneticSnapFrame === currentFrame;

    const left = useMemo(
      () =>
        currentFrame * frameWidth -
        (timelineScrollElement?.scrollLeft ?? scrollX),
      [currentFrame, frameWidth, scrollX, timelineScrollElement],
    );

    const styles = useMemo(
      () => ({
        line: {
          left,
          transform: 'translate3d(0, 0, 0)',
        },
        handle: {
          left: left - 11,
          width: 24,
          height: 24,
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
          transform: 'translate3d(0, 0, 0)',
        },
        indicator: {
          left: left + 8,
          transform: 'translate3d(0, 0, 0)',
        },
      }),
      [left],
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        // Only respond to left mouse button
        if (e.button !== 0) return;

        e.preventDefault();
        e.stopPropagation();

        if (onStartDrag) {
          onStartDrag(e);
        }
      },
      [onStartDrag],
    );

    return (
      <>
        {/* Playhead line - clickable for dragging */}
        <div
          className={cn(
            'absolute top-0 w-0.5 h-full rounded-full z-30 cursor-ew-resize will-change-transform pointer-events-auto',
            isSnapping ? 'bg-secondary' : 'bg-primary',
          )}
          style={styles.line}
          onMouseDown={handleMouseDown}
        />

        {/* Playhead handle - draggable */}
        <div
          className="absolute -top-6 z-30 cursor-grab active:cursor-grabbing will-change-transform pointer-events-auto"
          style={styles.handle}
          onMouseDown={handleMouseDown}
        >
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path
              d="M6,8 A2,2 0 0,1 8,6 L16,6 A2,2 0 0,1 18,8 A2,2 0 0,1 17.5,9.5 L12.8,16.2 A1,1 0 0,1 11.2,16.2 L6.5,9.5 A2,2 0 0,1 6,8 Z"
              fill={
                isSnapping ? 'hsl(var(--secondary))' : 'hsl(var(--primary))'
              }
              stroke="none"
            />
          </svg>
        </div>

        {/* Frame indicator - also draggable */}
        <div
          className={cn(
            'absolute top-0.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold whitespace-nowrap z-30 cursor-grab active:cursor-grabbing will-change-transform pointer-events-auto',
            isSnapping
              ? 'bg-secondary/90 text-secondary-foreground'
              : 'bg-primary/90 text-primary-foreground',
          )}
          style={styles.indicator}
          onMouseDown={handleMouseDown}
        >
          {currentFrame}
        </div>
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.currentFrame === nextProps.currentFrame &&
      prevProps.frameWidth === nextProps.frameWidth &&
      prevProps.scrollX === nextProps.scrollX &&
      prevProps.visible === nextProps.visible &&
      prevProps.timelineScrollElement === nextProps.timelineScrollElement &&
      prevProps.onStartDrag === nextProps.onStartDrag &&
      prevProps.magneticSnapFrame === nextProps.magneticSnapFrame
    );
  },
);
