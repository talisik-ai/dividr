import { VideoTrack } from '../types';
import { TRACK_COLORS } from './constants';

export const getTrackColor = (index: number): string =>
  TRACK_COLORS[index % TRACK_COLORS.length];

export function findNearestAvailablePosition(
  desiredStartFrame: number,
  duration: number,
  existingTracks: VideoTrack[],
  playheadFrame?: number,
): number {
  const desiredEndFrame = desiredStartFrame + duration;

  const sortedTracks = [...existingTracks].sort(
    (a, b) => a.startFrame - b.startFrame,
  );

  const hasConflict = sortedTracks.some(
    (track) =>
      desiredStartFrame < track.endFrame && desiredEndFrame > track.startFrame,
  );

  if (!hasConflict) {
    return Math.max(0, desiredStartFrame);
  }

  const availablePositions: number[] = [];

  for (let i = 0; i < sortedTracks.length - 1; i++) {
    const currentTrack = sortedTracks[i];
    const nextTrack = sortedTracks[i + 1];
    const gapStart = currentTrack.endFrame;
    const gapEnd = nextTrack.startFrame;
    const gapSize = gapEnd - gapStart;

    if (gapSize >= duration) {
      let gapPosition = Math.max(gapStart, desiredStartFrame);

      if (desiredStartFrame < gapStart) {
        gapPosition = gapStart;
      }

      if (desiredStartFrame > gapEnd - duration) {
        gapPosition = gapEnd - duration;
      }

      if (gapPosition >= gapStart && gapPosition + duration <= gapEnd) {
        availablePositions.push(gapPosition);
      }
    }
  }

  if (sortedTracks.length > 0) {
    const firstTrack = sortedTracks[0];
    if (firstTrack.startFrame >= duration) {
      const gapPosition = Math.max(0, firstTrack.startFrame - duration);
      if (gapPosition + duration <= firstTrack.startFrame) {
        availablePositions.push(gapPosition);
      }
    }
  }

  if (sortedTracks.length > 0) {
    const lastTrack = sortedTracks[sortedTracks.length - 1];
    const gapPosition = lastTrack.endFrame;
    availablePositions.push(gapPosition);
  }

  if (availablePositions.length === 0) {
    const lastTrack = sortedTracks[sortedTracks.length - 1];
    const fallbackPosition = lastTrack.endFrame;
    return fallbackPosition;
  }

  let nearestPosition = availablePositions[0];
  let minDistance = Math.abs(availablePositions[0] - desiredStartFrame);

  for (const position of availablePositions) {
    const distance = Math.abs(position - desiredStartFrame);

    let adjustedDistance = distance;
    if (playheadFrame !== undefined) {
      const playheadDistance = Math.abs(position - playheadFrame);
      if (playheadDistance < 10) {
        adjustedDistance = distance * 0.8;
      }
    }

    if (adjustedDistance < minDistance) {
      nearestPosition = position;
      minDistance = adjustedDistance;
    }
  }

  return nearestPosition;
}

/**
 * Find the end frame of the last clip of a given type across all rows
 * This enables consecutive clip placement like professional editors (Premiere Pro, CapCut)
 *
 * @param tracks - All tracks in the timeline
 * @param type - The track type to search for ('video', 'audio', etc.)
 * @returns The end frame of the last clip, or 0 if no clips of this type exist
 */
export function findLastEndFrameForType(
  tracks: VideoTrack[],
  type: VideoTrack['type'],
): number {
  const tracksOfType = tracks.filter((t) => t.type === type);

  if (tracksOfType.length === 0) {
    return 0;
  }

  // Find the maximum end frame across ALL clips of this type
  return Math.max(...tracksOfType.map((t) => t.endFrame));
}
