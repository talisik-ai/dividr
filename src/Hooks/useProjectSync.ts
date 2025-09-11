import { useProjectStore } from '@/Store/ProjectStore';
import { useVideoEditorStore } from '@/Store/VideoEditorStore';
import { useEffect } from 'react';

/**
 * Hook to synchronize project state between ProjectStore and VideoEditorStore
 * This ensures that changes in the video editor are persisted to the project
 */
export const useProjectSync = () => {
  const currentProject = useProjectStore((state) => state.currentProject);
  const currentProjectId = useVideoEditorStore(
    (state) => state.currentProjectId,
  );
  const hasUnsavedChanges = useVideoEditorStore(
    (state) => state.hasUnsavedChanges,
  );
  const isAutoSaveEnabled = useVideoEditorStore(
    (state) => state.isAutoSaveEnabled,
  );
  const saveProjectData = useVideoEditorStore((state) => state.saveProjectData);
  const setCurrentProjectId = useVideoEditorStore(
    (state) => state.setCurrentProjectId,
  );
  const loadProjectData = useVideoEditorStore((state) => state.loadProjectData);

  // Sync current project ID when project changes
  useEffect(() => {
    if (currentProject?.id !== currentProjectId) {
      if (currentProject) {
        console.log(`🔄 Syncing project: ${currentProject.metadata.title}`);
        setCurrentProjectId(currentProject.id);
        loadProjectData(currentProject.id).catch(console.error);
      } else {
        setCurrentProjectId(null);
      }
    }
  }, [currentProject, currentProjectId, setCurrentProjectId, loadProjectData]);

  // Auto-save when leaving the page if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && currentProjectId) {
        event.preventDefault();
        event.returnValue =
          'You have unsaved changes. Are you sure you want to leave?';

        // Try to save before leaving
        saveProjectData().catch(console.error);

        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, currentProjectId, saveProjectData]);

  // Periodic auto-save for extra safety
  useEffect(() => {
    if (!isAutoSaveEnabled || !currentProjectId) return;

    const interval = setInterval(() => {
      if (hasUnsavedChanges) {
        console.log('🔄 Periodic auto-save triggered');
        saveProjectData().catch(console.error);
      }
    }, 30000); // Save every 30 seconds if there are changes

    return () => clearInterval(interval);
  }, [isAutoSaveEnabled, currentProjectId, hasUnsavedChanges, saveProjectData]);

  return {
    currentProject,
    hasUnsavedChanges,
    isAutoSaveEnabled,
    saveProjectData,
  };
};

/**
 * Hook to manually save the current project
 */
export const useSaveProject = () => {
  const saveProjectData = useVideoEditorStore((state) => state.saveProjectData);
  const currentProjectId = useVideoEditorStore(
    (state) => state.currentProjectId,
  );
  const hasUnsavedChanges = useVideoEditorStore(
    (state) => state.hasUnsavedChanges,
  );

  const saveProject = async () => {
    if (!currentProjectId) {
      throw new Error('No project is currently open');
    }

    await saveProjectData();
  };

  return {
    saveProject,
    canSave: !!currentProjectId,
    hasUnsavedChanges,
  };
};
