/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../index';
import { createGlobalShortcuts } from '../shortcuts/globalShortcuts';
import { useProjectShortcutHandlers } from '../shortcuts/hooks/useProjectShortcutHandlers';
import { useProjectShortcutDialog } from '../shortcuts/hooks/useProjectShortcutDialog';

/**
 * Hook for global keyboard shortcuts
 * These shortcuts are always active regardless of focus state
 */
export const useGlobalShortcuts = () => {
  const timeline = useVideoEditorStore((state) => state.timeline);
  const tracks = useVideoEditorStore((state) => state.tracks);

  // Setup project shortcut dialog
  const { showConfirmation, ConfirmationDialog } = useProjectShortcutDialog();

  // Setup project shortcut handlers
  const projectHandlers = useProjectShortcutHandlers(showConfirmation);

  // Calculate effective end frame
  const effectiveEndFrame = useMemo(() => {
    // When tracks exist, use the maximum track end frame
    // Only use totalFrames as fallback when no tracks exist
    return tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame))
      : timeline.totalFrames;
  }, [tracks, timeline.totalFrames]);

  // Create global shortcuts with a getter function to always access fresh state
  const globalShortcuts = useMemo(
    () =>
      createGlobalShortcuts(
        useVideoEditorStore.getState,
        effectiveEndFrame,
        projectHandlers,
      ),
    [effectiveEndFrame, projectHandlers],
  );

  // Register shortcuts individually to comply with React hooks rules
  // Playback toggle (index 7, after 7 project shortcuts)
  useHotkeys('space', globalShortcuts[7].handler, globalShortcuts[7].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate frame prev
  useHotkeys('left', globalShortcuts[8].handler, globalShortcuts[8].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate frame next
  useHotkeys('right', globalShortcuts[9].handler, globalShortcuts[9].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate frame prev fast (Shift+Left)
  useHotkeys(
    'shift+left',
    globalShortcuts[10].handler,
    globalShortcuts[10].options,
    [effectiveEndFrame, timeline.currentFrame, timeline.fps],
  );

  // Navigate frame next fast (Shift+Right)
  useHotkeys(
    'shift+right',
    globalShortcuts[11].handler,
    globalShortcuts[11].options,
    [effectiveEndFrame, timeline.currentFrame, timeline.fps],
  );

  // Navigate to next edit point (Down)
  useHotkeys('down', globalShortcuts[12].handler, globalShortcuts[12].options, [
    effectiveEndFrame,
    timeline.currentFrame,
    tracks,
  ]);

  // Navigate to previous edit point (Up)
  useHotkeys('up', globalShortcuts[13].handler, globalShortcuts[13].options, [
    effectiveEndFrame,
    timeline.currentFrame,
    tracks,
  ]);

  // Project shortcuts (indices 0-6 are project shortcuts)
  // New Project (Ctrl+N / Cmd+N)
  useHotkeys(
    ['ctrl+n', 'meta+n'],
    globalShortcuts[0].handler,
    { preventDefault: true, enableOnFormTags: false },
    [],
  );

  // Open Project (Ctrl+O / Cmd+O)
  useHotkeys(
    ['ctrl+o', 'meta+o'],
    globalShortcuts[1].handler,
    { preventDefault: true, enableOnFormTags: false },
    [],
  );

  // Save Project (Ctrl+S / Cmd+S)
  useHotkeys(
    ['ctrl+s', 'meta+s'],
    globalShortcuts[2].handler,
    { preventDefault: true, enableOnFormTags: false },
    [],
  );

  // Save Project As (Ctrl+Shift+S / Cmd+Shift+S)
  useHotkeys(
    ['ctrl+shift+s', 'meta+shift+s'],
    globalShortcuts[3].handler,
    { preventDefault: true, enableOnFormTags: false },
    [],
  );

  // Import Media (Ctrl+I / Cmd+I)
  useHotkeys(
    ['ctrl+i', 'meta+i'],
    globalShortcuts[4].handler,
    { preventDefault: true, enableOnFormTags: false },
    [],
  );

  // Export Video (Ctrl+E / Cmd+E)
  useHotkeys(
    ['ctrl+e', 'meta+e'],
    globalShortcuts[5].handler,
    { preventDefault: true, enableOnFormTags: false },
    [],
  );

  // Close Project (Ctrl+W / Cmd+W)
  useHotkeys(
    ['ctrl+w', 'meta+w'],
    globalShortcuts[6].handler,
    { preventDefault: true, enableOnFormTags: false },
    [],
  );

  return {
    shortcuts: globalShortcuts,
    effectiveEndFrame,
    ConfirmationDialog,
  };
};
