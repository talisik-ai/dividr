/**
 * Utility functions for calculating track row positions dynamically
 * based on visible track rows in the timeline
 */

import {
  calculateCenteringOffset,
  getCurrentTrackRowHeight,
  getRowHeight,
} from './timelineConstants';

export const TRACK_ROW_ORDER = [
  'text',
  'subtitle',
  'image',
  'video',
  'audio',
] as const;

/**
 * Get the visual index of a track type based on which rows are currently visible
 */
export const getVisibleRowIndex = (
  trackType: string,
  visibleTrackRows: string[],
): number => {
  // Filter TRACK_ROW_ORDER to only include visible rows, maintaining the order
  const visibleRowsInOrder = TRACK_ROW_ORDER.filter((rowId) =>
    visibleTrackRows.includes(rowId),
  );

  return visibleRowsInOrder.indexOf(
    trackType as (typeof TRACK_ROW_ORDER)[number],
  );
};

/**
 * Get the top position (in pixels) of a track row
 * Uses individual row heights for accurate positioning
 * @param trackType - The track type to get the top position for
 * @param visibleTrackRows - Array of visible track row IDs
 * @param includeCenteringOffset - Whether to include vertical centering offset (default: false)
 */
export const getTrackRowTop = (
  trackType: string,
  visibleTrackRows: string[],
  includeCenteringOffset = false,
): number => {
  // Get all visible rows in order up to (but not including) the target row
  const visibleRowsInOrder = TRACK_ROW_ORDER.filter((rowId) =>
    visibleTrackRows.includes(rowId),
  );

  const rowIndex = visibleRowsInOrder.indexOf(
    trackType as (typeof TRACK_ROW_ORDER)[number],
  );

  if (rowIndex === -1) return 0;

  // Sum up the heights of all rows before this one
  let topPosition = 0;
  for (let i = 0; i < rowIndex; i++) {
    topPosition += getRowHeight(visibleRowsInOrder[i]);
  }

  // Add centering offset if requested
  if (includeCenteringOffset) {
    topPosition += calculateCenteringOffset(visibleTrackRows);
  }

  return topPosition;
};

/**
 * Get track row height (responsive based on viewport width)
 * This matches the actual rendered height using Tailwind responsive classes
 * @param trackType - Optional track type for type-specific heights
 */
export const getTrackRowHeight = (trackType?: string): number => {
  if (trackType) {
    return getRowHeight(trackType);
  }
  return getCurrentTrackRowHeight();
};

/**
 * Get all visible track rows in their display order
 */
export const getVisibleRowsInOrder = (visibleTrackRows: string[]): string[] => {
  return TRACK_ROW_ORDER.filter((rowId) => visibleTrackRows.includes(rowId));
};
