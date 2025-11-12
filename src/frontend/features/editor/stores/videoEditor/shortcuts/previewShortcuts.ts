/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Preview shortcuts - active when focus is on the video preview area
 * These include preview interaction mode shortcuts (Select, Hand, Fullscreen)
 * and preview zoom shortcuts
 */
export const createPreviewShortcuts = (
  getStore: () => any,
): ShortcutConfig[] => [
  // Preview Tools
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
    id: 'preview-text-edit-tool',
    keys: 't',
    description: 'Text Edit Mode (Preview)',
    category: 'Preview Tools',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      const store = getStore();
      // Toggle text edit mode - if already in text edit mode, switch back to select mode
      if (store.preview.interactionMode === 'text-edit') {
        store.setPreviewInteractionMode('select');
      } else {
        store.setPreviewInteractionMode('text-edit');
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

  // Preview Zoom Shortcuts
  {
    id: 'preview-zoom-25',
    keys: 'shift+0',
    description: 'Zoom to 25%',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().setPreviewScale(0.25);
    },
  },
  {
    id: 'preview-zoom-50',
    keys: 'shift+1',
    description: 'Zoom to 50%',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().setPreviewScale(0.5);
    },
  },
  {
    id: 'preview-zoom-fit',
    keys: 'shift+f',
    description: 'Zoom to Fit (100%)',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().setPreviewScale(1);
      getStore().resetPreviewPan();
    },
  },
  {
    id: 'preview-zoom-200',
    keys: 'shift+2',
    description: 'Zoom to 200%',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().setPreviewScale(2);
    },
  },
  {
    id: 'preview-zoom-400',
    keys: 'shift+3',
    description: 'Zoom to 400%',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().setPreviewScale(4);
    },
  },
  {
    id: 'preview-zoom-in',
    keys: 'ctrl+equal',
    description: 'Zoom In (Preview)',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      const store = getStore();
      const currentScale = store.preview.previewScale;
      store.setPreviewScale(Math.min(currentScale * 1.2, 8));
    },
  },
  {
    id: 'preview-zoom-out',
    keys: 'ctrl+minus',
    description: 'Zoom Out (Preview)',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      const store = getStore();
      const currentScale = store.preview.previewScale;
      store.setPreviewScale(Math.max(currentScale / 1.2, 0.1));
    },
  },
  {
    id: 'preview-zoom-reset',
    keys: 'ctrl+0',
    description: 'Reset Zoom (100%)',
    category: 'Preview Zoom',
    scope: 'preview',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().setPreviewScale(1);
      getStore().resetPreviewPan();
    },
  },
];
