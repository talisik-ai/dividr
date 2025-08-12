import React from 'react';

interface TimelineRulerProps {
  frameWidth: number;
  totalFrames: number;
  currentFrame: number;
  scrollX: number;
  fps: number;
  inPoint?: number;
  outPoint?: number;
  onClick: (e: React.MouseEvent) => void;
}

export const TimelineRuler: React.FC<TimelineRulerProps> = ({
  frameWidth,
  totalFrames,
  currentFrame,
  scrollX,
  fps,
  inPoint,
  outPoint,
  onClick,
}) => {
  // Calculate time markings
  const formatTime = (frame: number) => {
    const totalSeconds = frame / fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor((totalSeconds % 1) * fps);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  // Calculate major tick interval based on zoom
  const getTickInterval = () => {
    if (frameWidth > 8) return fps; // 1 second intervals
    if (frameWidth > 4) return fps * 5; // 5 second intervals
    if (frameWidth > 2) return fps * 10; // 10 second intervals
    return fps * 30; // 30 second intervals
  };

  const tickInterval = getTickInterval();
  const ticks = [];
  
  for (let frame = 0; frame <= totalFrames; frame += tickInterval) {
    const x = frame * frameWidth - scrollX;
    if (x > -50 && x < window.innerWidth + 50) { // Only render visible ticks
      ticks.push({
        frame,
        x,
        time: formatTime(frame),
      });
    }
  }

  return (
    <div
      style={{
        height: '40px',
        backgroundColor: '#333',
        borderBottom: '1px solid #3d3d3d',
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
      }}
      onClick={onClick}
    >
      {/* Background */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: -scrollX,
          width: totalFrames * frameWidth,
          height: '100%',
          background: 'repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255,255,255,0.1) 4px, rgba(255,255,255,0.1) 5px)',
        }}
      />

      {/* In/Out Points */}
      {inPoint !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: inPoint * frameWidth - scrollX,
            top: 0,
            width: '2px',
            height: '100%',
            backgroundColor: '#4CAF50',
            zIndex: 2,
          }}
        />
      )}
      
      {outPoint !== undefined && (
        <div
          style={{
            position: 'absolute',
            left: outPoint * frameWidth - scrollX,
            top: 0,
            width: '2px',
            height: '100%',
            backgroundColor: '#f44336',
            zIndex: 2,
          }}
        />
      )}

      {/* Time Ticks */}
      {ticks.map(({ frame, x, time }) => (
        <div key={frame} style={{ position: 'absolute', left: x, top: 0 }}>
          <div
            style={{
              width: '1px',
              height: '15px',
              backgroundColor: '#666',
              marginBottom: '2px',
            }}
          />
          <div
            style={{
              fontSize: '10px',
              color: '#aaa',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
            }}
          >
            {time}
          </div>
        </div>
      ))}

      {/* Current Frame Indicator */}
      <div
        style={{
          position: 'absolute',
          left: currentFrame * frameWidth - scrollX,
          top: 0,
          width: '2px',
          height: '100%',
          backgroundColor: '#FF5722',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};