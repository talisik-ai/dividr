import React, { useMemo } from 'react';

interface TimelinePlayheadProps {
  currentFrame: number;
  frameWidth: number;
  scrollX: number;
  visible: boolean;
  timelineScrollElement?: HTMLElement | null;
}

export const TimelinePlayhead: React.FC<TimelinePlayheadProps> = React.memo(
  ({ currentFrame, frameWidth, scrollX, visible, timelineScrollElement }) => {
    if (!visible) return null;

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

    return (
      <>
        <div
          className="absolute top-0 w-0.5 h-full bg-primary rounded-full z-30 pointer-events-none will-change-transform"
          style={styles.line}
        />

        <div
          className="absolute -top-6 pointer-events-none z-30 will-change-transform"
          style={styles.handle}
        >
          <svg width="24" height="24" viewBox="0 0 24 24">
            <path
              d="M6,8 A2,2 0 0,1 8,6 L16,6 A2,2 0 0,1 18,8 A2,2 0 0,1 17.5,9.5 L12.8,16.2 A1,1 0 0,1 11.2,16.2 L6.5,9.5 A2,2 0 0,1 6,8 Z"
              fill="hsl(var(--primary))"
              stroke="none"
            />
          </svg>
        </div>

        <div
          className="absolute top-0.5 bg-primary/90 text-primary-foreground px-1.5 py-0.5 rounded-sm text-[10px] font-bold whitespace-nowrap z-30 pointer-events-none will-change-transform"
          style={styles.indicator}
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
      prevProps.timelineScrollElement === nextProps.timelineScrollElement
    );
  },
);
