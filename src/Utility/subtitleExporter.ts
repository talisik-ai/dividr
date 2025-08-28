import { VideoTrack, TimelineState } from '../store/videoEditorStore';

export interface SubtitleSegment {
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
  index: number;
}

export interface SubtitleExportOptions {
  format: 'srt' | 'vtt' | 'ass';
  outputPath: string;
  filename: string;
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
 * Generates ASS subtitle content (Advanced SubStation Alpha) with opaque background
 */
export function generateASSContent(segments: SubtitleSegment[]): string {
  if (segments.length === 0) {
    return '';
  }

  const header = `[Script Info]
Title: Exported Subtitles
ScriptType: v4.00+

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,16,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,4,0,0,2,10,10,10,1

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

      return `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${segment.text}`;
    })
    .join('\n');

  return header + events;
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
      content = generateASSContent(segments);
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
