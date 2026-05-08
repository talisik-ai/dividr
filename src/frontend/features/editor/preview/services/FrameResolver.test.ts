import { describe, expect, it } from 'vitest';
import type { VideoTrack } from '../../stores/videoEditor';
import { resolveFrameRequests } from './FrameResolver';

const makeVideoTrack = (
  track: Partial<VideoTrack> & Pick<VideoTrack, 'id'>,
): VideoTrack => ({
  id: track.id,
  type: 'video',
  name: track.id,
  source: `media/${track.id}.mp4`,
  previewUrl: `http://example.test/${track.id}.mp4`,
  duration: 100,
  startFrame: 0,
  endFrame: 100,
  visible: true,
  locked: false,
  color: '#ffffff',
  ...track,
});

describe('resolveFrameRequests', () => {
  it('returns overlapping videos from lower timeline rows to higher rows', () => {
    const lowerVideo = makeVideoTrack({
      id: 'lower-video',
      trackRowIndex: 0,
    });
    const upperVideo = makeVideoTrack({
      id: 'upper-video',
      trackRowIndex: 2,
    });

    const requests = resolveFrameRequests(30, [upperVideo, lowerVideo], 30);

    expect(requests.map((request) => request.clipId)).toEqual([
      'lower-video',
      'upper-video',
    ]);
  });

  it('orders videos on the same row by layer', () => {
    const lowerLayer = makeVideoTrack({
      id: 'lower-layer',
      trackRowIndex: 1,
      layer: 0,
    });
    const higherLayer = makeVideoTrack({
      id: 'higher-layer',
      trackRowIndex: 1,
      layer: 4,
    });

    const requests = resolveFrameRequests(30, [higherLayer, lowerLayer], 30);

    expect(requests.map((request) => request.clipId)).toEqual([
      'lower-layer',
      'higher-layer',
    ]);
  });

  it('ignores hidden, inactive, and source-less video tracks', () => {
    const active = makeVideoTrack({
      id: 'active',
      trackRowIndex: 0,
    });
    const hidden = makeVideoTrack({
      id: 'hidden',
      trackRowIndex: 1,
      visible: false,
    });
    const inactive = makeVideoTrack({
      id: 'inactive',
      trackRowIndex: 2,
      startFrame: 60,
      endFrame: 90,
    });
    const noSource = makeVideoTrack({
      id: 'no-source',
      trackRowIndex: 3,
      source: '',
      previewUrl: '',
    });

    const requests = resolveFrameRequests(
      30,
      [hidden, inactive, noSource, active],
      30,
    );

    expect(requests.map((request) => request.clipId)).toEqual(['active']);
  });
});
