export interface VideoTrack {
  id: string;
  type: 'video' | 'audio' | 'image' | 'subtitle' | 'text';
  name: string;
  source: string;
  previewUrl?: string;
  originalFile?: File;
  tempFilePath?: string;
  duration: number; // Current visible duration in frames (timeline length)
  sourceDuration?: number; // Original source media duration in frames (for trimming boundaries)
  startFrame: number;
  endFrame: number;
  sourceStartTime?: number; // in seconds - where in the source file this track segment starts (trim in-point)
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
  volume?: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  color: string;
  subtitleText?: string;
  linkedTrackId?: string;
  isLinked?: boolean;
  // Precise subtitle timing from original SRT file (in seconds with millisecond precision)
  subtitleStartTime?: number; // Original start time from SRT (seconds)
  subtitleEndTime?: number; // Original end time from SRT (seconds)
  // Text clip properties (for type === 'text')
  textContent?: string; // The actual text content for text clips
  textType?: 'heading' | 'body'; // Type of text clip
  textStyle?: {
    // Per-clip text styling (independent from global subtitle styles)
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
  };
}
