/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../index';
import { createTimelineShortcuts } from '../shortcuts/timelineShortcuts';

/**
 * Hook for timeline-specific keyboard shortcuts
 * These shortcuts are active when the timeline is focused
 */
export const useTimelineShortcutsV2 = () => {
  const timeline = useVideoEditorStore((state) => state.timeline);
  const tracks = useVideoEditorStore((state) => state.tracks);

  // Create timeline shortcuts - pass getState so handlers always get fresh state
  const timelineShortcuts = useMemo(
    () => createTimelineShortcuts(useVideoEditorStore.getState()),
    [],
  );

  // Register shortcuts individually to comply with React hooks rules
  // Zoom in
  useHotkeys(
    'equal',
    timelineShortcuts[0].handler,
    timelineShortcuts[0].options,
    [timeline.zoom],
  );

  // Zoom out
  useHotkeys(
    'minus',
    timelineShortcuts[1].handler,
    timelineShortcuts[1].options,
    [timeline.zoom],
  );

  // Zoom reset
  useHotkeys('0', timelineShortcuts[2].handler, timelineShortcuts[2].options, [
    timeline.zoom,
  ]);

  // Toggle snap
  useHotkeys('s', timelineShortcuts[3].handler, timelineShortcuts[3].options, [
    timeline.snapEnabled,
  ]);

  // Note: B, C, V tool switching shortcuts are registered in useTrackShortcuts to avoid conflicts
  // Exit split mode is handled there as well via Escape key

  // Select All (Ctrl+A / Cmd+A)
  useHotkeys(
    ['ctrl+a', 'meta+a'],
    timelineShortcuts[7].handler,
    { preventDefault: true, enableOnFormTags: false },
    [tracks.length, timeline.selectedTrackIds],
  );

  return {
    shortcuts: timelineShortcuts,
  };
};
