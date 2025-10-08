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
    return tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame), timeline.totalFrames)
      : timeline.totalFrames;
  }, [tracks, timeline.totalFrames]);

  // Get the store instance for creating shortcuts
  const store = useVideoEditorStore.getState();

  // Create global shortcuts with current state
  const globalShortcuts = useMemo(
    () => createGlobalShortcuts(store, effectiveEndFrame),
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

  return {
    shortcuts: globalShortcuts,
    effectiveEndFrame,
  };
};
