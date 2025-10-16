/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { useVideoEditorStore } from '../index';
import { shortcutRegistry } from '../shortcuts';

/**
 * Custom equality function to compare track end frames
 * Only triggers re-render if the actual values change
 */
const areEndFramesEqual = (a: number[], b: number[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((val, idx) => val === b[idx]);
};

/**
 * Hook to initialize the shortcut registry globally
 * This ensures shortcuts are always available in the HotkeysDialog
 * even after app reload or before Timeline component mounts
 *
 * Optimized to prevent re-renders during playback by:
 * 1. Only subscribing to track structure changes (endFrames), not the entire tracks array
 * 2. Using shallow comparison for track end frames array
 * 3. Only re-initializing when effectiveEndFrame actually changes
 */
export const useShortcutRegistryInit = (): null => {
  // Track previous values to implement custom shallow comparison
  const prevTrackEndFramesRef = useRef<number[]>([]);
  const prevTotalFramesRef = useRef<number>(0);
  const prevEffectiveEndFrameRef = useRef<number>(0);

  useEffect(() => {
    // Subscribe to store changes manually to have fine-grained control
    const unsubscribe = useVideoEditorStore.subscribe((state) => {
      // Extract only the values we need
      const tracksLength = state.tracks.length;
      const totalFrames = state.timeline.totalFrames;
      const trackEndFrames = state.tracks.map((track: any) => track.endFrame);

      // Check if any relevant values have changed
      const totalFramesChanged = totalFrames !== prevTotalFramesRef.current;
      const endFramesChanged = !areEndFramesEqual(
        trackEndFrames,
        prevTrackEndFramesRef.current,
      );

      // Skip if nothing changed
      if (!totalFramesChanged && !endFramesChanged) {
        return;
      }

      // Calculate new effective end frame
      let newEffectiveEndFrame: number;
      if (tracksLength === 0) {
        newEffectiveEndFrame = totalFrames;
      } else {
        newEffectiveEndFrame = Math.max(...trackEndFrames);
      }

      // Only re-initialize if the effective end frame actually changed
      if (newEffectiveEndFrame !== prevEffectiveEndFrameRef.current) {
        prevEffectiveEndFrameRef.current = newEffectiveEndFrame;
        shortcutRegistry.initialize(
          useVideoEditorStore.getState,
          newEffectiveEndFrame,
        );
      }

      // Update refs
      prevTrackEndFramesRef.current = trackEndFrames;
      prevTotalFramesRef.current = totalFrames;
    });

    // Initial initialization on mount
    const state = useVideoEditorStore.getState();
    const initialTracksLength = state.tracks.length;
    const initialTotalFrames = state.timeline.totalFrames;
    const initialTrackEndFrames = state.tracks.map(
      (track: any) => track.endFrame,
    );

    const initialEffectiveEndFrame =
      initialTracksLength === 0
        ? initialTotalFrames
        : Math.max(...initialTrackEndFrames);

    prevEffectiveEndFrameRef.current = initialEffectiveEndFrame;
    prevTrackEndFramesRef.current = initialTrackEndFrames;
    prevTotalFramesRef.current = initialTotalFrames;

    shortcutRegistry.initialize(
      useVideoEditorStore.getState,
      initialEffectiveEndFrame,
    );

    return unsubscribe;
  }, []); // Empty deps - only run on mount/unmount

  return null;
};
