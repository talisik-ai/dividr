/* eslint-disable @typescript-eslint/no-explicit-any */
import { projectService } from '@/backend/services/projectService';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { StateCreator } from 'zustand';

export interface ProjectSlice {
  currentProjectId: string | null;
  isAutoSaveEnabled: boolean;
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
  lastSavedAt: null,
  hasUnsavedChanges: false,

  setCurrentProjectId: (projectId) => {
    set({ currentProjectId: projectId, hasUnsavedChanges: false });
  },

  loadProjectData: async (projectId) => {
    try {
      const project = await projectService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const { videoEditor } = project;
      set((state: any) => ({
        ...state,
        tracks: videoEditor.tracks || [],
        mediaLibrary: (videoEditor as any).mediaLibrary || [], // Support for legacy projects
        timeline: { ...state.timeline, ...videoEditor.timeline },
        playback: {
          ...state.playback,
          ...videoEditor.playback,
          isPlaying: false, // Always start paused when loading a project
        },
        preview: { ...state.preview, ...videoEditor.preview },
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
      });

      // Sync with ProjectStore to update the project list
      get().syncWithProjectStore();

      console.log(
        `💾 Saved project data for: ${updatedProject.metadata.title}`,
      );
    } catch (error) {
      console.error('Failed to save project data:', error);
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

      if (state.isAutoSaveEnabled && state.currentProjectId) {
        setTimeout(() => {
          const currentState = get() as any;
          if (currentState.hasUnsavedChanges && currentState.currentProjectId) {
            currentState.saveProjectData().catch(console.error);
          }
        }, 2000);
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
        hasUnsavedChanges: true,
      });
      console.log('✅ Project imported successfully');
    } catch (error) {
      console.error('Failed to import project:', error);
    }
  },
});
