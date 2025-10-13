import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import {
  createFileProcessingSlice,
  FileProcessingSlice,
} from './slices/fileProcessingSlice';
import {
  createMediaLibrarySlice,
  MediaLibrarySlice,
} from './slices/mediaLibrarySlice';
import { createPlaybackSlice, PlaybackSlice } from './slices/playbackSlice';
import { createPreviewSlice, PreviewSlice } from './slices/previewSlice';
import { createProjectSlice, ProjectSlice } from './slices/projectSlice';
import { createRenderSlice, RenderSlice } from './slices/renderSlice';
import { createTextStyleSlice, TextStyleSlice } from './slices/textStyleSlice';
import { createTimelineSlice, TimelineSlice } from './slices/timelineSlice';
import { createTracksSlice, TracksSlice } from './slices/tracksSlice';
import { createUtilitySlice, UtilitySlice } from './slices/utilitySlice';

// Compose all slices into the complete store type
type VideoEditorStore = TimelineSlice &
  TracksSlice &
  PlaybackSlice &
  PreviewSlice &
  RenderSlice &
  MediaLibrarySlice &
  ProjectSlice &
  UtilitySlice &
  FileProcessingSlice &
  TextStyleSlice;

// Create the unified store
export const useVideoEditorStore = create<VideoEditorStore>()(
  devtools(
    persist(
      subscribeWithSelector((...a) => ({
        ...createTimelineSlice(...a),
        ...createTracksSlice(...a),
        ...createPlaybackSlice(...a),
        ...createPreviewSlice(...a),
        ...createRenderSlice(...a),
        ...createMediaLibrarySlice(...a),
        ...createProjectSlice(...a),
        ...createUtilitySlice(...a),
        ...createFileProcessingSlice(...a),
        ...createTextStyleSlice(...a),
      })),
      {
        name: 'video-editor-store',
        // Persist only essential state
        partialize: (state) => ({
          timeline: {
            fps: state.timeline.fps,
            zoom: state.timeline.zoom,
            snapEnabled: state.timeline.snapEnabled,
          },
          preview: {
            canvasWidth: state.preview.canvasWidth,
            canvasHeight: state.preview.canvasHeight,
            previewScale: state.preview.previewScale,
            // Don't persist pan values and mode - they should reset on app restart
            panX: 0,
            panY: 0,
            interactionMode: 'select' as const,
            showGrid: state.preview.showGrid,
            showSafeZones: state.preview.showSafeZones,
            backgroundColor: state.preview.backgroundColor,
          },
          playback: {
            volume: state.playback.volume,
            muted: state.playback.muted,
            isLooping: state.playback.isLooping,
          },
          isAutoSaveEnabled: state.isAutoSaveEnabled,
        }),
      },
    ),
    {
      name: 'VideoEditorStore',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);

export * from './hooks';
export { useShortcutRegistryInit } from './hooks/useShortcutRegistryInit';
export * from './types';
export * from './utils';
export type { VideoEditorStore };
