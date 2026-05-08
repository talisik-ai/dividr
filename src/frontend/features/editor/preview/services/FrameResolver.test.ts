import { describe, expect, it } from 'vitest';
import type { VideoTrack } from '../../stores/videoEditor/types';
import { resolveFrameRequests } from './FrameResolver';

const makeVideoTrack = (
  id: string,
  trackRowIndex: number,
  overrides: Partial<VideoTrack> = {},
): VideoTrack =>
  ({
    id,
    type: 'video',
    name: id,
    source: `${id}.mp4`,
    previewUrl: `http://localhost/${id}.mp4`,
    duration: 90,
    startFrame: 0,
    endFrame: 90,
    sourceStartTime: 0,
    visible: true,
    locked: false,
    color: '#ffffff',
    trackRowIndex,
    ...overrides,
  }) as VideoTrack;

describe('resolveFrameRequests', () => {
  it('orders overlapping video clips by timeline row instead of input order', () => {
    const tracks = [
      makeVideoTrack('top-video', 2),
      makeVideoTrack('bottom-video', 0),
    ];

    expect(resolveFrameRequests(30, tracks, 30).map((r) => r.clipId)).toEqual([
      'bottom-video',
      'top-video',
    ]);
  });

  it('uses layer as a secondary ordering value for same-row videos', () => {
    const tracks = [
      makeVideoTrack('higher-layer', 1, { layer: 3 }),
      makeVideoTrack('lower-layer', 1, { layer: 0 }),
    ];

    expect(resolveFrameRequests(30, tracks, 30).map((r) => r.clipId)).toEqual([
      'lower-layer',
      'higher-layer',
    ]);
  });

  it('does not request hidden or inactive clips', () => {
    const tracks = [
      makeVideoTrack('hidden-video', 4, { visible: false }),
      makeVideoTrack('future-video', 5, { startFrame: 60, endFrame: 90 }),
      makeVideoTrack('active-video', 1),
    ];

    expect(resolveFrameRequests(30, tracks, 30).map((r) => r.clipId)).toEqual([
      'active-video',
    ]);
  });
});
