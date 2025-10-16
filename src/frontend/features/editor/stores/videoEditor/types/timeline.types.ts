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
  visibleTrackRows: string[]; // Track row IDs that are visible (e.g., ['video', 'audio', 'subtitle', 'logo'])
}

export interface SnapPoint {
  frame: number;
  type: 'playhead' | 'track-start' | 'track-end' | 'in-point' | 'out-point';
  trackId?: string;
}
