export interface TrackInfo {
  path: string;
  audioPath?: string;
  audioFileIndex?: number; // File index for the separate audio file (if audioPath is provided)
  startTime?: number; // Source trim start time in seconds (where to start reading from source file)
  duration?: number; // Duration in seconds (how long to read from source)
  endTime?: number; // in seconds
  timelineStartFrame?: number; // Timeline position where this track starts (in frames)
  timelineEndFrame?: number; // Timeline position where this track ends (in frames)
  muted?: boolean; // Whether this track's audio should be muted
  trackType?: 'video' | 'audio' | 'image' | 'subtitle' | 'text' | 'both'; // Type of the track
  visible?: boolean; // Whether this track's video should be visible (if false, show black)
  gapType?: 'video' | 'audio' | 'both';
  width?: number;
  height?: number;
  isImage?: boolean; // Internal flag to mark image layers for overlay processing
  layer?: number; // Layer index for video/image tracks (0 = base layer, higher = overlay priority)
}

export interface TextStyleConfig {
  fontWeight?: string | number;
  fontStyle?: string;
  fontFamily?: string;
  textTransform?: string;
}

export interface TextClipTransform {
  x: number; // Normalized position (-1 to 1)
  y: number; // Normalized position (-1 to 1)
  scale: number; // Scale factor
  rotation: number; // Rotation in degrees
  width: number; // Width in pixels (actual rendered width)
  height: number; // Height in pixels (actual rendered height)
}

export interface TextClipStyle {
  fontFamily?: string;
  fontWeight?: string;
  fontStyle?: string;
  isBold?: boolean;
  isItalic?: boolean;
  isUnderline?: boolean;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  fontSize?: number;
  fillColor?: string;
  strokeColor?: string;
  backgroundColor?: string;
  hasShadow?: boolean;
  letterSpacing?: number;
  lineSpacing?: number;
  hasGlow?: boolean;
  opacity?: number;
}

export interface TextClipData {
  id: string;
  content: string;
  type: 'heading' | 'body';
  startFrame: number;
  endFrame: number;
  duration: number;
  style: TextClipStyle;
  transform: TextClipTransform;
  fontFile: string; // Font family name from frontend (backend resolves to absolute path)
}

export interface Gap {
  // Gap Interface
  startFrame: number;
  length: number;
}

export interface TimelineGaps {
  // interface for the 3 timeline objects
  video: Gap[];
  audio: Gap[];
  subtitles?: Gap[];
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
    useHardwareAcceleration?: boolean; // Enable hardware acceleration if available
    hwaccelType?:
      | 'auto'
      | 'nvenc'
      | 'qsv'
      | 'amf'
      | 'videotoolbox'
      | 'vaapi'
      | 'none'; // Specific hardware type or auto-detect
    preferHEVC?: boolean; // Prefer H.265/HEVC over H.264 if available
  };
  gaps?: TimelineGaps;
  subtitleContent?: string; // SRT content to be written to a temporary file
  subtitleFormat?: 'srt' | 'vtt' | 'ass'; // Subtitle format for export
  videoDimensions?: { width: number; height: number };
  textClips?: TextClipData[]; // Text clips for rendering (heading/body)
  textClipsContent?: string; // Generated ASS content for text clips
  subtitleFontFamilies?: string[]; // Font families used in subtitles (resolved to paths in main process)
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

export interface ProcessedTimelineSegment {
  input: TrackInfo;
  originalIndex: number;
  startTime: number;
  duration: number;
  endTime: number;
  timelineType: 'video' | 'audio';
  layer?: number; // Layer index for video/image segments (0 = base, higher = overlay priority)
}

export interface ProcessedTimeline {
  segments: ProcessedTimelineSegment[];
  totalDuration: number;
  timelineType: 'video' | 'audio';
}
