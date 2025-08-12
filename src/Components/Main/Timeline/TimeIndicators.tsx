import React from "react";

interface TimeIndicatorsProps {
  totalFrames: number;
  fps: number;
  zoom: number;
}

export const TimeIndicators: React.FC<TimeIndicatorsProps> = ({ totalFrames, fps, zoom }) => {
  const seconds = Math.ceil(totalFrames / fps);
  const markers = Array.from({ length: seconds }, (_, i) => i);

  return (
    <div className="flex border-b border-gray-700 text-xs">
      {markers.map(sec => (
        <div
          key={sec}
          className="border-l border-gray-600 px-2"
          style={{ minWidth: `${50 * zoom}px` }}
        >
          {sec}s
        </div>
      ))}
    </div>
  );
};
