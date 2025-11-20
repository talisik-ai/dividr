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
    const typeSet = rowIndicesByType.get(track.type);
    if (typeSet) {
      typeSet.add(rowIndex);
    }
  });

  // Ensure base video row always exists (Track 0)
  if (!rowIndicesByType.has('video')) {
    rowIndicesByType.set('video', new Set([0]));
  } else {
    const videoSet = rowIndicesByType.get('video');
    if (videoSet) {
      videoSet.add(0);
    }
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

/**
 * Determine if a new row should be auto-created based on drag position
 * Returns the target row index where the track should be placed
 *
 * @param targetRowIndex - The row index being targeted by drag
 * @param _trackType - Type of track being dragged (unused but kept for API consistency)
 * @param tracks - All tracks in the timeline
 * @returns Target row index (may trigger row creation if new)
 */
export function determineTargetRowForDrag(
  targetRowIndex: number,
  trackType: VideoTrack['type'],
  tracks: VideoTrack[],
): { rowIndex: number; shouldCreateRow: boolean } {
  // Get all existing row indices for this type
  const existingIndices = tracks
    .filter((t) => t.type === trackType)
    .map((t) => t.trackRowIndex ?? 0);

  if (existingIndices.length === 0) {
    // No tracks of this type exist, create row 0
    return { rowIndex: 0, shouldCreateRow: true };
  }

  const maxIndex = Math.max(...existingIndices);
  const minIndex = Math.min(...existingIndices);

  // Check if target row already exists
  if (existingIndices.includes(targetRowIndex)) {
    return { rowIndex: targetRowIndex, shouldCreateRow: false };
  }

  // Dragging above highest row → create new row at maxIndex + 1
  if (targetRowIndex > maxIndex) {
    return { rowIndex: maxIndex + 1, shouldCreateRow: true };
  }

  // Dragging below lowest row → create new row at minIndex - 1 (or 0)
  if (targetRowIndex < minIndex) {
    return { rowIndex: Math.max(0, minIndex - 1), shouldCreateRow: true };
  }

  // Dragging between two rows → insert new row between them
  // This will shift existing rows
  return { rowIndex: targetRowIndex, shouldCreateRow: true };
}

/**
 * Normalize row indices to ensure they are sequential (0, 1, 2, 3...)
 * This should be called after row deletion or insertion
 *
 * @param tracks - All tracks in the timeline
 * @returns Tracks with normalized row indices
 */
export function normalizeRowIndices(tracks: VideoTrack[]): VideoTrack[] {
  // Group tracks by type
  const tracksByType = new Map<VideoTrack['type'], VideoTrack[]>();

  tracks.forEach((track) => {
    if (!tracksByType.has(track.type)) {
      tracksByType.set(track.type, []);
    }
    const typeList = tracksByType.get(track.type);
    if (typeList) {
      typeList.push(track);
    }
  });

  // Normalize each type's row indices
  const normalizedTracks: VideoTrack[] = [];

  tracksByType.forEach((typeTracks) => {
    // Sort by current row index (descending - higher rows first)
    const sorted = [...typeTracks].sort(
      (a, b) => (b.trackRowIndex ?? 0) - (a.trackRowIndex ?? 0),
    );

    // Reassign sequential indices starting from 0
    sorted.forEach((track, index) => {
      normalizedTracks.push({
        ...track,
        trackRowIndex: sorted.length - 1 - index, // Reverse to maintain visual order
      });
    });
  });

  // Merge with tracks that weren't in any group (shouldn't happen, but safety)
  const processedIds = new Set(normalizedTracks.map((t) => t.id));
  tracks.forEach((track) => {
    if (!processedIds.has(track.id)) {
      normalizedTracks.push(track);
    }
  });

  return normalizedTracks;
}

/**
 * Insert a new row at a specific index, shifting existing rows
 * This is used when dragging between two rows
 *
 * @param tracks - All tracks in the timeline
 * @param type - Media type for the new row
 * @param insertAtIndex - Index where new row should be inserted
 * @returns Tracks with updated row indices
 */
export function insertRowAtIndex(
  tracks: VideoTrack[],
  type: VideoTrack['type'],
  insertAtIndex: number,
): VideoTrack[] {
  return tracks.map((track) => {
    // Only affect tracks of the same type
    if (track.type !== type) {
      return track;
    }

    const currentIndex = track.trackRowIndex ?? 0;

    // Shift rows at or above the insertion point
    if (currentIndex >= insertAtIndex) {
      return {
        ...track,
        trackRowIndex: currentIndex + 1,
      };
    }

    return track;
  });
}

/**
 * Get the display label for a row (e.g., "Video 1", "Video 2", "Text 1")
 *
 * @param type - Media type
 * @param rowIndex - Row index
 * @returns Display label string
 */
export function getRowDisplayLabel(
  type: VideoTrack['type'],
  rowIndex: number,
): string {
  const baseLabels: Record<VideoTrack['type'], string> = {
    video: 'Video',
    audio: 'Audio',
    image: 'Image',
    text: 'Text',
    subtitle: 'Subtitle',
  };

  const baseLabel = baseLabels[type] || type;

  // For row 0, just show the base label
  // For higher rows, show "Label N" where N = rowIndex + 1
  return rowIndex === 0 ? baseLabel : `${baseLabel} ${rowIndex + 1}`;
}
