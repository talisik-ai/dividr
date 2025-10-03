/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { PlaybackState } from '../types';
import { DEFAULT_PLAYBACK_CONFIG } from '../utils/constants';

export interface PlaybackSlice {
  playback: PlaybackState;
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlayback: () => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleLoop: () => void;
}

export const createPlaybackSlice: StateCreator<
  PlaybackSlice,
  [],
  [],
  PlaybackSlice
> = (set) => ({
  playback: {
    isPlaying: false,
    isLooping: false,
    ...DEFAULT_PLAYBACK_CONFIG,
  },

  play: () =>
    set((state: any) => ({
      playback: { ...state.playback, isPlaying: true },
    })),

  pause: () =>
    set((state: any) => ({
      playback: { ...state.playback, isPlaying: false },
    })),

  stop: () =>
    set((state: any) => ({
      playback: { ...state.playback, isPlaying: false },
      timeline: {
        ...state.timeline,
        currentFrame: state.timeline.inPoint || 0,
      },
    })),

  togglePlayback: () =>
    set((state: any) => ({
      playback: { ...state.playback, isPlaying: !state.playback.isPlaying },
    })),

  setPlaybackRate: (rate) =>
    set((state: any) => ({
      playback: {
        ...state.playback,
        playbackRate: Math.max(0.1, Math.min(rate, 4)),
      },
    })),

  setVolume: (volume) =>
    set((state: any) => ({
      playback: {
        ...state.playback,
        volume: Math.max(0, Math.min(volume, 1)),
      },
    })),

  toggleMute: () =>
    set((state: any) => ({
      playback: { ...state.playback, muted: !state.playback.muted },
    })),

  toggleLoop: () =>
    set((state: any) => ({
      playback: { ...state.playback, isLooping: !state.playback.isLooping },
    })),
});
