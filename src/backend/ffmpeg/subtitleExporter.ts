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
}

/**
 * Extracts subtitle segments from timeline tracks
 */
export function extractSubtitleSegments(
  tracks: VideoTrack[],
  timeline: TimelineState,
): SubtitleSegment[] {
  const subtitleTracks = tracks.filter(
    (track) => track.type === 'subtitle' && track.visible && track.subtitleText,
  );

  if (subtitleTracks.length === 0) {
    return [];
  }

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
        `[Export] Using original SRT timing for subtitle: ${startTime.toFixed(3)}s - ${endTime.toFixed(3)}s`,
      );
    } else {
      // Calculate from frame positions for user-created subtitles
      startTime = track.startFrame / timeline.fps;
      endTime = track.endFrame / timeline.fps;
      console.log(
        `[Export] Calculated timing from frames: ${startTime.toFixed(3)}s - ${endTime.toFixed(3)}s`,
      );
    }

    return {
      startTime,
      endTime,
      text: track.subtitleText || '',
      index: index + 1,
    };
  });

  // Sort by start time
  segments.sort((a, b) => a.startTime - b.startTime);

  // Re-index after sorting
  segments.forEach((segment, index) => {
    segment.index = index + 1;
  });

  return segments;
}

/**
 * Formats time for SRT format (HH:MM:SS,mmm)
 */
function formatTimeForSRT(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

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
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.floor((seconds % 1) * 1000);

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
 */
function convertColorToASS(color: string): string {
  // Default to black if invalid
  if (!color) return '&H00000000';

  // Handle hex colors (#RRGGBB or #RGB)
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
      const r = hex.substring(0, 2);
      const g = hex.substring(2, 4);
      const b = hex.substring(4, 6);

      // Convert RGB to BGR for ASS format (fully opaque: AA=00)
      return `&H00${b}${g}${r}`.toUpperCase();
    }
  }

  // Handle rgba colors
  const rgbaMatch = color.match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/,
  );
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0');
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0');
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0');
    const a = rgbaMatch[4]
      ? Math.round((1 - parseFloat(rgbaMatch[4])) * 255)
      : 0;
    const alpha = a.toString(16).padStart(2, '0');

    // Convert RGBA to ABGR for ASS format
    return `&H${alpha}${b}${g}${r}`.toUpperCase();
  }

  // Fallback to black
  return '&H00000000';
}

/**
 * Generates ASS subtitle content (Advanced SubStation Alpha) with styling support
 */
export function generateASSContent(
  segments: SubtitleSegment[],
  textStyle?: TextStyleOptions,
  videoDimensions?: { width: number; height: number },
): string {
  if (segments.length === 0) {
    return '';
  }

  console.log(
    '📝 generateASSContent received textStyle:',
    JSON.stringify(textStyle, null, 2),
  );

  // Convert text style to ASS parameters
  const assStyle = convertTextStyleToASS(textStyle);

  // Smart Glow Logic: If glow is enabled but no stroke, use text color for stroke
  let effectiveStrokeColor = textStyle?.strokeColor;
  if (textStyle?.hasGlow && !effectiveStrokeColor) {
    effectiveStrokeColor = textStyle?.color || '#FFFFFF';
  }

  const isTransparentStroke =
    !effectiveStrokeColor ||
    effectiveStrokeColor === 'transparent' ||
    effectiveStrokeColor.includes('rgba(0, 0, 0, 0)') ||
    effectiveStrokeColor.match(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/);

  const hasOutline = !isTransparentStroke;
  const outlineWidth = hasOutline ? 3.5 : 0; // Match example ASS style outline width

  // Convert strokeColor (hex or rgba) to ASS BGR format
  let outlineColor = '&H00000000'; // Default: black
  if (hasOutline && effectiveStrokeColor) {
    outlineColor = convertColorToASS(effectiveStrokeColor);

    // Apply opacity to outline color if specified
    if (textStyle?.opacity !== undefined && textStyle.opacity < 1) {
      const colorMatch = outlineColor.match(
        /&H([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})/i,
      );
      if (colorMatch) {
        const [, currentAlpha, b, g, r] = colorMatch;
        const newAlpha = Math.round((1 - textStyle.opacity) * 255);
        outlineColor = `&H${newAlpha.toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}`;
      }
    }
  }

  const shadowDistance = textStyle?.hasShadow ? 2 : 0;

  // Convert text color (primary color) to ASS format
  let primaryColor = textStyle?.color
    ? convertColorToASS(textStyle.color)
    : '&H00FFFFFF'; // Default: white

  // Apply opacity to primary color if specified
  if (textStyle?.opacity !== undefined && textStyle.opacity < 1) {
    // Extract RGB components from primaryColor (&HAABBGGRR format)
    const colorMatch = primaryColor.match(
      /&H([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})/i,
    );
    if (colorMatch) {
      const [, currentAlpha, b, g, r] = colorMatch;
      // Calculate new alpha: convert opacity (0-1) to alpha (0-255), then invert for ASS format
      const newAlpha = Math.round((1 - textStyle.opacity) * 255);
      primaryColor = `&H${newAlpha.toString(16).padStart(2, '0').toUpperCase()}${b}${g}${r}`;
      console.log('🎨 Text Opacity Calculation:', {
        inputOpacity: textStyle.opacity,
        calculatedAlpha: newAlpha,
        alphaHex: newAlpha.toString(16).padStart(2, '0').toUpperCase(),
        originalAlpha: currentAlpha,
        resultColor: primaryColor,
        formula: `(1 - ${textStyle.opacity}) * 255 = ${newAlpha}`,
      });
    }
  }

  // Convert background color to ASS format
  // Use BorderStyle 3 for background box - outline width becomes padding in this mode
  let backColor = '&H00000000'; // Default: fully transparent (no background)
  let borderStyle = 1; // Default: outline + shadow style
  let convertedBackgroundColor = null;
  let finalOutlineColor = outlineColor; // Will be modified if background is used

  // Check if background color is set and not transparent
  const hasBackgroundColor =
    textStyle?.backgroundColor &&
    textStyle.backgroundColor !== 'transparent' &&
    textStyle.backgroundColor !== 'rgba(0,0,0,0)' &&
    textStyle.backgroundColor !== 'rgba(0, 0, 0, 0)';

  if (hasBackgroundColor) {
    const convertedColor = convertColorToASS(textStyle.backgroundColor);

    // Apply opacity to background or ensure fully opaque
    // ASS format: &HAABBGGRR where AA=00 means fully opaque
    const colorMatch = convertedColor.match(
      /&H([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})/i,
    );
    if (colorMatch) {
      const [, alpha, b, g, r] = colorMatch;

      // Apply opacity if specified, otherwise force fully opaque
      let finalAlpha = '00'; // Default: fully opaque
      if (textStyle?.opacity !== undefined && textStyle.opacity < 1) {
        const newAlpha = Math.round((1 - textStyle.opacity) * 255);
        finalAlpha = newAlpha.toString(16).padStart(2, '0').toUpperCase();
      }

      convertedBackgroundColor = `&H${finalAlpha}${b}${g}${r}`;
      backColor = convertedBackgroundColor;
      borderStyle = 3; // Use BorderStyle 3 for opaque background box

      // In BorderStyle 3, OutlineColour affects the box edge/border
      // Set it to the same as background color to avoid color conflicts
      finalOutlineColor = backColor;

      console.log('🎨 Background Color Conversion:', {
        input: textStyle.backgroundColor,
        convertedOutput: convertedColor,
        finalOutput: backColor,
        originalAlpha: alpha,
        appliedAlpha: finalAlpha,
        opacity: textStyle?.opacity,
        borderStyle: borderStyle,
        outlineColorOverride: finalOutlineColor,
      });
    }
  }

  let fontSize = textStyle?.fontSize
    ? parseInt(textStyle.fontSize.replace('px', ''))
    : 20; // Default: 20

  // Check if we need outline styles (when both background and outline are present)
  const needsOutlineStyles = hasBackgroundColor && hasOutline && outlineColor;
  fontSize = fontSize * (videoDimensions?.width / 720);
  const outlineStylesSection = needsOutlineStyles
    ? `Style: DefaultOutline,${assStyle.fontFamily},${fontSize},${primaryColor},&H000000FF,${outlineColor},&H00000000,0,${assStyle.italic},${assStyle.underline},0,100,100,0,0,1,${outlineWidth},0,2,10,10,20,1
Style: SemiboldOutline,${assStyle.fontFamily},${fontSize},${primaryColor},&H000000FF,${outlineColor},&H00000000,-1,${assStyle.italic},${assStyle.underline},0,100,100,0,0,1,${outlineWidth},0,2,10,10,20,1
Style: BoldOutline,${assStyle.fontFamily},${fontSize},${primaryColor},&H000000FF,${outlineColor},&H00000000,-1,${assStyle.italic},${assStyle.underline},0,120,120,0,0,1,${outlineWidth},0,2,10,10,20,1
`
    : '';

  // Get resolution from videoDimensions or use defaults
  const playResX = videoDimensions?.width || 1920;
  const playResY = videoDimensions?.height || 1080;

  const header = `[Script Info]
Title: Exported Subtitles
ScriptType: v4.00+
PlayResX: ${playResX}
PlayResY: ${playResY}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${assStyle.fontFamily},${fontSize},${primaryColor},&H000000FF,${finalOutlineColor},${backColor},0,${assStyle.italic},${assStyle.underline},0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDistance},2,10,10,20,1
Style: Semibold,${assStyle.fontFamily},${fontSize},${primaryColor},&H000000FF,${finalOutlineColor},${backColor},-1,${assStyle.italic},${assStyle.underline},0,100,100,0,0,${borderStyle},${outlineWidth},${shadowDistance},2,10,10,20,1
Style: Bold,${assStyle.fontFamily},${fontSize},${primaryColor},&H000000FF,${finalOutlineColor},${backColor},-1,${assStyle.italic},${assStyle.underline},0,120,120,0,0,${borderStyle},${outlineWidth},${shadowDistance},2,10,10,20,1
${outlineStylesSection}
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // ASS Style Parameters Explanation:
  // - BackColour=&H00000000: Fully transparent background (no black box)
  // - Bold=-1: Bold text enabled
  // - BorderStyle=1: Outline + shadow style (traditional subtitle look)
  // - Outline=2: Black outline for readability
  // - Shadow=1: Subtle drop shadow
  // - Alignment=2: Bottom center alignment
  // - PrimaryColour=&H00FFFFFF: White text color

  const events = segments
    .map((segment) => {
      const startTime = formatTimeForASS(segment.startTime);
      const endTime = formatTimeForASS(segment.endTime);

      // Apply text transformations if specified
      let text = segment.text;
      if (textStyle?.textTransform) {
        text = applyTextTransform(text, textStyle.textTransform);
      }

      // Convert newlines to ASS format (\N for line breaks)
      // SRT uses \n, but ASS requires \N (capital N)
      text = text.replace(/\n/g, '\\N');

      // Choose style based on font weight
      let styleName = 'Default';
      if (textStyle?.fontWeight) {
        const weight =
          typeof textStyle.fontWeight === 'number'
            ? textStyle.fontWeight
            : parseInt(textStyle.fontWeight.toString());

        if (weight >= 800) {
          styleName = 'Bold'; // For 800+ (like uppercase and bold)
        } else if (weight >= 600) {
          styleName = 'Semibold'; // For 600 (semibold)
        }
      }

      // Build override tags based on glow and outline settings
      let overrideTags = '';
      const overrideCommands: string[] = [];

      // Check if has actual background (not transparent)
      const hasActualBackground =
        textStyle?.backgroundColor &&
        textStyle.backgroundColor !== 'transparent' &&
        textStyle.backgroundColor !== 'rgba(0,0,0,0)' &&
        textStyle.backgroundColor !== 'rgba(0, 0, 0, 0)';

      if (textStyle?.hasGlow) {
        if (hasActualBackground) {
          // When background color exists with BorderStyle 3:
          // BorderStyle 3 shows an opaque background box
          // The Outline parameter in the style becomes the padding/margin for the box

          // DON'T blur the text/box - keep it crisp
          // Instead only blur/enhance the shadow for glow effect
          overrideCommands.push('\\blur0'); // Disable blur on text and box

          // For glow behind the background box, use shadow with text color
          const textColorForGlow = textStyle?.color || '#FFFFFF';
          const glowShadowColor = convertColorToASS(textColorForGlow);

          // Set shadow properties for glow effect
          const shadowBlur = (textStyle.glowIntensity || 2) + 18;
          overrideCommands.push(`\\shad${shadowBlur}`); // Shadow distance/size for glow
          overrideCommands.push('\\xshad-5'); // Offset shadow horizontally (increased from -3 to -5)
          overrideCommands.push('\\yshad6'); // Offset shadow vertically (increased from 4 to 6)
          overrideCommands.push(`\\4c${glowShadowColor}`); // Shadow color = text color for glow

          console.log('✨ Background + Glow mode (BorderStyle 3):', {
            textColor: textStyle?.color,
            glowShadowColor: glowShadowColor,
            backgroundColor: textStyle?.backgroundColor,
            backgroundColorConverted: convertedBackgroundColor,
            shadowBlur: shadowBlur,
            note: 'Text and box are crisp, only shadow is blurred for glow',
          });
        } else {
          // No background color - glow without background
          // For clean look matching example: NO blur, just outline
          // The outline itself provides the glow effect
          console.log(
            '✨ Glow mode without background (BorderStyle 1 with outline)',
          );
          // Don't add any overrides - let the base style with BorderStyle 1 and outline show through
        }
      }

      if (overrideCommands.length > 0) {
        overrideTags = `{${overrideCommands.join('')}}`;
      }

      // Multi-layer rendering for complex effects
      if (textStyle?.hasGlow) {
        const layers: string[] = [];

        // Determine glow color - use text color for the glow effect
        const glowColor = textStyle?.color || '#FFFFFF';
        const glowColorASS = convertColorToASS(glowColor);

        // Layer 0: Blurred glow/shadow layer (furthest back)
        const glowBlurAmount = (textStyle.glowIntensity || 2) + 10; // Increased intensity
        const glowOverrides: string[] = [];
        glowOverrides.push(`\\blur${glowBlurAmount}`); // Heavy blur for glow
        glowOverrides.push(`\\bord${outlineWidth * 3.25}`); // Larger outline for glow spread (decreased by 8 total)
        glowOverrides.push(`\\3c${glowColorASS}`); // Glow color on outline
        glowOverrides.push('\\1a&H00&'); // More opaque glow (was &H05&)
        glowOverrides.push('\\shad0'); // No shadow on glow layer

        const glowTags = `{${glowOverrides.join('')}}`;
        const glowLayer = `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${glowTags}${text}`;
        layers.push(glowLayer);

        if (hasActualBackground && hasOutline && outlineColor) {
          // Multi-layer with background: glow + background + outline

          // Layer 1: Background box layer (BorderStyle 3)
          const backgroundLayer = `Dialogue: 1,${startTime},${endTime},${styleName},,0,0,0,,${text}`;
          layers.push(backgroundLayer);

          // Layer 2: Outlined text on top using the *Outline style (BorderStyle 1)
          const outlineStyleName = `${styleName}Outline`;
          const textLayer = `Dialogue: 2,${startTime},${endTime},${outlineStyleName},,0,0,0,,${text}`;
          layers.push(textLayer);

          console.log(
            '✨ Triple-layer mode: glow + background + outlined text',
          );
        } else {
          // Layer 1: Main text with outline (no background)
          // Use outline style if available, otherwise use base style with outline in overrides
          if (hasOutline && outlineColor && needsOutlineStyles) {
            const outlineStyleName = `${styleName}Outline`;
            const mainLayer = `Dialogue: 1,${startTime},${endTime},${outlineStyleName},,0,0,0,,${text}`;
            layers.push(mainLayer);
          } else {
            // No special outline style needed - use base style
            const mainLayer = `Dialogue: 1,${startTime},${endTime},${styleName},,0,0,0,,${text}`;
            layers.push(mainLayer);
          }

          console.log('✨ Double-layer mode: glow + text');
        }

        return layers.join('\n');
      }

      // No glow - simple rendering
      if (hasActualBackground && hasOutline && outlineColor) {
        // Double-layer without glow: background + outline
        const backgroundLayer = `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${text}`;

        const outlineStyleName = `${styleName}Outline`;
        const textLayer = `Dialogue: 1,${startTime},${endTime},${outlineStyleName},,0,0,0,,${text}`;

        console.log(
          '✨ Double-layer mode: background + outlined text (no glow)',
        );

        return `${backgroundLayer}\n${textLayer}`;
      }

      return `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${overrideTags}${text}`;
    })
    .join('\n');

  return header + events;
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
      console.log(`✅ Using available font for ASS subtitles: ${fontFamily}`);
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
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
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
    case 'ass':
      content = generateASSContent(
        segments,
        options.textStyle,
        options.videoDimensions,
      );
      break;
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
