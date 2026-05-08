import { describe, expect, it } from 'vitest';
import type { VideoTrack } from '../../stores/videoEditor/types';
import {
  getActiveVisualTracksAtFrame,
  getTrackZIndex,
  getVisualTracksForRendering,
} from './trackUtils';

const makeTrack = (
  id: string,
  type: VideoTrack['type'],
  trackRowIndex: number,
  overrides: Partial<VideoTrack> = {},
): VideoTrack =>
  ({
    id,
    type,
    name: id,
    source: `${id}.mp4`,
    previewUrl: `http://localhost/${id}.mp4`,
    duration: 100,
    startFrame: 0,
    endFrame: 100,
    visible: true,
    locked: false,
    color: '#ffffff',
    trackRowIndex,
    ...overrides,
  }) as VideoTrack;

describe('preview track stack ordering', () => {
  it('renders lower timeline rows behind higher rows across media types', () => {
    const tracks = [
      makeTrack('top-video', 'video', 3),
      makeTrack('bottom-image', 'image', 1),
      makeTrack('middle-text', 'text', 2),
    ];

    expect(getActiveVisualTracksAtFrame(tracks, 10).map((t) => t.id)).toEqual([
      'bottom-image',
      'middle-text',
      'top-video',
    ]);
  });

  it('does not give images or text priority over a higher video row', () => {
    const lowerImage = makeTrack('lower-image', 'image', 1);
    const higherVideo = makeTrack('higher-video', 'video', 2);

    expect(getTrackZIndex(higherVideo)).toBeGreaterThan(
      getTrackZIndex(lowerImage),
    );
    expect(
      getVisualTracksForRendering([higherVideo, lowerImage], 10).map(
        (t) => t.id,
      ),
    ).toEqual(['lower-image', 'higher-video']);
  });

  it('uses layer only as a tie-breaker within the same row', () => {
    const lowerLayer = makeTrack('lower-layer', 'video', 2, { layer: 0 });
    const higherLayer = makeTrack('higher-layer', 'image', 2, { layer: 4 });
    const nextRow = makeTrack('next-row', 'text', 3, { layer: 0 });

    expect(
      getActiveVisualTracksAtFrame([nextRow, higherLayer, lowerLayer], 10).map(
        (t) => t.id,
      ),
    ).toEqual(['lower-layer', 'higher-layer', 'next-row']);
  });

  it('excludes hidden visual tracks and audio tracks from visual rendering', () => {
    const visibleVideo = makeTrack('visible-video', 'video', 1);
    const hiddenText = makeTrack('hidden-text', 'text', 3, { visible: false });
    const audio = makeTrack('audio', 'audio', 9);

    expect(
      getActiveVisualTracksAtFrame([hiddenText, audio, visibleVideo], 10).map(
        (t) => t.id,
      ),
    ).toEqual(['visible-video']);
  });
});
