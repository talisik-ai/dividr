/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import {
  DEFAULT_PLAYBACK_CONFIG,
  DEFAULT_PREVIEW_CONFIG,
  DEFAULT_TIMELINE_CONFIG,
} from '../utils/constants';
import { getDefaultTextStyleState } from './textStyleSlice';

export interface UtilitySlice {
  reset: () => void;
}

export const createUtilitySlice: StateCreator<
  UtilitySlice,
  [],
  [],
  UtilitySlice
> = (set) => ({
  reset: () =>
    set({
      tracks: [],
      mediaLibrary: [],
      generatingSpriteSheets: new Set<string>(),
      generatingWaveforms: new Set<string>(),
      timeline: {
        currentFrame: 0,
        ...DEFAULT_TIMELINE_CONFIG,
        selectedTrackIds: [],
        playheadVisible: true,
        snapEnabled: true,
        isSplitModeActive: false,
        inPoint: undefined,
        outPoint: undefined,
        visibleTrackRows: ['video', 'audio'], // Reset to default visible tracks
      },
      playback: {
        isPlaying: false,
        isLooping: false,
        isDraggingTrack: false,
        wasPlayingBeforeDrag: false,
        ...DEFAULT_PLAYBACK_CONFIG,
      },
      preview: {
        ...DEFAULT_PREVIEW_CONFIG,
        showGrid: false,
        showSafeZones: false,
      },
      render: {
        isRendering: false,
        progress: 0,
        status: 'ready',
        currentTime: undefined,
        currentJob: undefined,
      },
      textStyle: getDefaultTextStyleState(), // Reset text styles to defaults
      currentProjectId: null,
      isAutoSaveEnabled: true,
      lastSavedAt: null,
      hasUnsavedChanges: false,
    } as any),
});
