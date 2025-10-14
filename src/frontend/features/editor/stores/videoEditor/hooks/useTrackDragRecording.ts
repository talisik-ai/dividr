/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from 'react';
import { useVideoEditorStore } from '../index';

/**
 * Hook to automatically record track state when drag operations complete
 * This ensures move and resize operations are captured for undo/redo
 *
 * NOTE: Recording now happens at drag END via endDraggingTrack()
 * This hook is kept for compatibility but delegates to the store method
 */
export const useTrackDragRecording = () => {
  const isDragging = useVideoEditorStore(
    (state) => state.playback.isDraggingTrack,
  );
  const wasDraggingRef = useRef(false);

  useEffect(() => {
    // Recording is now handled by endDraggingTrack() with recordUndo parameter
    // This hook remains for backward compatibility but does not duplicate recording
    // When drag ENDS, endDraggingTrack() automatically records the action

    wasDraggingRef.current = isDragging;
  }, [isDragging]);
};
