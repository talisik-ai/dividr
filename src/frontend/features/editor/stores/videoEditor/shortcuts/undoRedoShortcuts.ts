/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Create undo/redo keyboard shortcuts
 * These are global shortcuts that can be used anywhere in the editor
 */
export const createUndoRedoShortcuts = (store: any): ShortcutConfig[] => {
  return [
    {
      id: 'undo',
      keys: ['ctrl+z', 'cmd+z'],
      description: 'Undo last action',
      category: 'Edit',
      scope: 'global',
      priority: 'high',
      handler: (event) => {
        event?.preventDefault();
        const currentStore = store();
        if (currentStore.canUndo()) {
          currentStore.undo();
        }
      },
      options: {
        enableOnFormTags: false,
        preventDefault: true,
      },
    },
    {
      id: 'redo-shift',
      keys: ['ctrl+shift+z', 'cmd+shift+z'],
      description: 'Redo last undone action',
      category: 'Edit',
      scope: 'global',
      priority: 'high',
      handler: (event) => {
        event?.preventDefault();
        const currentStore = store();
        if (currentStore.canRedo()) {
          currentStore.redo();
        }
      },
      options: {
        enableOnFormTags: false,
        preventDefault: true,
      },
    },
    {
      id: 'redo-y',
      keys: ['ctrl+y', 'cmd+y'],
      description: 'Redo last undone action (alternative)',
      category: 'Edit',
      scope: 'global',
      priority: 'high',
      handler: (event) => {
        event?.preventDefault();
        const currentStore = store();
        if (currentStore.canRedo()) {
          currentStore.redo();
        }
      },
      options: {
        enableOnFormTags: false,
        preventDefault: true,
      },
    },
  ];
};
