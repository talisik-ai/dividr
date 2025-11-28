import { cn } from '@/frontend/utils/utils';
import React, { useMemo } from 'react';
import { TrackRowDefinition, parseRowId } from './utils/dynamicTrackRows';
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

      // Filter to visible rows only
      const visibleDynamicRows = dynamicRows.filter((row) => {
        const mediaType = row.trackTypes[0];
        return visibleTrackRows.includes(mediaType);
      });

      // Calculate baseline and centering
      const baselineHeight = dynamicRows.reduce((sum, row) => {
        const mediaType = row.trackTypes[0];
        return sum + getRowHeight(mediaType);
      }, 0);

      const totalVisibleHeight = visibleDynamicRows.reduce((sum, row) => {
        const mediaType = row.trackTypes[0];
        return sum + getRowHeight(mediaType);
      }, 0);

      const centeringOffset =
        visibleDynamicRows.length < dynamicRows.length
          ? (baselineHeight - totalVisibleHeight) / 2
          : 0;

      // Find the target row's position
      let cumulativeTop = 0;
      let targetTop = 0;
      let targetHeight = 0;
      let found = false;

      for (const row of dynamicRows) {
        const mediaType = row.trackTypes[0];
        const rowParsed = parseRowId(row.id);

        if (visibleTrackRows.includes(mediaType) && rowParsed) {
          const rowHeight = getRowHeight(mediaType);

          if (
            rowParsed.type === parsed.type &&
            Math.round(rowParsed.rowIndex) === Math.round(parsed.rowIndex)
          ) {
            targetTop = cumulativeTop + centeringOffset;
            targetHeight = rowHeight;
            found = true;
            break;
          }

          cumulativeTop += rowHeight;
        }
      }

      if (!found) {
        // Row not found in visible rows - might be a new row being created
        // Fall back to calculating based on type
        targetTop = cumulativeTop + centeringOffset;
        targetHeight = getRowHeight(parsed.type);
      }

      return {
        top: targetTop,
        height: targetHeight,
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
