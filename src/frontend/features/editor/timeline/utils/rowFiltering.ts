/**
 * Row Filtering Utilities
 *
 * Separates visual placeholder rows from interactive real track rows.
 * Ensures interaction logic (hit-testing, seeking, marquee) only operates on real tracks.
 */

import { VideoTrack } from '../../stores/videoEditor/types';
import { TrackRowDefinition, parseRowId } from './dynamicTrackRows';
import { getRowHeight } from './timelineConstants';

/**
 * Check if a row definition represents a real track row (not a placeholder)
 * Real rows have format: "video-0", "audio-1", etc.
 * Placeholder rows have format: "placeholder-above-0", "placeholder-below-1", etc.
 */
export function isRealTrackRow(rowDef: TrackRowDefinition): boolean {
  return !rowDef.id.startsWith('placeholder-');
}

/**
 * Filter dynamic rows to only real track rows (excluding placeholders)
 * Use this for ALL interaction logic (hit-testing, seeking, marquee)
 */
export function getRealTrackRows(
  rows: TrackRowDefinition[],
): TrackRowDefinition[] {
  return rows.filter(isRealTrackRow);
}

/**
 * Calculate cumulative Y position for a real track row accounting for placeholders
 * This handles the visual offset caused by placeholder spacing above the row
 *
 * @param rowId - Row ID to calculate position for (e.g., "video-0", "audio-1")
 * @param allRows - All dynamic rows including placeholders
 * @param visibleTrackRows - Currently visible track types
 * @param placeholderHeight - Height of placeholder rows in pixels (default: 48)
 * @returns Y position of the row's top edge in content coordinates
 */
export function calculateRealRowTopPosition(
  rowId: string,
  allRows: TrackRowDefinition[],
  visibleTrackRows: string[],
  placeholderHeight = 48,
): number {
  const parsed = parseRowId(rowId);
  if (!parsed) return 0;

  // Filter visible rows (real + placeholders)
  const visibleRows = allRows.filter((row) => {
    if (row.id.startsWith('placeholder-')) return true; // Always include placeholders in layout
    const mediaType = row.trackTypes[0];
    return visibleTrackRows.includes(mediaType);
  });

  // Calculate centering offset (matching timelineTracks.tsx logic)
  const realRows = getRealTrackRows(allRows);
  const visibleRealRows = realRows.filter((row) => {
    const mediaType = row.trackTypes[0];
    return visibleTrackRows.includes(mediaType);
  });

  const baselineHeight = realRows.reduce((sum, row) => {
    const mediaType = row.trackTypes[0];
    return sum + getRowHeight(mediaType);
  }, 0);

  const totalVisibleHeight = visibleRealRows.reduce((sum, row) => {
    const mediaType = row.trackTypes[0];
    return sum + getRowHeight(mediaType);
  }, 0);

  const centeringOffset =
    visibleRealRows.length < realRows.length
      ? (baselineHeight - totalVisibleHeight) / 2
      : 0;

  // Calculate cumulative top position
  let cumulativeTop = 0;
  for (const row of visibleRows) {
    if (row.id === rowId) {
      return cumulativeTop + centeringOffset;
    }

    // Add row height to cumulative position
    if (row.id.startsWith('placeholder-')) {
      cumulativeTop += placeholderHeight;
    } else {
      const mediaType = row.trackTypes[0];
      cumulativeTop += getRowHeight(mediaType);
    }
  }

  return 0;
}

/**
 * Build row bounds array for interaction hit-testing
 * ONLY includes real track rows, excludes placeholders
 * Accounts for placeholder spacing in Y positions
 *
 * @param allRows - All dynamic rows including placeholders
 * @param visibleTrackRows - Currently visible track types
 * @param placeholderHeight - Height of placeholder rows (default: 48)
 * @returns Array of row bounds for real tracks only
 */
export function buildInteractionRowBounds(
  allRows: TrackRowDefinition[],
  visibleTrackRows: string[],
  placeholderHeight = 48,
): Array<{
  rowId: string;
  top: number;
  bottom: number;
  type: VideoTrack['type'];
  rowIndex: number;
}> {
  const bounds: Array<{
    rowId: string;
    top: number;
    bottom: number;
    type: VideoTrack['type'];
    rowIndex: number;
  }> = [];

  // Get only real track rows
  const realRows = getRealTrackRows(allRows);

  // Filter visible real rows
  const visibleRealRows = realRows.filter((row) => {
    const mediaType = row.trackTypes[0];
    return visibleTrackRows.includes(mediaType);
  });

  // Calculate centering offset
  const baselineHeight = realRows.reduce((sum, row) => {
    const mediaType = row.trackTypes[0];
    return sum + getRowHeight(mediaType);
  }, 0);

  const totalVisibleHeight = visibleRealRows.reduce((sum, row) => {
    const mediaType = row.trackTypes[0];
    return sum + getRowHeight(mediaType);
  }, 0);

  const centeringOffset =
    visibleRealRows.length < realRows.length
      ? (baselineHeight - totalVisibleHeight) / 2
      : 0;

  // Count placeholder rows above
  const placeholderRowsAbove = allRows.filter((row) =>
    row.id.startsWith('placeholder-above-'),
  ).length;

  // Start with placeholder offset
  let cumulativeTop = placeholderRowsAbove * placeholderHeight;

  // Build bounds for visible real rows
  for (const row of realRows) {
    const mediaType = row.trackTypes[0];
    if (!visibleTrackRows.includes(mediaType)) continue;

    const parsed = parseRowId(row.id);
    if (!parsed) continue;

    const rowHeight = getRowHeight(mediaType);
    const rowTop = cumulativeTop + centeringOffset;

    bounds.push({
      rowId: row.id,
      top: rowTop,
      bottom: rowTop + rowHeight,
      type: parsed.type,
      rowIndex: parsed.rowIndex,
    });

    cumulativeTop += rowHeight;
  }

  return bounds;
}

/**
 * Find track at cursor position using only real track rows
 * Placeholders are completely ignored for hit-testing
 *
 * @param cursorX - X position in timeline content coordinates (includes scrollX)
 * @param cursorY - Y position in timeline content coordinates (includes scrollY)
 * @param tracks - All tracks
 * @param rowBounds - Row bounds from buildInteractionRowBounds()
 * @param frameWidth - Width of one frame in pixels
 * @returns Track at cursor position or null
 */
export function findTrackAtCursor(
  cursorX: number,
  cursorY: number,
  tracks: VideoTrack[],
  rowBounds: ReturnType<typeof buildInteractionRowBounds>,
  frameWidth: number,
): VideoTrack | null {
  // Find which row the cursor is in
  const targetRow = rowBounds.find(
    (row) => cursorY >= row.top && cursorY < row.bottom,
  );

  if (!targetRow) return null;

  // Find track in this row at cursor X position
  const targetFrame = Math.floor(cursorX / frameWidth);

  return (
    tracks.find(
      (track) =>
        track.type === targetRow.type &&
        (track.trackRowIndex ?? 0) === targetRow.rowIndex &&
        targetFrame >= track.startFrame &&
        targetFrame < track.endFrame,
    ) || null
  );
}

/**
 * Calculate total content height including placeholders
 * Use this for container sizing
 */
export function calculateTotalContentHeight(
  allRows: TrackRowDefinition[],
  placeholderHeight = 48,
): number {
  let totalHeight = 0;

  for (const row of allRows) {
    if (row.id.startsWith('placeholder-')) {
      totalHeight += placeholderHeight;
    } else {
      const mediaType = row.trackTypes[0];
      totalHeight += getRowHeight(mediaType);
    }
  }

  return totalHeight;
}
