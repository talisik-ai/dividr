import React from 'react';

/**
 * Rotation info badge component - displays rotation angle during rotation
 */

export interface RotationInfoBadgeProps {
  rotation: number;
}

export const RotationInfoBadge: React.FC<RotationInfoBadgeProps> = ({
  rotation,
}) => {
  const fullRotations = Math.floor(rotation / 360);
  const normalizedDegrees = ((rotation % 360) + 360) % 360;
  const displayDegrees =
    normalizedDegrees > 180 ? normalizedDegrees - 360 : normalizedDegrees;

  return (
    <div className="absolute top-4 left-4 dark:bg-black/80 bg-white/80 dark:text-white backdrop-blur-sm text-black px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 z-[1002]">
      <span className="text-[#F45513]">Rotation:</span>
      {fullRotations !== 0 && (
        <span className="font-bold">
          {fullRotations > 0 ? '+' : ''}
          {fullRotations}
        </span>
      )}
      <span>
        {displayDegrees > 0 ? '+' : displayDegrees < 0 ? '' : ''}
        {displayDegrees.toFixed(0)}°
      </span>
    </div>
  );
};
