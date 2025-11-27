import { ClosedCaption, Image, Music, Type, Video } from 'lucide-react';
import React from 'react';
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

  // Convert to array and sort by rowIndex (ascending - audio-0, audio-1, audio-2)
  const audioRowEntries = Array.from(audioRowMap.entries()).sort((a, b) => {
    const aRowId = parseRowId(a[0]);
    const bRowId = parseRowId(b[0]);
    if (!aRowId || !bRowId) return 0;
    return aRowId.rowIndex - bRowId.rowIndex; // Ascending order for audio
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
 * Supports fractional indices for temporary positioning during drag operations
 *
 * @param track - The track to get the row ID for
 * @returns The row ID string (e.g., "video-0", "text-2", "text-1.5")
 */
export function getTrackRowId(track: VideoTrack): string {
  const rowIndex = track.trackRowIndex ?? 0;
  // Keep fractional indices in the row ID
  // This allows proper visual separation during drag operations
  return `${track.type}-${rowIndex}`;
}

/**
 * Parse a row ID into type and index components
 * Now supports fractional indices (e.g., "text-1.5") and negative indices (e.g., "text--0.5")
 *
 * @param rowId - Row ID string (e.g., "video-0", "text-2", "text-1.5", "text--0.5")
 * @returns Object with type and rowIndex, or null if invalid
 */
export function parseRowId(
  rowId: string,
): { type: VideoTrack['type']; rowIndex: number } | null {
  // Support integer, fractional, and negative indices (including negative fractional)
  // Pattern: type-number or type--number (for negatives)
  const match = rowId.match(/^(video|audio|image|text|subtitle)-(-?[\d.]+)$/);
  if (!match) return null;

  const rowIndex = parseFloat(match[2]);
  if (isNaN(rowIndex)) return null;

  return {
    type: match[1] as VideoTrack['type'],
    rowIndex,
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
 * Normalize row indices after drag-drop operation
 * Converts fractional indices to sequential integers while preserving visual order
 * This is the final step after a drag operation completes
 *
 * Key differences from normalizeRowIndices:
 * - Preserves the exact visual order established by fractional indices
 * - Does not enforce hierarchy (assumes it's already correct)
 * - Handles fractional indices properly
 *
 * @param tracks - All tracks (may have fractional trackRowIndex values)
 * @returns Tracks with normalized integer row indices
 */
export function normalizeAfterDrop(tracks: VideoTrack[]): VideoTrack[] {
  console.log(
    `🔄 NORMALIZE: Before -`,
    tracks.map((t) => `${t.type}-${t.trackRowIndex}`).join(', '),
  );

  // Separate tracks into non-audio and audio groups
  const nonAudioTracks = tracks.filter(
    (t) => !AUDIO_GROUP_TYPES.includes(t.type),
  );
  const audioTracks = tracks.filter((t) => AUDIO_GROUP_TYPES.includes(t.type));

  // ========================================
  // NORMALIZE NON-AUDIO TRACKS
  // ========================================

  // Collect all unique indices (including fractional)
  const nonAudioIndices = nonAudioTracks.map((t) => t.trackRowIndex ?? 0);
  const uniqueIndices = [...new Set(nonAudioIndices)].sort((a, b) => a - b);

  // Create mapping: sorted position → new sequential index
  // This preserves relative order while making indices sequential
  const indexMapping = new Map<number, number>();
  uniqueIndices.forEach((oldIndex, position) => {
    indexMapping.set(oldIndex, position);
  });

  console.log(`   Unique indices: [${uniqueIndices.join(', ')}]`);
  console.log(
    `   Index mapping:`,
    Array.from(indexMapping.entries())
      .map(([old, newIdx]) => `${old}→${newIdx}`)
      .join(', '),
  );

  // Apply mapping to non-audio tracks
  const normalizedNonAudio = nonAudioTracks.map((track) => {
    const oldIndex = track.trackRowIndex ?? 0;
    let newIndex = indexMapping.get(oldIndex) ?? 0;

    // CRITICAL: Ensure base video track stays at index 0
    // If video-0 got displaced, we need to adjust
    if (track.type === 'video' && oldIndex === 0) {
      // Check if index 0 is still available
      const indexZeroMapping = indexMapping.get(0);
      if (indexZeroMapping !== undefined) {
        newIndex = indexZeroMapping;
      }
    }

    console.log(`   ${track.type}: ${oldIndex} → ${newIndex}`);
    return { ...track, trackRowIndex: newIndex };
  });

  // ========================================
  // NORMALIZE AUDIO TRACKS (same logic)
  // ========================================

  const audioIndices = audioTracks.map((t) => t.trackRowIndex ?? 0);
  const uniqueAudioIndices = [...new Set(audioIndices)].sort((a, b) => a - b);

  const audioIndexMapping = new Map<number, number>();
  uniqueAudioIndices.forEach((oldIndex, position) => {
    audioIndexMapping.set(oldIndex, position);
  });

  const normalizedAudio = audioTracks.map((track) => {
    const oldIndex = track.trackRowIndex ?? 0;
    const newIndex = audioIndexMapping.get(oldIndex) ?? 0;

    // Ensure base audio track stays at index 0
    if (track.type === 'audio' && oldIndex === 0) {
      return { ...track, trackRowIndex: audioIndexMapping.get(0) ?? 0 };
    }

    return { ...track, trackRowIndex: newIndex };
  });

  const result = [...normalizedNonAudio, ...normalizedAudio];
  console.log(
    `🔄 NORMALIZE: After -`,
    result.map((t) => `${t.type}-${t.trackRowIndex}`).join(', '),
  );

  return result;
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
 * Get the display icon for a row (e.g., "🎬", "🎵", "🖼️", "🔤", "💬")
 *
 * @param type - Media type
 * @param rowIndex - Row index
 * @returns Display icon React node
 */
export function getRowDisplayIcon(
  type: VideoTrack['type'],
  rowIndex: number,
): React.ReactNode {
  const baseIcons: Record<VideoTrack['type'], React.ElementType> = {
    video: Video,
    audio: Music,
    image: Image,
    text: Type,
    subtitle: ClosedCaption,
  };

  const IconComponent = baseIcons[type];

  if (!IconComponent) return null;

  // Create the icon element
  const icon = <IconComponent className="size-4 text-muted-foreground/60" />;

  // Row 0 → icon only
  if (rowIndex === 0) return icon;

  // Higher row → icon + number
  return <span className="flex items-center gap-1">{icon}</span>;
}

/**
 * Insertion Point Detection for CapCut-style track insertion
 */

export interface InsertionPoint {
  /** Type of insertion: above a row, between rows, or below a row */
  type: 'above' | 'between' | 'below' | 'inside';
  /** The row index where insertion will occur (can be fractional for temporary positioning) */
  targetRowIndex: number;
  /** Y position for the insertion line indicator */
  yPosition: number;
  /** Whether this insertion is valid */
  isValid: boolean;
  /** The track type being inserted */
  trackType: VideoTrack['type'];
  /** The existing row being targeted (for inside drops) */
  existingRowId?: string;
}

/**
 * Calculate fractional row index for insertion between two rows
 * Uses array insertion semantics rather than snapping to existing rows
 *
 * CRITICAL FIX: Uses ALL non-audio track indices for visual positioning calculations.
 * This ensures fractional indices account for tracks of OTHER types in the visual ordering,
 * matching the UI's geometric calculations that consider all visible rows.
 *
 * @param tracks - All tracks in the timeline
 * @param trackType - Type of track being inserted
 * @param insertionType - Type of insertion (above, below, between)
 * @param referenceRowIndex - The row index being used as reference
 * @returns Fractional row index for temporary positioning
 */
export function calculateInsertionRowIndex(
  tracks: VideoTrack[],
  trackType: VideoTrack['type'],
  insertionType: 'above' | 'below' | 'between',
  referenceRowIndex: number,
): number {
  const isAudioType = AUDIO_GROUP_TYPES.includes(trackType);

  // CRITICAL FIX: Use ALL relevant track indices for visual positioning
  // This ensures we find the correct adjacent rows regardless of type
  // The UI shows insertion lines based on ALL visible rows, so calculations must match
  const allRelevantIndices = isAudioType
    ? tracks
        .filter((t) => AUDIO_GROUP_TYPES.includes(t.type))
        .map((t) => t.trackRowIndex ?? 0)
    : tracks
        .filter((t) => !AUDIO_GROUP_TYPES.includes(t.type))
        .map((t) => t.trackRowIndex ?? 0);

  // Get unique sorted indices (descending = visual order, higher indices at top)
  const uniqueVisualIndices = [...new Set(allRelevantIndices)].sort(
    (a, b) => b - a,
  );

  // Also get same-type indices for type-specific constraints (like max index)
  const sameTypeIndices = tracks
    .filter((t) => t.type === trackType)
    .map((t) => t.trackRowIndex ?? 0)
    .sort((a, b) => b - a);

  console.log(
    `🎯 INSERTION: dragType=${trackType}, insertionType=${insertionType}, refRow=${referenceRowIndex}`,
  );
  console.log(`   Same-type indices: [${sameTypeIndices}]`);
  console.log(`   All visual indices: [${uniqueVisualIndices}]`);

  // CRITICAL: video-0 is the base track and cannot have videos below it
  const isVideoType = trackType === 'video';
  const minAllowedIndex = isVideoType ? 0 : -Infinity;

  // Handle case when no tracks of this type exist
  if (sameTypeIndices.length === 0) {
    // No tracks of this type exist - use reference position for cross-type reordering
    console.log(
      `   ➡️ No ${trackType} tracks exist, using refRow=${referenceRowIndex}`,
    );
    return referenceRowIndex;
  }

  // For 'above' case, use same-type max to ensure we go above all existing same-type tracks
  const sameTypeMaxIndex = Math.max(...sameTypeIndices);

  // For 'below' and 'between', use ALL visual indices to find correct adjacent positions
  const visualMaxIndex =
    uniqueVisualIndices.length > 0 ? Math.max(...uniqueVisualIndices) : 0;

  switch (insertionType) {
    case 'above': {
      // Inserting above means higher visual position = higher index
      // Use the greater of: same-type max + 1, or reference + 1
      // This ensures the new track appears above both the reference and all same-type tracks
      const result = Math.max(
        sameTypeMaxIndex + 1,
        referenceRowIndex + 1,
        visualMaxIndex + 1,
      );
      console.log(
        `   ➡️ ${result} (above: max(sameType+1=${sameTypeMaxIndex + 1}, ref+1=${referenceRowIndex + 1}, visual+1=${visualMaxIndex + 1}))`,
      );
      return result;
    }

    case 'below': {
      // Inserting below means lower visual position = lower index
      // CRITICAL: Use ALL visual indices to find the next lower row, not just same-type
      const lowerVisualIndices = uniqueVisualIndices.filter(
        (idx) => idx < referenceRowIndex,
      );

      if (lowerVisualIndices.length === 0) {
        // No rows below reference in the visual ordering
        if (referenceRowIndex === 0) {
          // Special case: dragging below row 0
          if (isVideoType) {
            // video-0 is base - cannot go below, place just above
            console.log(`   ➡️ 0.5 (video can't go below video-0)`);
            return 0.5;
          }
          console.log(`   ➡️ -0.5 (below row 0)`);
          return -0.5;
        }
        // Use fractional below reference (halfway to 0 or minAllowed)
        const result = Math.max(minAllowedIndex, referenceRowIndex - 0.5);
        console.log(
          `   ➡️ ${result} (no visual rows below ref=${referenceRowIndex})`,
        );
        return result;
      }

      // Find the next lower index in the visual ordering
      const nextLowerVisualIndex = Math.max(...lowerVisualIndices);
      // Calculate midpoint between reference and the next lower visual row
      const result = Math.max(
        minAllowedIndex,
        referenceRowIndex - (referenceRowIndex - nextLowerVisualIndex) / 2,
      );
      console.log(
        `   ➡️ ${result} (between ref=${referenceRowIndex} and nextLower=${nextLowerVisualIndex})`,
      );
      return result;
    }

    case 'between': {
      // Inserting between two rows - same logic as 'below' since we're inserting
      // in the space between the reference row and the row below it
      const lowerVisualIndices = uniqueVisualIndices.filter(
        (idx) => idx < referenceRowIndex,
      );

      if (lowerVisualIndices.length === 0) {
        // No rows below reference
        if (referenceRowIndex === 0) {
          // Special case: inserting below row 0
          if (isVideoType) {
            // video-0 is base - cannot go below
            console.log(`   ➡️ 0.5 (video can't go below video-0)`);
            return 0.5;
          }
          console.log(`   ➡️ -0.5 (between, below row 0)`);
          return -0.5;
        }
        // Use fractional below reference
        const result = Math.max(minAllowedIndex, referenceRowIndex - 0.5);
        console.log(
          `   ➡️ ${result} (between, no visual rows below ref=${referenceRowIndex})`,
        );
        return result;
      }

      const nextLowerVisualIndex = Math.max(...lowerVisualIndices);
      const result = Math.max(
        minAllowedIndex,
        referenceRowIndex - (referenceRowIndex - nextLowerVisualIndex) / 2,
      );
      console.log(
        `   ➡️ ${result} (between ref=${referenceRowIndex} and nextLower=${nextLowerVisualIndex})`,
      );
      return result;
    }

    default:
      return referenceRowIndex;
  }
}

/**
 * Detect insertion point based on cursor Y position relative to existing rows
 * Uses the visual row bounds directly to compute target indices, ensuring
 * UI indicator and internal calculations match exactly.
 *
 * CRITICAL: This function uses rowBounds (which represents the visual ordering)
 * to determine insertion positions. The rowBounds array is sorted top-to-bottom
 * visually, with higher rowIndex values at the top (descending order).
 *
 * @param cursorY - Y position of cursor in timeline coordinates
 * @param rowBounds - Array of row boundaries with their metadata (sorted top-to-bottom visually)
 * @param draggedTrackType - Type of track being dragged
 * @param tracks - All tracks (needed to calculate fractional indices)
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _tracks: VideoTrack[],
): InsertionPoint | null {
  if (rowBounds.length === 0) return null;

  // Define insertion threshold (10% of row height for insertion zones)
  // 80% in the middle is the "inside" zone for merging with existing row
  const INSERTION_THRESHOLD = 0.1;

  const isDraggingAudio = AUDIO_GROUP_TYPES.includes(draggedTrackType);
  const isVideoType = draggedTrackType === 'video';

  // Separate rows by type for boundary checks
  const nonAudioRows = rowBounds.filter(
    (row) => !AUDIO_GROUP_TYPES.includes(row.type),
  );
  const audioRows = rowBounds.filter((row) =>
    AUDIO_GROUP_TYPES.includes(row.type),
  );

  // ========================================
  // CASE 1: Dragging above the topmost non-audio row
  // ========================================
  if (nonAudioRows.length > 0 && cursorY < nonAudioRows[0].top) {
    if (isDraggingAudio) return null; // Audio can't go above non-audio

    // Target index: above the highest visual index
    const maxVisualIndex = Math.max(...nonAudioRows.map((r) => r.rowIndex));
    const targetIndex = maxVisualIndex + 1;

    console.log(
      `🎯 DETECT: Above topmost → targetIndex=${targetIndex} (max visual=${maxVisualIndex})`,
    );

    return {
      type: 'above',
      targetRowIndex: targetIndex,
      yPosition: nonAudioRows[0].top,
      isValid: true,
      trackType: draggedTrackType,
    };
  }

  // ========================================
  // CASE 2: Dragging below the bottommost non-audio row (but above audio)
  // ========================================
  const lastNonAudioRow =
    nonAudioRows.length > 0 ? nonAudioRows[nonAudioRows.length - 1] : null;
  const firstAudioRow = audioRows.length > 0 ? audioRows[0] : null;

  if (
    lastNonAudioRow &&
    cursorY > lastNonAudioRow.bottom &&
    (!firstAudioRow || cursorY < firstAudioRow.top)
  ) {
    if (isDraggingAudio) return null; // Audio should go to audio zone

    // Target index: below the lowest visual non-audio index
    const minVisualIndex = Math.min(...nonAudioRows.map((r) => r.rowIndex));

    // For video, can't go below 0
    let targetIndex: number;
    if (minVisualIndex === 0) {
      // Already at the bottom, use fractional to indicate "just above" the floor
      targetIndex = isVideoType ? 0.5 : -0.5;
    } else {
      // Halfway between min and 0 (or next lower)
      targetIndex = minVisualIndex / 2;
    }

    console.log(
      `🎯 DETECT: Below bottommost non-audio → targetIndex=${targetIndex} (min visual=${minVisualIndex})`,
    );

    return {
      type: 'below',
      targetRowIndex: targetIndex,
      yPosition: lastNonAudioRow.bottom,
      isValid: !isDraggingAudio,
      trackType: draggedTrackType,
    };
  }

  // ========================================
  // CASE 3: Check each row for insertion zones
  // ========================================
  for (let i = 0; i < rowBounds.length; i++) {
    const row = rowBounds[i];
    const rowHeight = row.bottom - row.top;
    const upperThreshold = row.top + rowHeight * INSERTION_THRESHOLD;
    const lowerThreshold = row.bottom - rowHeight * INSERTION_THRESHOLD;

    const isAudioRow = AUDIO_GROUP_TYPES.includes(row.type);

    // ----------------------------------------
    // UPPER ZONE (top 10%): Insert ABOVE this row
    // ----------------------------------------
    if (cursorY >= row.top && cursorY <= upperThreshold) {
      // Prevent audio/non-audio boundary violations
      if (isAudioRow && !isDraggingAudio) return null;
      if (!isAudioRow && isDraggingAudio) return null;

      // Calculate target index based on visual neighbors
      let targetIndex: number;

      if (i === 0) {
        // This is the topmost row - insert above it
        targetIndex = row.rowIndex + 1;
      } else {
        // There's a row above - insert between row[i-1] and row[i]
        const aboveRow = rowBounds[i - 1];
        // Midpoint between the row above and this row
        const midpoint = (aboveRow.rowIndex + row.rowIndex) / 2;

        // CRITICAL FIX: If rows have same or very close indices (midpoint equals either),
        // create a fractional index ABOVE the current row to ensure movement happens
        if (midpoint <= row.rowIndex) {
          // Same indices or midpoint would be at/below current row
          // Create fractional index above the current row
          targetIndex = row.rowIndex + 0.5;
        } else {
          targetIndex = midpoint;
        }
      }

      console.log(
        `🎯 DETECT: Upper zone of row ${row.rowId} → targetIndex=${targetIndex}`,
      );

      return {
        type: i === 0 ? 'above' : 'between',
        targetRowIndex: targetIndex,
        yPosition: row.top,
        isValid: true,
        trackType: draggedTrackType,
      };
    }

    // ----------------------------------------
    // MIDDLE ZONE (80%): Merge INTO this row (same type only)
    // ----------------------------------------
    if (cursorY > upperThreshold && cursorY < lowerThreshold) {
      // Type must match for "inside" drops
      if (row.type !== draggedTrackType) {
        continue; // Skip to next row - can't merge different types
      }

      // Prevent boundary violations
      if (isAudioRow && !isDraggingAudio) return null;
      if (!isAudioRow && isDraggingAudio) return null;

      console.log(
        `🎯 DETECT: Inside row ${row.rowId} → targetIndex=${row.rowIndex}`,
      );

      return {
        type: 'inside',
        targetRowIndex: row.rowIndex,
        yPosition: row.top + rowHeight / 2,
        isValid: true,
        trackType: draggedTrackType,
        existingRowId: row.rowId,
      };
    }

    // ----------------------------------------
    // LOWER ZONE (bottom 10%): Insert BELOW this row
    // ----------------------------------------
    if (cursorY >= lowerThreshold && cursorY <= row.bottom) {
      const nextRow = i < rowBounds.length - 1 ? rowBounds[i + 1] : null;

      // Prevent boundary violations
      if (isAudioRow && !isDraggingAudio) return null;
      if (!isAudioRow && isDraggingAudio && !nextRow) return null;

      // Calculate target index based on visual neighbors
      let targetIndex: number;

      if (!nextRow) {
        // This is the bottommost row - insert below it
        if (row.rowIndex === 0) {
          // At floor, use fractional
          targetIndex =
            isVideoType && draggedTrackType === 'video' ? 0.5 : -0.5;
        } else {
          targetIndex = row.rowIndex / 2;
        }
      } else {
        // There's a row below - insert between row[i] and row[i+1]
        // Midpoint between this row and the row below
        const midpoint = (row.rowIndex + nextRow.rowIndex) / 2;

        // CRITICAL FIX: If rows have same or very close indices (midpoint equals either),
        // create a fractional index BELOW the current row to ensure movement happens
        if (midpoint >= row.rowIndex) {
          // Same indices or midpoint would be at/above current row
          // Create fractional index below the current row (but above the next row conceptually)
          // Use a small offset below current row
          targetIndex = row.rowIndex - 0.5;

          // Ensure we don't go below minAllowed for video
          if (isVideoType && draggedTrackType === 'video' && targetIndex < 0) {
            targetIndex = 0.5; // Stay just above base
          }
        } else {
          targetIndex = midpoint;
        }
      }

      console.log(
        `🎯 DETECT: Lower zone of row ${row.rowId} → targetIndex=${targetIndex}`,
      );

      return {
        type: nextRow ? 'between' : 'below',
        targetRowIndex: targetIndex,
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
