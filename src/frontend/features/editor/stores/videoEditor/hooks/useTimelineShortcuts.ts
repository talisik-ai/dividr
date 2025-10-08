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

  // Get the store instance for creating shortcuts
  const store = useVideoEditorStore.getState();

  // Create timeline shortcuts
  const timelineShortcuts = useMemo(() => createTimelineShortcuts(store), []);

  // Register shortcuts individually to comply with React hooks rules
  // Set in point
  useHotkeys('i', timelineShortcuts[0].handler, timelineShortcuts[0].options, [
    timeline.currentFrame,
  ]);

  // Set out point
  useHotkeys('o', timelineShortcuts[1].handler, timelineShortcuts[1].options, [
    timeline.currentFrame,
  ]);

  // Zoom in
  useHotkeys(
    'equal',
    timelineShortcuts[2].handler,
    timelineShortcuts[2].options,
    [timeline.zoom],
  );

  // Zoom out
  useHotkeys(
    'minus',
    timelineShortcuts[3].handler,
    timelineShortcuts[3].options,
    [timeline.zoom],
  );

  // Zoom reset
  useHotkeys('0', timelineShortcuts[4].handler, timelineShortcuts[4].options, [
    timeline.zoom,
  ]);

  // Toggle snap
  useHotkeys('s', timelineShortcuts[5].handler, timelineShortcuts[5].options, [
    timeline.snapEnabled,
  ]);

  // Toggle split mode
  useHotkeys('c', timelineShortcuts[6].handler, timelineShortcuts[6].options, [
    timeline.isSplitModeActive,
  ]);

  // Exit split mode
  useHotkeys(
    'escape',
    timelineShortcuts[7].handler,
    timelineShortcuts[7].options,
    [timeline.isSplitModeActive],
  );

  return {
    shortcuts: timelineShortcuts,
  };
};
