/* eslint-disable @typescript-eslint/no-explicit-any */
import { useVideoEditorStore } from '@/frontend/features/editor/stores/videoEditor';
import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export const useUnsavedChangesWarning = () => {
  const { hasUnsavedChanges, isSaving, saveProjectData } =
    useVideoEditorStore();

  // Browser beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges || isSaving) {
        e.preventDefault();
        // Modern browsers ignore custom messages, but setting returnValue triggers the dialog
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, isSaving]);

  // React Router navigation blocker
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      (hasUnsavedChanges || isSaving) &&
      currentLocation.pathname !== nextLocation.pathname,
  );

  // Handle Electron app quit (if you have IPC for this)
  useEffect(() => {
    const handleAppQuit = async (e: any) => {
      if (hasUnsavedChanges || isSaving) {
        e.preventDefault();

        // Try to save before quitting
        if (hasUnsavedChanges) {
          try {
            await saveProjectData();
          } catch (error) {
            console.error('Failed to save before quit:', error);
          }
        }

        // Show native dialog
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to quit?',
        );

        if (confirmed) {
          window.appControl?.quitApp();
        }
      }
    };

    // Add Electron IPC listener if available
    window.electronAPI.on('app-quit', handleAppQuit);

    return () => {
      // Cleanup if needed
      window.electronAPI.removeListener('app-quit', handleAppQuit);
    };
  }, [hasUnsavedChanges, isSaving, saveProjectData]);

  return { blocker };
};
