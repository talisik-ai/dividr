/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../index';
import { createTrackShortcuts } from '../shortcuts/trackShortcuts';

/**
 * Hook for track-level keyboard shortcuts
 * These shortcuts are active when tracks are selected or focused
 */
export const useTrackShortcuts = () => {
  const timeline = useVideoEditorStore((state) => state.timeline);

  // Get the store instance for creating shortcuts
  const store = useVideoEditorStore.getState();

  // Create track shortcuts
  const trackShortcuts = useMemo(() => createTrackShortcuts(store), []);

  // Register shortcuts individually to comply with React hooks rules

  // Slice at playhead (Ctrl+B)
  useHotkeys('ctrl+b', trackShortcuts[0].handler, trackShortcuts[0].options, [
    timeline.selectedTrackIds,
  ]);

  // Slice at playhead (Cmd+B)
  useHotkeys('cmd+b', trackShortcuts[1].handler, trackShortcuts[1].options, [
    timeline.selectedTrackIds,
  ]);

  // Duplicate track (Ctrl+D)
  useHotkeys('ctrl+d', trackShortcuts[2].handler, trackShortcuts[2].options, [
    timeline.selectedTrackIds,
  ]);

  // Duplicate track (Cmd+D)
  useHotkeys('cmd+d', trackShortcuts[3].handler, trackShortcuts[3].options, [
    timeline.selectedTrackIds,
  ]);

  // Selection tool (V key)
  useHotkeys('v', trackShortcuts[4].handler, trackShortcuts[4].options, [
    timeline.isSplitModeActive,
  ]);

  // Slice tool mode (B key)
  useHotkeys('b', trackShortcuts[5].handler, trackShortcuts[5].options, [
    timeline.isSplitModeActive,
  ]);

  // Toggle mute
  useHotkeys('m', trackShortcuts[6].handler, trackShortcuts[6].options, [
    timeline.selectedTrackIds,
  ]);

  // Delete track (Del)
  useHotkeys('del', trackShortcuts[7].handler, trackShortcuts[7].options, [
    timeline.selectedTrackIds,
  ]);

  // Delete track (Backspace)
  useHotkeys(
    'backspace',
    trackShortcuts[8].handler,
    trackShortcuts[8].options,
    [timeline.selectedTrackIds],
  );

  // Deselect all
  useHotkeys('escape', trackShortcuts[9].handler, trackShortcuts[9].options, [
    timeline.selectedTrackIds,
  ]);

  // Link clips (Ctrl+G)
  useHotkeys('ctrl+g', trackShortcuts[10].handler, trackShortcuts[10].options, [
    timeline.selectedTrackIds,
  ]);

  // Link clips (Cmd+G)
  useHotkeys('cmd+g', trackShortcuts[11].handler, trackShortcuts[11].options, [
    timeline.selectedTrackIds,
  ]);

  // Unlink clips (Ctrl+Shift+G)
  useHotkeys(
    'ctrl+shift+g',
    trackShortcuts[12].handler,
    trackShortcuts[12].options,
    [timeline.selectedTrackIds],
  );

  // Unlink clips (Cmd+Shift+G)
  useHotkeys(
    'cmd+shift+g',
    trackShortcuts[13].handler,
    trackShortcuts[13].options,
    [timeline.selectedTrackIds],
  );

  return {
    shortcuts: trackShortcuts,
  };
};
