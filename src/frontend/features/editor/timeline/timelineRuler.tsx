import { VideoTrack } from '@/frontend/features/editor/stores/videoEditor/index';
import { getDisplayFps } from '@/frontend/features/editor/stores/videoEditor/types/timeline.types';
import { cn } from '@/frontend/utils/utils';
import React, { useCallback, useMemo } from 'react';
import { TIMELINE_HEADER_HEIGHT_CLASSES } from './utils/timelineConstants';

interface TimelineRulerProps {
  frameWidth: number;
  totalFrames: number;
  scrollX: number;
  fps: number; // Kept for backward compatibility but not used - getDisplayFps is used instead
  tracks: VideoTrack[];
  inPoint?: number;
  outPoint?: number;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  timelineScrollElement?: HTMLElement | null;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = React.memo(
  ({
    frameWidth,
    totalFrames,
    scrollX,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    fps: _fps, // Unused - kept for backward compatibility
    tracks,
    inPoint,
    outPoint,
    onClick,
    className,
    timelineScrollElement,
  }) => {
    // Get display FPS from source video tracks (dynamic but static once determined)
    const displayFps = useMemo(() => getDisplayFps(tracks), [tracks]);

    // Memoize effective timeline duration calculation
    const effectiveEndFrame = useMemo(() => {
      // When tracks exist, use the maximum track end frame
      // Only use totalFrames as fallback when no tracks exist
      return tracks.length > 0
        ? Math.max(...tracks.map((track) => track.endFrame))
        : totalFrames;
    }, [tracks, totalFrames]);

    // Memoize format time function with zoom-responsive precision
    const formatTime = useCallback(
      (frame: number, pixelsPerSecond: number) => {
        const totalSeconds = frame / displayFps;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const frameRemainder = Math.floor((totalSeconds % 1) * displayFps);

        // Adjust precision based on zoom level
        if (pixelsPerSecond >= 150) {
          // Very zoomed in - show frames
          if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frameRemainder.toString().padStart(2, '0')}`;
          }
          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frameRemainder.toString().padStart(2, '0')}`;
        } else if (pixelsPerSecond >= 25) {
          // Medium zoom - show seconds
          if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
          }
          return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        } else if (pixelsPerSecond >= 5) {
          // Low zoom - show minutes
          if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}`;
          }
          return `${minutes}m`;
        } else {
          // Very zoomed out - show hours
          if (hours > 0) {
            return `${hours}h`;
          }
          return `${minutes}m`;
        }
      },
      [displayFps],
    );

    // Memoize tick interval calculation based on zoom level
    const tickInterval = useMemo(() => {
      const pixelsPerSecond = frameWidth * displayFps;

      if (pixelsPerSecond >= 100) return displayFps / 4; // 0.25 second intervals (very zoomed in)
      if (pixelsPerSecond >= 50) return displayFps / 2; // 0.5 second intervals
      if (pixelsPerSecond >= 25) return displayFps; // 1 second intervals
      if (pixelsPerSecond >= 10) return displayFps * 2; // 2 second intervals
      if (pixelsPerSecond >= 5) return displayFps * 5; // 5 second intervals
      if (pixelsPerSecond >= 2) return displayFps * 10; // 10 second intervals
      if (pixelsPerSecond >= 1) return displayFps * 30; // 30 second intervals
      return displayFps * 60; // 1 minute intervals (very zoomed out)
    }, [frameWidth, displayFps]);

    // Memoize ticks calculation with real-time scroll position
    const ticks = useMemo(() => {
      const ticksArray = [];
      const pixelsPerSecond = frameWidth * displayFps;

      // Use actual scroll position if available, otherwise fallback to prop
      const currentScrollX = timelineScrollElement?.scrollLeft ?? scrollX;

      // Generate ticks with better viewport culling
      const viewportStart = Math.max(
        0,
        Math.floor(currentScrollX / frameWidth) - 100,
      );
      const viewportEnd = Math.min(
        effectiveEndFrame,
        Math.ceil((currentScrollX + window.innerWidth) / frameWidth) + 100,
      );

      for (
        let frame = Math.floor(viewportStart / tickInterval) * tickInterval;
        frame <= viewportEnd;
        frame += tickInterval
      ) {
        if (frame >= 0) {
          const x = frame * frameWidth - currentScrollX;
          ticksArray.push({
            frame,
            x,
            time: formatTime(frame, pixelsPerSecond),
            isSecond: frame % displayFps === 0,
            isMinute: frame % (displayFps * 60) === 0,
            isHour: frame % (displayFps * 3600) === 0,
          });
        }
      }

      return ticksArray;
    }, [
      scrollX,
      frameWidth,
      effectiveEndFrame,
      tickInterval,
      formatTime,
      displayFps,
      timelineScrollElement,
    ]);

    // Memoize track content regions calculation with real-time scroll position
    const trackRegions = useMemo(() => {
      // Use actual scroll position if available, otherwise fallback to prop
      const currentScrollX = timelineScrollElement?.scrollLeft ?? scrollX;

      return tracks
        .filter((track) => track.visible)
        .map((track) => {
          const region = {
            startX: track.startFrame * frameWidth - currentScrollX,
            endX: track.endFrame * frameWidth - currentScrollX,
            type: track.type,
            color: 'green',
          };

          // Track regions for visualization

          return region;
        })
        .filter(
          (region) =>
            region.endX > -50 && region.startX < window.innerWidth + 50,
        );
    }, [tracks, frameWidth, scrollX, timelineScrollElement]);

    return (
      <div
        className={cn(
          'border-t border-accent relative',
          TIMELINE_HEADER_HEIGHT_CLASSES,
          className,
        )}
        onClick={onClick}
      >
        {/* Background Grid */}
        {/* <div
          className="absolute top-0 h-full bg-gradient-to-r from-transparent via-transparent to-transparent"
          style={{
            left: -(timelineScrollElement?.scrollLeft ?? scrollX),
            // Always span at least viewport width for consistent full-width grid
            width: Math.max(
              effectiveEndFrame * frameWidth,
              (timelineScrollElement?.clientWidth ?? window.innerWidth) + 200,
            ),
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 9px, hsl(var(--foreground) / 0.05) 9px, hsl(var(--foreground) / 0.05) 10px)',
          }}
        /> */}

        {/* Track Content Regions Indicator */}
        <div className="absolute bottom-0.5 left-0 right-0 h-[1.5px] bg-accent">
          {trackRegions.map((region, index) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: Math.max(0, region.startX),
                width: Math.max(1, region.endX - Math.max(0, region.startX)),
                height: '3px',
                backgroundColor: region.color,
                opacity: 0.6,
                borderRadius: '1px',
              }}
            />
          ))}
        </div>

        {/* Time Ticks */}
        {ticks.map(({ frame, x, time, isSecond, isMinute, isHour }) => {
          // Responsive tick height based on zoom level
          const pixelsPerSecond = frameWidth * displayFps;
          const getTickHeight = () => {
            if (isHour) {
              return 14;
            }
            if (isMinute) {
              return pixelsPerSecond >= 100
                ? 20
                : pixelsPerSecond >= 50
                  ? 16
                  : 14;
            }
            if (isSecond) {
              return pixelsPerSecond >= 150
                ? 16
                : pixelsPerSecond >= 100
                  ? 12
                  : 10;
            }
            return pixelsPerSecond >= 200 ? 10 : 8;
          };
          const tickHeight = getTickHeight();

          // Theme-aware tick styling
          const tickClasses = isHour
            ? 'bg-foreground'
            : isMinute
              ? 'bg-foreground/80'
              : isSecond
                ? 'bg-muted-foreground'
                : 'bg-muted-foreground/60';

          const labelClasses = isHour
            ? 'text-foreground'
            : isMinute
              ? 'text-foreground/80'
              : isSecond
                ? 'text-muted-foreground'
                : 'text-muted-foreground/60';

          // Smart label visibility based on zoom level and spacing
          const getShowLabel = () => {
            const pixelsPerSecond = frameWidth * displayFps;

            // Very zoomed in (> 100px per second) - show all labels
            if (pixelsPerSecond >= 200) {
              return true;
            }

            // Zoomed in (50-100px per second) - show second and minute labels
            if (pixelsPerSecond >= 30) {
              return isSecond || isMinute || isHour;
            }

            // Medium zoom (25-50px per second) - show only minute and hour labels
            if (pixelsPerSecond >= 25) {
              return isMinute || isHour;
            }

            // Medium-low zoom (10-25px per second) - show every 2nd minute and hours
            if (pixelsPerSecond >= 10) {
              return (
                isHour ||
                (isMinute && Math.floor(frame / displayFps) % 120 === 0)
              ); // every 2 minutes
            }

            // Low zoom (5-10px per second) - show every 5th minute and hours
            if (pixelsPerSecond >= 5) {
              return (
                isHour ||
                (isMinute && Math.floor(frame / displayFps) % 300 === 0)
              ); // every 5 minutes
            }

            // Very low zoom (2-5px per second) - show every 10th minute and hours
            if (pixelsPerSecond >= 2) {
              return (
                isHour ||
                (isMinute && Math.floor(frame / displayFps) % 600 === 0)
              ); // every 10 minutes
            }

            // Extremely zoomed out (< 2px per second) - show only hours
            return isHour;
          };

          const showLabel = getShowLabel();

          return (
            <div key={frame} className="absolute top-0" style={{ left: x }}>
              <div
                className={cn('mb-px', tickClasses)}
                style={{
                  width: isMinute ? '2px' : '1px',
                  height: `${tickHeight}px`,
                }}
              />
              {showLabel && (
                <div
                  className={cn(
                    '-translate-x-1/2 whitespace-nowrap',
                    labelClasses,
                    isHour
                      ? 'font-bold'
                      : isMinute
                        ? 'font-semibold'
                        : 'font-normal',
                  )}
                  style={{
                    fontSize: (() => {
                      const pixelsPerSecond = frameWidth * displayFps;

                      // Larger font sizes for higher zoom levels
                      if (isHour) {
                        return '12px';
                      }
                      if (isMinute) {
                        return pixelsPerSecond >= 100
                          ? '12px'
                          : pixelsPerSecond >= 50
                            ? '11px'
                            : '10px';
                      }
                      // Seconds
                      return pixelsPerSecond >= 150 ? '11px' : '10px';
                    })(),
                  }}
                >
                  {time}
                </div>
              )}
            </div>
          );
        })}

        {/* In/Out Points with improved design */}
        {inPoint !== undefined && (
          <div
            className="absolute top-0 w-[3px] h-full bg-accent z-10"
            style={{
              left:
                inPoint * frameWidth -
                (timelineScrollElement?.scrollLeft ?? scrollX),
              boxShadow: '0 0 4px rgba(76, 175, 80, 0.5)',
            }}
          />
        )}

        {outPoint !== undefined && (
          <div
            className="absolute top-0 w-[3px] h-full bg-[#f44336] z-10"
            style={{
              left:
                outPoint * frameWidth -
                (timelineScrollElement?.scrollLeft ?? scrollX),
              boxShadow: '0 0 4px rgba(244, 67, 54, 0.5)',
            }}
          />
        )}

        {/* Note: Playhead is handled by TimelinePlayhead component */}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check - only check properties that affect ruler display
    if (prevProps.frameWidth !== nextProps.frameWidth) return false;
    if (prevProps.totalFrames !== nextProps.totalFrames) return false;
    if (prevProps.scrollX !== nextProps.scrollX) return false;
    // fps prop is no longer used (getDisplayFps is used instead), so skip this check
    if (prevProps.inPoint !== nextProps.inPoint) return false;
    if (prevProps.outPoint !== nextProps.outPoint) return false;

    // Check tracks - only properties that affect ruler display
    if (prevProps.tracks.length !== nextProps.tracks.length) return false;

    const tracksChanged = prevProps.tracks.some((track, index) => {
      const nextTrack = nextProps.tracks[index];
      return (
        !nextTrack ||
        track.endFrame !== nextTrack.endFrame ||
        track.visible !== nextTrack.visible ||
        track.startFrame !== nextTrack.startFrame
      );
    });

    return !tracksChanged;
  },
);
