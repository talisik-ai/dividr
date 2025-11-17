import React from 'react';

interface CanvasOverlayProps {
  actualWidth: number;
  actualHeight: number;
  panX: number;
  panY: number;
  className?: string;
}

/**
 * Black canvas overlay that represents the video canvas bounds
 * This ensures transformable content is visible within canvas bounds
 */
export const CanvasOverlay: React.FC<CanvasOverlayProps> = ({
  actualWidth,
  actualHeight,
  panX,
  panY,
  className,
}) => {
  return (
    <div
      className={`absolute bg-black ${className || ''}`}
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        zIndex: 0, // Behind all content
        pointerEvents: 'none', // Don't interfere with interactions
      }}
    />
  );
};
