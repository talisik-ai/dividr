/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Project-level shortcuts - active globally for project management
 * Implements industry-standard project actions following conventions from
 * Premiere Pro, After Effects, DaVinci Resolve, etc.
 *
 * All shortcuts prevent default Electron behavior and work within a single window.
 * Navigation and state management are handled via React Router and Zustand stores.
 */

/**
 * Project Shortcut Handlers Interface
 * Define callbacks for each project action to be implemented by the consuming component
 */
export interface ProjectShortcutHandlers {
  onNewProject: () => void;
  onOpenProject: () => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onImportMedia: () => void;
  onExportVideo: () => void;
  onCloseProject: () => void;
}

/**
 * Creates project-level keyboard shortcuts
 * @param getStore - Function to get the video editor store state
 * @param handlers - Object containing handler functions for each shortcut action
 * @returns Array of shortcut configurations
 */
export const createProjectShortcuts = (
  getStore: () => any,
  handlers: ProjectShortcutHandlers,
): ShortcutConfig[] => [
  {
    id: 'project-new',
    keys: ['ctrl+n', 'meta+n'],
    description: 'New Project',
    category: 'Project',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      handlers.onNewProject();
    },
  },
  {
    id: 'project-open',
    keys: ['ctrl+o', 'meta+o'],
    description: 'Open Project',
    category: 'Project',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      handlers.onOpenProject();
    },
  },
  {
    id: 'project-save',
    keys: ['ctrl+s', 'meta+s'],
    description: 'Save Project',
    category: 'Project',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      handlers.onSaveProject();
    },
  },
  {
    id: 'project-save-as',
    keys: ['ctrl+shift+s', 'meta+shift+s'],
    description: 'Save Project As...',
    category: 'Project',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      handlers.onSaveProjectAs();
    },
  },
  {
    id: 'project-import',
    keys: ['ctrl+i', 'meta+i'],
    description: 'Import Media',
    category: 'Project',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      handlers.onImportMedia();
    },
  },
  {
    id: 'project-export',
    keys: ['ctrl+e', 'meta+e'],
    description: 'Export Video',
    category: 'Project',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      handlers.onExportVideo();
    },
  },
  {
    id: 'project-close',
    keys: ['ctrl+w', 'meta+w'],
    description: 'Close Project',
    category: 'Project',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      e?.stopPropagation();
      handlers.onCloseProject();
    },
  },
];
