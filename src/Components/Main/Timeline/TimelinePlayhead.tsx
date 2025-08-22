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
        className="absolute top-0 w-0.5 h-full bg-white z-[100] pointer-events-none shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
        style={{ left: left }}
      />

      {/* Playhead handle */}
      <div
        className="absolute top-0 w-[14px] h-5 bg-white z-[101] pointer-events-none shadow-[0_2px_4px_rgba(0,0,0,0.3)]"
        style={{
          left: left - 6,
          clipPath: 'polygon(50% 100%, 0 0, 100% 0)',
        }}
      />

      {/* Frame number indicator */}
      <div
        className="absolute top-0.5 bg-black/80 text-white px-1.5 py-0.5 rounded-sm text-[10px] font-bold whitespace-nowrap z-[102] pointer-events-none"
        style={{ left: left + 8 }}
      >
        {currentFrame}
      </div>
    </>
  );
};
