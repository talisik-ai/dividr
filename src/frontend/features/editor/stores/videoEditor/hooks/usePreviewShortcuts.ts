/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../index';
import { createPreviewShortcuts } from '../shortcuts/previewShortcuts';

/**
 * Hook for preview keyboard shortcuts
 * These shortcuts are active only when the preview area has focus
 *
 * @param enabled - Whether the shortcuts should be active (preview is focused)
 */
export const usePreviewShortcuts = (enabled = true) => {
  const preview = useVideoEditorStore((state) => state.preview);

  // Create preview shortcuts with a getter function to always access fresh state
  const previewShortcuts = useMemo(
    () => createPreviewShortcuts(useVideoEditorStore.getState),
    [],
  );

  // Preview Tools
  // V - Select Tool (Preview)
  useHotkeys(
    'v',
    previewShortcuts[0].handler,
    {
      ...previewShortcuts[0].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.interactionMode, enabled],
  );

  // H - Hand Tool (Preview)
  useHotkeys(
    'h',
    previewShortcuts[1].handler,
    {
      ...previewShortcuts[1].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.interactionMode, preview.previewScale, enabled],
  );

  // F - Toggle Fullscreen
  useHotkeys(
    'f',
    previewShortcuts[2].handler,
    {
      ...previewShortcuts[2].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.isFullscreen, enabled],
  );

  // Preview Zoom Shortcuts
  // Shift+0 - Zoom to 25%
  useHotkeys(
    'shift+0',
    previewShortcuts[3].handler,
    {
      ...previewShortcuts[3].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, enabled],
  );

  // Shift+1 - Zoom to 50%
  useHotkeys(
    'shift+1',
    previewShortcuts[4].handler,
    {
      ...previewShortcuts[4].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, enabled],
  );

  // Shift+F - Zoom to Fit (100%)
  useHotkeys(
    'shift+f',
    previewShortcuts[5].handler,
    {
      ...previewShortcuts[5].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, preview.panX, preview.panY, enabled],
  );

  // Shift+2 - Zoom to 200%
  useHotkeys(
    'shift+2',
    previewShortcuts[6].handler,
    {
      ...previewShortcuts[6].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, enabled],
  );

  // Shift+3 - Zoom to 400%
  useHotkeys(
    'shift+3',
    previewShortcuts[7].handler,
    {
      ...previewShortcuts[7].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, enabled],
  );

  // Ctrl+= - Zoom In
  useHotkeys(
    'ctrl+equal',
    previewShortcuts[8].handler,
    {
      ...previewShortcuts[8].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, enabled],
  );

  // Ctrl+- - Zoom Out
  useHotkeys(
    'ctrl+minus',
    previewShortcuts[9].handler,
    {
      ...previewShortcuts[9].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, enabled],
  );

  // Ctrl+0 - Reset Zoom
  useHotkeys(
    'ctrl+0',
    previewShortcuts[10].handler,
    {
      ...previewShortcuts[10].options,
      enabled,
      enableOnFormTags: false,
      preventDefault: true,
    },
    [preview.previewScale, preview.panX, preview.panY, enabled],
  );

  return {
    shortcuts: previewShortcuts,
  };
};
