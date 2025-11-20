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
 *
 * NOTE: With free reordering enabled, this is only used for:
 * - Initial grouping of audio tracks at bottom
 * - Fallback ordering when trackRowIndex is not set
 */
export const TRACK_TYPE_ORDER: VideoTrack['type'][] = [
  'text',
  'subtitle',
  'image',
  'video',
  'audio',
];

/**
 * Non-audio track types that can be freely reordered
 */
export const FREE_REORDER_TYPES: VideoTrack['type'][] = [
  'text',
  'subtitle',
  'image',
  'video',
];

/**
 * Audio track types that remain pinned at the bottom
 */
export const AUDIO_GROUP_TYPES: VideoTrack['type'][] = ['audio'];

/**
 * Base tracks that cannot be deleted or moved
 */
export const BASE_TRACKS = {
  video: 0, // video-0 is the base video track
  audio: 0, // audio-0 is the base audio track
} as const;

/**
 * Generate dynamic row definitions based on existing tracks
 * Creates one row per unique (type, trackRowIndex) combination
 *
 * With free reordering enabled:
 * - Non-audio tracks are sorted by trackRowIndex (descending)
 * - Audio tracks remain grouped at the bottom
 * - Each track type can have multiple rows
 * - ENFORCES HIERARCHY: video-0 is always the lowest visual track
 *
 * @param tracks - All tracks in the timeline
 * @returns Array of dynamic row definitions, ordered by visual position
 */
export function generateDynamicRows(
  tracks: VideoTrack[],
): TrackRowDefinition[] {
  // CRITICAL: Enforce track hierarchy before generating rows
  const hierarchyEnforcedTracks = enforceTrackHierarchy(tracks);

  // Separate non-audio and audio tracks
  const nonAudioTracks = hierarchyEnforcedTracks.filter(
    (t) => !AUDIO_GROUP_TYPES.includes(t.type),
  );
  const audioTracks = hierarchyEnforcedTracks.filter((t) =>
    AUDIO_GROUP_TYPES.includes(t.type),
  );

  const rows: TrackRowDefinition[] = [];

  // Process non-audio tracks (free reordering)
  // Group by (type, rowIndex) and sort by rowIndex descending
  const nonAudioRowMap = new Map<string, VideoTrack[]>();
  nonAudioTracks.forEach((track) => {
    const rowId = getTrackRowId(track);
    if (!nonAudioRowMap.has(rowId)) {
      nonAudioRowMap.set(rowId, []);
    }
    const rowTracks = nonAudioRowMap.get(rowId);
    if (rowTracks) {
      rowTracks.push(track);
    }
  });

  // CRITICAL: Ensure base video row (video-0) always exists, even when empty
  // This is the foundation track that should never auto-disappear
  if (!nonAudioRowMap.has('video-0')) {
    nonAudioRowMap.set('video-0', []);
  }

  // Convert to array and sort by rowIndex (descending)
  const nonAudioRowEntries = Array.from(nonAudioRowMap.entries()).sort(
    (a, b) => {
      // Handle empty rows (base tracks) - use rowId to extract type and index
      const aRowId = parseRowId(a[0]);
      const bRowId = parseRowId(b[0]);

      if (!aRowId || !bRowId) return 0;

      // If rows have tracks, use first track's rowIndex
      // Otherwise, use the rowIndex from the parsed rowId
      const aIndex =
        a[1].length > 0 ? (a[1][0].trackRowIndex ?? 0) : aRowId.rowIndex;
      const bIndex =
        b[1].length > 0 ? (b[1][0].trackRowIndex ?? 0) : bRowId.rowIndex;

      return bIndex - aIndex;
    },
  );

  // Add non-audio rows
  nonAudioRowEntries.forEach(([rowId, tracksInRow]) => {
    // For empty rows (base tracks), parse the rowId to get type and index
    const parsedRowId = parseRowId(rowId);
    if (!parsedRowId) return;

    const track = tracksInRow.length > 0 ? tracksInRow[0] : null;
    const trackType = track?.type || parsedRowId.type;
    const baseDefinition = BASE_ROW_DEFINITIONS[trackType];
    const rowIndex = track?.trackRowIndex ?? parsedRowId.rowIndex;

    rows.push({
      id: rowId,
      name: getRowDisplayLabel(trackType, rowIndex),
      trackTypes: [trackType],
      color: baseDefinition.color,
      icon: baseDefinition.icon,
    });
  });

  // Process audio tracks (grouped at bottom)
  const audioRowMap = new Map<string, VideoTrack[]>();
  audioTracks.forEach((track) => {
    const rowId = getTrackRowId(track);
    if (!audioRowMap.has(rowId)) {
      audioRowMap.set(rowId, []);
    }
    const rowTracks = audioRowMap.get(rowId);
    if (rowTracks) {
      rowTracks.push(track);
    }
  });

  // CRITICAL: Ensure base audio row (audio-0) always exists, even when empty
  // This is the foundation track that should never auto-disappear
  if (!audioRowMap.has('audio-0')) {
    audioRowMap.set('audio-0', []);
  }

  // Convert to array and sort by rowIndex (descending)
  const audioRowEntries = Array.from(audioRowMap.entries()).sort((a, b) => {
    const aRowId = parseRowId(a[0]);
    const bRowId = parseRowId(b[0]);
    if (!aRowId || !bRowId) return 0;
    return bRowId.rowIndex - aRowId.rowIndex;
  });

  // Add audio rows
  audioRowEntries.forEach(([rowId]) => {
    const parsed = parseRowId(rowId);
    if (!parsed) return;

    const baseDefinition = BASE_ROW_DEFINITIONS[parsed.type];
    rows.push({
      id: rowId,
      name: getRowDisplayLabel(parsed.type, parsed.rowIndex),
      trackTypes: [parsed.type],
      color: baseDefinition.color,
      icon: baseDefinition.icon,
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
 * Enforce track hierarchy rules:
 * - Visual tracks (text, subtitle, image) must be above video-0
 * - video-0 is the lowest visual track
 * - Audio tracks are below all visual tracks
 *
 * NOTE: This function does NOT move overlay tracks above video-0 automatically.
 * It only ensures video-0 stays at index 0. Overlay tracks can coexist at any index.
 *
 * @param tracks - All tracks in the timeline
 * @returns Tracks with enforced hierarchy
 */
export function enforceTrackHierarchy(tracks: VideoTrack[]): VideoTrack[] {
  // Separate tracks by category
  const visualOverlayTracks = tracks.filter((t) =>
    ['text', 'subtitle', 'image'].includes(t.type),
  );
  const videoTracks = tracks.filter((t) => t.type === 'video');
  const audioTracks = tracks.filter((t) => t.type === 'audio');

  // Find video-0 (base video track)
  const baseVideoTrack = videoTracks.find((t) => (t.trackRowIndex ?? 0) === 0);

  // Overlay tracks keep their current indices
  // They can coexist with video tracks at any row index
  const correctedOverlayTracks = visualOverlayTracks;

  // Ensure video-0 stays at index 0
  const correctedVideoTracks = videoTracks.map((track) => {
    if (track.id === baseVideoTrack?.id) {
      return { ...track, trackRowIndex: 0 };
    }
    return track;
  });

  // Audio tracks keep their indices (they're in a separate group)
  return [...correctedOverlayTracks, ...correctedVideoTracks, ...audioTracks];
}

/**
 * Normalize row indices to ensure they are sequential (0, 1, 2, 3...)
 * This should be called after row deletion or insertion
 *
 * INCLUDES HIERARCHY ENFORCEMENT: Ensures video-0 is always the lowest visual track
 *
 * @param tracks - All tracks in the timeline
 * @returns Tracks with normalized row indices and enforced hierarchy
 */
export function normalizeRowIndices(tracks: VideoTrack[]): VideoTrack[] {
  // STEP 1: Enforce hierarchy rules first
  const hierarchyEnforcedTracks = enforceTrackHierarchy(tracks);

  // STEP 2: Group tracks by type
  const tracksByType = new Map<VideoTrack['type'], VideoTrack[]>();

  hierarchyEnforcedTracks.forEach((track) => {
    if (!tracksByType.has(track.type)) {
      tracksByType.set(track.type, []);
    }
    const typeList = tracksByType.get(track.type);
    if (typeList) {
      typeList.push(track);
    }
  });

  // STEP 3: Normalize each type's row indices
  const normalizedTracks: VideoTrack[] = [];

  tracksByType.forEach((typeTracks, type) => {
    // Sort by current row index (descending - higher rows first)
    const sorted = [...typeTracks].sort(
      (a, b) => (b.trackRowIndex ?? 0) - (a.trackRowIndex ?? 0),
    );

    // For video tracks, ensure video-0 stays at index 0
    if (type === 'video') {
      const baseVideo = sorted.find((t) => (t.trackRowIndex ?? 0) === 0);
      if (baseVideo) {
        // Keep video-0 at index 0
        normalizedTracks.push({ ...baseVideo, trackRowIndex: 0 });

        // Normalize other video tracks starting from 1
        const otherVideos = sorted.filter((t) => t.id !== baseVideo.id);
        otherVideos.forEach((track, index) => {
          normalizedTracks.push({
            ...track,
            trackRowIndex: otherVideos.length - index, // Start from 1 upwards
          });
        });
        return;
      }
    }

    // For other types, normalize normally
    sorted.forEach((track, index) => {
      normalizedTracks.push({
        ...track,
        trackRowIndex: sorted.length - 1 - index, // Reverse to maintain visual order
      });
    });
  });

  // STEP 4: Merge with tracks that weren't in any group (shouldn't happen, but safety)
  const processedIds = new Set(normalizedTracks.map((t) => t.id));
  hierarchyEnforcedTracks.forEach((track) => {
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

/**
 * Insertion Point Detection for CapCut-style track insertion
 */

export interface InsertionPoint {
  /** Type of insertion: above a row, between rows, or below a row */
  type: 'above' | 'between' | 'below';
  /** The row index where insertion will occur */
  targetRowIndex: number;
  /** Y position for the insertion line indicator */
  yPosition: number;
  /** Whether this insertion is valid */
  isValid: boolean;
  /** The track type being inserted */
  trackType: VideoTrack['type'];
}

/**
 * Detect insertion point based on cursor Y position relative to existing rows
 *
 * @param cursorY - Y position of cursor in timeline coordinates
 * @param rowBounds - Array of row boundaries with their metadata
 * @param draggedTrackType - Type of track being dragged
 * @returns InsertionPoint or null if no valid insertion point
 */
export function detectInsertionPoint(
  cursorY: number,
  rowBounds: Array<{
    rowId: string;
    top: number;
    bottom: number;
    type: VideoTrack['type'];
    rowIndex: number;
  }>,
  draggedTrackType: VideoTrack['type'],
): InsertionPoint | null {
  if (rowBounds.length === 0) return null;

  // Define insertion threshold (20% of row height)
  const INSERTION_THRESHOLD = 0.2;

  // Check if dragging above the topmost non-audio row
  const nonAudioRows = rowBounds.filter(
    (row) => !AUDIO_GROUP_TYPES.includes(row.type),
  );
  if (nonAudioRows.length > 0 && cursorY < nonAudioRows[0].top) {
    // Dragging above all non-audio tracks
    const maxRowIndex = Math.max(...nonAudioRows.map((r) => r.rowIndex));
    return {
      type: 'above',
      targetRowIndex: maxRowIndex + 1,
      yPosition: nonAudioRows[0].top,
      isValid: !AUDIO_GROUP_TYPES.includes(draggedTrackType),
      trackType: draggedTrackType,
    };
  }

  // Check if dragging below the bottommost non-audio row (but above audio)
  const audioRows = rowBounds.filter((row) =>
    AUDIO_GROUP_TYPES.includes(row.type),
  );
  const lastNonAudioRow =
    nonAudioRows.length > 0 ? nonAudioRows[nonAudioRows.length - 1] : null;
  const firstAudioRow = audioRows.length > 0 ? audioRows[0] : null;

  if (
    lastNonAudioRow &&
    cursorY > lastNonAudioRow.bottom &&
    (!firstAudioRow || cursorY < firstAudioRow.top)
  ) {
    // Dragging in the gap between non-audio and audio groups
    const minRowIndex = Math.min(...nonAudioRows.map((r) => r.rowIndex));
    return {
      type: 'below',
      targetRowIndex: Math.max(0, minRowIndex - 1),
      yPosition: lastNonAudioRow.bottom,
      isValid: !AUDIO_GROUP_TYPES.includes(draggedTrackType),
      trackType: draggedTrackType,
    };
  }

  // Check each row for insertion zones
  for (let i = 0; i < rowBounds.length; i++) {
    const row = rowBounds[i];
    const rowHeight = row.bottom - row.top;
    const upperThreshold = row.top + rowHeight * INSERTION_THRESHOLD;
    const lowerThreshold = row.bottom - rowHeight * INSERTION_THRESHOLD;

    // Check if cursor is in the upper insertion zone
    if (cursorY >= row.top && cursorY <= upperThreshold) {
      // Check if we can insert above this row
      const isAudioRow = AUDIO_GROUP_TYPES.includes(row.type);
      const isDraggingAudio = AUDIO_GROUP_TYPES.includes(draggedTrackType);

      // Prevent non-audio from entering audio zone
      if (isAudioRow && !isDraggingAudio) {
        return null;
      }

      // Prevent audio from leaving audio zone
      if (!isAudioRow && isDraggingAudio) {
        return null;
      }

      return {
        type: i === 0 ? 'above' : 'between',
        targetRowIndex: row.rowIndex + 1,
        yPosition: row.top,
        isValid: true,
        trackType: draggedTrackType,
      };
    }

    // Check if cursor is in the lower insertion zone
    if (cursorY >= lowerThreshold && cursorY <= row.bottom) {
      const nextRow = i < rowBounds.length - 1 ? rowBounds[i + 1] : null;
      const isAudioRow = AUDIO_GROUP_TYPES.includes(row.type);
      const isDraggingAudio = AUDIO_GROUP_TYPES.includes(draggedTrackType);

      // Check boundary conditions
      if (isAudioRow && !isDraggingAudio) {
        return null;
      }
      if (!isAudioRow && isDraggingAudio && !nextRow) {
        return null;
      }

      return {
        type: nextRow ? 'between' : 'below',
        targetRowIndex: row.rowIndex,
        yPosition: row.bottom,
        isValid: true,
        trackType: draggedTrackType,
      };
    }
  }

  return null;
}

/**
 * Check if a track can be moved
 *
 * Base tracks (video-0, audio-0) CAN be moved and reordered.
 * They only differ in that they persist even when empty.
 *
 * @param track - Track to check (unused - all tracks can be moved)
 * @returns True if track can be moved (always true for all tracks)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canMoveTrack(track: VideoTrack): boolean {
  // All tracks can be moved, including base tracks
  // Base tracks are special only in that they persist when empty
  return true;
}

/**
 * Check if a track can be deleted
 *
 * Base tracks (video-0, audio-0) CAN be deleted by the user.
 * They only differ in that they persist even when empty (auto-removal is prevented).
 *
 * @param track - Track to check (unused - all tracks can be deleted)
 * @returns True if track can be deleted (always true for all tracks)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function canDeleteTrack(track: VideoTrack): boolean {
  // All tracks can be deleted, including base tracks
  // Base tracks are special only in that they persist when empty
  return true;
}

/**
 * Get all tracks sorted by their visual order (for rendering)
 * With free reordering, this returns tracks sorted by:
 * 1. Non-audio tracks by trackRowIndex (descending - higher rows on top)
 * 2. Audio tracks by trackRowIndex (descending)
 *
 * @param tracks - All tracks
 * @returns Tracks sorted by visual order
 */
export function getTracksByVisualOrder(tracks: VideoTrack[]): VideoTrack[] {
  const nonAudioTracks = tracks.filter(
    (t) => !AUDIO_GROUP_TYPES.includes(t.type),
  );
  const audioTracks = tracks.filter((t) => AUDIO_GROUP_TYPES.includes(t.type));

  // Sort non-audio tracks by row index (descending)
  const sortedNonAudio = [...nonAudioTracks].sort(
    (a, b) => (b.trackRowIndex ?? 0) - (a.trackRowIndex ?? 0),
  );

  // Sort audio tracks by row index (descending)
  const sortedAudio = [...audioTracks].sort(
    (a, b) => (b.trackRowIndex ?? 0) - (a.trackRowIndex ?? 0),
  );

  // Non-audio tracks first, then audio tracks
  return [...sortedNonAudio, ...sortedAudio];
}
