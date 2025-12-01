import { cn } from '@/frontend/utils/utils';
import React, { useMemo } from 'react';
import {
  calculatePlaceholderRows,
  calculateRowBoundsWithPlaceholders,
  TrackRowDefinition,
  parseRowId,
} from './utils/dynamicTrackRows';
import { getRowHeight } from './utils/timelineConstants';

interface DropZoneIndicatorProps {
  targetRow: string;
  startFrame: number;
  endFrame: number;
  frameWidth: number;
  scrollX: number;
  scrollY?: number;
  viewportHeight?: number;
  visibleTrackRows: string[];
  dynamicRows: TrackRowDefinition[];
  isValidDrop: boolean;
}

export const DropZoneIndicator: React.FC<DropZoneIndicatorProps> = React.memo(
  ({
    targetRow,
    startFrame,
    endFrame,
    frameWidth,
    scrollX,
    scrollY = 0,
    viewportHeight,
    visibleTrackRows,
    dynamicRows,
    isValidDrop,
  }) => {
    const position = useMemo(() => {
      const parsed = parseRowId(targetRow);
      if (!parsed) return null;

      // Calculate placeholder rows (matches timelineTracks.tsx logic)
      const { placeholderRowsAbove, placeholderRowsBelow } =
        calculatePlaceholderRows(dynamicRows);
      const PLACEHOLDER_ROW_HEIGHT = 48;

      // Calculate row bounds with placeholder spacing
      const rowBounds = calculateRowBoundsWithPlaceholders(
        dynamicRows,
        visibleTrackRows,
        placeholderRowsAbove,
        placeholderRowsBelow,
        PLACEHOLDER_ROW_HEIGHT,
      );

      // Find the target row's position
      const targetRowBound = rowBounds.find(
        (bound) =>
          bound.type === parsed.type &&
          Math.round(bound.rowIndex) === Math.round(parsed.rowIndex),
      );

      if (!targetRowBound) {
        // Row not found in visible rows - might be a new row being created
        // Fall back to calculating based on type
        const lastBound = rowBounds[rowBounds.length - 1];
        const targetTop = lastBound ? lastBound.bottom : 0;
        const targetHeight = getRowHeight(parsed.type);

        return {
          top: targetTop,
          height: targetHeight,
          left: startFrame * frameWidth - scrollX,
          width: Math.max(1, (endFrame - startFrame) * frameWidth),
        };
      }

      return {
        top: targetRowBound.top,
        height: targetRowBound.bottom - targetRowBound.top,
        left: startFrame * frameWidth - scrollX,
        width: Math.max(1, (endFrame - startFrame) * frameWidth),
      };
    }, [
      targetRow,
      startFrame,
      endFrame,
      frameWidth,
      scrollX,
      visibleTrackRows,
      dynamicRows,
    ]);

    if (!position) return null;

    // Convert to viewport coordinates
    const viewportTop = position.top - scrollY;
    const viewportBottom = viewportTop + position.height;

    // Viewport clipping - don't render if completely outside
    if (viewportHeight !== undefined) {
      if (viewportBottom < 0 || viewportTop > viewportHeight) {
        return null;
      }
    }

    // Calculate visible portion (clip to viewport)
    let clippedTop = viewportTop;
    let clippedHeight = position.height;

    if (viewportHeight !== undefined) {
      if (viewportTop < 0) {
        clippedHeight += viewportTop; // Reduce height by amount above viewport
        clippedTop = 0;
      }
      if (viewportTop + position.height > viewportHeight) {
        clippedHeight = viewportHeight - Math.max(0, viewportTop);
      }
    }

    return (
      <div
        className={cn(
          'absolute pointer-events-none rounded border-2 border-dashed transition-opacity duration-150',
          isValidDrop
            ? 'border-secondary/60 bg-secondary/20'
            : 'border-destructive/60 bg-destructive/20',
        )}
        style={{
          top: `${clippedTop}px`,
          left: `${position.left}px`,
          width: `${position.width}px`,
          height: `${Math.max(0, clippedHeight)}px`,
          zIndex: 5,
        }}
      />
    );
  },
);
