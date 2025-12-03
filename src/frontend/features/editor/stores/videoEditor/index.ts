import { create } from 'zustand';
import { devtools, persist, subscribeWithSelector } from 'zustand/middleware';
import { ClipboardSlice, createClipboardSlice } from './slices/clipboardSlice';
import {
  ColorHistorySlice,
  createColorHistorySlice,
} from './slices/colorHistorySlice';
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
import { createTextClipsSlice, TextClipsSlice } from './slices/textClipsSlice';
import { createTextStyleSlice, TextStyleSlice } from './slices/textStyleSlice';
import { createTimelineSlice, TimelineSlice } from './slices/timelineSlice';
import { createTracksSlice, TracksSlice } from './slices/tracksSlice';
import {
  createTranscriptionSlice,
  TranscriptionSlice,
} from './slices/transcriptionSlice';
import { createUndoRedoSlice, UndoRedoSlice } from './slices/undoRedoSlice';
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
  TextStyleSlice &
  TextClipsSlice &
  ColorHistorySlice &
  ClipboardSlice &
  UndoRedoSlice &
  TranscriptionSlice;

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
        ...createTextClipsSlice(...a),
        ...createColorHistorySlice(...a),
        ...createClipboardSlice(...a),
        ...createUndoRedoSlice(...a),
        ...createTranscriptionSlice(...a),
      })),
      {
        name: 'video-editor-store',
        // Persist only essential state
        partialize: (state) => ({
          timeline: {
            fps: state.timeline.fps,
            zoom: state.timeline.zoom,
            snapEnabled: state.timeline.snapEnabled,
            visibleTrackRows: state.timeline.visibleTrackRows,
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
          // textStyle is now project-scoped, not globally persisted
          // It will be saved/loaded per project via projectSlice
          colorHistory: state.colorHistory,
          recentFonts: state.recentFonts, // Keep recent fonts global for convenience
          isAutoSaveEnabled: state.isAutoSaveEnabled,
          // Don't persist undo/redo history - it should reset on app restart
          // undoStack: [],
          // redoStack: [],
        }),
        // Merge persisted state with default state to ensure all fields exist
        merge: (
          persistedState: Partial<VideoEditorStore> | undefined,
          currentState: VideoEditorStore,
        ) => ({
          ...currentState,
          timeline: {
            ...currentState.timeline,
            ...(persistedState?.timeline || {}),
            // Ensure visibleTrackRows has a fallback
            visibleTrackRows: persistedState?.timeline?.visibleTrackRows || [
              'video',
              'audio',
            ],
          },
          preview: {
            ...currentState.preview,
            ...(persistedState?.preview || {}),
          },
          playback: {
            ...currentState.playback,
            ...(persistedState?.playback || {}),
          },
          // textStyle is NOT merged from localStorage - it's project-scoped
          // Each project will load its own textStyle via projectSlice.loadProjectData
          recentFonts: persistedState?.recentFonts || currentState.recentFonts,
          colorHistory:
            persistedState?.colorHistory || currentState.colorHistory,
          isAutoSaveEnabled:
            persistedState?.isAutoSaveEnabled ?? currentState.isAutoSaveEnabled,
        }),
      },
    ),
    {
      name: 'VideoEditorStore',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);

// Expose store to window for console debugging (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).__videoEditorStore = useVideoEditorStore;
}

export * from './hooks';
export { useShortcutRegistryInit } from './hooks/useShortcutRegistryInit';
export * from './types';
export * from './utils';
export type { VideoEditorStore };
