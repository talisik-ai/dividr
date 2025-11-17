/* eslint-disable @typescript-eslint/no-explicit-any */
import { useVideoEditorStore } from '../';
import { getDisplayFps } from '../types/timeline.types';
import { detectTimelineGaps } from '../utils/trackPositioning';

export const useTimelineUtils = () => {
  const store = useVideoEditorStore();
  // Get display FPS from source video tracks (dynamic but static once determined)
  const displayFps = getDisplayFps(store.tracks);

  const getTimelineGaps = () => {
    console.log('--- Starting independent gap detection process ---');
    console.log('Initial tracks state:', store.tracks);

    const result = detectTimelineGaps(store.tracks);

    console.log('\n--- Independent gap detection process complete ---');
    console.log('Final gaps:', result);
    return result;
  };

  const getEffectiveEndFrame = () => {
    return store.tracks.length > 0
      ? Math.max(
          ...store.tracks.map((track: any) => track.endFrame),
          store.timeline.totalFrames,
        )
      : store.timeline.totalFrames;
  };

  const getTracksByType = (type: 'video' | 'audio' | 'image' | 'subtitle') => {
    return store.tracks.filter((track: any) => track.type === type);
  };

  const getSelectedTracks = () => {
    return store.tracks.filter((track: any) =>
      store.timeline.selectedTrackIds.includes(track.id),
    );
  };

  const getTracksAtFrame = (frame: number) => {
    return store.tracks.filter(
      (track: any) => frame >= track.startFrame && frame < track.endFrame,
    );
  };

  const getVisibleTracks = () => {
    return store.tracks.filter((track: any) => track.visible);
  };

  const getLinkedTracks = (trackId: string) => {
    const track = store.tracks.find((t: any) => t.id === trackId);
    if (!track?.isLinked || !track.linkedTrackId) {
      return [];
    }

    const linkedTrack = store.tracks.find(
      (t: any) => t.id === track.linkedTrackId,
    );
    return linkedTrack ? [track, linkedTrack] : [track];
  };

  const framesToTime = (frames: number) => {
    const seconds = frames / displayFps;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const frames_remainder = Math.floor(
      (seconds - Math.floor(seconds)) * displayFps,
    );

    return {
      hours,
      minutes,
      seconds: secs,
      frames: frames_remainder,
      totalSeconds: seconds,
      formatted: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(frames_remainder).padStart(2, '0')}`,
    };
  };

  const timeToFrames = (
    hours: number,
    minutes: number,
    seconds: number,
    frames = 0,
  ) => {
    const totalSeconds = hours * 3600 + minutes * 60 + seconds;
    return Math.floor(totalSeconds * displayFps) + frames;
  };

  const getTrackDuration = (trackId: string) => {
    const track = store.tracks.find((t: any) => t.id === trackId);
    if (!track) return 0;
    return track.endFrame - track.startFrame;
  };

  const getTotalDuration = () => {
    return getEffectiveEndFrame();
  };

  return {
    getTimelineGaps,
    getEffectiveEndFrame,
    getTracksByType,
    getSelectedTracks,
    getTracksAtFrame,
    getVisibleTracks,
    getLinkedTracks,
    framesToTime,
    timeToFrames,
    getTrackDuration,
    getTotalDuration,
  };
};
