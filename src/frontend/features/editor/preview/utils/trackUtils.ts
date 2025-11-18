import { VideoTrack } from '../../stores/videoEditor/index';
import { TRACK_ROW_ORDER, Z_INDEX_SPACING } from '../core/constants';

/**
 * Utility functions for track management
 */

/**
 * Get z-index based on timeline track row positioning
 * Timeline visual order (top to bottom): Text → Subtitle → Image → Video → Audio
 * Rendering order (bottom to top): Audio → Video → Image → Subtitle → Text
 * Topmost tracks should have HIGHEST z-index to render on top
 */
export function getTrackZIndex(
  track: VideoTrack,
  allTracks: VideoTrack[],
): number {
  // Base z-index for each track type (500 units apart for fine-grained control)
  const baseZIndex = TRACK_ROW_ORDER[track.type] * Z_INDEX_SPACING;

  // Find track position within all tracks of the same type
  // Later tracks in the array (imported later) should render on top
  const sameTypeTracks = allTracks.filter((t) => t.type === track.type);
  const indexWithinType = sameTypeTracks.findIndex((t) => t.id === track.id);

  // Add the within-type index for fine-grained ordering
  // This ensures tracks imported later appear on top of earlier tracks of the same type
  return baseZIndex + (indexWithinType !== -1 ? indexWithinType : 0);
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
 * Get active tracks at current frame
 */
export function getActiveTracksAtFrame(
  tracks: VideoTrack[],
  currentFrame: number,
  trackType: VideoTrack['type'],
): VideoTrack[] {
  return tracks.filter(
    (track) =>
      track.type === trackType &&
      track.visible &&
      currentFrame >= track.startFrame &&
      currentFrame < track.endFrame,
  );
}
