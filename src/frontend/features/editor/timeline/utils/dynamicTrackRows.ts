import { VideoTrack } from '../../stores/videoEditor/types';

export interface TrackRowDefinition {
  id: string;
  name: string;
  trackTypes: VideoTrack['type'][];
  color: string;
  icon: string;
}

/**
 * Dynamic Track Row Management Utilities
 *
 * These utilities enable CapCut-style dynamic track rows where:
 * - Each media type can have multiple rows (indexed by trackRowIndex)
 * - Clips can be moved vertically between rows of the same type
 * - New rows are auto-created when needed
 * - Track row indices determine vertical ordering and layer priority
 */

/**
 * Base row definitions for each media type
 * These define the visual properties for each type of row
 */
export const BASE_ROW_DEFINITIONS: Record<
  VideoTrack['type'],
  Omit<TrackRowDefinition, 'id'>
> = {
  text: {
    name: 'Text',
    trackTypes: ['text'],
    color: '#3498db',
    icon: '🔤',
  },
  subtitle: {
    name: 'Subtitles',
    trackTypes: ['subtitle'],
    color: '#9b59b6',
    icon: '💬',
  },
  image: {
    name: 'Images/Overlays',
    trackTypes: ['image'],
    color: '#e67e22',
    icon: '🖼️',
  },
  video: {
    name: 'Video',
    trackTypes: ['video'],
    color: '#8e44ad',
    icon: '🎬',
  },
  audio: {
    name: 'Audio',
    trackTypes: ['audio'],
    color: '#27ae60',
    icon: '🎵',
  },
};

/**
 * Visual ordering of track types from top to bottom
 * This defines the vertical stacking order in the timeline
 */
export const TRACK_TYPE_ORDER: VideoTrack['type'][] = [
  'text',
  'subtitle',
  'image',
  'video',
  'audio',
];

/**
 * Generate dynamic row definitions based on existing tracks
 * Creates one row per unique (type, trackRowIndex) combination
 *
 * @param tracks - All tracks in the timeline
 * @returns Array of dynamic row definitions, ordered by type and row index
 */
export function generateDynamicRows(
  tracks: VideoTrack[],
): TrackRowDefinition[] {
  // Group tracks by type and find all unique row indices per type
  const rowIndicesByType = new Map<VideoTrack['type'], Set<number>>();

  tracks.forEach((track) => {
    const rowIndex = track.trackRowIndex ?? 0; // Default to row 0

    if (!rowIndicesByType.has(track.type)) {
      rowIndicesByType.set(track.type, new Set());
    }
    rowIndicesByType.get(track.type)!.add(rowIndex);
  });

  // Ensure base video row always exists (Track 0)
  if (!rowIndicesByType.has('video')) {
    rowIndicesByType.set('video', new Set([0]));
  } else {
    rowIndicesByType.get('video')!.add(0);
  }

  // Generate row definitions in visual order (top to bottom)
  const rows: TrackRowDefinition[] = [];

  TRACK_TYPE_ORDER.forEach((type) => {
    const rowIndices = rowIndicesByType.get(type);
    if (!rowIndices || rowIndices.size === 0) return;

    // Sort row indices (higher index = upper row in timeline)
    const sortedIndices = Array.from(rowIndices).sort((a, b) => b - a);

    sortedIndices.forEach((rowIndex) => {
      const baseDefinition = BASE_ROW_DEFINITIONS[type];
      const rowId = `${type}-${rowIndex}`;

      rows.push({
        id: rowId,
        name:
          rowIndex === 0
            ? baseDefinition.name
            : `${baseDefinition.name} ${rowIndex + 1}`,
        trackTypes: baseDefinition.trackTypes,
        color: baseDefinition.color,
        icon: baseDefinition.icon,
      });
    });
  });

  return rows;
}

/**
 * Get the row ID for a specific track
 *
 * @param track - The track to get the row ID for
 * @returns The row ID string (e.g., "video-0", "text-2")
 */
export function getTrackRowId(track: VideoTrack): string {
  const rowIndex = track.trackRowIndex ?? 0;
  return `${track.type}-${rowIndex}`;
}

/**
 * Parse a row ID into type and index components
 *
 * @param rowId - Row ID string (e.g., "video-0", "text-2")
 * @returns Object with type and rowIndex, or null if invalid
 */
export function parseRowId(
  rowId: string,
): { type: VideoTrack['type']; rowIndex: number } | null {
  const match = rowId.match(/^(video|audio|image|text|subtitle)-(\d+)$/);
  if (!match) return null;

  return {
    type: match[1] as VideoTrack['type'],
    rowIndex: parseInt(match[2], 10),
  };
}

/**
 * Get the next available row index for a given type
 * This is used when auto-creating new rows
 *
 * @param tracks - All tracks in the timeline
 * @param type - Media type to find next row for
 * @returns Next available row index
 */
export function getNextAvailableRowIndex(
  tracks: VideoTrack[],
  type: VideoTrack['type'],
): number {
  const existingIndices = tracks
    .filter((t) => t.type === type)
    .map((t) => t.trackRowIndex ?? 0);

  if (existingIndices.length === 0) return 0;

  return Math.max(...existingIndices) + 1;
}

/**
 * Check if a row is valid for dropping a track
 * Validates that the target row matches the track's media type
 *
 * @param trackType - Type of the track being dragged
 * @param targetRowId - ID of the target row
 * @returns True if drop is valid
 */
export function isValidDropTarget(
  trackType: VideoTrack['type'],
  targetRowId: string,
): boolean {
  const parsed = parseRowId(targetRowId);
  if (!parsed) return false;

  return parsed.type === trackType;
}

/**
 * Get all row IDs that currently exist in the timeline
 *
 * @param tracks - All tracks in the timeline
 * @returns Set of row IDs
 */
export function getExistingRowIds(tracks: VideoTrack[]): Set<string> {
  const rowIds = new Set<string>();

  tracks.forEach((track) => {
    rowIds.add(getTrackRowId(track));
  });

  // Ensure base video row always exists
  rowIds.add('video-0');

  return rowIds;
}

/**
 * Determine if a new row should be auto-created based on drag position
 *
 * @param dragY - Y position of drag in timeline coordinates
 * @param trackType - Type of track being dragged
 * @param existingRows - Currently existing row definitions
 * @param visibleTrackRows - IDs of visible track rows
 * @returns Row index for auto-create, or null if not needed
 */
export function shouldAutoCreateRow(
  dragY: number,
  trackType: VideoTrack['type'],
  existingRows: TrackRowDefinition[],
  visibleTrackRows: string[],
): number | null {
  // Filter to rows of the same type
  const typeRows = existingRows.filter((row) =>
    row.trackTypes.includes(trackType),
  );

  if (typeRows.length === 0) {
    // No rows exist for this type, create row 0
    return 0;
  }

  // Check if dragging above the topmost row or below the bottommost row
  // This would trigger auto-creation of a new row
  // For now, return null (will be implemented in drop handler)
  return null;
}

/**
 * Assign default trackRowIndex to tracks that don't have one
 * This is used for migration and backward compatibility
 *
 * @param tracks - Tracks to migrate
 * @returns Migrated tracks with trackRowIndex assigned
 */
export function migrateTracksWithRowIndex(tracks: VideoTrack[]): VideoTrack[] {
  return tracks.map((track) => {
    if (track.trackRowIndex !== undefined) {
      return track; // Already has row index
    }

    // Assign default row index based on media type
    // Video tracks default to row 0 (base track)
    // Other types also default to row 0
    return {
      ...track,
      trackRowIndex: 0,
    };
  });
}
