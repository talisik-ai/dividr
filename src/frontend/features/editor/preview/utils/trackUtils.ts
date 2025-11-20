import { VideoTrack } from '../../stores/videoEditor/index';

/**
 * Utility functions for track management
 */

/**
 * Get z-index based on timeline track row positioning WITH free reordering support
 *
 * With free reordering enabled:
 * - Non-audio tracks: z-index is ONLY determined by trackRowIndex (higher = in front)
 * - Audio tracks: Always render below non-audio tracks, z-index by trackRowIndex within audio group
 *
 * This allows text, image, video, and subtitle tracks to be freely reordered
 * while keeping audio tracks pinned at the bottom.
 */
export function getTrackZIndex(track: VideoTrack): number {
  const rowIndex = track.trackRowIndex ?? 0;

  // Audio tracks: Base z-index 0-999 (always below non-audio)
  if (track.type === 'audio') {
    return rowIndex * 10; // 0, 10, 20, 30...
  }

  // Non-audio tracks: Base z-index 1000+ (always above audio)
  // Higher row index = higher z-index (renders on top)
  return 1000 + rowIndex * 10; // 1000, 1010, 1020, 1030...
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
    const zIndexA = getTrackZIndex(a);
    const zIndexB = getTrackZIndex(b);

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
 * Get active tracks at current frame, sorted by render order (z-index)
 *
 * With free reordering:
 * - Returns tracks sorted by z-index (back to front)
 * - Audio tracks always render below non-audio tracks
 * - Within each group, higher trackRowIndex renders in front
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

  // Sort by z-index (lower z-index = renders behind, higher z-index = renders in front)
  return activeTracks.sort((a, b) => {
    const zIndexA = getTrackZIndex(a);
    const zIndexB = getTrackZIndex(b);
    return zIndexA - zIndexB; // Ascending order
  });
}
