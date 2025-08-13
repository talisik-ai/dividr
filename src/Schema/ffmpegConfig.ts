export interface TrackInfo {
  path: string;
  startTime?: number; // in seconds
  duration?: number; // in seconds
  endTime?: number; // in seconds
}

export interface VideoEditJob {
  inputs: string[] | TrackInfo[]; // Support both simple paths and detailed track info
  output: string;
  operations: {
    concat?: boolean;
    trim?: { start?: string; duration?: string; end?: string };
    crop?: { width: number; height: number; x: number; y: number };
    subtitles?: string;
    aspect?: string;
    replaceAudio?: string;
    normalizeFrameRate?: boolean;
    targetFrameRate?: number;
  };
}