/**
 * FrameResolver - Pure function service for deterministic frame resolution.
 *
 * Determines which clips are visible at any timeline frame and calculates
 * source positions. Core formula: sourceFrame = timelineFrame - startFrame + inFrame
 */

import { VideoTrack } from '../../stores/videoEditor/index';

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  width: number;
  height: number;
}

export interface FrameRequest {
  clipId: string;
  sourceId: string;
  sourceUrl: string;
  sourceFrame: number;
  sourceTime: number;
  trackRowIndex: number;
  layer: number;
  opacity: number;
  transform: Transform;
  visible: boolean;
  track: VideoTrack;
}

export interface AudioFrameRequest {
  clipId: string;
  sourceId: string;
  sourceUrl: string;
  sourceTime: number;
  volume: number;
  muted: boolean;
  trackRowIndex: number;
  track: VideoTrack;
}

export interface ClipMetadata {
  clipId: string;
  sourceId: string;
  sourceUrl: string;
  inFrame: number;
  outFrame: number;
  timelineStartFrame: number;
  timelineEndFrame: number;
  trackRowIndex: number;
  layer: number;
  visible: boolean;
  opacity: number;
  transform: Transform;
  track: VideoTrack;
}

export const normalizeSourceId = (url: string | undefined | null): string => {
  if (!url) return '';
  try {
    if (url.startsWith('blob:')) return url;
    const parsed = new URL(url, window.location.origin);
    return decodeURIComponent(parsed.pathname);
  } catch {
    return url;
  }
};

export const getVideoSource = (
  track: VideoTrack | undefined,
): string | undefined => {
  if (!track) return undefined;
  if (track.previewUrl?.trim()) return track.previewUrl;
  if (track.source?.trim()) {
    const src = track.source.trim();
    if (src.startsWith('http://') || src.startsWith('https://')) return src;
    return `http://localhost:3001/${encodeURIComponent(src)}`;
  }
  return undefined;
};

export const extractClipMetadata = (
  track: VideoTrack,
  fps: number,
): ClipMetadata | null => {
  const sourceUrl = getVideoSource(track);
  if (!sourceUrl) return null;

  const sourceId = normalizeSourceId(sourceUrl);
  const durationFrames = track.endFrame - track.startFrame;
  const inFrame = Math.floor((track.sourceStartTime || 0) * fps);
  const outFrame = inFrame + durationFrames;

  const transform: Transform = track.textTransform || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    width: track.width || 1920,
    height: track.height || 1080,
  };

  const opacity =
    track.textStyle?.opacity !== undefined ? track.textStyle.opacity / 100 : 1;

  return {
    clipId: track.id,
    sourceId,
    sourceUrl,
    inFrame,
    outFrame,
    timelineStartFrame: track.startFrame,
    timelineEndFrame: track.endFrame,
    trackRowIndex: track.trackRowIndex ?? 0,
    layer: track.layer ?? 0,
    visible: track.visible,
    opacity,
    transform,
    track,
  };
};

export const calculateSourceFrame = (
  timelineFrame: number,
  clip: ClipMetadata,
): number => {
  const relativeFrame = timelineFrame - clip.timelineStartFrame;
  return clip.inFrame + relativeFrame;
};

export const calculateSourceTime = (
  timelineFrame: number,
  clip: ClipMetadata,
  fps: number,
): number => {
  const sourceFrame = calculateSourceFrame(timelineFrame, clip);
  return sourceFrame / fps;
};

export const isClipVisibleAtFrame = (
  timelineFrame: number,
  clip: ClipMetadata,
): boolean => {
  return (
    clip.visible &&
    timelineFrame >= clip.timelineStartFrame &&
    timelineFrame < clip.timelineEndFrame
  );
};

export const resolveFrameRequests = (
  timelineFrame: number,
  tracks: VideoTrack[],
  fps: number,
): FrameRequest[] => {
  const requests: FrameRequest[] = [];
  const videoTracks = tracks.filter((t) => t.type === 'video');

  for (const track of videoTracks) {
    const clip = extractClipMetadata(track, fps);
    if (!clip) continue;
    if (!isClipVisibleAtFrame(timelineFrame, clip)) continue;

    const sourceFrame = calculateSourceFrame(timelineFrame, clip);
    const sourceTime = sourceFrame / fps;

    requests.push({
      clipId: clip.clipId,
      sourceId: clip.sourceId,
      sourceUrl: clip.sourceUrl,
      sourceFrame,
      sourceTime,
      trackRowIndex: clip.trackRowIndex,
      layer: clip.layer,
      opacity: clip.opacity,
      transform: clip.transform,
      visible: clip.visible,
      track,
    });
  }

  // Sort by z-order: trackRowIndex (lower = behind), then layer
  requests.sort((a, b) => {
    if (a.trackRowIndex !== b.trackRowIndex) {
      return a.trackRowIndex - b.trackRowIndex;
    }
    return a.layer - b.layer;
  });

  return requests;
};

export const resolveAudioFrameRequests = (
  timelineFrame: number,
  tracks: VideoTrack[],
  fps: number,
): AudioFrameRequest[] => {
  const requests: AudioFrameRequest[] = [];
  const audioTracks = tracks.filter((t) => t.type === 'audio');

  for (const track of audioTracks) {
    if (timelineFrame < track.startFrame || timelineFrame >= track.endFrame) {
      continue;
    }

    const sourceUrl = track.previewUrl || getVideoSource(track);
    if (!sourceUrl) continue;

    const relativeFrame = timelineFrame - track.startFrame;
    const sourceTime = (track.sourceStartTime || 0) + relativeFrame / fps;

    requests.push({
      clipId: track.id,
      sourceId: normalizeSourceId(sourceUrl),
      sourceUrl,
      sourceTime,
      volume: track.volume ?? 1,
      muted: track.muted ?? false,
      trackRowIndex: track.trackRowIndex ?? 0,
      track,
    });
  }

  return requests;
};

export const getPreloadFrames = (
  timelineFrame: number,
  tracks: VideoTrack[],
  fps: number,
  lookaheadFrames = 3,
): Map<string, number[]> => {
  const preloadMap = new Map<string, number[]>();

  for (let offset = 1; offset <= lookaheadFrames; offset++) {
    const futureFrame = timelineFrame + offset;
    const requests = resolveFrameRequests(futureFrame, tracks, fps);

    for (const req of requests) {
      const existing = preloadMap.get(req.sourceId) || [];
      if (!existing.includes(req.sourceFrame)) {
        existing.push(req.sourceFrame);
        preloadMap.set(req.sourceId, existing);
      }
    }
  }

  return preloadMap;
};

export const hasVisibleClipsAtFrame = (
  timelineFrame: number,
  tracks: VideoTrack[],
): boolean => {
  return tracks.some((track) => {
    if (track.type !== 'video') return false;
    if (!track.visible) return false;
    if (!getVideoSource(track)) return false;
    return timelineFrame >= track.startFrame && timelineFrame < track.endFrame;
  });
};

export default {
  resolveFrameRequests,
  resolveAudioFrameRequests,
  calculateSourceFrame,
  calculateSourceTime,
  extractClipMetadata,
  getPreloadFrames,
  hasVisibleClipsAtFrame,
  normalizeSourceId,
  getVideoSource,
};
