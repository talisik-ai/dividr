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
  // Note: Multiple shortcuts with same handler (split, duplicate) consolidated

  // Split at playhead (S key)
  useHotkeys('s', trackShortcuts[0].handler, trackShortcuts[0].options, [
    timeline.selectedTrackIds,
  ]);

  // Split at playhead (Ctrl+K)
  useHotkeys('ctrl+k', trackShortcuts[1].handler, trackShortcuts[1].options, [
    timeline.selectedTrackIds,
  ]);

  // Split at playhead (Cmd+K)
  useHotkeys('cmd+k', trackShortcuts[2].handler, trackShortcuts[2].options, [
    timeline.selectedTrackIds,
  ]);

  // Duplicate track (Ctrl+D)
  useHotkeys('ctrl+d', trackShortcuts[3].handler, trackShortcuts[3].options, [
    timeline.selectedTrackIds,
  ]);

  // Duplicate track (Cmd+D)
  useHotkeys('cmd+d', trackShortcuts[4].handler, trackShortcuts[4].options, [
    timeline.selectedTrackIds,
  ]);

  // Toggle visibility
  useHotkeys('v', trackShortcuts[5].handler, trackShortcuts[5].options, [
    timeline.selectedTrackIds,
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

  return {
    shortcuts: trackShortcuts,
  };
};
