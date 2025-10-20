/**
 * Utility functions for calculating track row positions dynamically
 * based on visible track rows in the timeline
 */

export const TRACK_ROW_ORDER = [
  'text',
  'subtitle',
  'logo',
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
 */
export const getTrackRowTop = (
  trackType: string,
  visibleTrackRows: string[],
  trackRowHeight = 48,
): number => {
  const rowIndex = getVisibleRowIndex(trackType, visibleTrackRows);
  return rowIndex >= 0 ? rowIndex * trackRowHeight : 0;
};

/**
 * Get track row height (standard across all responsive breakpoints for calculations)
 */
export const getTrackRowHeight = (): number => {
  return 48; // Standard track row height for calculations
};

/**
 * Get all visible track rows in their display order
 */
export const getVisibleRowsInOrder = (visibleTrackRows: string[]): string[] => {
  return TRACK_ROW_ORDER.filter((rowId) => visibleTrackRows.includes(rowId));
};
