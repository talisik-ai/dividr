/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../index';
import { createGlobalShortcuts } from '../shortcuts/globalShortcuts';

/**
 * Hook for global keyboard shortcuts
 * These shortcuts are always active regardless of focus state
 */
export const useGlobalShortcuts = () => {
  const timeline = useVideoEditorStore((state) => state.timeline);
  const tracks = useVideoEditorStore((state) => state.tracks);

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
      createGlobalShortcuts(useVideoEditorStore.getState, effectiveEndFrame),
    [effectiveEndFrame],
  );

  // Register shortcuts individually to comply with React hooks rules
  // Playback toggle
  useHotkeys('space', globalShortcuts[0].handler, globalShortcuts[0].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate home
  useHotkeys('home', globalShortcuts[1].handler, globalShortcuts[1].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate end
  useHotkeys('end', globalShortcuts[2].handler, globalShortcuts[2].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate frame prev
  useHotkeys('left', globalShortcuts[3].handler, globalShortcuts[3].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate frame next
  useHotkeys('right', globalShortcuts[4].handler, globalShortcuts[4].options, [
    effectiveEndFrame,
    timeline.currentFrame,
  ]);

  // Navigate frame prev fast (Shift+Left)
  useHotkeys(
    'shift+left',
    globalShortcuts[5].handler,
    globalShortcuts[5].options,
    [effectiveEndFrame, timeline.currentFrame, timeline.fps],
  );

  // Navigate frame next fast (Shift+Right)
  useHotkeys(
    'shift+right',
    globalShortcuts[6].handler,
    globalShortcuts[6].options,
    [effectiveEndFrame, timeline.currentFrame, timeline.fps],
  );

  // Navigate to next edit point (Down)
  useHotkeys('down', globalShortcuts[7].handler, globalShortcuts[7].options, [
    effectiveEndFrame,
    timeline.currentFrame,
    tracks,
  ]);

  // Navigate to previous edit point (Up)
  useHotkeys('up', globalShortcuts[8].handler, globalShortcuts[8].options, [
    effectiveEndFrame,
    timeline.currentFrame,
    tracks,
  ]);

  return {
    shortcuts: globalShortcuts,
    effectiveEndFrame,
  };
};
