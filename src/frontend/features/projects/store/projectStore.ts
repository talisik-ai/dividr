/* eslint-disable @typescript-eslint/no-explicit-any */
import { projectService } from '@/backend/services/projectService';
import {
  createDefaultProject,
  ProjectData,
  ProjectSummary,
} from '@/shared/types/project.types';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useVideoEditorStore } from '../../editor/stores/VideoEditorStore';

// Current project state
interface ProjectStore {
  // Current project being edited
  currentProject: ProjectData | null;

  // List of all projects for management
  projects: ProjectSummary[];

  // Loading states
  isLoading: boolean;
  isInitialized: boolean;

  // Actions for current project
  setCurrentProject: (project: ProjectData | null) => void;
  updateCurrentProjectMetadata: (
    updates: Partial<ProjectData['metadata']>,
  ) => void;
  updateCurrentProjectData: (updates: Partial<ProjectData>) => void;
  syncVideoEditorState: () => Promise<void>;

  // Actions for project management
  initializeProjects: () => Promise<void>;
  loadProjects: () => Promise<void>;
  createNewProject: (title: string, description?: string) => Promise<string>;
  openProject: (id: string) => Promise<void>;
  saveCurrentProject: () => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  renameProject: (id: string, newTitle: string) => Promise<void>;
  duplicateProject: (id: string, newTitle?: string) => Promise<string>;
  searchProjects: (query: string) => Promise<ProjectSummary[]>;
  getRecentProjects: (limit?: number) => Promise<ProjectSummary[]>;

  // Import/Export
  exportProject: (id: string) => Promise<void>;
  importProject: (file: File) => Promise<string>;

  // Utility
  reset: () => void;
}

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentProject: null as ProjectData | null,
    projects: [] as ProjectSummary[],
    isLoading: false,
    isInitialized: false,

    // Current project actions
    setCurrentProject: (project) => set({ currentProject: project }),

    updateCurrentProjectMetadata: (updates) =>
      set((state) => {
        if (!state.currentProject) return state;

        return {
          currentProject: {
            ...state.currentProject,
            metadata: {
              ...state.currentProject.metadata,
              ...updates,
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }),

    updateCurrentProjectData: (updates) =>
      set((state) => {
        if (!state.currentProject) return state;

        return {
          currentProject: {
            ...state.currentProject,
            ...updates,
            metadata: {
              ...state.currentProject.metadata,
              ...(updates.metadata || {}),
              updatedAt: new Date().toISOString(),
            },
          },
        };
      }),

    // Project management actions
    initializeProjects: async () => {
      const state = get();
      if (state.isInitialized) return;

      set({ isLoading: true });

      try {
        await projectService.init();
        await get().loadProjects();
        set({ isInitialized: true });
      } catch (error) {
        console.error('Failed to initialize projects:', error);
      } finally {
        set({ isLoading: false });
      }
    },

    loadProjects: async () => {
      set({ isLoading: true });

      try {
        const projects = await projectService.getAllProjects();
        set({ projects });
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        set({ isLoading: false });
      }
    },

    createNewProject: async (title, description = '') => {
      set({ isLoading: true });

      try {
        const newProject = createDefaultProject(title, description);
        await projectService.createProject(newProject);
        await get().loadProjects();

        // Set up VideoEditorStore for the new project
        const videoEditorStore = useVideoEditorStore.getState();
        videoEditorStore.reset();
        videoEditorStore.setCurrentProjectId(newProject.id);

        return newProject.id;
      } catch (error) {
        console.error('Failed to create project:', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    openProject: async (id) => {
      set({ isLoading: true });

      try {
        const project = await projectService.getProject(id);
        if (!project) {
          throw new Error('Project not found');
        }

        // Mark as opened
        await projectService.markProjectOpened(id);

        // Set as current project
        set({ currentProject: project });

        const videoEditorStore = useVideoEditorStore.getState();
        await videoEditorStore.loadProjectData(id);

        // Refresh project list to update lastOpenedAt
        await get().loadProjects();
      } catch (error) {
        console.error('Failed to open project:', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    saveCurrentProject: async () => {
      const state = get();
      if (!state.currentProject) {
        throw new Error('No current project to save');
      }

      set({ isLoading: true });

      try {
        await projectService.updateProject(state.currentProject);
        await get().loadProjects();
      } catch (error) {
        console.error('Failed to save project:', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    deleteProject: async (id) => {
      set({ isLoading: true });

      try {
        // First, get the project data to extract audio files for cleanup
        const projectToDelete = await projectService.getProject(id);

        if (projectToDelete) {
          // Extract all extracted audio file paths from the project's media library
          const extractedAudioPaths: string[] = [];
          const mediaLibrary =
            (projectToDelete.videoEditor as any).mediaLibrary || [];

          for (const mediaItem of mediaLibrary) {
            if (mediaItem.extractedAudio?.audioPath) {
              extractedAudioPaths.push(mediaItem.extractedAudio.audioPath);
            }
          }

          // Clean up extracted audio files if any exist
          if (extractedAudioPaths.length > 0) {
            console.log(
              `🧹 Cleaning up ${extractedAudioPaths.length} extracted audio files for project: ${projectToDelete.metadata.title}`,
            );
            try {
              const cleanupResult =
                await window.electronAPI.cleanupExtractedAudio(
                  extractedAudioPaths,
                );
              if (cleanupResult.success) {
                console.log(
                  `✅ Successfully cleaned up extracted audio files: ${cleanupResult.deletedFiles.length} deleted`,
                );
              } else {
                console.warn(
                  `⚠️ Some audio files could not be deleted:`,
                  cleanupResult.failedFiles,
                );
              }
            } catch (cleanupError) {
              console.error(
                'Failed to cleanup extracted audio files:',
                cleanupError,
              );
              // Don't fail the project deletion if cleanup fails
            }
          }
        }

        // Delete the project from the database
        await projectService.deleteProject(id);

        // If the deleted project is the current project, clear it
        const state = get();
        if (state.currentProject?.id === id) {
          set({ currentProject: null });
        }

        await get().loadProjects();
      } catch (error) {
        console.error('Failed to delete project:', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    renameProject: async (id, newTitle) => {
      set({ isLoading: true });

      try {
        // Get the project
        const project = await projectService.getProject(id);
        if (!project) {
          throw new Error('Project not found');
        }

        // Update the project title and metadata
        const updatedProject = {
          ...project,
          metadata: {
            ...project.metadata,
            title: newTitle,
            updatedAt: new Date().toISOString(),
          },
        };

        // Save to database
        await projectService.updateProject(updatedProject);

        // If this is the current project, update it
        const state = get();
        if (state.currentProject?.id === id) {
          set({
            currentProject: updatedProject,
          });
        }

        // Refresh project list
        await get().loadProjects();
      } catch (error) {
        console.error('Failed to rename project:', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    duplicateProject: async (id, newTitle) => {
      set({ isLoading: true });

      try {
        const newProjectId = await projectService.duplicateProject(
          id,
          newTitle,
        );
        await get().loadProjects();
        return newProjectId;
      } catch (error) {
        console.error('Failed to duplicate project:', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    searchProjects: async (query) => {
      try {
        return await projectService.searchProjects(query);
      } catch (error) {
        console.error('Failed to search projects:', error);
        return [];
      }
    },

    getRecentProjects: async (limit = 5) => {
      try {
        return await projectService.getRecentProjects(limit);
      } catch (error) {
        console.error('Failed to get recent projects:', error);
        return [];
      }
    },

    exportProject: async (id) => {
      try {
        const exportData = await projectService.exportProject(id);

        // Create and download file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], {
          type: 'application/json',
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${exportData.metadata.title.replace(/[^a-z0-9]/gi, '_')}.dividr`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Failed to export project:', error);
        throw error;
      }
    },

    importProject: async (file) => {
      set({ isLoading: true });

      try {
        const text = await file.text();
        const exportData = JSON.parse(text);

        const newProjectId = await projectService.importProject(exportData);
        await get().loadProjects();

        return newProjectId;
      } catch (error) {
        console.error('Failed to import project:', error);
        throw error;
      } finally {
        set({ isLoading: false });
      }
    },

    syncVideoEditorState: async () => {
      try {
        const videoEditorStore = useVideoEditorStore.getState();

        if (videoEditorStore.currentProjectId) {
          await videoEditorStore.saveProjectData();
          await get().loadProjects();
        }
      } catch (error) {
        console.error('Failed to sync video editor state:', error);
      }
    },

    reset: () => {
      set({
        currentProject: null,
        projects: [],
        isLoading: false,
        isInitialized: false,
      });

      // Also reset VideoEditorStore
      import('../../editor/stores/VideoEditorStore').then(
        ({ useVideoEditorStore }) => {
          const videoEditorStore = useVideoEditorStore.getState();
          videoEditorStore.reset();
          videoEditorStore.setCurrentProjectId(null);
        },
      );
    },
  })),
);
