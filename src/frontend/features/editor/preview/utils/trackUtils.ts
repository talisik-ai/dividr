import { VideoTrack } from '../../stores/videoEditor/index';

/**
 * Utility functions for track management
 *
 * UNIFIED Z-INDEX SYSTEM FOR DYNAMIC TRACK ORDERING
 *
 * The preview uses a unified z-index system that matches the timeline's dynamic track rows.
 * This enables cross-type layering where any visual track type (video, image, text, subtitle)
 * can be positioned above or below any other visual track based on trackRowIndex.
 *
 * Key principles:
 * 1. Audio tracks are non-visual and don't affect preview stacking (z-index 0-99)
 * 2. Visual tracks (video, image, text, subtitle) share a unified z-index space (1000+)
 * 3. Higher trackRowIndex = higher z-index = renders in front
 * 4. All visual track types can be freely reordered relative to each other
 */

/**
 * Audio track types (non-visual, always at bottom of z-index stack)
 */
const AUDIO_TYPES: VideoTrack['type'][] = ['audio'];

/**
 * Visual track types that participate in unified z-index ordering
 */
const VISUAL_TYPES: VideoTrack['type'][] = [
  'video',
  'image',
  'text',
  'subtitle',
];

/**
 * Get z-index based on timeline track row positioning WITH unified cross-type layering
 *
 * With unified ordering:
 * - Visual tracks (video, image, text, subtitle): z-index determined ONLY by trackRowIndex
 * - Audio tracks: Always z-index 0-99 (non-visual, doesn't affect preview)
 *
 * This enables true cross-type layering where a text can appear behind an image,
 * or a video overlay can appear above text, based purely on trackRowIndex.
 *
 * @param track - The track to get z-index for
 * @param allTracks - Optional: all tracks for computing relative position (for future use)
 * @returns z-index value for CSS positioning
 */
export function getTrackZIndex(
  track: VideoTrack,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allTracks?: VideoTrack[],
): number {
  const rowIndex = track.trackRowIndex ?? 0;

  // Audio tracks: Base z-index 0-99 (non-visual, doesn't affect preview stacking)
  if (AUDIO_TYPES.includes(track.type)) {
    return Math.max(0, Math.min(99, rowIndex * 10)); // 0, 10, 20... capped at 99
  }

  // Visual tracks: Unified z-index space starting at 1000
  // Higher row index = higher z-index = renders on top
  // Base of 1000 ensures all visual tracks are above audio
  // Multiply by 10 to allow room for fractional indices during drag operations
  return 1000 + Math.round(rowIndex * 10);
}

/**
 * Sort tracks for rendering based on z-index (trackRowIndex)
 * This is the primary helper for preview rendering order
 *
 * Returns tracks sorted by render order (back to front):
 * - Lower z-index first (renders behind)
 * - Higher z-index last (renders in front)
 *
 * @param tracks - All tracks to sort
 * @returns Sorted array of tracks (back to front render order)
 */
export function getSortedRenderableTracks(tracks: VideoTrack[]): VideoTrack[] {
  return [...tracks].sort((a, b) => {
    const zIndexA = getTrackZIndex(a);
    const zIndexB = getTrackZIndex(b);

    // Sort ascending: lower z-index first (renders behind)
    return zIndexA - zIndexB;
  });
}

/**
 * Get all visual tracks sorted by render order (back to front)
 * Excludes audio tracks since they are non-visual
 *
 * @param tracks - All tracks
 * @param currentFrame - Current playhead position
 * @returns Visual tracks sorted by z-index (ascending)
 */
export function getVisualTracksForRendering(
  tracks: VideoTrack[],
  currentFrame: number,
): VideoTrack[] {
  // Filter to only visual tracks that are visible and active at current frame
  const activeVisualTracks = tracks.filter(
    (track) =>
      VISUAL_TYPES.includes(track.type) &&
      track.visible &&
      currentFrame >= track.startFrame &&
      currentFrame < track.endFrame,
  );

  // Sort by z-index (ascending: lower z-index = renders behind)
  return activeVisualTracks.sort((a, b) => {
    const zIndexA = getTrackZIndex(a);
    const zIndexB = getTrackZIndex(b);
    return zIndexA - zIndexB;
  });
}

/**
 * Check if a track type is visual (participates in preview rendering)
 *
 * @param type - Track type to check
 * @returns True if the track type is visual
 */
export function isVisualTrackType(type: VideoTrack['type']): boolean {
  return VISUAL_TYPES.includes(type);
}

/**
 * Get the maximum z-index among a set of tracks
 * Useful for positioning overlay containers
 *
 * @param tracks - Tracks to check
 * @returns Maximum z-index, or 0 if no tracks
 */
export function getMaxZIndex(tracks: VideoTrack[]): number {
  if (tracks.length === 0) return 0;
  return Math.max(...tracks.map((t) => getTrackZIndex(t)));
}

/**
 * Check if a linked audio track has a position gap from its video counterpart
 */
export function hasAudioPositionGap(
  audioTrack: VideoTrack,
  allTracks: VideoTrack[],
): boolean {
  if (!audioTrack.isLinked || !audioTrack.linkedTrackId) return false;

  const linkedVideoTrack = allTracks.find(
    (t) => t.id === audioTrack.linkedTrackId,
  );
  if (!linkedVideoTrack) return false;

  // Check if there's a significant gap between the linked tracks
  const gap = Math.abs(audioTrack.startFrame - linkedVideoTrack.startFrame);
  return gap > 0; // Any gap means they should be treated independently for preview
}

/**
 * Check if a linked video track has a position gap from its audio counterpart
 */
export function hasVideoPositionGap(
  videoTrack: VideoTrack,
  allTracks: VideoTrack[],
): boolean {
  if (!videoTrack.isLinked || !videoTrack.linkedTrackId) return false;

  const linkedAudioTrack = allTracks.find(
    (t) => t.id === videoTrack.linkedTrackId,
  );
  if (!linkedAudioTrack) return false;

  // Check if there's a significant gap between the linked tracks
  const gap = Math.abs(videoTrack.startFrame - linkedAudioTrack.startFrame);
  return gap > 0; // Any gap means they should be treated independently for preview
}

/**
 * Get active tracks at current frame, sorted by render order (z-index)
 *
 * With unified ordering:
 * - Returns tracks sorted by z-index (back to front)
 * - All visual track types share the same z-index space
 * - Higher trackRowIndex renders in front, regardless of track type
 *
 * @param tracks - All tracks
 * @param currentFrame - Current playhead position
 * @param trackType - Optional: filter by specific track type
 * @returns Active tracks sorted by z-index (ascending)
 */
export function getActiveTracksAtFrame(
  tracks: VideoTrack[],
  currentFrame: number,
  trackType?: VideoTrack['type'],
): VideoTrack[] {
  // Filter active tracks (optionally by type)
  const activeTracks = tracks.filter(
    (track) =>
      (trackType === undefined || track.type === trackType) &&
      track.visible &&
      currentFrame >= track.startFrame &&
      currentFrame < track.endFrame,
  );

  // Sort by z-index (lower z-index = renders behind, higher z-index = renders in front)
  return activeTracks.sort((a, b) => {
    const zIndexA = getTrackZIndex(a);
    const zIndexB = getTrackZIndex(b);
    return zIndexA - zIndexB; // Ascending order
  });
}

/**
 * Get all active visual tracks at current frame, sorted by unified render order
 * This is the primary function for the unified overlay renderer
 *
 * @param tracks - All tracks
 * @param currentFrame - Current playhead position
 * @returns All active visual tracks sorted by z-index (back to front)
 */
export function getActiveVisualTracksAtFrame(
  tracks: VideoTrack[],
  currentFrame: number,
): VideoTrack[] {
  return getVisualTracksForRendering(tracks, currentFrame);
}
