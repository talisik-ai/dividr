/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { useVideoEditorStore } from '../index';

/**
 * Hook to automatically record track state when drag operations START
 * This ensures move and resize operations are captured for undo/redo
 * Recording happens BEFORE the drag so we capture the pre-change state
 */
export const useTrackDragRecording = () => {
  const isDragging = useVideoEditorStore(
    (state) => state.playback.isDraggingTrack,
  );
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    // When drag STARTS, record the current state (before any changes)
    if (!wasDraggingRef.current && isDragging) {
      const store = useVideoEditorStore.getState();
      store.recordAction?.('Move/Resize Track');
    }

    wasDraggingRef.current = isDragging;
  }, [isDragging]);
};
