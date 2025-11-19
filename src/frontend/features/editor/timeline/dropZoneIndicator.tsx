import { cn } from '@/frontend/utils/utils';
import React, { useMemo } from 'react';
import { getRowHeight, getTrackItemHeight } from './utils/timelineConstants';
import { parseRowId, TrackRowDefinition } from './utils/dynamicTrackRows';

interface DropZoneIndicatorProps {
  targetRow: string; // Now accepts row IDs like "video-1", "text-0"
  startFrame: number;
  endFrame: number;
  frameWidth: number;
  scrollX: number;
  visibleTrackRows: string[]; // Still media types like ['video', 'audio']
  dynamicRows: TrackRowDefinition[]; // Dynamic row definitions for positioning
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
 * - Accounts for centering when < 5 tracks are visible
 */
export const DropZoneIndicator: React.FC<DropZoneIndicatorProps> = React.memo(
  ({
    targetRow,
    startFrame,
    endFrame,
    frameWidth,
    scrollX,
    visibleTrackRows,
    dynamicRows,
    isValidDrop,
  }) => {
    // Parse the target row ID to get media type
    const parsedTargetRow = useMemo(() => parseRowId(targetRow), [targetRow]);

    // Calculate position using dynamic rows
    const { top, height, centeringOffset } = useMemo(() => {
      if (!parsedTargetRow) {
        return { top: 0, height: 0, centeringOffset: 0 };
      }

      const mediaType = parsedTargetRow.type;

      // Filter visible dynamic rows
      const visibleDynamicRows = dynamicRows.filter((row) => {
        const rowMediaType = row.trackTypes[0];
        return visibleTrackRows.includes(rowMediaType);
      });

      // Calculate baseline height (all dynamic rows)
      const baselineHeight = dynamicRows.reduce((sum, row) => {
        const rowMediaType = row.trackTypes[0];
        return sum + getRowHeight(rowMediaType);
      }, 0);

      // Calculate total height of visible rows
      const totalVisibleHeight = visibleDynamicRows.reduce((sum, row) => {
        const rowMediaType = row.trackTypes[0];
        return sum + getRowHeight(rowMediaType);
      }, 0);

      // Calculate centering offset
      const centeringOffset =
        visibleDynamicRows.length < dynamicRows.length
          ? (baselineHeight - totalVisibleHeight) / 2
          : 0;

      // Find the target row's position
      let cumulativeTop = 0;
      for (const row of dynamicRows) {
        if (row.id === targetRow) {
          // Found the target row
          const rowMediaType = row.trackTypes[0];
          const rowHeight = getRowHeight(rowMediaType);
          const trackItemHeight = getTrackItemHeight(rowMediaType);

          // Center the drop zone vertically within the row
          const top =
            cumulativeTop +
            centeringOffset +
            (rowHeight - trackItemHeight) / 2;

          return { top, height: trackItemHeight, centeringOffset };
        }

        // Skip invisible rows
        const rowMediaType = row.trackTypes[0];
        if (visibleTrackRows.includes(rowMediaType)) {
          cumulativeTop += getRowHeight(rowMediaType);
        }
      }

      // Fallback if row not found
      const rowHeight = getRowHeight(mediaType);
      const trackItemHeight = getTrackItemHeight(mediaType);
      return {
        top: centeringOffset + (rowHeight - trackItemHeight) / 2,
        height: trackItemHeight,
        centeringOffset,
      };
    }, [targetRow, parsedTargetRow, dynamicRows, visibleTrackRows]);

    // Calculate horizontal position
    const left = startFrame * frameWidth - scrollX;
    const width = Math.max(1, (endFrame - startFrame) * frameWidth);

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
