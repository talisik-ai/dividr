import { cn } from '@/frontend/utils/utils';
import React from 'react';
import { getRowHeight, getTrackItemHeight } from './utils/timelineConstants';
import { getTrackRowTop } from './utils/trackRowPositions';

interface DropZoneIndicatorProps {
  targetRow: string;
  startFrame: number;
  endFrame: number;
  frameWidth: number;
  scrollX: number;
  visibleTrackRows: string[];
  isValidDrop: boolean;
}

/**
 * DropZoneIndicator - Visual feedback showing where the clip will land
 *
 * Features:
 * - Highlights the drop area with soft borders and background
 * - Resizes automatically to match dragged item's full length
 * - Shows valid (green/blue) or invalid (red) drop states
 * - Positioned accurately using track row calculations
 */
export const DropZoneIndicator: React.FC<DropZoneIndicatorProps> = React.memo(
  ({
    targetRow,
    startFrame,
    endFrame,
    frameWidth,
    scrollX,
    visibleTrackRows,
    isValidDrop,
  }) => {
    // Calculate position and dimensions
    const left = startFrame * frameWidth - scrollX;
    const width = Math.max(1, (endFrame - startFrame) * frameWidth);
    const rowTop = getTrackRowTop(targetRow, visibleTrackRows);
    const rowHeight = getRowHeight(targetRow);
    const trackItemHeight = getTrackItemHeight(targetRow);

    // Center the drop zone vertically within the row
    const top = rowTop + (rowHeight - trackItemHeight) / 2;
    const height = trackItemHeight;

    return (
      <div
        className={cn(
          'absolute pointer-events-none z-[998] rounded transition-colors duration-75',
          'border-2',
          isValidDrop
            ? 'border-2 border-zinc-500 bg-zinc-500/20 dark:border-zinc-300 dark:bg-zinc-300/20 '
            : 'border-red-400 bg-red-400/10 dark:border-red-500 dark:bg-red-500/10',
        )}
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height}px`,
        }}
      >
        {/* Inner glow effect */}
        {/* <div
          className={cn(
            'absolute inset-0 rounded',
            isValidDrop
              ? 'shadow-[inset_0_0_20px_rgba(59,130,246,0.3)]'
              : 'shadow-[inset_0_0_20px_rgba(239,68,68,0.3)]',
          )}
        /> */}
      </div>
    );
  },
);

DropZoneIndicator.displayName = 'DropZoneIndicator';
