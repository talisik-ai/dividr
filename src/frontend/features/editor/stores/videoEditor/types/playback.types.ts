export interface PlaybackState {
  isPlaying: boolean;
  isLooping: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
  isDraggingTrack: boolean;
  wasPlayingBeforeDrag: boolean;
  magneticSnapFrame: number | null; // For visual indicator when Shift + dragging
}
