/**
 * Close Project Action Handler (Ctrl+W)
 * Closes current project with confirmation and returns to home
 */

import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { toast } from 'sonner';

export const closeProjectAction = async (
  navigate: (path: string) => void,
  showConfirmation: (options: {
    title: string;
    message: string;
    onConfirm: () => void;
  }) => void,
) => {
  try {
    const projectStore = useProjectStore.getState();
    const currentProject = projectStore.currentProject;

    if (!currentProject) {
      // No project to close, just navigate to home
      navigate('/');
      return;
    }

    // Show confirmation dialog
    showConfirmation({
      title: 'Close Project',
      message: `Are you sure you want to close "${currentProject.metadata.title}"?`,
      onConfirm: async () => {
        try {
          // Get the video editor store
          const { useVideoEditorStore } = await import('../../index');
          const videoEditorStore = useVideoEditorStore.getState();

          // Clear current project
          projectStore.setCurrentProject(null);

          // Reset video editor state
          videoEditorStore.reset();

          // Navigate to home
          navigate('/');

          toast.success('Project closed');
        } catch (error) {
          console.error('[Close Project] Failed to reset:', error);
          toast.error('Failed to close project properly');
        }
      },
    });
  } catch (error) {
    console.error('[Close Project] Failed:', error);
    toast.error('Failed to close project');
  }
};
