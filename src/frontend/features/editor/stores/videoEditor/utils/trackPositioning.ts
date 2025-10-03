import { VideoTrack } from '../types/track.types';

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

  // Check gaps between tracks
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

  // Check gap before first track
  if (sortedTracks.length > 0) {
    const firstTrack = sortedTracks[0];
    if (firstTrack.startFrame >= duration) {
      const gapPosition = Math.max(0, firstTrack.startFrame - duration);
      if (gapPosition + duration <= firstTrack.startFrame) {
        availablePositions.push(gapPosition);
      }
    }
  }

  // Check gap after last track
  if (sortedTracks.length > 0) {
    const lastTrack = sortedTracks[sortedTracks.length - 1];
    const gapPosition = lastTrack.endFrame;
    availablePositions.push(gapPosition);
  }

  // If no gaps found, place at the end
  if (availablePositions.length === 0) {
    const lastTrack = sortedTracks[sortedTracks.length - 1];
    return lastTrack.endFrame;
  }

  // Find the position closest to the desired position
  let nearestPosition = availablePositions[0];
  let minDistance = Math.abs(availablePositions[0] - desiredStartFrame);

  for (const position of availablePositions) {
    const distance = Math.abs(position - desiredStartFrame);

    // Give slight preference to positions near the playhead
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

export function detectTimelineGaps(tracks: VideoTrack[]) {
  const detectGapsForTracks = (tracksByType: VideoTrack[]) => {
    const sortedTracks = [...tracksByType].sort(
      (a, b) => a.startFrame - b.startFrame,
    );
    const gaps = [];
    let lastEndFrame = 0;

    for (const track of sortedTracks) {
      if (track.startFrame > lastEndFrame) {
        const gapLength = track.startFrame - lastEndFrame;
        gaps.push({
          startFrame: lastEndFrame,
          length: gapLength,
        });
      }
      lastEndFrame = track.endFrame;
    }
    return gaps;
  };

  const videoTracks = tracks.filter((t) => t.type === 'video');
  const audioTracks = tracks.filter((t) => t.type === 'audio');
  const subtitleTracks = tracks.filter((t) => t.type === 'subtitle');

  return {
    video: detectGapsForTracks(videoTracks),
    audio: detectGapsForTracks(audioTracks),
    subtitles: detectGapsForTracks(subtitleTracks),
  };
}
