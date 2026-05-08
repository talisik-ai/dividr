import { describe, expect, it } from 'vitest';
import type { VideoTrack } from '../../stores/videoEditor';
import {
  getActiveTracksAtFrame,
  getTrackZIndex,
  getVisualTracksForRendering,
} from './trackUtils';

const makeTrack = (
  track: Partial<VideoTrack> & Pick<VideoTrack, 'id' | 'type'>,
): VideoTrack => ({
  id: track.id,
  type: track.type,
  name: track.id,
  source: `${track.id}.mp4`,
  duration: 100,
  startFrame: 0,
  endFrame: 100,
  visible: true,
  locked: false,
  color: '#ffffff',
  ...track,
});

describe('preview track ordering', () => {
  it('renders higher timeline rows above lower rows across media types', () => {
    const image = makeTrack({
      id: 'image-bottom',
      type: 'image',
      trackRowIndex: 0,
    });
    const video = makeTrack({
      id: 'video-top',
      type: 'video',
      trackRowIndex: 2,
    });

    const orderedTracks = getVisualTracksForRendering([video, image], 20);

    expect(orderedTracks.map((track) => track.id)).toEqual([
      'image-bottom',
      'video-top',
    ]);
    expect(getTrackZIndex(video)).toBeGreaterThan(getTrackZIndex(image));
  });

  it('uses layer as a tie-breaker within the same timeline row', () => {
    const lowerLayer = makeTrack({
      id: 'lower-layer',
      type: 'video',
      trackRowIndex: 1,
      layer: 0,
    });
    const higherLayer = makeTrack({
      id: 'higher-layer',
      type: 'video',
      trackRowIndex: 1,
      layer: 3,
    });

    const orderedTracks = getActiveTracksAtFrame([higherLayer, lowerLayer], 5);

    expect(orderedTracks.map((track) => track.id)).toEqual([
      'lower-layer',
      'higher-layer',
    ]);
    expect(getTrackZIndex(higherLayer)).toBeGreaterThan(
      getTrackZIndex(lowerLayer),
    );
  });

  it('does not prioritize text, image, subtitle, or video by media type', () => {
    const text = makeTrack({
      id: 'text-low-row',
      type: 'text',
      trackRowIndex: 0,
    });
    const subtitle = makeTrack({
      id: 'subtitle-middle-row',
      type: 'subtitle',
      trackRowIndex: 1,
      subtitleText: 'Caption',
    });
    const image = makeTrack({
      id: 'image-high-row',
      type: 'image',
      trackRowIndex: 2,
    });
    const video = makeTrack({
      id: 'video-top-row',
      type: 'video',
      trackRowIndex: 3,
    });

    const orderedTracks = getVisualTracksForRendering(
      [video, image, subtitle, text],
      10,
    );

    expect(orderedTracks.map((track) => track.id)).toEqual([
      'text-low-row',
      'subtitle-middle-row',
      'image-high-row',
      'video-top-row',
    ]);
  });

  it('excludes hidden and inactive clips from active visual rendering', () => {
    const visible = makeTrack({
      id: 'visible',
      type: 'image',
      trackRowIndex: 1,
    });
    const hidden = makeTrack({
      id: 'hidden',
      type: 'video',
      trackRowIndex: 3,
      visible: false,
    });
    const inactive = makeTrack({
      id: 'inactive',
      type: 'text',
      trackRowIndex: 4,
      startFrame: 30,
      endFrame: 40,
    });

    const orderedTracks = getVisualTracksForRendering(
      [hidden, inactive, visible],
      20,
    );

    expect(orderedTracks.map((track) => track.id)).toEqual(['visible']);
  });
});
