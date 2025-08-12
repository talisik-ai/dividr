import React from "react";

interface PlayheadProps {
  currentFrame: number;
  zoom: number;
  totalFrames: number;
}

export const Playhead: React.FC<PlayheadProps> = ({ currentFrame, zoom, totalFrames }) => {
  const positionPercent = (currentFrame / totalFrames) * 100;

  return (
    <div
      className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
      style={{ left: `${positionPercent * zoom}%` }}
    />
  );
};
