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

      set((state: any) => ({
        ...state,
        tracks: tracksWithPreviewUrls,
        mediaLibrary: (videoEditor as any).mediaLibrary || [], // Support for legacy projects
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
        textStyle: videoEditor.textStyle
          ? { ...state.textStyle, ...videoEditor.textStyle }
          : state.textStyle,
        currentProjectId: projectId,
        hasUnsavedChanges: false,
        lastSavedAt: new Date().toISOString(),
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

      // Update the project with current video editor state
      const updatedProject = {
        ...currentProject,
        videoEditor: {
          tracks: state.tracks,
          mediaLibrary: state.mediaLibrary,
          timeline: state.timeline,
          playback: state.playback,
          preview: state.preview,
          textStyle: state.textStyle, // Save text styles per project
        },
        metadata: {
          ...currentProject.metadata,
          updatedAt: new Date().toISOString(),
          // Update duration based on tracks
          duration:
            state.tracks.length > 0
              ? Math.max(...state.tracks.map((t: any) => t.endFrame)) /
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
