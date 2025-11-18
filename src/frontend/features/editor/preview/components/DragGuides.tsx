/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

export interface AlignmentGuide {
  type: 'horizontal' | 'vertical';
  position: number; // In pixels relative to video frame
  label?: string;
}

interface DragGuidesProps {
  guides: AlignmentGuide[];
  videoWidth: number;
  videoHeight: number;
  previewScale: number;
  panX: number;
  panY: number;
  isBoundaryWarning?: boolean;
}

export const DragGuides: React.FC<DragGuidesProps> = ({
  guides,
  videoWidth,
  videoHeight,
  previewScale,
  panX,
  panY,
  isBoundaryWarning = false,
}) => {
  // Calculate the actual rendered dimensions
  const actualWidth = videoWidth * previewScale;
  const actualHeight = videoHeight * previewScale;

  return (
    <div
      className="absolute pointer-events-none transition-[width,height,left,top] duration-150 ease-out"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'hidden', // Ensure guides are clipped to video canvas bounds
        zIndex: 999, // Below transform handles (1001) but above video content
      }}
    >
      {guides.map((guide, index) => {
        if (guide.type === 'horizontal') {
          return (
            <div
              key={`h-${index}`}
              className="absolute animate-in fade-in duration-150"
              style={{
                left: 0,
                right: 0,
                top: `${guide.position * previewScale}px`,
                height: '1px',
                backgroundColor: isBoundaryWarning
                  ? 'rgb(239, 68, 68)' // red-500 for boundary warning
                  : '#F45513',
                boxShadow: isBoundaryWarning
                  ? '0 0 8px rgba(239, 68, 68, 0.6)'
                  : '0 0 8px #F45513',
              }}
            />
          );
        } else {
          return (
            <div
              key={`v-${index}`}
              className="absolute animate-in fade-in duration-150"
              style={{
                top: 0,
                bottom: 0,
                left: `${guide.position * previewScale}px`,
                width: '1px',
                backgroundColor: isBoundaryWarning
                  ? 'rgb(239, 68, 68)' // red-500 for boundary warning
                  : '#F45513',
                boxShadow: isBoundaryWarning
                  ? '0 0 8px rgba(239, 68, 68, 0.6)'
                  : '0 0 8px #F45513',
              }}
            />
          );
        }
      })}
    </div>
  );
};
