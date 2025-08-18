import React from 'react';
import { VideoTrack } from '../../../Store/videoEditorStore';

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
      style={{
        height: '50px',
        backgroundColor: '#1e1e1e',
        borderBottom: '1px solid #333',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        backgroundImage: 'linear-gradient(to bottom, #2a2a2a 0%, #1e1e1e 100%)',
      }}
      onClick={onClick}
    >
      {/* Background Grid */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: -scrollX,
          width: Math.max(effectiveEndFrame * frameWidth, window.innerWidth),
          height: '100%',
          background:
            'repeating-linear-gradient(90deg, transparent, transparent 9px, rgba(255,255,255,0.03) 9px, rgba(255,255,255,0.03) 10px)',
        }}
      />

      {/* Track Content Regions Indicator */}
      <div
        style={{
          position: 'absolute',
          top: '32px',
          left: 0,
          right: 0,
          height: '3px',
          backgroundColor: '#2a2a2a',
        }}
      >
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
        const tickColor = isHour
          ? '#fff'
          : isMinute
            ? '#ddd'
            : isSecond
              ? '#aaa'
              : '#666';
        const showLabel =
          isSecond ||
          (frameWidth > 2 && frame % Math.max(1, Math.floor(fps / 4)) === 0);

        return (
          <div key={frame} style={{ position: 'absolute', left: x, top: 0 }}>
            <div
              style={{
                width: isMinute ? '2px' : '1px',
                height: `${tickHeight}px`,
                backgroundColor: tickColor,
                marginBottom: '1px',
              }}
            />
            {showLabel && (
              <div
                style={{
                  fontSize: isMinute ? '11px' : '10px',
                  color: tickColor,
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontWeight: isMinute ? '600' : '400',
                  textShadow: '0 1px 2px rgba(0,0,0,0.8)',
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
          style={{
            position: 'absolute',
            left: inPoint * frameWidth - scrollX,
            top: 0,
            width: '3px',
            height: '100%',
            backgroundColor: '#4CAF50',
            zIndex: 10,
            boxShadow: '0 0 4px rgba(76, 175, 80, 0.5)',
          }}
        />
      )}

      {outPoint !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: outPoint * frameWidth - scrollX,
            top: 0,
            width: '3px',
            height: '100%',
            backgroundColor: '#f44336',
            zIndex: 10,
            boxShadow: '0 0 4px rgba(244, 67, 54, 0.5)',
          }}
        />
      )}

      {/* Note: Playhead is handled by TimelinePlayhead component */}
    </div>
  );
};
