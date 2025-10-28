/**
 * Utility functions for calculating track row positions dynamically
 * based on visible track rows in the timeline
 */

import { getCurrentTrackRowHeight, getRowHeight } from './timelineConstants';

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
 */
export const getTrackRowTop = (
  trackType: string,
  visibleTrackRows: string[],
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

  return topPosition;
};

/**
 * Get track row height (responsive based on viewport width)
 * This matches the actual rendered height using Tailwind responsive classes
 */
export const getTrackRowHeight = (): number => {
  return getCurrentTrackRowHeight();
};

/**
 * Get all visible track rows in their display order
 */
export const getVisibleRowsInOrder = (visibleTrackRows: string[]): string[] => {
  return TRACK_ROW_ORDER.filter((rowId) => visibleTrackRows.includes(rowId));
};
