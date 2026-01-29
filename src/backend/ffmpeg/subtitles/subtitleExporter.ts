import {
  TimelineState,
  VideoTrack,
} from '@/frontend/features/editor/stores/videoEditor/index';

/**
 * Available fonts in the application
 * This list matches the fonts in fontMapper.ts but doesn't require Electron imports
 */
const AVAILABLE_FONTS = [
  'Cormorant',
  'Inter',
  'Lato',
  'Libre Baskerville',
  'Lora',
  'Montserrat',
  'Playfair Display',
  'Poppins',
  'Roboto',
  'Arial',
];

/**
 * Check if a font is available (frontend-safe version)
 */
function isFontAvailable(fontFamily: string): boolean {
  const cleanFamily = fontFamily.replace(/['"]/g, '').trim();
  return AVAILABLE_FONTS.includes(cleanFamily);
}

export interface SubtitleSegment {
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
  index: number;
  style?: TextStyleOptions; // Per-segment styling
  position?: {
    x?: number; // X coordinate (0-1 normalized, or pixel value if > 1)
    y?: number; // Y coordinate (0-1 normalized, or pixel value if > 1)
    scale?: number; // Scale factor (1 = 100%, 2 = 200%, etc.)
    // Note: Subtitles don't support rotation - use text tracks for rotatable text
  };
}

export interface TextStyleOptions {
  fontWeight?: string | number;
  fontStyle?: string;
  fontFamily?: string;
  textTransform?: string;
  textDecoration?: string;
  isUnderline?: boolean;
  hasGlow?: boolean;
  glowIntensity?: number;
  strokeColor?: string;
  hasShadow?: boolean;
  color?: string; // Text color
  textShadow?: string; // CSS text-shadow value
  backgroundColor?: string;
  fontSize?: string;
  textAlign?: string;
  letterSpacing?: string;
  lineHeight?: number;
  opacity?: number;
}

export interface SubtitleExportOptions {
  format: 'srt' | 'vtt' | 'ass';
  outputPath: string;
  filename: string;
  textStyle?: TextStyleOptions;
  videoDimensions?: { width: number; height: number };
  scale?: number; // Global scaling factor to multiply font sizes
}

/**
 * Converts VideoTrack textStyle or subtitleStyle to TextStyleOptions format
 * Only includes properties that are explicitly set (not undefined)
 * This prevents undefined values from overwriting global styles during merge
 *
 * CRITICAL: This function must respect ALL explicitly set values, including false/0
 * to ensure per-clip styling overrides work correctly during export
 */
function convertTrackStyleToTextStyle(
  trackStyle?: VideoTrack['textStyle'] | VideoTrack['subtitleStyle'],
): TextStyleOptions | undefined {
  if (!trackStyle) {
    return undefined;
  }

  const result: TextStyleOptions = {};

  // Font Family - explicit value only
  if (trackStyle.fontFamily !== undefined && trackStyle.fontFamily !== null) {
    result.fontFamily = trackStyle.fontFamily;
  }

  // Font Weight / Bold - handle both fontWeight property and isBold flag
  // CRITICAL: Must handle false values to allow disabling bold on per-clip basis
  if ('fontWeight' in trackStyle && trackStyle.fontWeight !== undefined) {
    result.fontWeight = trackStyle.fontWeight;
  } else if (trackStyle.isBold !== undefined) {
    // Explicitly set isBold (true or false) should always be respected
    result.fontWeight = trackStyle.isBold ? '700' : '400';
  }

  // Font Style / Italic - handle both fontStyle property and isItalic flag
  // CRITICAL: Must handle false values to allow disabling italic on per-clip basis
  if ('fontStyle' in trackStyle && trackStyle.fontStyle !== undefined) {
    result.fontStyle = trackStyle.fontStyle;
  } else if (trackStyle.isItalic !== undefined) {
    // Explicitly set isItalic (true or false) should always be respected
    result.fontStyle = trackStyle.isItalic ? 'italic' : 'normal';
  }

  // Underline - respect explicit true/false values
  if (trackStyle.isUnderline !== undefined) {
    result.isUnderline = trackStyle.isUnderline;
    result.textDecoration = trackStyle.isUnderline ? 'underline' : 'none';
  }

  // Text Transform
  if (trackStyle.textTransform !== undefined) {
    result.textTransform = trackStyle.textTransform;
  }

  // Font Size - explicit value only
  if (trackStyle.fontSize !== undefined && trackStyle.fontSize !== null) {
    result.fontSize = `${trackStyle.fontSize}px`;
  }

  // Fill Color (text color)
  if (trackStyle.fillColor !== undefined && trackStyle.fillColor !== null) {
    result.color = trackStyle.fillColor;
  }

  // Stroke Color - CRITICAL: Must include even if set to transparent/none
  // to allow per-clip override of global stroke
  if (trackStyle.strokeColor !== undefined && trackStyle.strokeColor !== null) {
    result.strokeColor = trackStyle.strokeColor;
  }

  // Background Color
  if (
    trackStyle.backgroundColor !== undefined &&
    trackStyle.backgroundColor !== null
  ) {
    result.backgroundColor = trackStyle.backgroundColor;
  }

  // Shadow - respect explicit true/false values
  if (trackStyle.hasShadow !== undefined) {
    result.hasShadow = trackStyle.hasShadow;
  }

  // Glow - respect explicit true/false values
  if (trackStyle.hasGlow !== undefined) {
    result.hasGlow = trackStyle.hasGlow;
  }

  // Opacity - CRITICAL: Convert from 0-100 range to 0-1 range for CSS compatibility
  // Must handle 0 as a valid value (fully transparent)
  if (trackStyle.opacity !== undefined && trackStyle.opacity !== null) {
    // Opacity in track is 0-100, convert to 0-1 for rendering
    result.opacity = trackStyle.opacity / 100;
  }

  // Letter Spacing - handle 0 as valid value (no extra spacing)
  if (
    trackStyle.letterSpacing !== undefined &&
    trackStyle.letterSpacing !== null
  ) {
    result.letterSpacing = `${trackStyle.letterSpacing}px`;
  }

  // Line Height
  if (trackStyle.lineHeight !== undefined && trackStyle.lineHeight !== null) {
    result.lineHeight = trackStyle.lineHeight;
  }

  // Text Alignment
  if (trackStyle.textAlign !== undefined) {
    result.textAlign = trackStyle.textAlign;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Converts VideoTrack subtitleStyle to TextStyleOptions format
 * subtitleStyle has a slightly different structure than textStyle
 */
function convertSubtitleStyleToTextStyle(
  subtitleStyle?: VideoTrack['subtitleStyle'],
): TextStyleOptions | undefined {
  if (!subtitleStyle) {
    return undefined;
  }

  return {
    fontFamily: subtitleStyle.fontFamily,
    fontWeight: subtitleStyle.isBold ? '700' : undefined,
    fontStyle: subtitleStyle.isItalic ? 'italic' : undefined,
    isUnderline: subtitleStyle.isUnderline,
    textTransform: subtitleStyle.textTransform,
    textDecoration: subtitleStyle.isUnderline ? 'underline' : undefined,
    fontSize: subtitleStyle.fontSize
      ? `${subtitleStyle.fontSize}px`
      : undefined,
    color: subtitleStyle.fillColor,
    strokeColor: subtitleStyle.strokeColor, // Outline/stroke color
    backgroundColor: subtitleStyle.backgroundColor,
    hasShadow: subtitleStyle.hasShadow,
    hasGlow: subtitleStyle.hasGlow,
    opacity: subtitleStyle.opacity,
    letterSpacing: subtitleStyle.letterSpacing
      ? `${subtitleStyle.letterSpacing}px`
      : undefined,
    lineHeight: subtitleStyle.lineHeight,
    textAlign: subtitleStyle.textAlign,
  };
}

/**
 * Extracts subtitle segments from timeline tracks
 * NOTE: This function now ONLY extracts subtitle tracks (type === 'subtitle')
 * Text tracks (type === 'text') are now handled separately by textLayers.ts
 */
export function extractSubtitleSegments(
  tracks: VideoTrack[],
  timeline: TimelineState,
): SubtitleSegment[] {
  // ONLY filter subtitle tracks - text tracks are handled separately
  const subtitleTracks = tracks.filter(
    (track) => track.type === 'subtitle' && track.visible && track.subtitleText,
  );

  if (subtitleTracks.length === 0) {
    console.log('[Subtitles] No subtitle tracks found');
    return [];
  }

  console.log(
    `[Subtitles] Extracting ${subtitleTracks.length} subtitle segments`,
  );

  // Convert tracks to subtitle segments
  const segments: SubtitleSegment[] = subtitleTracks.map((track, index) => {
    // Prefer original precise timing if available (from imported SRT)
    // Otherwise calculate from frames (for user-created subtitles)
    let startTime: number;
    let endTime: number;

    if (
      track.subtitleStartTime !== undefined &&
      track.subtitleEndTime !== undefined
    ) {
      // Use original precise timing from SRT import
      startTime = track.subtitleStartTime;
      endTime = track.subtitleEndTime;
      console.log(
        `[Subtitles] Using original SRT timing for subtitle: ${startTime.toFixed(3)}s - ${endTime.toFixed(3)}s`,
      );
    } else {
      // Calculate from frame positions for user-created subtitles
      startTime = track.startFrame / timeline.fps;
      endTime = track.endFrame / timeline.fps;
      console.log(
        `[Subtitles] Calculated timing from frames: ${startTime.toFixed(3)}s - ${endTime.toFixed(3)}s`,
      );
    }

    // Extract per-track styling if available
    // Prefer subtitleStyle over textStyle (subtitleStyle takes precedence for subtitle tracks)
    // This ensures outline (strokeColor) from subtitleStyle is properly parsed and applied
    const segmentStyle = track.subtitleStyle
      ? convertSubtitleStyleToTextStyle(track.subtitleStyle)
      : convertTrackStyleToTextStyle(track.textStyle);

    // Extract transform/position data from subtitleTransform
    // This includes position (x, y), scale, and dimensions
    // Note: Subtitles don't support rotation, so we don't include it
    const position = track.subtitleTransform
      ? {
          x: track.subtitleTransform.x,
          y: track.subtitleTransform.y,
          scale: track.subtitleTransform.scale,
          // No rotation for subtitles
        }
      : undefined;

    return {
      startTime,
      endTime,
      text: track.subtitleText || '',
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

  console.log(`✅ [Subtitles] Extracted ${segments.length} subtitle segments`);

  return segments;
}

export function convertTextClipsToSubtitleSegments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  textClips: any[], // TextClipData[] from backend schema
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fps: number,
): SubtitleSegment[] {
  console.warn(
    '⚠️ convertTextClipsToSubtitleSegments is deprecated and should not be used. Text clips are handled by textLayers.ts using extractTextSegments().',
  );

  // This function should never be called - text clips are handled separately
  return [];
}

/**
 * Parses seconds into time components
 */
function parseTimeComponents(seconds: number): {
  hours: number;
  minutes: number;
  secs: number;
  milliseconds: number;
} {
  return {
    hours: Math.floor(seconds / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    secs: Math.floor(seconds % 60),
    milliseconds: Math.floor((seconds % 1) * 1000),
  };
}

/**
 * Formats time for SRT format (HH:MM:SS,mmm)
 */
function formatTimeForSRT(seconds: number): string {
  const { hours, minutes, secs, milliseconds } = parseTimeComponents(seconds);
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Formats time for VTT format (HH:MM:SS.mmm)
 */
function formatTimeForVTT(seconds: number): string {
  const { hours, minutes, secs, milliseconds } = parseTimeComponents(seconds);
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${milliseconds
    .toString()
    .padStart(3, '0')}`;
}

/**
 * Generates SRT subtitle content
 */
export function generateSRTContent(segments: SubtitleSegment[]): string {
  if (segments.length === 0) {
    return '';
  }

  return segments
    .map((segment) => {
      const startTime = formatTimeForSRT(segment.startTime);
      const endTime = formatTimeForSRT(segment.endTime);

      return `${segment.index}\n${startTime} --> ${endTime}\n${segment.text}\n`;
    })
    .join('\n');
}

/**
 * Generates VTT subtitle content
 */
export function generateVTTContent(segments: SubtitleSegment[]): string {
  if (segments.length === 0) {
    return 'WEBVTT\n\n';
  }

  const content = segments
    .map((segment) => {
      const startTime = formatTimeForVTT(segment.startTime);
      const endTime = formatTimeForVTT(segment.endTime);

      return `${startTime} --> ${endTime}\n${segment.text}\n`;
    })
    .join('\n');

  return `WEBVTT\n\n${content}`;
}

/**
 * Converts CSS color (hex or rgba) to ASS BGR format with alpha
 * ASS format: &HAABBGGRR (hex) where AA=alpha, BB=blue, GG=green, RR=red
 * Note: ASS alpha is inverted (0=opaque, 255=transparent), opposite of CSS
 */
function convertColorToASS(color: string, opacity?: number): string {
  // Default to black if invalid
  if (!color) return '&H00000000';

  let r = 0,
    g = 0,
    b = 0;

  let cssAlpha = 1.0; // CSS alpha (0=transparent, 1=opaque)

  // Handle hex colors (#RRGGBB, #RRGGBBAA, or #RGB)
  if (color.startsWith('#')) {
    let hex = color.substring(1);

    // Expand shorthand hex (#RGB -> #RRGGBB)
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }

    if (hex.length === 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
      cssAlpha = 1.0; // Hex colors are fully opaque by default
    } else if (hex.length === 8) {
      // Handle 8-character hex with alpha (#RRGGBBAA)
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
      const alphaHex = parseInt(hex.substring(6, 8), 16);
      cssAlpha = alphaHex / 255; // Convert 0-255 to 0.0-1.0
    }
  }

  // Handle rgba/rgb colors
  const rgbaMatch = color.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );

  if (rgbaMatch) {
    r = parseInt(rgbaMatch[1]);
    g = parseInt(rgbaMatch[2]);
    b = parseInt(rgbaMatch[3]);
    cssAlpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1.0;
  }

  // Apply CSS opacity multiplication (like CSS does)
  // In CSS: final_alpha = color_alpha * opacity
  const originalCssAlpha = cssAlpha;
  if (opacity !== undefined && opacity >= 0 && opacity <= 1) {
    cssAlpha = cssAlpha * opacity;
  }

  // Clamp CSS alpha to valid range
  cssAlpha = Math.max(0, Math.min(1, cssAlpha));

  // Convert CSS alpha (0=transparent, 1=opaque) to ASS alpha (0=opaque, 255=transparent)
  const assAlpha = Math.round((1 - cssAlpha) * 255);

  // Log opacity calculations for debugging (when opacity is applied or color has alpha)
  if (
    (opacity !== undefined && opacity < 1 && originalCssAlpha !== cssAlpha) ||
    (originalCssAlpha < 1.0 && color.startsWith('#') && color.length === 9)
  ) {
    console.log('🎨 CSS Opacity Calculation:', {
      color,
      colorAlpha: originalCssAlpha.toFixed(3),
      opacityProperty: opacity?.toFixed(3) || 'none',
      finalCssAlpha: cssAlpha.toFixed(3),
      formula:
        opacity !== undefined
          ? `${originalCssAlpha.toFixed(3)} × ${opacity.toFixed(3)} = ${cssAlpha.toFixed(3)}`
          : `${originalCssAlpha.toFixed(3)} (from color alpha)`,
      assAlpha: assAlpha,
      assAlphaHex: assAlpha.toString(16).padStart(2, '0').toUpperCase(),
      note: 'CSS: 0=transparent, 1=opaque | ASS: 0=opaque, 255=transparent',
    });
  }

  // Convert to hex
  const rHex = r.toString(16).padStart(2, '0');
  const gHex = g.toString(16).padStart(2, '0');
  const bHex = b.toString(16).padStart(2, '0');
  const alphaHex = assAlpha.toString(16).padStart(2, '0');

  // Convert RGBA to ABGR for ASS format
  return `&H${alphaHex}${bHex}${gHex}${rHex}`.toUpperCase();
}

/**
 * Merges global text style with segment-specific style
 * Segment style takes precedence over global style
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

  // Segment style overrides global style
  return {
    ...globalStyle,
    ...segmentStyle,
  };
}

/**
 * Checks if a background color is effectively transparent or empty
 */
function isTransparentBackground(backgroundColor?: string): boolean {
  if (!backgroundColor || backgroundColor === 'transparent') return true;

  // Check for rgba with zero alpha (handles 0, 0.0, 0.00, etc.)
  const rgbaMatch = backgroundColor.match(
    /rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/,
  );
  if (rgbaMatch) {
    const alpha = parseFloat(rgbaMatch[1]);
    if (alpha === 0) return true;
  }

  return false;
}

/**
 * Generates a unique style name based on style properties
 */
function generateStyleName(style: TextStyleOptions, baseIndex: number): string {
  const weight = style.fontWeight
    ? typeof style.fontWeight === 'number'
      ? style.fontWeight
      : parseInt(style.fontWeight.toString())
    : 400;

  let name = 'Style';
  if (weight >= 800) {
    name += 'Bold';
  } else if (weight >= 600) {
    name += 'Semibold';
  }

  if (style.fontStyle === 'italic') {
    name += 'Italic';
  }

  if (style.hasGlow) {
    name += 'Glow';
  }

  if (!isTransparentBackground(style.backgroundColor)) {
    name += 'BG';
  }

  // Add index to ensure uniqueness
  return `${name}_${baseIndex}`;
}

/**
 * Computes ASS style parameters from TextStyleOptions
 */
interface ASSStyleParams {
  fontFamily: string;
  fontSize: number;
  primaryColor: string;
  outlineColor: string;
  backColor: string;
  bold: number;
  italic: number;
  underline: number;
  borderStyle: number;
  outlineWidth: number;
  shadowDistance: number;
  hasOutline: boolean;
  hasBackground: boolean;
  hasGlow: boolean;
  glowIntensity?: number;
}

/**
 * Creates a unique key for style parameters (used for deduplication)
 */
function createStyleKey(params: ASSStyleParams): string {
  return JSON.stringify({
    font: params.fontFamily,
    size: params.fontSize,
    primary: params.primaryColor,
    outline: params.outlineColor,
    back: params.backColor,
    bold: params.bold,
    italic: params.italic,
    underline: params.underline,
    borderStyle: params.borderStyle,
    outlineWidth: params.outlineWidth,
    shadow: params.shadowDistance,
  });
}

function computeASSStyleParams(
  style: TextStyleOptions,
  videoDimensions?: { width: number; height: number },
  scale?: number,
): ASSStyleParams {
  const assStyle = convertTextStyleToASS(style);

  // Smart Glow Logic: If glow is enabled but no stroke, use text color for stroke
  let effectiveStrokeColor = style?.strokeColor;
  if (style?.hasGlow && !effectiveStrokeColor) {
    effectiveStrokeColor = style?.color || '#FFFFFF';
  }

  const isTransparentStroke =
    !effectiveStrokeColor ||
    effectiveStrokeColor === 'transparent' ||
    effectiveStrokeColor.includes('rgba(0, 0, 0, 0)') ||
    effectiveStrokeColor.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/);

  const hasOutline = !isTransparentStroke;
  const outlineWidth = hasOutline ? 2.1 : 0;

  // Convert strokeColor to ASS BGR format with opacity applied
  let outlineColor = '&H00000000'; // Default: black
  if (hasOutline && effectiveStrokeColor) {
    outlineColor = convertColorToASS(effectiveStrokeColor, style?.opacity);
  }

  const shadowDistance = style?.hasShadow ? 2 : 0;

  // Convert text color (primary color) to ASS format with opacity applied
  const primaryColor = style?.color
    ? convertColorToASS(style.color, style?.opacity)
    : convertColorToASS('#FFFFFF', style?.opacity); // Default: white

  // Convert background color to ASS format with opacity applied
  let backColor = '&H00000000'; // Default: fully transparent
  let borderStyle = 1; // Default: outline + shadow style
  let finalOutlineColor = outlineColor;

  const hasBackground = !isTransparentBackground(style?.backgroundColor);

  if (hasBackground && style.backgroundColor) {
    // Apply opacity to background color (CSS-style multiplication)
    backColor = convertColorToASS(style.backgroundColor, style?.opacity);
    borderStyle = 3; // Use BorderStyle 3 for opaque background box
    finalOutlineColor = backColor;
  }

  let fontSize = style?.fontSize
    ? parseInt(style.fontSize.replace('px', ''))
    : 40;

  // Apply scale factor to font size
  const effectiveScale = scale || 1;
  if (effectiveScale !== 1) {
    const originalFontSize = fontSize;
    fontSize = Math.round(fontSize * effectiveScale);
    console.log(
      `📏 Applied scale ${effectiveScale} to font size: ${originalFontSize}px → ${fontSize}px`,
    );
  }

  return {
    fontFamily: assStyle.fontFamily,
    fontSize,
    primaryColor,
    outlineColor: finalOutlineColor,
    backColor,
    bold: assStyle.bold,
    italic: assStyle.italic,
    underline: assStyle.underline,
    borderStyle,
    outlineWidth,
    shadowDistance,
    hasOutline,
    hasBackground,
    hasGlow: style?.hasGlow || false,
    glowIntensity: style?.glowIntensity,
  };
}

/**
 * Generates ASS subtitle content (Advanced SubStation Alpha) with per-segment styling support
 * @returns Object containing the ASS content and array of font families used
 */
export function generateASSContent(
  segments: SubtitleSegment[],
  textStyle?: TextStyleOptions,
  videoDimensions?: { width: number; height: number },
  globalScale?: number,
): { content: string; fontFamilies: string[] } {
  if (segments.length === 0) {
    return { content: '', fontFamilies: [] };
  }

  console.log(
    '📝 generateASSContent received global textStyle:',
    JSON.stringify(textStyle, null, 2),
  );
  console.log(
    `📝 generateASSContent received global scale: ${globalScale || 1}`,
  );
  console.log(
    '📝 generateASSContent processing',
    segments.length,
    'segments with individual styles',
  );

  // Get resolution from videoDimensions or use defaults
  const playResX = videoDimensions?.width || 1920;
  const playResY = videoDimensions?.height || 1080;

  // Collect unique styles from segments
  const styleMap = new Map<
    string,
    { style: TextStyleOptions; params: ASSStyleParams; styleName: string }
  >();
  const segmentStyleNames: string[] = [];

  segments.forEach((segment) => {
    // Merge global style with segment-specific style
    const mergedStyle = mergeTextStyles(textStyle, segment.style);
    const segmentScale = segment.position?.scale || 1;
    // Apply global scale factor from payload, multiplied with per-segment scale
    const effectiveScale = (globalScale || 1) * segmentScale;
    const styleParams = computeASSStyleParams(
      mergedStyle,
      videoDimensions,
      effectiveScale,
    );
    const styleKey = createStyleKey(styleParams);

    let styleName: string;
    const existingStyle = styleMap.get(styleKey);
    if (existingStyle) {
      // Reuse existing style
      styleName = existingStyle.styleName;
    } else {
      // Create new style
      styleName = generateStyleName(mergedStyle, styleMap.size);
      styleMap.set(styleKey, {
        style: mergedStyle,
        params: styleParams,
        styleName,
      });
    }

    segmentStyleNames.push(styleName);
  });

  console.log(
    `📝 Generated ${styleMap.size} unique styles for ${segments.length} segments`,
  );

  // Calculate layer offsets to avoid conflicts when subtitles overlap
  const layerOffsets = calculateLayerOffsets(segments);
  console.log(
    `🎬 Calculated layer offsets for ${segments.length} segments to avoid overlap conflicts`,
  );

  // Collect unique font families used in all styles
  const usedFontFamilies = new Set<string>();
  styleMap.forEach(({ params }) => {
    if (params.fontFamily && params.fontFamily !== 'Arial') {
      usedFontFamilies.add(params.fontFamily);
    }
  });
  console.log(
    `🎨 Fonts used in subtitles: ${Array.from(usedFontFamilies).join(', ')}`,
  );

  // Calculate vertical margin based on video dimensions
  const aspectRatio = playResX / playResY;
  const isPortrait = aspectRatio < 1;

  // Base margin percentage (works well for landscape)
  const marginPercentage = isPortrait ? 0.133 : 0.037;

  // Calculate margin in pixels
  const verticalMargin = Math.round(playResY * marginPercentage);

  console.log(
    `📐 Video dimensions: ${playResX}x${playResY} (aspect ratio: ${aspectRatio.toFixed(3)}, ${isPortrait ? 'portrait' : 'landscape'})`,
  );
  console.log(
    `📐 Calculated vertical margin: ${verticalMargin}px (${(marginPercentage * 100).toFixed(1)}% of height)`,
  );

  // Generate style definitions
  const styleDefinitions: string[] = [];
  styleMap.forEach(({ params, styleName, style }) => {
    // Base style
    console.log(
      `🎨 Creating ASS style "${styleName}" with font: "${params.fontFamily}"`,
    );
    styleDefinitions.push(
      `Style: ${styleName},${params.fontFamily},${params.fontSize},${params.primaryColor},&H000000FF,${params.outlineColor},${params.backColor},${params.bold},${params.italic},${params.underline},0,100,100,0,0,${params.borderStyle},${params.outlineWidth},${params.shadowDistance},2,10,10,${verticalMargin},1`,
    );

    // If this style has both background and outline, create an outline variant
    if (params.hasBackground && params.hasOutline) {
      // Get the original outline color (before it was overridden by background)
      const originalOutlineColor = convertColorToASS(
        style.strokeColor || '#000000',
        style.opacity,
      );

      styleDefinitions.push(
        `Style: ${styleName}Outline,${params.fontFamily},${params.fontSize},${params.primaryColor},&H000000FF,${originalOutlineColor},&H00000000,${params.bold},${params.italic},${params.underline},0,100,100,0,0,1,${params.outlineWidth},0,2,10,10,${verticalMargin},1`,
      );
    }
  });

  // Generate header
  const header = `[Script Info]
Title: Exported Subtitles
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
${styleDefinitions.join('\n')}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Log the first few style definitions for debugging
  console.log('📝 ASS File Preview (first 3 styles):');
  styleDefinitions.slice(0, 3).forEach((style) => console.log('  ', style));

  // Generate events with per-segment styles
  const events = segments
    .map((segment, index) => {
      const startTime = formatTimeForASS(segment.startTime);
      const endTime = formatTimeForASS(segment.endTime);
      const styleName = segmentStyleNames[index];
      const mergedStyle = mergeTextStyles(textStyle, segment.style);
      const segmentScale = segment.position?.scale || 1;
      // Apply global scale factor from payload, multiplied with per-segment scale
      const effectiveScale = (globalScale || 1) * segmentScale;
      const computedParams = computeASSStyleParams(
        mergedStyle,
        videoDimensions,
        effectiveScale,
      );
      const styleKey = createStyleKey(computedParams);
      const styleParams = styleMap.get(styleKey)?.params;
      const layerOffset = layerOffsets[index];

      // Log segment processing
      console.log(`\n📝 Processing segment ${index + 1}/${segments.length}:`);
      console.log(
        `   - Text: "${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}"`,
      );
      console.log(
        `   - Time: ${segment.startTime.toFixed(3)}s - ${segment.endTime.toFixed(3)}s`,
      );
      console.log(`   - Style: ${styleName}`);
      console.log(`   - Layer offset: ${layerOffset}`);

      // Log position and scale information (always show, even if defaults)
      const x =
        segment.position?.x !== undefined ? segment.position.x : undefined;
      const y =
        segment.position?.y !== undefined ? segment.position.y : undefined;

      console.log(`   - Transform:`);
      console.log(
        `     * Position: x=${x !== undefined ? x.toFixed(3) : 'default'}, y=${y !== undefined ? y.toFixed(3) : 'default'}`,
      );
      console.log(`     * Segment scale: ${segmentScale}`);
      console.log(`     * Global scale: ${globalScale || 1}`);
      console.log(
        `     * Effective scale: ${effectiveScale.toFixed(3)} (applied to font size)`,
      );

      // Apply text transformations if specified
      let text = segment.text;
      if (mergedStyle?.textTransform) {
        text = applyTextTransform(text, mergedStyle.textTransform);
      }

      // Convert newlines to ASS format and clean up trailing newlines
      text = text.replace(/\n/g, '\\N').replace(/\\N\s*$/, '');

      // Generate position tags if custom position is specified
      const positionTags = generatePositionTags(
        segment.position,
        videoDimensions,
      );

      // Handle glow effect with multi-layer rendering
      if (styleParams?.hasGlow) {
        return generateGlowLayers(
          segment,
          text,
          styleName,
          mergedStyle,
          styleParams,
          startTime,
          endTime,
          videoDimensions,
          layerOffset,
        );
      }

      // Simple rendering without glow
      if (styleParams?.hasBackground && styleParams?.hasOutline) {
        // Double-layer: background + outlined text
        const { xbord, ybord } = calculateBackgroundBoxDimensions(
          styleParams.outlineWidth,
        );
        const backgroundLayer = `Dialogue: ${layerOffset},${startTime},${endTime},${styleName},,0,0,0,,${positionTags}{\\xbord${xbord}\\ybord${ybord}}${text}`;
        const textLayer = `Dialogue: ${layerOffset + 1},${startTime},${endTime},${styleName}Outline,,0,0,0,,${positionTags}${text}`;
        return `${backgroundLayer}\n${textLayer}`;
      }

      // For backgrounds without outline, also adjust box dimensions
      if (styleParams?.hasBackground) {
        const { xbord, ybord } = calculateBackgroundBoxDimensions(
          styleParams.outlineWidth,
        );
        return `Dialogue: ${layerOffset},${startTime},${endTime},${styleName},,0,0,0,,${positionTags}{\\xbord${xbord}\\ybord${ybord}}${text}`;
      }

      return `Dialogue: ${layerOffset},${startTime},${endTime},${styleName},,0,0,0,,${positionTags}${text}`;
    })
    .join('\n');

  const content = header + events;
  const fontFamilies = Array.from(usedFontFamilies);

  return { content, fontFamilies };
}

/**
 * Calculates layer offsets for segments to avoid conflicts when they overlap in time
 * Returns an array of layer offsets (one per segment)
 */
function calculateLayerOffsets(segments: SubtitleSegment[]): number[] {
  const layerOffsets: number[] = new Array(segments.length).fill(0);

  // For each segment, check if it overlaps with any previous segments
  for (let i = 0; i < segments.length; i++) {
    const currentSegment = segments[i];
    const overlappingSegments: number[] = [];

    // Find all segments that overlap with the current one
    for (let j = 0; j < i; j++) {
      const otherSegment = segments[j];

      // Check if segments overlap in time
      const overlaps =
        currentSegment.startTime < otherSegment.endTime &&
        currentSegment.endTime > otherSegment.startTime;

      if (overlaps) {
        overlappingSegments.push(j);
      }
    }

    // If there are overlapping segments, assign a layer offset that doesn't conflict
    if (overlappingSegments.length > 0) {
      // Find the maximum layer offset used by overlapping segments
      const maxLayerOffset = Math.max(
        ...overlappingSegments.map((idx) => layerOffsets[idx]),
      );
      // Assign the next available layer offset (each segment can use up to 3 layers for glow effect)
      layerOffsets[i] = maxLayerOffset + 3;

      console.log(
        `  Segment ${i} "${currentSegment.text.substring(0, 20)}" overlaps with ${overlappingSegments.length} segments, assigned layer offset ${layerOffsets[i]}`,
      );
    }
  }

  return layerOffsets;
}

/**
 * Calculates background box dimensions for ASS subtitles
 */
function calculateBackgroundBoxDimensions(outlineWidth: number): {
  xbord: number;
  ybord: number;
} {
  return {
    xbord: outlineWidth + 10,
    ybord: 0, // No vertical padding - tight fit to text
  };
}

/**
 * Converts normalized or pixel coordinates to ASS pixel coordinates
 * @param value - Coordinate value (0-1 for normalized, >1 for pixels)
 * @param resolution - Video resolution (width or height)
 * @returns Pixel coordinate for ASS
 */
function convertToASSCoordinate(value: number, resolution: number): number {
  // If value is between 0 and 1, treat as normalized (percentage)
  if (value >= 0 && value <= 1) {
    return Math.round(value * resolution);
  }
  // Otherwise treat as absolute pixel value
  return Math.round(value);
}

/**
 * Generates ASS position override tags
 * @param position - Position object with x, y, and scale
 * @param videoDimensions - Video dimensions for coordinate conversion
 * @returns ASS override tags string (empty if no position specified)
 *
 * Transform handling:
 * - Position: Converts normalized coordinates (0-1) to pixel coordinates
 * - Alignment: Sets center alignment (5) when using custom position
 * - Scale: Applied directly to font size, not via ASS tags
 *
 * Note: Subtitles don't support rotation - use text tracks for rotatable text
 */
function generatePositionTags(
  position?: SubtitleSegment['position'],
  videoDimensions?: { width: number; height: number },
): string {
  if (!position) {
    return '';
  }

  const tags: string[] = [];
  const playResX = videoDimensions?.width || 1920;
  const playResY = videoDimensions?.height || 1080;

  // Add position override if x or y is specified
  if (position.x !== undefined || position.y !== undefined) {
    // Default to center if not specified
    const x =
      position.x !== undefined
        ? convertToASSCoordinate(position.x, playResX)
        : playResX / 2;
    const y =
      position.y !== undefined
        ? convertToASSCoordinate(position.y, playResY)
        : playResY - 20; // Default bottom position with 20px margin

    // Log normalized and pixel coordinates
    console.log(`📍 Subtitle position coordinates:`);
    console.log(
      `   - Normalized: x=${position.x?.toFixed(3) || 'default'}, y=${position.y?.toFixed(3) || 'default'} (0-1 range, 0.5=center)`,
    );
    console.log(
      `   - Pixel coords: x=${Math.round(x)}px, y=${Math.round(y)}px`,
    );
    console.log(`   - Video dimensions: ${playResX}x${playResY}`);
    console.log(`   - Scale: ${position.scale || 1}`);

    // \pos(x,y) - absolute position
    tags.push(`\\pos(${x},${y})`);

    // When using \pos, we need to set alignment to center (5) for proper positioning
    tags.push('\\an5');
  }

  // Note: Subtitles don't support rotation - use text tracks for rotatable text

  return tags.length > 0 ? `{${tags.join('')}}` : '';
}

/**
 * Generates multi-layer dialogue lines for glow effects
 */
function generateGlowLayers(
  segment: SubtitleSegment,
  text: string,
  styleName: string,
  style: TextStyleOptions,
  params: ASSStyleParams,
  startTime: string,
  endTime: string,
  videoDimensions?: { width: number; height: number },
  layerOffset = 0,
): string {
  const layers: string[] = [];

  // Generate position tags if custom position is specified
  const positionTags = generatePositionTags(segment.position, videoDimensions);

  // Determine glow color - use text color for the glow effect with opacity applied
  const glowColor = style?.color || '#FFFFFF';
  const glowColorASS = convertColorToASS(glowColor, style?.opacity);

  // Layer 0 + offset: Blurred glow/shadow layer (furthest back)
  const glowBlurAmount = (params.glowIntensity || 2) + 10;
  const glowOverrides: string[] = [];
  glowOverrides.push(`\\blur${glowBlurAmount}`);
  glowOverrides.push(`\\xbord${params.outlineWidth * 3.25 + 6}`); // Horizontal border (length)
  glowOverrides.push(`\\ybord${params.outlineWidth * 3.25}`); // Vertical border (width)
  glowOverrides.push(`\\3c${glowColorASS}`);
  glowOverrides.push('\\1a&H00&');
  glowOverrides.push('\\shad0');

  const glowTags = `{${glowOverrides.join('')}}`;
  const glowLayer = `Dialogue: ${layerOffset},${startTime},${endTime},${styleName},,0,0,0,,${positionTags}${glowTags}${text}`;
  layers.push(glowLayer);

  if (params.hasBackground && params.hasOutline) {
    // Triple-layer: glow + background + outlined text
    const { xbord, ybord } = calculateBackgroundBoxDimensions(
      params.outlineWidth,
    );
    const backgroundLayer = `Dialogue: ${layerOffset + 1},${startTime},${endTime},${styleName},,0,0,0,,${positionTags}{\\xbord${xbord}\\ybord${ybord}}${text}`;
    layers.push(backgroundLayer);

    const textLayer = `Dialogue: ${layerOffset + 2},${startTime},${endTime},${styleName}Outline,,0,0,0,,${positionTags}${text}`;
    layers.push(textLayer);

    console.log('✨ Triple-layer mode: glow + background + outlined text');
  } else if (params.hasBackground) {
    // Double-layer: glow + background (no outline)
    const { xbord, ybord } = calculateBackgroundBoxDimensions(
      params.outlineWidth,
    );
    const backgroundLayer = `Dialogue: ${layerOffset + 1},${startTime},${endTime},${styleName},,0,0,0,,${positionTags}{\\xbord${xbord}\\ybord${ybord}}${text}`;
    layers.push(backgroundLayer);

    console.log('✨ Double-layer mode: glow + background');
  } else {
    // Double-layer: glow + text (no background)
    const mainLayer = `Dialogue: ${layerOffset + 1},${startTime},${endTime},${styleName},,0,0,0,,${positionTags}${text}`;
    layers.push(mainLayer);

    console.log('✨ Double-layer mode: glow + text');
  }

  return layers.join('\n');
}

/**
 * Converts text style options to ASS format parameters
 */
function convertTextStyleToASS(textStyle?: TextStyleOptions): {
  fontFamily: string;
  bold: number;
  italic: number;
  underline: number;
} {
  if (!textStyle) {
    return {
      fontFamily: 'Arial',
      bold: -1, // Default bold for visibility
      italic: 0,
      underline: 0,
    };
  }

  // Convert font weight to ASS bold value
  let bold = 0;
  if (textStyle.fontWeight) {
    const fontWeight =
      typeof textStyle.fontWeight === 'number'
        ? textStyle.fontWeight
        : parseInt(textStyle.fontWeight.toString());
    if (fontWeight >= 700) {
      bold = -1; // Bold enabled
    } else if (fontWeight >= 600) {
      bold = -1; // Semibold treated as bold in ASS
    }
  }

  // Convert font style to ASS italic value
  const italic = textStyle.fontStyle === 'italic' ? -1 : 0;

  // Convert underline to ASS underline value
  // Check both textDecoration and isUnderline for compatibility
  const hasUnderline =
    textStyle.textDecoration?.includes('underline') ||
    textStyle.isUnderline === true;
  const underline = hasUnderline ? -1 : 0;

  // Extract font family or use default
  let fontFamily = 'Arial';
  if (textStyle.fontFamily) {
    // Extract first font from font stack
    const requestedFont = textStyle.fontFamily
      .split(',')[0]
      .replace(/['"]/g, '')
      .trim();

    // Check if the requested font is available
    if (isFontAvailable(requestedFont)) {
      fontFamily = requestedFont;
      //console.log(`✅ Using available font for ASS subtitles: ${fontFamily}`);
    } else {
      console.warn(
        `⚠️ Font "${requestedFont}" not available, falling back to Arial`,
      );
      fontFamily = 'Arial';
    }
  }

  return {
    fontFamily,
    bold,
    italic,
    underline,
  };
}

/**
 * Applies text transformations to subtitle text
 */
function applyTextTransform(text: string, transform: string): string {
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase();
    case 'lowercase':
      return text.toLowerCase();
    case 'capitalize':
      return text.replace(/\b\w/g, (char) => char.toUpperCase());
    case 'none':
    default:
      return text;
  }
}

/**
 * Formats time for ASS format (H:MM:SS.cc)
 */
function formatTimeForASS(seconds: number): string {
  const { hours, minutes, secs } = parseTimeComponents(seconds);
  const centiseconds = Math.floor((seconds % 1) * 100);

  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;
}

/**
 * Creates a temporary subtitle file for export using Electron IPC
 */
export async function createSubtitleFile(
  segments: SubtitleSegment[],
  options: SubtitleExportOptions,
): Promise<string> {
  if (segments.length === 0) {
    throw new Error('No subtitle segments to export');
  }

  let content: string;
  const extension = `.${options.format}`;

  switch (options.format) {
    case 'srt':
      content = generateSRTContent(segments);
      break;
    case 'vtt':
      content = generateVTTContent(segments);
      break;
    case 'ass': {
      const assResult = generateASSContent(
        segments,
        options.textStyle,
        options.videoDimensions,
        options.scale,
      );
      content = assResult.content;
      break;
    }
    default:
      throw new Error(`Unsupported subtitle format: ${options.format}`);
  }

  const filename = options.filename.replace(/\.[^/.]+$/, '') + extension;

  try {
    // Use Electron API to write the subtitle file
    const result = await window.electronAPI.writeSubtitleFile({
      content,
      filename,
      outputPath: options.outputPath,
    });

    if (result.success && result.filePath) {
      console.log(`✅ Subtitle file created: ${result.filePath}`);
      return result.filePath;
    } else {
      throw new Error(result.error || 'Failed to create subtitle file');
    }
  } catch (error) {
    console.error('❌ Failed to create subtitle file:', error);
    throw new Error(`Failed to create subtitle file: ${error}`);
  }
}

/**
 * Removes temporary subtitle file after export using Electron IPC
 */
export async function cleanupSubtitleFile(filePath: string): Promise<void> {
  try {
    const result = await window.electronAPI.deleteFile(filePath);
    if (result.success) {
      console.log(`🗑️ Cleaned up subtitle file: ${filePath}`);
    } else {
      console.warn('⚠️ Failed to cleanup subtitle file:', result.error);
    }
  } catch (error) {
    console.warn('⚠️ Failed to cleanup subtitle file:', error);
    // Don't throw error for cleanup failures
  }
}

/**
 * Validates subtitle segments for common issues
 */
export function validateSubtitleSegments(segments: SubtitleSegment[]): {
  isValid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (segments.length === 0) {
    issues.push('No subtitle segments found');
    return { isValid: false, issues };
  }

  // Check for overlapping segments
  for (let i = 0; i < segments.length - 1; i++) {
    const current = segments[i];
    const next = segments[i + 1];

    if (current.endTime > next.startTime) {
      issues.push(
        `Overlapping subtitles: Segment ${current.index} (${current.startTime}s-${current.endTime}s) overlaps with Segment ${next.index} (${next.startTime}s-${next.endTime}s)`,
      );
    }
  }

  // Check for invalid timing
  segments.forEach((segment) => {
    if (segment.startTime >= segment.endTime) {
      issues.push(
        `Invalid timing: Segment ${segment.index} has start time (${segment.startTime}s) >= end time (${segment.endTime}s)`,
      );
    }

    if (segment.startTime < 0) {
      issues.push(
        `Invalid timing: Segment ${segment.index} has negative start time (${segment.startTime}s)`,
      );
    }

    if (!segment.text || segment.text.trim() === '') {
      issues.push(`Empty text: Segment ${segment.index} has no text content`);
    }
  });

  return {
    isValid: issues.length === 0,
    issues,
  };
}
