export interface VideoTrack {
  id: string;
  type: 'video' | 'audio' | 'image' | 'subtitle' | 'text';
  name: string;
  source: string;
  previewUrl?: string;
  originalFile?: File;
  tempFilePath?: string;
  mediaId?: string; // Media library ID for accurate waveform/sprite lookup
  duration: number; // Current visible duration in frames (timeline length)
  sourceDuration?: number; // Original source media duration in frames (for trimming boundaries - video/audio only; dynamically updated for text/subtitle/image)
  startFrame: number;
  endFrame: number;
  sourceStartTime?: number; // in seconds - where in the source file this track segment starts (trim in-point)
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
  aspectRatio?: number; // Calculated aspect ratio (width / height)
  detectedAspectRatioLabel?: string; // Human-readable label (e.g., '16:9', '9:16', '1:1')
  /**
   * Original FPS extracted from the source video file (IMMUTABLE)
   * This value must NEVER be mutated after track creation.
   * When a track is deleted and re-added, it always restores to this original FPS.
   * Used for: timeline display, track duration calculation, playback synchronization
   */
  sourceFps?: number;
  /**
   * User-set FPS for this track (used for export interpretation only)
   * This can be modified by the user for export purposes, but does not affect
   * timeline display or track length calculations (which use sourceFps).
   * Defaults to sourceFps when track is created.
   */
  effectiveFps?: number;
  volume?: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  color: string;
  subtitleText?: string;
  subtitleType?: 'karaoke' | 'regular'; // Distinguish between karaoke (generated) and regular (imported) subtitles
  linkedTrackId?: string;
  isLinked?: boolean;
  layer?: number; // Layer index for video/image tracks (0 = base layer, higher = overlay priority)
  // For subtitle tracks: reference to the source video/audio track they were generated from
  linkedVideoTrackId?: string;
  // Precise subtitle timing from original SRT file (in seconds with millisecond precision)
  subtitleStartTime?: number; // Original start time from SRT (seconds)
  subtitleEndTime?: number; // Original end time from SRT (seconds)
  // Global subtitle transform (position only - applies to ALL subtitle tracks)
  subtitleTransform?: {
    x: number; // X position normalized (-1 to 1, relative to video center, 0 = center)
    y: number; // Y position normalized (-1 to 1, relative to video center, default bottom-aligned)
  };
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
  // Per-segment subtitle styling (overrides global styles when present)
  subtitleStyle?: {
    fontFamily?: string;
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
  // Transform properties for text clips (position, scale, rotation)
  textTransform?: {
    x: number; // X position normalized (-1 to 1, relative to video center, 0 = center)
    y: number; // Y position normalized (-1 to 1, relative to video center, 0 = center)
    scale: number; // Scale factor (1 = 100%)
    rotation: number; // Rotation in degrees
    width: number; // Width in pixels (actual rendered width)
    height: number; // Height in pixels (actual rendered height)
  };
}
