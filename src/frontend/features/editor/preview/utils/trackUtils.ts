import { VideoTrack } from '../../stores/videoEditor/index';
import { TRACK_ROW_ORDER, Z_INDEX_SPACING } from '../core/constants';

/**
 * Utility functions for track management
 */

/**
 * Get z-index based on timeline track row positioning WITH trackRowIndex support
 * Timeline visual order (top to bottom): Text → Subtitle → Image → Video → Audio
 * Rendering order (bottom to top): Audio → Video → Image → Subtitle → Text
 * 
 * NEW: Higher trackRowIndex = renders in FRONT (on top)
 * Lower trackRowIndex = renders BEHIND (below)
 * 
 * This replaces the old import-order based layering with proper row-based layering
 */
export function getTrackZIndex(
  track: VideoTrack,
  allTracks: VideoTrack[],
): number {
  // Base z-index for each track type (500 units apart for fine-grained control)
  const baseZIndex = TRACK_ROW_ORDER[track.type] * Z_INDEX_SPACING;

  // NEW: Use trackRowIndex for within-type ordering
  // Higher row index = higher z-index (renders on top)
  const rowIndex = track.trackRowIndex ?? 0;

  // Add the row index multiplied by a factor to ensure proper spacing
  // This ensures tracks in higher rows appear on top of tracks in lower rows
  return baseZIndex + (rowIndex * 10);
}

/**
 * Sort tracks for rendering based on z-index (trackRowIndex + type)
 * This is the SOC helper for preview rendering
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
    const zIndexA = getTrackZIndex(a, tracks);
    const zIndexB = getTrackZIndex(b, tracks);
    
    // Sort ascending: lower z-index first (renders behind)
    return zIndexA - zIndexB;
  });
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
 * Get active tracks at current frame, sorted by render order (trackRowIndex)
 * 
 * Returns tracks sorted from back to front:
 * - Lower trackRowIndex first (renders behind)
 * - Higher trackRowIndex last (renders in front)
 */
export function getActiveTracksAtFrame(
  tracks: VideoTrack[],
  currentFrame: number,
  trackType: VideoTrack['type'],
): VideoTrack[] {
  // Filter active tracks of the specified type
  const activeTracks = tracks.filter(
    (track) =>
      track.type === trackType &&
      track.visible &&
      currentFrame >= track.startFrame &&
      currentFrame < track.endFrame,
  );

  // Sort by trackRowIndex (lower index = renders behind, higher index = renders in front)
  return activeTracks.sort((a, b) => {
    const rowIndexA = a.trackRowIndex ?? 0;
    const rowIndexB = b.trackRowIndex ?? 0;
    return rowIndexA - rowIndexB; // Ascending order
  });
}
