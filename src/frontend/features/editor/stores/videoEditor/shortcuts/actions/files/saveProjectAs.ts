/**
 * Save Project As Action Handler (Ctrl+Shift+S)
 * Exports the current project to a user-selected location
 * Opens native save dialog and saves the project file
 */

import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { toast } from 'sonner';

export const saveProjectAsAction = async () => {
  try {
    const projectStore = useProjectStore.getState();
    const currentProject = projectStore.currentProject;

    if (!currentProject) {
      toast.error('No project to save');
      return;
    }

    // Export the current project (this will open native save dialog)
    await projectStore.exportProject(currentProject.id);

    // toast.success('Project exported successfully');
  } catch (error) {
    console.error('[Save Project As] Failed:', error);
    toast.error('Failed to save project as');
  }
};
