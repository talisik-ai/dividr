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
export const usePreviewShortcuts = (enabled: boolean = true) => {
  const preview = useVideoEditorStore((state) => state.preview);

  // Create preview shortcuts with a getter function to always access fresh state
  const previewShortcuts = useMemo(
    () => createPreviewShortcuts(useVideoEditorStore.getState),
    [],
  );

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

  return {
    shortcuts: previewShortcuts,
  };
};
