import React from 'react';

interface TimelinePlayheadProps {
  currentFrame: number;
  frameWidth: number;
  scrollX: number;
  visible: boolean;
}

export const TimelinePlayhead: React.FC<TimelinePlayheadProps> = ({
  currentFrame,
  frameWidth,
  scrollX,
  visible,
}) => {
  if (!visible) return null;

  const left = currentFrame * frameWidth - scrollX;

  return (
    <>
      {/* Playhead line */}
      <div
        style={{
          position: 'absolute',
          left: left,
          top: 0,
          width: '2px',
          height: '100%',
          backgroundColor: 'white',
          zIndex: 100,
          pointerEvents: 'none',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
        }}
      />

      {/* Playhead handle */}
      <div
        style={{
          position: 'absolute',
          left: left - 6,
          top: 0,
          width: '14px',
          height: '20px',
          backgroundColor: 'white',
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
          zIndex: 101,
          pointerEvents: 'none',
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
        }}
      />

      {/* Frame number indicator */}
      <div
        style={{
          position: 'absolute',
          left: left + 8,
          top: '2px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: '#fff',
          padding: '2px 6px',
          borderRadius: '3px',
          fontSize: '10px',
          fontWeight: 'bold',
          whiteSpace: 'nowrap',
          zIndex: 102,
          pointerEvents: 'none',
        }}
      >
        {currentFrame}
      </div>
    </>
  );
};
