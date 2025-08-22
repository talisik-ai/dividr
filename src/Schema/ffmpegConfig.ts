export interface TrackInfo {
  path: string;
  startTime?: number; // in seconds
  duration?: number; // in seconds
  endTime?: number; // in seconds
}

export interface VideoEditJob {
  inputs: string[] | TrackInfo[]; // Support both simple paths and detailed track info
  output: string;
  outputPath?: string; // Optional output directory path
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

export interface CommandParts {
  args: string[];
  filters: string[];
}

export interface AudioTrimResult {
  filterRef: string;
  filters: string[];
}

export interface AudioProcessingContext {
  trackInfo: TrackInfo;
  originalIndex: number;
  fileIndex: number;
  inputStreamRef: string;
}

export interface VideoProcessingContext {
  trackInfo: TrackInfo;
  originalIndex: number;
  fileIndex: number;
  inputStreamRef: string;
}

export interface InputCategory {
  originalIndex: number;
  fileIndex: number;
  trackInfo: TrackInfo;
  isGap: boolean;
}

export interface CategorizedInputs {
  videoInputs: InputCategory[];
  audioInputs: Omit<InputCategory, 'isGap'>[];
  fileInputIndex: number;
}
