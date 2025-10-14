/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Preview shortcuts - active when focus is on the video preview area
 * These include preview interaction mode shortcuts (Select, Hand, Fullscreen)
 */
export const createPreviewShortcuts = (
  getStore: () => any,
): ShortcutConfig[] => [
  {
    id: 'preview-select-tool',
    keys: 'v',
    description: 'Select Tool (Preview)',
    category: 'Preview Tools',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().setPreviewInteractionMode('select');
    },
  },
  {
    id: 'preview-hand-tool',
    keys: 'h',
    description: 'Hand Tool (Preview)',
    category: 'Preview Tools',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      const store = getStore();
      // Only activate hand tool if zoomed in
      if (store.preview.previewScale > 1) {
        store.setPreviewInteractionMode('pan');
      }
    },
  },
  {
    id: 'preview-toggle-fullscreen',
    keys: 'f',
    description: 'Toggle Fullscreen',
    category: 'Preview Tools',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().toggleFullscreen();
    },
  },
];
