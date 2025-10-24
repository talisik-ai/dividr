export interface PlaybackState {
  isPlaying: boolean;
  isLooping: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  isDraggingTrack: boolean;
  wasPlayingBeforeDrag: boolean;
  magneticSnapFrame: number | null; // For visual indicator when Shift + dragging

  // Playhead drag state for scrubbing
  isDraggingPlayhead: boolean;
  wasPlayingBeforePlayheadDrag: boolean;

  // Force drag tracking for progressive boundary bypass
  dragStartFrame: number | null; // Initial position when drag started
  boundaryCollisionCount: number; // Number of consecutive boundary collisions
  lastAttemptedFrame: number | null; // Last frame position attempted during drag

  // Drag ghost state for visual feedback
  dragGhost: {
    isActive: boolean;
    trackId: string | null; // Primary track being dragged
    selectedTrackIds: string[]; // All tracks in the drag (for multi-selection)
    mouseX: number;
    mouseY: number;
    offsetX: number; // Offset from left edge of primary track to cursor
    offsetY: number; // Offset from top edge of primary track to cursor
    targetRow: string | null; // Target track row for drop (primary track)
    targetFrame: number | null; // Target start frame for drop (primary track)
    isMultiSelection: boolean; // Whether this is a multi-track drag
  } | null;
}
