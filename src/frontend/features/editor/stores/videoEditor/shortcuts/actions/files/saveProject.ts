/**
 * Save Project Action Handler (Ctrl+S)
 * Forces an immediate save and shows feedback
 */

import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { toast } from 'sonner';

export const saveProjectAction = async () => {
  try {
    const projectStore = useProjectStore.getState();
    const currentProject = projectStore.currentProject;

    if (!currentProject) {
      toast.info('No project to save');
      return;
    }

    // Check if already saved recently (within 2 seconds)
    const { lastSavedAt } = projectStore;
    if (lastSavedAt) {
      const timeSinceLastSave = Date.now() - new Date(lastSavedAt).getTime();
      if (timeSinceLastSave < 2000) {
        toast.success('💾 Project already saved', {
          duration: 1500,
        });
        return;
      }
    }

    // Force an immediate save
    await projectStore.saveCurrentProject();

    // Show feedback with disk icon
    toast.success('💾 All changes saved', {
      duration: 2000,
    });
  } catch (error) {
    console.error('[Save Project] Failed:', error);
    toast.error('Failed to save project');
  }
};
