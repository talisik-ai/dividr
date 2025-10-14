export interface PlaybackState {
  isPlaying: boolean;
  isLooping: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  isDraggingTrack: boolean;
  wasPlayingBeforeDrag: boolean;
  magneticSnapFrame: number | null; // For visual indicator when Shift + dragging

  // Force drag tracking for progressive boundary bypass
  dragStartFrame: number | null; // Initial position when drag started
  boundaryCollisionCount: number; // Number of consecutive boundary collisions
  lastAttemptedFrame: number | null; // Last frame position attempted during drag
}
