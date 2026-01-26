// =============================================================================
// CLIP METADATA - Pure Data Model for Frame-Driven Playback
// =============================================================================
//
// ClipMetadata represents a clip as PURE DATA with NO playback state.
// This is the foundation of the frame-driven playback architecture.
//
// Key principles:
// - Clips NEVER own decoders, video elements, or playback state
// - Clips are immutable during playback
// - Source frames are calculated deterministically from timeline position
// - Multiple clips can safely reference the same source
//
// The source frame formula:
//   sourceFrame = timelineFrame - timelineStartFrame + inFrame
//
// =============================================================================

// =============================================================================
// AUDIO METADATA - Audio Processing Intent Model
// =============================================================================
//
// AudioMetadata represents the audio processing intent for a clip.
// This is a DATA-ONLY model - no processing logic is executed here.
//
// Used by:
// - Audio clips (standalone)
// - Video clips with embedded/linked audio
//
// The data is passed forward to mediaToolsRunner for processing.
// =============================================================================

/**
 * Volume value in decibels.
 * - Numeric values: -60 to +12 dB
 * - '-inf': Represents complete silence (mute)
 */
export type VolumeDb = number | '-inf';

/**
 * AudioMetadata - Audio processing settings for a clip.
 *
 * This interface represents the user's INTENT for audio processing.
 * No actual processing occurs - data is forwarded to mediaToolsRunner.
 *
 * Default values:
 * - volumeDb: 0 (unity gain)
 * - noiseReductionEnabled: false
 */
export interface AudioMetadata {
  /**
   * Volume in decibels.
   * - Range: -60 to +12 dB
   * - Use '-inf' for complete mute
   * - 0 dB = unity gain (no change)
   */
  volumeDb: VolumeDb;

  /**
   * Whether noise reduction processing is enabled.
   * This is a boolean flag only - no parameters or model selection.
   * When true, signals intent to apply noise reduction during export.
   */
  noiseReductionEnabled: boolean;
}

/**
 * Default audio metadata values.
 * Used when initializing new audio-capable clips.
 */
export const DEFAULT_AUDIO_METADATA: AudioMetadata = {
  volumeDb: 0,
  noiseReductionEnabled: false,
};

/**
 * MediaToolsAudioPayload - Payload structure for mediaToolsRunner.
 *
 * This is the data format sent to mediaToolsRunner for audio processing.
 * Intent-only: no processing is executed, just data forwarding.
 */
export interface MediaToolsAudioPayload {
  /** Volume in decibels (-60 to +12, or '-inf' for mute) */
  volumeDb: VolumeDb;
  /** Whether to apply noise reduction */
  noiseReduction: boolean;
}

/**
 * Extracts audio metadata from a track as a structured object.
 * Returns default values for any missing properties.
 */
export const getAudioMetadata = (track: {
  volumeDb?: number;
  noiseReductionEnabled?: boolean;
}): AudioMetadata => {
  return {
    volumeDb: track.volumeDb ?? DEFAULT_AUDIO_METADATA.volumeDb,
    noiseReductionEnabled:
      track.noiseReductionEnabled ??
      DEFAULT_AUDIO_METADATA.noiseReductionEnabled,
  };
};

/**
 * Creates a mediaToolsRunner payload from track audio properties.
 * This is DATA-ONLY - no processing is executed.
 */
export const createMediaToolsAudioPayload = (track: {
  volumeDb?: number;
  noiseReductionEnabled?: boolean;
}): MediaToolsAudioPayload => {
  const audio = getAudioMetadata(track);
  return {
    volumeDb: audio.volumeDb,
    noiseReduction: audio.noiseReductionEnabled,
  };
};

/**
 * ClipMetadata - Stateless representation of a media clip.
 *
 * This interface ensures clips contain ONLY metadata:
 * - No decoder references
 * - No loading flags
 * - No playback position
 * - No render ownership
 *
 * Used by FrameResolver for deterministic frame resolution.
 */
export interface ClipMetadata {
  /** Unique clip identifier */
  clipId: string;

  /** Normalized source identifier (URL pathname) */
  sourceId: string;

  /** Raw source URL */
  sourceUrl: string;

  /** In-point in source media (frame number) - where this clip starts in the source */
  inFrame: number;

  /** Out-point in source media (frame number) - where this clip ends in the source */
  outFrame: number;

  /** Timeline start frame - where this clip starts on the timeline */
  timelineStartFrame: number;

  /** Timeline end frame - where this clip ends on the timeline */
  timelineEndFrame: number;

  /** Track row index for z-ordering (0 = behind, higher = in front) */
  trackRowIndex: number;

  /** Layer within the track for additional z-ordering */
  layer: number;
}

/**
 * AudioClipMetadata - Stateless representation of an audio clip.
 */
export interface AudioClipMetadata extends ClipMetadata {
  /** Volume level (0-1) */
  volume: number;

  /** Whether the clip is muted */
  muted: boolean;
}

// =============================================================================
// VIDEO TRACK - Full Track Model
// =============================================================================
//
// VideoTrack is the complete track model stored in state.
// It contains all metadata for timeline display and manipulation.
//
// IMPORTANT: VideoTrack should NOT contain playback state like:
// - currentPlaybackTime
// - isBuffering
// - decoderReference
//
// Playback state is managed by the SourceRegistry and compositor.
// =============================================================================

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
  // ==========================================================================
  // Audio Properties (for audio/video tracks)
  // ==========================================================================
  /**
   * Legacy volume (0-1) for backward compatibility.
   * @deprecated Use volumeDb instead
   */
  volume?: number;
  /**
   * Volume in decibels (-60 to +12 dB).
   * Use -Infinity for complete silence (mute).
   * 0 dB = unity gain (no change).
   * @see AudioMetadata
   */
  volumeDb?: number;
  /**
   * Whether the track's audio is muted.
   * Separate from volumeDb - allows muting without losing volume setting.
   */
  muted?: boolean;
  /**
   * Whether noise reduction is enabled for this track.
   * Boolean flag only - signals processing intent for export.
   * No parameters or model selection.
   * @see AudioMetadata
   */
  noiseReductionEnabled?: boolean;
  // ==========================================================================
  visible: boolean;
  locked: boolean;
  color: string;
  subtitleText?: string;
  subtitleType?: 'karaoke' | 'regular'; // Distinguish between karaoke (generated) and regular (imported) subtitles
  linkedTrackId?: string;
  isLinked?: boolean;
  layer?: number; // Layer index for video/image tracks (0 = base layer, higher = overlay priority)
  trackRowIndex?: number; // Row index within the same media type (0 = bottom row, higher = upper rows)
  // For subtitle tracks: reference to the source video/audio track they were generated from
  linkedVideoTrackId?: string;
  // Precise subtitle timing from original SRT file (in seconds with millisecond precision)
  subtitleStartTime?: number; // Original start time from SRT (seconds)
  subtitleEndTime?: number; // Original end time from SRT (seconds)
  // Normalized subtitle timing used for rendering/export (no overlaps)
  normalizedSubtitleStartTime?: number;
  normalizedSubtitleEndTime?: number;
  subtitleSafeGapSeconds?: number;
  // Global subtitle transform (applies to ALL subtitle tracks)
  subtitleTransform?: {
    x: number; // X position normalized (-1 to 1, relative to video center, 0 = center)
    y: number; // Y position normalized (-1 to 1, relative to video center, default bottom-aligned)
    scale?: number; // Scale factor (default 1, 1 = 100%)
    width?: number; // Width in video space pixels (0 = auto)
    height?: number; // Height in video space pixels (0 = auto)
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

  // ==========================================================================
  // Proxy Generation Blocking State
  // ==========================================================================
  /**
   * Indicates the track is blocked due to 4K proxy generation in progress.
   * When true, the track cannot be edited (no drag, trim, split, etc.)
   * but is visually present on the timeline with an "optimizing" overlay.
   * Other tracks and UI remain fully usable.
   */
  proxyBlocked?: boolean;

  /**
   * Message to display when track is proxy-blocked.
   * Shown as an overlay on the track strip.
   */
  proxyBlockedMessage?: string;
}
