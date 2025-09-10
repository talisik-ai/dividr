import React from 'react';
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
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  frameWidth,
  totalFrames,
  scrollX,
  fps,
  tracks,
  inPoint,
  outPoint,
  onClick,
}) => {
  // Calculate effective timeline duration based on actual tracks
  const effectiveEndFrame =
    tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame), totalFrames)
      : totalFrames;

  // Format time with better precision and readability
  const formatTime = (frame: number) => {
    const totalSeconds = frame / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frameRemainder = Math.floor((totalSeconds % 1) * fps);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frameRemainder.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frameRemainder.toString().padStart(2, '0')}`;
  };

  // Smart tick interval calculation based on zoom level
  const getTickInterval = () => {
    const pixelsPerSecond = frameWidth * fps;

    if (pixelsPerSecond >= 100) return fps / 4; // 0.25 second intervals (very zoomed in)
    if (pixelsPerSecond >= 50) return fps / 2; // 0.5 second intervals
    if (pixelsPerSecond >= 25) return fps; // 1 second intervals
    if (pixelsPerSecond >= 10) return fps * 2; // 2 second intervals
    if (pixelsPerSecond >= 5) return fps * 5; // 5 second intervals
    if (pixelsPerSecond >= 2) return fps * 10; // 10 second intervals
    if (pixelsPerSecond >= 1) return fps * 30; // 30 second intervals
    return fps * 60; // 1 minute intervals (very zoomed out)
  };

  const tickInterval = getTickInterval();
  const ticks = [];

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
      ticks.push({
        frame,
        x,
        time: formatTime(frame),
        isSecond: frame % fps === 0,
        isMinute: frame % (fps * 60) === 0,
        isHour: frame % (fps * 3600) === 0,
      });
    }
  }

  // Calculate track content regions for visualization
  const trackRegions = tracks
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
      (region) => region.endX > -50 && region.startX < window.innerWidth + 50,
    );

  return (
    <div
      className="h-[36px] lg:h-[40px] border-t border-accent relative overflow-hidden cursor-pointer"
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
        const tickHeight = isHour ? 20 : isMinute ? 16 : isSecond ? 12 : 8;

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

        const showLabel =
          isSecond ||
          (frameWidth > 2 && frame % Math.max(1, Math.floor(fps / 4)) === 0);

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
                  isMinute ? 'font-semibold' : 'font-normal',
                )}
                style={{
                  fontSize: isMinute ? '11px' : '10px',
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
};
