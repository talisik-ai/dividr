/* eslint-disable @typescript-eslint/no-explicit-any */
import { projectService } from '@/backend/services/projectService';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { StateCreator } from 'zustand';

export interface ProjectSlice {
  currentProjectId: string | null;
  isAutoSaveEnabled: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  hasUnsavedChanges: boolean;
  setCurrentProjectId: (projectId: string | null) => void;
  loadProjectData: (projectId: string) => Promise<void>;
  saveProjectData: () => Promise<void>;
  setAutoSave: (enabled: boolean) => void;
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  syncWithProjectStore: () => void;
  exportProject: () => string;
  importProject: (data: string) => void;
  setProjectThumbnail: (thumbnailData: string) => Promise<void>;
  setIsSaving: (isSaving: boolean) => void;

  // Cross-slice helpers accessed by other slices
  updateProjectThumbnailFromTimeline?: () => Promise<void>;
}

export const createProjectSlice: StateCreator<
  ProjectSlice,
  [],
  [],
  ProjectSlice
> = (set, get) => ({
  currentProjectId: null,
  isAutoSaveEnabled: true,
  isSaving: false,
  lastSavedAt: null,
  hasUnsavedChanges: false,

  setIsSaving: (isSaving) => {
    set({ isSaving });
  },

  setCurrentProjectId: (projectId) => {
    // If setting to null (exiting editor), clear all drag states
    if (projectId === null) {
      set((state: any) => ({
        currentProjectId: projectId,
        hasUnsavedChanges: false,
        playback: {
          ...state.playback,
          isDraggingTrack: false,
          wasPlayingBeforeDrag: false,
          dragGhost: null,
          magneticSnapFrame: null,
          isDraggingPlayhead: false,
          wasPlayingBeforePlayheadDrag: false,
        },
      }));
    } else {
      set({ currentProjectId: projectId, hasUnsavedChanges: false });
    }
  },

  loadProjectData: async (projectId) => {
    try {
      const project = await projectService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const { videoEditor } = project;

      // Regenerate previewUrl for video/image tracks that are missing it
      // This ensures videos display correctly after project reload
      const tracksWithPreviewUrls = await Promise.all(
        (videoEditor.tracks || []).map(async (track: any) => {
          // Only process video and image tracks
          if (track.type !== 'video' && track.type !== 'image') {
            return track;
          }

          // If previewUrl exists and is valid, keep it
          if (track.previewUrl && track.previewUrl.trim()) {
            return track;
          }

          // If source exists, regenerate previewUrl
          if (track.source && track.source.trim()) {
            try {
              const previewResult = await window.electronAPI.createPreviewUrl(
                track.source,
              );
              if (previewResult.success && previewResult.url) {
                console.log(
                  `🔄 Regenerated previewUrl for track: ${track.name}`,
                );
                return {
                  ...track,
                  previewUrl: previewResult.url,
                };
              }
            } catch (error) {
              console.warn(
                `⚠️ Failed to regenerate previewUrl for track ${track.name}:`,
                error,
              );
            }
          }

          // Return track as-is if we couldn't regenerate previewUrl
          return track;
        }),
      );

      // CRITICAL: Use complete state replacement for tracks and mediaLibrary
      // to ensure all saved data (including transforms) is restored correctly.
      // Deep clone the data to prevent any reference issues.
      const loadedTracks = JSON.parse(JSON.stringify(tracksWithPreviewUrls));
      const loadedMediaLibrary = JSON.parse(
        JSON.stringify((videoEditor as any).mediaLibrary || []),
      );

      // Log what we're loading for debugging data persistence issues
      console.log(
        `📂 Loading project "${project.metadata.title}": ${loadedTracks.length} tracks, ${loadedMediaLibrary.length} media items`,
      );

      // Log transform data for text/subtitle tracks to help debug transform persistence
      loadedTracks.forEach((track: any) => {
        if (track.type === 'text' && track.textTransform) {
          console.log(
            `  📝 Text track "${track.name}" transform:`,
            track.textTransform,
          );
        }
        if (track.type === 'subtitle' && track.subtitleTransform) {
          console.log(
            `  📝 Subtitle track "${track.name}" transform:`,
            track.subtitleTransform,
          );
        }
      });

      set((state: any) => ({
        ...state,
        // CRITICAL: Complete replacement of tracks and mediaLibrary
        // This ensures all track properties including textTransform and subtitleTransform
        // are fully restored from the saved project data
        tracks: loadedTracks,
        mediaLibrary: loadedMediaLibrary,
        timeline: { ...state.timeline, ...videoEditor.timeline },
        playback: {
          ...state.playback,
          ...videoEditor.playback,
          isPlaying: false, // Always start paused when loading a project
          isDraggingTrack: false, // Reset drag state when loading
          wasPlayingBeforeDrag: false,
          dragGhost: null, // Clear any lingering drag ghost from previous session
          magneticSnapFrame: null, // Clear snap indicators
          isDraggingPlayhead: false, // Reset playhead drag state
          wasPlayingBeforePlayheadDrag: false,
        },
        preview: { ...state.preview, ...videoEditor.preview },
        // Load textStyle from project data if available, otherwise keep current defaults
        // This provides backward compatibility for projects created before textStyle was saved
        // Use proper deep merge to ensure nested objects (globalControls, globalSubtitlePosition)
        // are fully restored from saved data
        textStyle: videoEditor.textStyle
          ? {
              ...state.textStyle,
              ...videoEditor.textStyle,
              // Deep merge globalControls to preserve all saved styling
              globalControls: {
                ...state.textStyle.globalControls,
                ...(videoEditor.textStyle.globalControls || {}),
              },
              // Deep merge globalSubtitlePosition to preserve all saved position/transform data
              globalSubtitlePosition: {
                ...state.textStyle.globalSubtitlePosition,
                ...(videoEditor.textStyle.globalSubtitlePosition || {}),
              },
            }
          : state.textStyle,
        currentProjectId: projectId,
        hasUnsavedChanges: false,
        lastSavedAt: new Date().toISOString(),
        // CRITICAL: Clear undo/redo history when loading a new project
        // This prevents stale history entries from previous projects affecting the new one
        undoStack: [],
        redoStack: [],
        isGrouping: false,
        groupStartState: null,
        groupActionName: null,
      }));

      console.log(`✅ Loaded project data for: ${project.metadata.title}`);
    } catch (error) {
      console.error('Failed to load project data:', error);
      throw error;
    }
  },

  saveProjectData: async () => {
    const state = get() as any;
    if (!state.currentProjectId) {
      console.warn('No current project ID set, cannot save');
      return;
    }

    set({ isSaving: true });

    try {
      // Get current project from ProjectService
      const currentProject = await projectService.getProject(
        state.currentProjectId,
      );
      if (!currentProject) {
        throw new Error('Current project not found');
      }

      // SAFETY VALIDATION: Prevent saving empty timeline over populated one
      // This protects against data loss from race conditions or corrupted state
      const existingTrackCount = currentProject.videoEditor.tracks?.length || 0;
      const newTrackCount = state.tracks?.length || 0;

      if (existingTrackCount > 0 && newTrackCount === 0) {
        console.warn(
          `⚠️ SAFETY BLOCK: Attempted to save empty timeline (0 tracks) over populated one (${existingTrackCount} tracks). ` +
            `This may indicate a data loss condition. Save operation aborted.`,
        );
        set({ isSaving: false });
        // Don't throw - this is a safety check, not an error
        // The user's data in IndexedDB is preserved
        return;
      }

      // Deep clone tracks to ensure all nested properties (transforms, styles) are saved
      const tracksToSave = JSON.parse(JSON.stringify(state.tracks || []));
      const mediaLibraryToSave = JSON.parse(
        JSON.stringify(state.mediaLibrary || []),
      );
      const textStyleToSave = state.textStyle
        ? JSON.parse(JSON.stringify(state.textStyle))
        : undefined;

      // Log what we're saving for debugging data persistence issues
      console.log(
        `💾 Saving project "${currentProject.metadata.title}": ${tracksToSave.length} tracks, ${mediaLibraryToSave.length} media items`,
      );

      // Log transform data for text/subtitle tracks
      tracksToSave.forEach((track: any) => {
        if (track.type === 'text' && track.textTransform) {
          console.log(
            `  📝 Saving text track "${track.name}" transform:`,
            track.textTransform,
          );
        }
        if (track.type === 'subtitle' && track.subtitleTransform) {
          console.log(
            `  📝 Saving subtitle track "${track.name}" transform:`,
            track.subtitleTransform,
          );
        }
      });

      // Update the project with current video editor state
      const updatedProject = {
        ...currentProject,
        videoEditor: {
          tracks: tracksToSave,
          mediaLibrary: mediaLibraryToSave,
          timeline: state.timeline,
          playback: state.playback,
          preview: state.preview,
          textStyle: textStyleToSave, // Save text styles per project
        },
        metadata: {
          ...currentProject.metadata,
          updatedAt: new Date().toISOString(),
          // Update duration based on tracks
          duration:
            tracksToSave.length > 0
              ? Math.max(...tracksToSave.map((t: any) => t.endFrame)) /
                state.timeline.fps
              : 0,
        },
      };

      // Save to IndexedDB
      await projectService.updateProject(updatedProject);

      // Update local state
      set({
        hasUnsavedChanges: false,
        lastSavedAt: new Date().toISOString(),
        isSaving: false,
      });

      // Sync with ProjectStore to update the project list
      get().syncWithProjectStore();

      console.log(
        `💾 Saved project data for: ${updatedProject.metadata.title}`,
      );
    } catch (error) {
      console.error('Failed to save project data:', error);
      set({ isSaving: false });
      throw error;
    }
  },

  setAutoSave: (enabled) => {
    set({ isAutoSaveEnabled: enabled });
  },

  markUnsavedChanges: () => {
    const state = get() as any;
    if (!state.hasUnsavedChanges) {
      set({ hasUnsavedChanges: true });

      // Log the source of what triggered auto-save
      // const stackTrace = new Error().stack;
      // const callerMatch = stackTrace?.match(/at\s+(\w+\.?\w*)\s+\(/g);
      // const callerInfo = callerMatch
      //   ? callerMatch
      //       .slice(1, 4)
      //       .map((call) => call.replace(/at\s+/, '').replace(/\s+\(/, ''))
      //       .join(' → ')
      //   : 'Unknown source';

      // console.log('🔄 Auto-save triggered by:', callerInfo);
      // console.trace('📋 Full call stack:');

      if (state.isAutoSaveEnabled && state.currentProjectId) {
        const timeoutId = setTimeout(() => {
          const currentState = get() as any;
          if (currentState.hasUnsavedChanges && currentState.currentProjectId) {
            // console.log(
            //   '💾 Executing auto-save (triggered by:',
            //   callerInfo,
            //   ')',
            // );
            currentState.saveProjectData().catch(console.error);
          }
        }, 2000);

        // Store timeout ID for potential cancellation (optional enhancement)
        (state as any)._autoSaveTimeoutId = timeoutId;
      }
    }
  },

  clearUnsavedChanges: () => {
    set({ hasUnsavedChanges: false });
  },

  syncWithProjectStore: () => {
    // Trigger ProjectStore to reload projects
    const projectStore = useProjectStore.getState();
    projectStore.loadProjects().catch(console.error);
  },

  exportProject: () => {
    const state = get() as any;
    return JSON.stringify({
      tracks: state.tracks,
      timeline: state.timeline,
      preview: state.preview,
      textStyle: state.textStyle,
    });
  },

  importProject: (data: string) => {
    try {
      const projectData = JSON.parse(data);
      const state = get() as any;
      set({
        ...state,
        tracks: projectData.tracks || [],
        timeline: { ...state.timeline, ...projectData.timeline },
        preview: { ...state.preview, ...projectData.preview },
        textStyle: projectData.textStyle
          ? { ...state.textStyle, ...projectData.textStyle }
          : state.textStyle,
        hasUnsavedChanges: true,
      });
      console.log('✅ Project imported successfully');
    } catch (error) {
      console.error('Failed to import project:', error);
    }
  },

  setProjectThumbnail: async (thumbnailData: string) => {
    const state = get() as any;
    if (!state.currentProjectId) {
      throw new Error('No project loaded');
    }

    try {
      // Get current project
      const currentProject = await projectService.getProject(
        state.currentProjectId,
      );
      if (!currentProject) {
        throw new Error('Current project not found');
      }

      // Update project with new thumbnail
      const updatedProject = {
        ...currentProject,
        metadata: {
          ...currentProject.metadata,
          thumbnail: thumbnailData,
          updatedAt: new Date().toISOString(),
        },
      };

      // Save to IndexedDB
      await projectService.updateProject(updatedProject);

      // Sync with ProjectStore to update the project list AND current project
      get().syncWithProjectStore();

      // Also update the current project in ProjectStore immediately
      const projectStore = useProjectStore.getState();
      projectStore.setCurrentProject(updatedProject);
    } catch (error) {
      console.log(error);
      throw error;
    }
  },
});
