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
  startDraggingTrack: (initialFrame: number) => void;
  endDraggingTrack: (recordUndo?: boolean) => void;
  startDraggingPlayhead: () => void;
  endDraggingPlayhead: () => void;
  startDraggingTransform: () => void;
  endDraggingTransform: () => void;
  setMagneticSnapFrame: (frame: number | null) => void;
  trackBoundaryCollision: (attemptedFrame: number, wasBlocked: boolean) => void;
  setDragGhost: (ghost: PlaybackState['dragGhost']) => void;
  updateDragGhostPosition: (
    mouseX: number,
    mouseY: number,
    targetRow: string | null,
    targetFrame: number | null,
  ) => void;
  clearDragGhost: () => void;
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
    isDraggingTrack: false,
    wasPlayingBeforeDrag: false,
    isDraggingPlayhead: false,
    wasPlayingBeforePlayheadDrag: false,
    isDraggingTransform: false,
    wasPlayingBeforeTransformDrag: false,
    magneticSnapFrame: null,
    dragStartFrame: null,
    boundaryCollisionCount: 0,
    lastAttemptedFrame: null,
    dragGhost: null,
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

  startDraggingTrack: (initialFrame) =>
    set((state: any) => {
      const wasPlaying = state.playback.isPlaying;
      return {
        playback: {
          ...state.playback,
          isDraggingTrack: true,
          wasPlayingBeforeDrag: wasPlaying,
          isPlaying: false, // Pause playback during drag
          dragStartFrame: initialFrame,
          boundaryCollisionCount: 0,
          lastAttemptedFrame: null,
        },
      };
    }),

  endDraggingTrack: (recordUndo = true) =>
    set((state: any) => {
      const shouldResume = state.playback.wasPlayingBeforeDrag;

      // Record undo action if requested and drag actually occurred
      if (recordUndo && state.playback.isDraggingTrack && state.recordAction) {
        state.recordAction('Move Clip');
      }

      return {
        playback: {
          ...state.playback,
          isDraggingTrack: false,
          isPlaying: shouldResume, // Resume if was playing before
          wasPlayingBeforeDrag: false,
          magneticSnapFrame: null, // Clear snap indicator
          dragStartFrame: null,
          boundaryCollisionCount: 0,
          lastAttemptedFrame: null,
        },
      };
    }),

  setMagneticSnapFrame: (frame) =>
    set((state: any) => ({
      playback: { ...state.playback, magneticSnapFrame: frame },
    })),

  trackBoundaryCollision: (attemptedFrame, wasBlocked) =>
    set((state: any) => {
      const isSameDirection =
        state.playback.lastAttemptedFrame === null ||
        (attemptedFrame > state.playback.lastAttemptedFrame &&
          state.playback.dragStartFrame !== null &&
          attemptedFrame > state.playback.dragStartFrame) ||
        (attemptedFrame < state.playback.lastAttemptedFrame &&
          state.playback.dragStartFrame !== null &&
          attemptedFrame < state.playback.dragStartFrame);

      return {
        playback: {
          ...state.playback,
          boundaryCollisionCount:
            wasBlocked && isSameDirection
              ? state.playback.boundaryCollisionCount + 1
              : 0,
          lastAttemptedFrame: attemptedFrame,
        },
      };
    }),

  setDragGhost: (ghost) =>
    set((state: any) => ({
      playback: { ...state.playback, dragGhost: ghost },
    })),

  updateDragGhostPosition: (mouseX, mouseY, targetRow, targetFrame) =>
    set((state: any) => ({
      playback: {
        ...state.playback,
        dragGhost: state.playback.dragGhost
          ? {
              ...state.playback.dragGhost,
              mouseX,
              mouseY,
              targetRow,
              targetFrame,
            }
          : null,
      },
    })),

  clearDragGhost: () =>
    set((state: any) => ({
      playback: { ...state.playback, dragGhost: null },
    })),

  startDraggingPlayhead: () =>
    set((state: any) => {
      const wasPlaying = state.playback.isPlaying;
      return {
        playback: {
          ...state.playback,
          isDraggingPlayhead: true,
          wasPlayingBeforePlayheadDrag: wasPlaying,
          isPlaying: false, // Pause playback during playhead drag
        },
      };
    }),

  endDraggingPlayhead: () =>
    set((state: any) => {
      const shouldResume = state.playback.wasPlayingBeforePlayheadDrag;
      return {
        playback: {
          ...state.playback,
          isDraggingPlayhead: false,
          isPlaying: shouldResume, // Resume if was playing before
          wasPlayingBeforePlayheadDrag: false,
        },
      };
    }),

  startDraggingTransform: () =>
    set((state: any) => {
      const wasPlaying = state.playback.isPlaying;
      return {
        playback: {
          ...state.playback,
          isDraggingTransform: true,
          wasPlayingBeforeTransformDrag: wasPlaying,
          isPlaying: false, // Pause playback during transform drag
        },
      };
    }),

  endDraggingTransform: () =>
    set((state: any) => {
      const shouldResume = state.playback.wasPlayingBeforeTransformDrag;
      return {
        playback: {
          ...state.playback,
          isDraggingTransform: false,
          isPlaying: shouldResume, // Resume if was playing before
          wasPlayingBeforeTransformDrag: false,
        },
      };
    }),
});
