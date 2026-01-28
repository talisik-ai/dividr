import {
  TimelineState,
  VideoTrack,
} from '@/frontend/features/editor/stores/videoEditor/index';
import { getFontPath } from './fontMapper';

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
  layer?: number; // Layer index for proper overlay ordering (0 = base, higher = overlay priority)
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
 * CRITICAL: Must respect ALL explicitly set values, including false/0
 * to ensure per-clip styling overrides work correctly during export
 */
function convertTrackStyleToTextStyle(
  trackStyle?: VideoTrack['textStyle'],
): TextStyleOptions | undefined {
  if (!trackStyle) {
    return undefined;
  }

  return {
    fontFamily: trackStyle.fontFamily,
    // Font Weight / Bold - handle both fontWeight property and isBold flag
    // CRITICAL: Must handle false values to allow disabling bold on per-clip basis
    fontWeight:
      trackStyle.fontWeight !== undefined
        ? trackStyle.fontWeight
        : trackStyle.isBold !== undefined
          ? trackStyle.isBold
            ? '700'
            : '400'
          : undefined,
    // Font Style / Italic - handle both fontStyle property and isItalic flag
    // CRITICAL: Must handle false values to allow disabling italic on per-clip basis
    fontStyle:
      trackStyle.fontStyle !== undefined
        ? trackStyle.fontStyle
        : trackStyle.isItalic !== undefined
          ? trackStyle.isItalic
            ? 'italic'
            : 'normal'
          : undefined,
    isUnderline: trackStyle.isUnderline,
    textTransform: trackStyle.textTransform,
    fontSize: trackStyle.fontSize ? `${trackStyle.fontSize}px` : undefined,
    color: trackStyle.fillColor,
    strokeColor: trackStyle.strokeColor,
    backgroundColor: trackStyle.backgroundColor,
    hasShadow: trackStyle.hasShadow,
    hasGlow: trackStyle.hasGlow,
    // Opacity - convert from 0-100 range to 0-1 range for CSS compatibility
    opacity:
      trackStyle.opacity !== undefined ? trackStyle.opacity / 100 : undefined,
    letterSpacing:
      trackStyle.letterSpacing !== undefined
        ? `${trackStyle.letterSpacing}px`
        : undefined,
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

  console.log(
    `📝 [TextLayers] Extracting ${textTracks.length} text segments from text tracks`,
  );

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

    // Extract transform/position data - use coordinates directly from frontend
    // Frontend coordinates are in [-1, 1] range where 0 = center
    const position = track.textTransform
      ? {
          x: track.textTransform.x, // Direct from frontend: -1 = left, 0 = center, 1 = right
          y: track.textTransform.y, // Direct from frontend: -1 = top, 0 = center, 1 = bottom
          scale: track.textTransform.scale || 1,
          rotation: track.textTransform.rotation || 0,
        }
      : undefined;

    if (position) {
      console.log(
        `[TextLayers] Position (from frontend): x=${position.x.toFixed(3)}, y=${position.y.toFixed(3)}, scale=${position.scale}, rotation=${position.rotation}°`,
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

  console.log(
    `✅ [TextLayers] Extracted ${segments.length} text segments, sorted by start time`,
  );

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
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
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
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
  // Note: \n is intentionally NOT escaped so FFmpeg can interpret it as a line break
}

/**
 * Escapes file path for FFmpeg filter syntax
 */
function escapePathForFilter(filePath: string): string {
  let escapedPath = filePath;

  // Convert Windows backslashes to forward slashes first
  if (process.platform === 'win32') {
    escapedPath = escapedPath.replace(/\\/g, '/');
  }

  // For filter syntax, we need to escape these characters in order:
  // 1. Backslashes first (escape to \\)
  escapedPath = escapedPath.replace(/\\/g, '\\\\');

  // 2. Colons (including drive letters) - escape to \:
  // In filter context, colons separate parameters, so they must be escaped
  escapedPath = escapedPath.replace(/:/g, '\\:');

  // 3. Single quotes - escape to \'
  escapedPath = escapedPath.replace(/'/g, "\\'");

  return escapedPath;
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
function mergeTextStyles(
  globalStyle?: TextStyleOptions,
  segmentStyle?: TextStyleOptions,
): TextStyleOptions {
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

  // Font family - resolve actual font path
  const fontFamily =
    mergedStyle.fontFamily?.split(',')[0].replace(/['"]/g, '').trim() ||
    'Inter';
  const fontWeight = mergedStyle.fontWeight
    ? typeof mergedStyle.fontWeight === 'string'
      ? mergedStyle.fontWeight
      : String(mergedStyle.fontWeight)
    : '400';
  const isItalic = mergedStyle.fontStyle === 'italic';

  // Get the actual font file path or font name
  const fontPath = getFontPath(fontFamily, fontWeight, isItalic);

  // Check if it's a system font (no .ttf extension) or a file path
  if (fontPath.includes('.ttf')) {
    // TTF file path - use fontfile parameter
    const escapedFontPath = escapePathForFilter(fontPath);
    params.push(`fontfile=${escapedFontPath}`);
  } else {
    // System font name - use font parameter
    params.push(`font=${fontPath}`);
  }

  // Apply scaling factor to font size
  const baseFontSize = mergedStyle.fontSize
    ? parseInt(mergedStyle.fontSize)
    : 40;
  const scale = segment.position?.scale || 1;
  const scaledFontSize = Math.round(baseFontSize * scale);

  params.push(`fontsize=${scaledFontSize}`);

  // Font color
  const fontColor = convertColorToFFmpeg(mergedStyle.color || '#FFFFFF');
  params.push(`fontcolor=${fontColor}`);

  // Position
  // FFmpeg drawtext x/y coordinates:
  // - x: left edge of text by default
  // - Frontend coordinates are percentages (0-1 range) representing position as percentage of resolution
  if (segment.position) {
    const coordX = segment.position.x; // Percentage from frontend: 0 = left, 1 = right
    const coordY = segment.position.y; // Percentage from frontend: 0 = top, 1 = bottom
    const textAlign = mergedStyle.textAlign || 'center';

    // Calculate pixel positions by multiplying percentages with resolution
    const pixelX = coordX * playResX;
    const pixelY = coordY * playResY;

    console.log(
      `[TextLayers] Position (from frontend): x=${coordX.toFixed(3)} (${Math.round(pixelX)}px), y=${coordY.toFixed(3)} (${Math.round(pixelY)}px), scale=${segment.position.scale}, rotation=${segment.position.rotation}°, align=${textAlign}`,
    );

    // Calculate X position based on text alignment
    // The coordinate represents the anchor point (left/center/right) of the text
    if (textAlign === 'center') {
      // Center alignment: coordinate is center of text, so subtract half text width
      params.push(`x=${Math.round(pixelX)}-text_w/2`);
    } else if (textAlign === 'right') {
      // Right alignment: coordinate is right edge of text
      params.push(`x=${Math.round(pixelX)}-text_w`);
    } else {
      // Left alignment: coordinate is left edge of text
      params.push(`x=${Math.round(pixelX)}`);
    }

    // Calculate Y position
    // For Y, we typically center vertically, so subtract half text height
    params.push(`y=${Math.round(pixelY)}-text_h/2`);
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
  if (
    mergedStyle.backgroundColor &&
    mergedStyle.backgroundColor !== 'transparent'
  ) {
    const boxColor = convertColorToFFmpeg(mergedStyle.backgroundColor);
    params.push(`box=1`);
    params.push(`boxcolor=${boxColor}`);
    params.push(`boxborderw=5`);
  }

  // Enable expression for time-based visibility
  params.push(
    `enable='between(t,${segment.startTime.toFixed(3)},${segment.endTime.toFixed(3)})'`,
  );

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

  console.log(
    `📝 [TextLayers] Generating drawtext filters for ${segments.length} text segments`,
  );

  const filters = segments.map((segment, index) => {
    console.log(
      `📝 [TextLayers] Processing segment ${index + 1}: "${segment.text.substring(0, 30)}..." [${segment.startTime.toFixed(3)}s-${segment.endTime.toFixed(3)}s]`,
    );

    return generateDrawtextFilter(segment, globalStyle, videoDimensions);
  });

  console.log(`✅ [TextLayers] Generated ${filters.length} drawtext filters`);

  return filters;
}
