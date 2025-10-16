/**
 * Open Project Action Handler (Ctrl+O)
 * Opens native file dialog to select and load an existing project
 */

import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { toast } from 'sonner';

export const openProjectAction = async (navigate: (path: string) => void) => {
  try {
    // Open file dialog for project files
    const result = await window.electronAPI.openFileDialog({
      title: 'Open Project',
      properties: ['openFile'],
      filters: [
        {
          name: 'Project Files',
          extensions: ['json', 'proj', 'dividr'],
        },
        {
          name: 'All Files',
          extensions: ['*'],
        },
      ],
    });

    if (result.canceled || !result.files || result.files.length === 0) {
      return; // User cancelled
    }

    const filePath = result.files[0].path;

    // Read the project file
    const fileContent = await window.electronAPI.readFile(filePath);
    if (!fileContent) {
      throw new Error('Failed to read project file');
    }

    // Parse project data
    const projectData = JSON.parse(fileContent);

    // Import the project
    const projectStore = useProjectStore.getState();

    // Create a new project with the imported data
    const projectId = await projectStore.createNewProject(
      projectData.metadata?.title || 'Imported Project',
      projectData.metadata?.description || '',
    );

    // Load the project
    await projectStore.openProject(projectId);

    // Navigate to video editor
    navigate('/video-editor');

    toast.success(
      `Project "${projectData.metadata?.title || 'Untitled'}" opened`,
    );
  } catch (error) {
    console.error('[Open Project] Failed:', error);
    toast.error('Failed to open project');
  }
};
