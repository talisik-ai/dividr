import { SnapPoint } from '../types/timeline.types';
import { VideoTrack } from '../types/track.types';
import { SNAP_THRESHOLD } from './constants';

export function findSnapPoints(
  currentFrame: number,
  tracks: VideoTrack[],
  inPoint?: number,
  outPoint?: number,
  excludeTrackId?: string,
): SnapPoint[] {
  const snapPoints: SnapPoint[] = [];

  snapPoints.push({
    frame: currentFrame,
    type: 'playhead',
  });

  if (inPoint !== undefined) {
    snapPoints.push({
      frame: inPoint,
      type: 'in-point',
    });
  }
  if (outPoint !== undefined) {
    snapPoints.push({
      frame: outPoint,
      type: 'out-point',
    });
  }

  tracks.forEach((track) => {
    if (track.visible && track.id !== excludeTrackId) {
      snapPoints.push({
        frame: track.startFrame,
        type: 'track-start',
        trackId: track.id,
      });
      snapPoints.push({
        frame: track.endFrame,
        type: 'track-end',
        trackId: track.id,
      });
    }
  });

  return snapPoints;
}

export function findNearestSnapPoint(
  targetFrame: number,
  snapPoints: SnapPoint[],
  threshold: number = SNAP_THRESHOLD,
  excludeTrackId?: string,
): number | null {
  let nearestSnapPoint: SnapPoint | null = null;
  let minDistance = threshold + 1;

  for (const snapPoint of snapPoints) {
    if (excludeTrackId && snapPoint.trackId === excludeTrackId) {
      continue;
    }

    const distance = Math.abs(snapPoint.frame - targetFrame);
    if (distance <= threshold && distance < minDistance) {
      nearestSnapPoint = snapPoint;
      minDistance = distance;
    }
  }

  return nearestSnapPoint ? nearestSnapPoint.frame : null;
}

export function findDirectionalSnapPoint(
  targetFrame: number,
  originalFrame: number,
  snapPoints: SnapPoint[],
  threshold: number = SNAP_THRESHOLD,
  excludeTrackId?: string,
): number | null {
  const dragDirection = targetFrame > originalFrame ? 1 : -1;
  const dragDistance = Math.abs(targetFrame - originalFrame);

  if (dragDistance < 2) {
    return null;
  }

  let nearestSnapPoint: SnapPoint | null = null;
  let minDistance = threshold + 1;

  for (const snapPoint of snapPoints) {
    if (excludeTrackId && snapPoint.trackId === excludeTrackId) {
      continue;
    }

    const distance = Math.abs(snapPoint.frame - targetFrame);
    const snapDirection = snapPoint.frame > originalFrame ? 1 : -1;

    if (
      distance <= threshold &&
      distance < minDistance &&
      snapDirection === dragDirection &&
      snapPoint.frame !== originalFrame
    ) {
      nearestSnapPoint = snapPoint;
      minDistance = distance;
    }
  }

  return nearestSnapPoint ? nearestSnapPoint.frame : null;
}

export function findNearestSnapPointForDrag(
  targetFrame: number,
  snapPoints: SnapPoint[],
  threshold: number = SNAP_THRESHOLD,
  excludeTrackId?: string,
  currentFrame?: number,
): number | null {
  let nearestSnapPoint: SnapPoint | null = null;
  let minDistance = threshold + 1;
  let playheadSnapPoint: SnapPoint | null = null;
  let playheadDistance = threshold + 1;

  for (const snapPoint of snapPoints) {
    if (excludeTrackId && snapPoint.trackId === excludeTrackId) {
      continue;
    }

    if (currentFrame !== undefined && snapPoint.frame === currentFrame) {
      continue;
    }

    const distance = Math.abs(snapPoint.frame - targetFrame);

    if (snapPoint.type === 'playhead' && distance <= threshold) {
      playheadSnapPoint = snapPoint;
      playheadDistance = distance;
    }

    if (distance <= threshold && distance < minDistance) {
      nearestSnapPoint = snapPoint;
      minDistance = distance;
    }
  }

  if (playheadSnapPoint && playheadDistance <= threshold) {
    if (playheadDistance <= 2 || playheadDistance <= minDistance) {
      return playheadSnapPoint.frame;
    }
  }

  return nearestSnapPoint ? nearestSnapPoint.frame : null;
}

export function findStableSnapPoint(
  targetFrame: number,
  snapPoints: SnapPoint[],
  threshold: number = SNAP_THRESHOLD,
  excludeTrackId?: string,
  currentFrame?: number,
  lastSnappedFrame?: number,
): number | null {
  let nearestSnapPoint: SnapPoint | null = null;
  let minDistance = threshold + 1;
  let playheadSnapPoint: SnapPoint | null = null;
  let playheadDistance = threshold + 1;

  for (const snapPoint of snapPoints) {
    if (excludeTrackId && snapPoint.trackId === excludeTrackId) {
      continue;
    }

    if (currentFrame !== undefined && snapPoint.frame === currentFrame) {
      continue;
    }

    const distance = Math.abs(snapPoint.frame - targetFrame);

    if (snapPoint.type === 'playhead' && distance <= threshold) {
      playheadSnapPoint = snapPoint;
      playheadDistance = distance;
    }

    if (distance <= threshold && distance < minDistance) {
      nearestSnapPoint = snapPoint;
      minDistance = distance;
    }
  }

  if (lastSnappedFrame !== undefined) {
    const lastSnapDistance = Math.abs(lastSnappedFrame - targetFrame);
    if (lastSnapDistance <= threshold * 0.8) {
      return lastSnappedFrame;
    }
  }

  if (playheadSnapPoint && playheadDistance <= threshold) {
    if (playheadDistance <= 2 || playheadDistance <= minDistance) {
      return playheadSnapPoint.frame;
    }
  }

  return nearestSnapPoint ? nearestSnapPoint.frame : null;
}

export function findBufferedSnapPoint(
  targetFrame: number,
  snapPoints: SnapPoint[],
  threshold: number = SNAP_THRESHOLD,
  excludeTrackId?: string,
  currentFrame?: number,
  lastSnappedFrame?: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _isApproaching?: boolean,
): number | null {
  let nearestSnapPoint: SnapPoint | null = null;
  let minDistance = threshold + 1;
  let playheadSnapPoint: SnapPoint | null = null;
  let playheadDistance = threshold + 1;

  const HYSTERESIS_BUFFER = Math.max(2, Math.round(threshold * 0.6));
  const releaseThreshold = threshold + HYSTERESIS_BUFFER;

  for (const snapPoint of snapPoints) {
    if (excludeTrackId && snapPoint.trackId === excludeTrackId) {
      continue;
    }

    if (currentFrame !== undefined && snapPoint.frame === currentFrame) {
      continue;
    }

    const distance = Math.abs(snapPoint.frame - targetFrame);

    if (snapPoint.type === 'playhead' && distance <= threshold) {
      playheadSnapPoint = snapPoint;
      playheadDistance = distance;
    }

    if (distance <= threshold && distance < minDistance) {
      nearestSnapPoint = snapPoint;
      minDistance = distance;
    }
  }

  if (lastSnappedFrame !== undefined) {
    const lastSnapDistance = Math.abs(lastSnappedFrame - targetFrame);

    if (lastSnapDistance <= releaseThreshold) {
      return lastSnappedFrame;
    }
  }

  if (nearestSnapPoint && minDistance <= threshold) {
    if (playheadSnapPoint && playheadDistance <= threshold) {
      return playheadSnapPoint.frame;
    }

    return nearestSnapPoint.frame;
  }

  return null;
}
