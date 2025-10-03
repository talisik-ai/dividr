export interface TimelineState {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollX: number;
  inPoint?: number;
  outPoint?: number;
  selectedTrackIds: string[];
  playheadVisible: boolean;
  snapEnabled: boolean;
  isSplitModeActive: boolean;
}

export interface SnapPoint {
  frame: number;
  type: 'playhead' | 'track-start' | 'track-end' | 'in-point' | 'out-point';
  trackId?: string;
}
