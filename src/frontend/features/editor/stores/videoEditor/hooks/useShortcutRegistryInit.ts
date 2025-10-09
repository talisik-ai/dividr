/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo } from 'react';
import { useVideoEditorStore } from '../index';
import { shortcutRegistry } from '../shortcuts';

/**
 * Hook to initialize the shortcut registry globally
 * This ensures shortcuts are always available in the HotkeysDialog
 * even after app reload or before Timeline component mounts
 */
export const useShortcutRegistryInit = (): null => {
  const tracks = useVideoEditorStore((state) => state.tracks);
  const timeline = useVideoEditorStore((state) => state.timeline);

  // Calculate effective end frame
  const effectiveEndFrame = useMemo(() => {
    return tracks.length > 0
      ? Math.max(
          ...tracks.map((track: any) => track.endFrame),
          timeline.totalFrames,
        )
      : timeline.totalFrames;
  }, [tracks, timeline.totalFrames]);

  // Initialize registry on mount and when effectiveEndFrame changes
  useEffect(() => {
    shortcutRegistry.initialize(
      useVideoEditorStore.getState,
      effectiveEndFrame,
    );
  }, [effectiveEndFrame]);

  return null;
};
