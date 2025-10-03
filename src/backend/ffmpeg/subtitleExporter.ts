import {
  TimelineState,
  VideoTrack,
} from '@/frontend/features/editor/stores/videoEditor/index';

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
}

export interface SubtitleExportOptions {
  format: 'srt' | 'vtt' | 'ass';
  outputPath: string;
  filename: string;
  textStyle?: TextStyleOptions;
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
    const startTime = track.startFrame / timeline.fps;
    const endTime = track.endFrame / timeline.fps;

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
 * Generates ASS subtitle content (Advanced SubStation Alpha) with styling support
 */
export function generateASSContent(
  segments: SubtitleSegment[],
  textStyle?: TextStyleOptions,
): string {
  if (segments.length === 0) {
    return '';
  }

  // Convert text style to ASS parameters
  const assStyle = convertTextStyleToASS(textStyle);

  const header = `[Script Info]
Title: Exported Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${assStyle.fontFamily},16,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,${assStyle.italic},0,0,100,100,0,0,4,0,0,2,10,10,10,1
Style: Semibold,${assStyle.fontFamily},16,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,${assStyle.italic},0,0,100,100,0,0,4,0,0,2,10,10,10,1
Style: Bold,${assStyle.fontFamily},16,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,${assStyle.italic},0,0,120,120,0,0,4,0,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // ASS Style Parameters Explanation:
  // - BackColour=&H80000000: Semi-transparent black background (80 = ~50% alpha)
  // - Bold=-1: Bold text enabled
  // - BorderStyle=4: Background box style (fills bounding box behind text)
  // - Outline=0, Shadow=0: No outline or shadow
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

      return `Dialogue: 0,${startTime},${endTime},${styleName},,0,0,0,,${text}`;
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
} {
  if (!textStyle) {
    return {
      fontFamily: 'Arial',
      bold: -1, // Default bold for visibility
      italic: 0,
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

  // Extract font family or use default
  let fontFamily = 'Arial';
  if (textStyle.fontFamily) {
    // Extract first font from font stack
    fontFamily = textStyle.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
  }

  return {
    fontFamily,
    bold,
    italic,
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
      content = generateASSContent(segments, options.textStyle);
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
