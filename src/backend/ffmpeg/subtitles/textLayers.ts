import {
  TimelineState,
  VideoTrack,
} from '@/frontend/features/editor/stores/videoEditor/index';

/**
 * Text Layer Processing Module
 * 
 * This module handles non-subtitle text segments (text clips) separately from subtitles.
 * Text segments are processed using FFmpeg drawtext filters and overlayed on the video during export.
 * All text processed here will be part of the multi-track rendering and added to the
 * FFmpeg filter complex upon export.
 */

/**
 * Text segment interface for non-subtitle text clips
 * These are rendered as drawtext overlays in the FFmpeg filter complex
 */
export interface TextSegment {
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
  index: number;
  style?: TextStyleOptions; // Per-segment styling
  position?: {
    x?: number; // X coordinate (0-1 normalized, or pixel value if > 1)
    y?: number; // Y coordinate (0-1 normalized, or pixel value if > 1)
    scale?: number; // Scale factor (1 = 100%, 2 = 200%, etc.)
    rotation?: number; // Rotation angle in degrees (clockwise)
  };
}

/**
 * Text style options for text segments
 */
export interface TextStyleOptions {
  fontWeight?: string | number;
  fontStyle?: string;
  fontFamily?: string;
  textTransform?: string;
  isUnderline?: boolean;
  hasGlow?: boolean;
  glowIntensity?: number;
  strokeColor?: string;
  hasShadow?: boolean;
  color?: string; // Text color
  backgroundColor?: string;
  fontSize?: string;
  textAlign?: string;
  letterSpacing?: string;
  lineHeight?: number;
  opacity?: number;
}

/**
 * Converts VideoTrack textStyle to TextStyleOptions format
 */
function convertTrackStyleToTextStyle(trackStyle?: VideoTrack['textStyle']): TextStyleOptions | undefined {
  if (!trackStyle) {
    return undefined;
  }

  return {
    fontFamily: trackStyle.fontFamily,
    fontWeight: trackStyle.fontWeight || (trackStyle.isBold ? '700' : undefined),
    fontStyle: trackStyle.fontStyle || (trackStyle.isItalic ? 'italic' : undefined),
    isUnderline: trackStyle.isUnderline,
    textTransform: trackStyle.textTransform,
    fontSize: trackStyle.fontSize ? `${trackStyle.fontSize}px` : undefined,
    color: trackStyle.fillColor,
    strokeColor: trackStyle.strokeColor,
    backgroundColor: trackStyle.backgroundColor,
    hasShadow: trackStyle.hasShadow,
    hasGlow: trackStyle.hasGlow,
    opacity: trackStyle.opacity,
    letterSpacing: trackStyle.letterSpacing ? `${trackStyle.letterSpacing}px` : undefined,
    lineHeight: trackStyle.lineSpacing,
    textAlign: trackStyle.textAlign,
  };
}

/**
 * Extracts text segments from text tracks (non-subtitle text clips)
 * These will be processed separately from subtitles and rendered as drawtext overlays
 */
export function extractTextSegments(
  tracks: VideoTrack[],
  timeline: TimelineState,
): TextSegment[] {
  const textTracks = tracks.filter(
    (track) => track.type === 'text' && track.visible && track.textContent,
  );

  if (textTracks.length === 0) {
    return [];
  }

  console.log(`📝 [TextLayers] Extracting ${textTracks.length} text segments from text tracks`);

  // Convert tracks to text segments
  const segments: TextSegment[] = textTracks.map((track, index) => {
    // Calculate timing from frames
    const startTime = track.startFrame / timeline.fps;
    const endTime = track.endFrame / timeline.fps;

    console.log(
      `[TextLayers] Text segment ${index + 1}: "${track.textContent?.substring(0, 30)}..." [${startTime.toFixed(3)}s - ${endTime.toFixed(3)}s]`,
    );

    // Extract per-track styling if available
    const segmentStyle = convertTrackStyleToTextStyle(track.textStyle);

    // Extract transform/position data
    const position = track.textTransform ? {
      x: (track.textTransform.x + 1) / 2, // Convert from [-1,1] to [0,1]
      y: (track.textTransform.y + 1) / 2, // Convert from [-1,1] to [0,1]
      scale: track.textTransform.scale || 1,
      rotation: track.textTransform.rotation || 0,
    } : undefined;

    if (position) {
      console.log(
        `[TextLayers] Position: x=${position.x.toFixed(3)}, y=${position.y.toFixed(3)}, scale=${position.scale}, rotation=${position.rotation}°`,
      );
    }

    return {
      startTime,
      endTime,
      text: track.textContent || '',
      index: index + 1,
      style: segmentStyle,
      position,
    };
  });

  // Sort by start time
  segments.sort((a, b) => a.startTime - b.startTime);

  // Re-index after sorting
  segments.forEach((segment, index) => {
    segment.index = index + 1;
  });

  console.log(`✅ [TextLayers] Extracted ${segments.length} text segments, sorted by start time`);

  return segments;
}

/**
 * Converts CSS color to FFmpeg color format
 * FFmpeg uses hex format without alpha: 0xRRGGBB
 */
function convertColorToFFmpeg(color: string): string {
  if (!color) return '0xFFFFFF'; // Default white
  
  // Handle hex colors
  if (color.startsWith('#')) {
    let hex = color.substring(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length >= 6) {
      return `0x${hex.substring(0, 6)}`;
    }
  }
  
  // Handle rgba/rgb colors
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
    return `0x${r}${g}${b}`;
  }
  
  return '0xFFFFFF'; // Default white
}

/**
 * Escapes text for FFmpeg drawtext filter
 */
function escapeTextForDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n');
}

/**
 * Applies text transformations
 */
function applyTextTransform(text: string, transform?: string): string {
  if (!transform) return text;
  
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/\b\w/g, (char) => char.toUpperCase());
    default:
      return text;
  }
}

/**
 * Merges global text style with segment-specific style
 */
function mergeTextStyles(globalStyle?: TextStyleOptions, segmentStyle?: TextStyleOptions): TextStyleOptions {
  if (!globalStyle && !segmentStyle) {
    return {};
  }
  if (!globalStyle) {
    return segmentStyle || {};
  }
  if (!segmentStyle) {
    return globalStyle;
  }
  
  return {
    ...globalStyle,
    ...segmentStyle,
  };
}

/**
 * Generates FFmpeg drawtext filter for a single text segment
 */
export function generateDrawtextFilter(
  segment: TextSegment,
  globalStyle?: TextStyleOptions,
  videoDimensions?: { width: number; height: number },
): string {
  const mergedStyle = mergeTextStyles(globalStyle, segment.style);
  const playResX = videoDimensions?.width || 1920;
  const playResY = videoDimensions?.height || 1080;

  // Apply text transformations
  let text = applyTextTransform(segment.text, mergedStyle.textTransform);
  text = escapeTextForDrawtext(text);

  // Build drawtext parameters
  const params: string[] = [];
  
  // Text content
  params.push(`text='${text}'`);
  
  // Font family
  const fontFamily = mergedStyle.fontFamily?.split(',')[0].replace(/['"]/g, '').trim() || 'Arial';
  params.push(`fontfile=/path/to/fonts/${fontFamily}.ttf`); // This will need to be resolved
  params.push(`fontsize=${mergedStyle.fontSize ? parseInt(mergedStyle.fontSize) : 40}`);
  
  // Font color
  const fontColor = convertColorToFFmpeg(mergedStyle.color || '#FFFFFF');
  params.push(`fontcolor=${fontColor}`);
  
  // Position
  // FFmpeg drawtext x/y coordinates:
  // - x: left edge of text by default
  // - For proper centering, we need to use expressions that account for text width/height
  if (segment.position) {
    const normalizedX = segment.position.x; // 0-1, where 0.5 is center
    const normalizedY = segment.position.y; // 0-1, where 0.5 is center
    const textAlign = mergedStyle.textAlign || 'center';
    
    // Calculate X position based on alignment
    // The normalized coordinate system uses 0.5 as center, so we need to account for text width
    if (textAlign === 'center') {
      // Center alignment: use expression that centers text, then offset by normalized position
      // normalizedX: 0 = left, 0.5 = center, 1 = right
      // Convert to offset from center: (normalizedX - 0.5) * playResX
      const offsetFromCenter = (normalizedX - 0.5) * playResX;
      if (Math.abs(offsetFromCenter) < 1) {
        // Effectively centered
        params.push(`x=(w-text_w)/2`);
      } else {
        // Offset from center
        params.push(`x=(w-text_w)/2+${Math.round(offsetFromCenter)}`);
      }
    } else if (textAlign === 'right') {
      // Right align: position from right edge
      const xOffset = Math.round((1 - normalizedX) * playResX);
      params.push(`x=w-text_w-${xOffset}`);
    } else {
      // Left align: position from left edge
      const x = Math.round(normalizedX * playResX);
      params.push(`x=${x}`);
    }
    
    // Calculate Y position
    // normalizedY: 0 = top, 0.5 = center, 1 = bottom
    if (textAlign === 'center' || Math.abs(normalizedY - 0.5) < 0.01) {
      // Center vertically: use expression that accounts for text height
      params.push(`y=(h-text_h)/2`);
    } else {
      // Offset from center vertically
      const offsetFromCenter = (normalizedY - 0.5) * playResY;
      params.push(`y=(h-text_h)/2+${Math.round(offsetFromCenter)}`);
    }
  } else {
    // Default center position
    params.push(`x=(w-text_w)/2`);
    params.push(`y=(h-text_h)/2`);
  }
  
  // Border/stroke (if strokeColor is set)
  if (mergedStyle.strokeColor) {
    const borderColor = convertColorToFFmpeg(mergedStyle.strokeColor);
    params.push(`borderw=2`);
    params.push(`bordercolor=${borderColor}`);
  }
  
  // Shadow (if hasShadow is true)
  if (mergedStyle.hasShadow) {
    params.push(`shadowx=2`);
    params.push(`shadowy=2`);
    params.push(`shadowcolor=0x000000`);
  }
  
  // Box/background (if backgroundColor is set)
  if (mergedStyle.backgroundColor && mergedStyle.backgroundColor !== 'transparent') {
    const boxColor = convertColorToFFmpeg(mergedStyle.backgroundColor);
    params.push(`box=1`);
    params.push(`boxcolor=${boxColor}`);
    params.push(`boxborderw=5`);
  }
  
  // Enable expression for time-based visibility
  params.push(`enable='between(t,${segment.startTime.toFixed(3)},${segment.endTime.toFixed(3)})'`);
  
  return `drawtext=${params.join(':')}`;
}

/**
 * Generates all drawtext filters for text segments
 * Returns an array of filter strings to be added to the filter complex
 */
export function generateTextLayerFilters(
  segments: TextSegment[],
  globalStyle?: TextStyleOptions,
  videoDimensions?: { width: number; height: number },
): string[] {
  if (segments.length === 0) {
    console.log('📝 [TextLayers] No text segments to process');
    return [];
  }

  console.log(`📝 [TextLayers] Generating drawtext filters for ${segments.length} text segments`);

  const filters = segments.map((segment, index) => {
    console.log(
      `📝 [TextLayers] Processing segment ${index + 1}: "${segment.text.substring(0, 30)}..." [${segment.startTime.toFixed(3)}s-${segment.endTime.toFixed(3)}s]`,
    );
    
    return generateDrawtextFilter(segment, globalStyle, videoDimensions);
  });

  console.log(`✅ [TextLayers] Generated ${filters.length} drawtext filters`);

  return filters;
}
