import React, { useCallback, useMemo } from 'react';
import { cn } from '../../../Lib/utils';
import { VideoTrack } from '../../../Store/VideoEditorStore';

interface TimelineRulerProps {
  frameWidth: number;
  totalFrames: number;
  scrollX: number;
  fps: number;
  tracks: VideoTrack[];
  inPoint?: number;
  outPoint?: number;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = React.memo(
  ({
    frameWidth,
    totalFrames,
    scrollX,
    fps,
    tracks,
    inPoint,
    outPoint,
    onClick,
    className,
  }) => {
    // Memoize effective timeline duration calculation
    const effectiveEndFrame = useMemo(() => {
      return tracks.length > 0
        ? Math.max(...tracks.map((track) => track.endFrame), totalFrames)
        : totalFrames;
    }, [tracks, totalFrames]);

    // Memoize format time function with zoom-responsive precision
    const formatTime = useCallback(
      (frame: number, pixelsPerSecond: number) => {
        const totalSeconds = frame / fps;
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const frameRemainder = Math.floor((totalSeconds % 1) * fps);

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
      [fps],
    );

    // Memoize tick interval calculation based on zoom level
    const tickInterval = useMemo(() => {
      const pixelsPerSecond = frameWidth * fps;

      if (pixelsPerSecond >= 100) return fps / 4; // 0.25 second intervals (very zoomed in)
      if (pixelsPerSecond >= 50) return fps / 2; // 0.5 second intervals
      if (pixelsPerSecond >= 25) return fps; // 1 second intervals
      if (pixelsPerSecond >= 10) return fps * 2; // 2 second intervals
      if (pixelsPerSecond >= 5) return fps * 5; // 5 second intervals
      if (pixelsPerSecond >= 2) return fps * 10; // 10 second intervals
      if (pixelsPerSecond >= 1) return fps * 30; // 30 second intervals
      return fps * 60; // 1 minute intervals (very zoomed out)
    }, [frameWidth, fps]);
    // Memoize ticks calculation
    const ticks = useMemo(() => {
      const ticksArray = [];
      const pixelsPerSecond = frameWidth * fps;

      // Generate ticks with better viewport culling
      const viewportStart = Math.max(0, Math.floor(scrollX / frameWidth) - 100);
      const viewportEnd = Math.min(
        effectiveEndFrame,
        Math.ceil((scrollX + window.innerWidth) / frameWidth) + 100,
      );

      for (
        let frame = Math.floor(viewportStart / tickInterval) * tickInterval;
        frame <= viewportEnd;
        frame += tickInterval
      ) {
        if (frame >= 0) {
          const x = frame * frameWidth - scrollX;
          ticksArray.push({
            frame,
            x,
            time: formatTime(frame, pixelsPerSecond),
            isSecond: frame % fps === 0,
            isMinute: frame % (fps * 60) === 0,
            isHour: frame % (fps * 3600) === 0,
          });
        }
      }

      return ticksArray;
    }, [scrollX, frameWidth, effectiveEndFrame, tickInterval, formatTime, fps]);

    // Memoize track content regions calculation
    const trackRegions = useMemo(() => {
      return tracks
        .filter((track) => track.visible)
        .map((track) => {
          const region = {
            startX: track.startFrame * frameWidth - scrollX,
            endX: track.endFrame * frameWidth - scrollX,
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
    }, [tracks, frameWidth, scrollX]);

    return (
      <div
        className={cn(
          'h-[36px] lg:h-[40px] border-t border-accent relative overflow-hidden',
          className,
        )}
        onClick={onClick}
      >
        {/* Background Grid */}
        <div
          className="absolute top-0 h-full bg-gradient-to-r from-transparent via-transparent to-transparent"
          style={{
            left: -scrollX,
            width: Math.max(effectiveEndFrame * frameWidth, window.innerWidth),
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 9px, hsl(var(--foreground) / 0.05) 9px, hsl(var(--foreground) / 0.05) 10px)',
          }}
        />

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
          const pixelsPerSecond = frameWidth * fps;
          const getTickHeight = () => {
            if (isHour) {
              return pixelsPerSecond >= 50 ? 24 : 20;
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
            const pixelsPerSecond = frameWidth * fps;

            // Very zoomed in (> 100px per second) - show all labels
            if (pixelsPerSecond >= 100) {
              return true;
            }

            // Zoomed in (50-100px per second) - show second and minute labels
            if (pixelsPerSecond >= 50) {
              return isSecond || isMinute || isHour;
            }

            // Medium zoom (25-50px per second) - show only minute and hour labels
            if (pixelsPerSecond >= 25) {
              return isMinute || isHour;
            }

            // Medium-low zoom (10-25px per second) - show every 2nd minute and hours
            if (pixelsPerSecond >= 10) {
              return (
                isHour || (isMinute && Math.floor(frame / fps) % 120 === 0)
              ); // every 2 minutes
            }

            // Low zoom (5-10px per second) - show every 5th minute and hours
            if (pixelsPerSecond >= 5) {
              return (
                isHour || (isMinute && Math.floor(frame / fps) % 300 === 0)
              ); // every 5 minutes
            }

            // Very low zoom (2-5px per second) - show every 10th minute and hours
            if (pixelsPerSecond >= 2) {
              return (
                isHour || (isMinute && Math.floor(frame / fps) % 600 === 0)
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
                      const pixelsPerSecond = frameWidth * fps;

                      // Larger font sizes for higher zoom levels
                      if (isHour) {
                        return pixelsPerSecond >= 50 ? '13px' : '12px';
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
              left: inPoint * frameWidth - scrollX,
              boxShadow: '0 0 4px rgba(76, 175, 80, 0.5)',
            }}
          />
        )}

        {outPoint !== undefined && (
          <div
            className="absolute top-0 w-[3px] h-full bg-[#f44336] z-10"
            style={{
              left: outPoint * frameWidth - scrollX,
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
    if (prevProps.fps !== nextProps.fps) return false;
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
