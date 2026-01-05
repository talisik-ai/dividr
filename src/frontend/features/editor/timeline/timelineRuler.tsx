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

    // Minimum pixel spacing for labels (CapCut-style - labels never disappear)
    const MIN_LABEL_SPACING_PX = 50;

    // Calculate label interval based on minimum pixel spacing
    // This ensures labels are ALWAYS visible at appropriate intervals
    const labelInterval = useMemo(() => {
      const pixelsPerSecond = frameWidth * displayFps;

      // Time intervals to choose from (in seconds)
      const intervals = [
        1 / displayFps, // 1 frame
        0.25, // quarter second
        0.5, // half second
        1, // 1 second
        2, // 2 seconds
        5, // 5 seconds
        10, // 10 seconds
        15, // 15 seconds
        30, // 30 seconds
        60, // 1 minute
        120, // 2 minutes
        300, // 5 minutes
        600, // 10 minutes
        900, // 15 minutes
        1800, // 30 minutes
        3600, // 1 hour
        7200, // 2 hours
        14400, // 4 hours
        28800, // 8 hours
        86400, // 24 hours
      ];

      // Find the smallest interval that gives at least MIN_LABEL_SPACING_PX
      for (const seconds of intervals) {
        const pixelSpacing = seconds * pixelsPerSecond;
        if (pixelSpacing >= MIN_LABEL_SPACING_PX) {
          return seconds * displayFps; // Convert to frames
        }
      }

      // Fallback for extremely zoomed out (should never reach here)
      return 86400 * displayFps;
    }, [frameWidth, displayFps]);

    // Tick interval for visual marks (more frequent than labels)
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
      const ticksArray: {
        frame: number;
        x: number;
        time: string;
        isSecond: boolean;
        isMinute: boolean;
        isHour: boolean;
        isLabelTick: boolean;
      }[] = [];
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
          // A tick is a "label tick" if it falls on the calculated label interval
          const isLabelTick =
            labelInterval > 0 && Math.abs(frame % labelInterval) < 0.001;

          ticksArray.push({
            frame,
            x,
            time: formatTime(frame, pixelsPerSecond),
            isSecond: frame % displayFps === 0,
            isMinute: frame % (displayFps * 60) === 0,
            isHour: frame % (displayFps * 3600) === 0,
            isLabelTick,
          });
        }
      }

      return ticksArray;
    }, [
      scrollX,
      frameWidth,
      effectiveEndFrame,
      tickInterval,
      labelInterval,
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
        {ticks.map(
          ({ frame, x, time, isSecond, isMinute, isHour, isLabelTick }) => {
            // Responsive tick height based on zoom level and tick importance
            const pixelsPerSecond = frameWidth * displayFps;

            // Determine tick importance (for styling hierarchy)
            const isMajorTick = isLabelTick || isHour || isMinute;

            const getTickHeight = () => {
              // Label ticks get prominent height
              if (isLabelTick) {
                return 16;
              }
              if (isHour) {
                return 14;
              }
              if (isMinute) {
                return pixelsPerSecond >= 100
                  ? 14
                  : pixelsPerSecond >= 50
                    ? 12
                    : 10;
              }
              if (isSecond) {
                return pixelsPerSecond >= 150
                  ? 10
                  : pixelsPerSecond >= 100
                    ? 8
                    : 6;
              }
              // Sub-second ticks
              return pixelsPerSecond >= 200 ? 6 : 4;
            };
            const tickHeight = getTickHeight();

            // Theme-aware tick styling - label ticks are most prominent
            const tickClasses = isLabelTick
              ? 'bg-foreground'
              : isHour
                ? 'bg-foreground/90'
                : isMinute
                  ? 'bg-foreground/70'
                  : isSecond
                    ? 'bg-muted-foreground/60'
                    : 'bg-muted-foreground/40';

            const labelClasses = isLabelTick
              ? 'text-foreground'
              : isHour
                ? 'text-foreground/90'
                : isMinute
                  ? 'text-foreground/80'
                  : 'text-muted-foreground';

            // CRITICAL: Labels are shown ONLY on label ticks (guaranteed minimum spacing)
            // This ensures labels NEVER disappear at any zoom level
            const showLabel = isLabelTick;

            return (
              <div key={frame} className="absolute top-0" style={{ left: x }}>
                <div
                  className={cn(tickClasses)}
                  style={{
                    width: isMajorTick ? '2px' : '1px',
                    height: `${tickHeight}px`,
                  }}
                />
                {showLabel && (
                  <div
                    className={cn(
                      '-translate-x-1/2 whitespace-nowrap',
                      labelClasses,
                      isHour || isMinute ? 'font-semibold' : 'font-normal',
                    )}
                    style={{
                      fontSize:
                        pixelsPerSecond >= 100
                          ? '11px'
                          : pixelsPerSecond >= 25
                            ? '10px'
                            : '9px',
                    }}
                  >
                    {time}
                  </div>
                )}
              </div>
            );
          },
        )}

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
