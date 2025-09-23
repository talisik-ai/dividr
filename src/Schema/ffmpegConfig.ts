export interface TrackInfo {
  path: string;
  startTime?: number; // in seconds
  duration?: number; // in seconds
  endTime?: number; // in seconds
  startFrame?: number;
  muted?: boolean; // Whether this track's audio should be muted
  trackType?: 'video' | 'audio' | 'image' | 'subtitle'; // Type of the track
  visible?: boolean; // Whether this track's video should be visible (if false, show black)
  gapType?: 'video' | 'audio';
}

export interface TextStyleConfig {
  fontWeight?: string | number;
  fontStyle?: string;
  fontFamily?: string;
  textTransform?: string;
}

export interface Gap { // Gap Interface
  startFrame: number;
  length: number;
}

export interface TimelineGaps { // interface for the 3 timeline objects
  video: Gap[];
  audio: Gap[];
  subtitles: Gap[];
}
export type EncodingPreset =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow';

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
    textStyle?: TextStyleConfig; // Text styling for subtitles
    preset?: EncodingPreset; // FFmpeg encoding preset for speed/quality tradeoff
    threads?: number; // Limit used threads
  };
  gaps?: TimelineGaps;
  subtitleContent?: string; // SRT content to be written to a temporary file
  subtitleFormat?: 'srt' | 'vtt' | 'ass'; // Subtitle format for export
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
