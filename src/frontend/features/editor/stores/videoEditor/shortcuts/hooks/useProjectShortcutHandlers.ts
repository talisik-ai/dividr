/**
 * Hook for creating project shortcut handlers
 * Connects action functions with React Router navigation and component state
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVideoEditorStore } from '../../index';
import {
  closeProjectAction,
  exportVideoAction,
  importMediaAction,
  newProjectAction,
  openProjectAction,
  saveProjectAction,
  saveProjectAsAction,
} from '../actions';
import type { ProjectShortcutHandlers } from '../projectShortcuts';

/**
 * Custom hook to create project shortcut handlers
 * @param showConfirmation - Function to show confirmation dialogs
 * @returns Object containing all project shortcut handlers
 */
export const useProjectShortcutHandlers = (
  showConfirmation: (options: {
    title: string;
    message: string;
    onConfirm: () => void;
  }) => void,
): ProjectShortcutHandlers => {
  const navigate = useNavigate();
  const importMediaFromDialog = useVideoEditorStore(
    (state) => state.importMediaFromDialog,
  );

  const onNewProject = useCallback(() => {
    newProjectAction(navigate).catch((error) => {
      console.error('[useProjectShortcutHandlers] New Project failed:', error);
    });
  }, [navigate]);

  const onOpenProject = useCallback(() => {
    openProjectAction(navigate).catch((error) => {
      console.error('[useProjectShortcutHandlers] Open Project failed:', error);
    });
  }, [navigate]);

  const onSaveProject = useCallback(() => {
    saveProjectAction().catch((error) => {
      console.error('[useProjectShortcutHandlers] Save Project failed:', error);
    });
  }, []);

  const onSaveProjectAs = useCallback(() => {
    saveProjectAsAction().catch((error) => {
      console.error(
        '[useProjectShortcutHandlers] Save Project As failed:',
        error,
      );
    });
  }, []);

  const onImportMedia = useCallback(() => {
    importMediaAction(importMediaFromDialog).catch((error) => {
      console.error('[useProjectShortcutHandlers] Import Media failed:', error);
    });
  }, [importMediaFromDialog]);

  const tracks = useVideoEditorStore((state) => state.tracks);

  const onExportVideo = useCallback(() => {
    exportVideoAction(tracks.length);
  }, [tracks.length]);

  const onCloseProject = useCallback(() => {
    closeProjectAction(navigate, showConfirmation).catch((error) => {
      console.error(
        '[useProjectShortcutHandlers] Close Project failed:',
        error,
      );
    });
  }, [navigate, showConfirmation]);

  return {
    onNewProject,
    onOpenProject,
    onSaveProject,
    onSaveProjectAs,
    onImportMedia,
    onExportVideo,
    onCloseProject,
  };
};
