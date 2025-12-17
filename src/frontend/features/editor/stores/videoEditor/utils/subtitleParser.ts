import { VideoTrack } from '../types/track.types';
import { SUBTITLE_EXTENSIONS } from './constants';

export interface SubtitleSegment {
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
  index?: number;
}

const SAFE_SUBTITLE_GAP_SECONDS = 0.05; // 50ms minimum separation
const MIN_SUBTITLE_DURATION_SECONDS = 0.05; // Prevent zero-length clips after shifts

type NormalizedSubtitleSegment = SubtitleSegment & {
  normalizedStartTime: number;
  normalizedEndTime: number;
  originalStartTime: number;
  originalEndTime: number;
};

const normalizeSubtitleSegments = (
  segments: SubtitleSegment[],
  safeGapSeconds: number = SAFE_SUBTITLE_GAP_SECONDS,
): NormalizedSubtitleSegment[] => {
  const normalized: NormalizedSubtitleSegment[] = [];
  let previousEnd = 0;

  for (const segment of segments) {
    const originalStartTime = segment.startTime;
    const originalEndTime = segment.endTime;

    let normalizedStartTime = originalStartTime;
    let normalizedEndTime = originalEndTime;

    if (normalizedStartTime <= previousEnd) {
      const shift = previousEnd + safeGapSeconds - normalizedStartTime;
      normalizedStartTime += shift;
      normalizedEndTime += shift;
    }

    if (normalizedEndTime <= normalizedStartTime) {
      normalizedEndTime = normalizedStartTime + MIN_SUBTITLE_DURATION_SECONDS;
    }

    previousEnd = normalizedEndTime;

    normalized.push({
      ...segment,
      startTime: normalizedStartTime,
      endTime: normalizedEndTime,
      normalizedStartTime,
      normalizedEndTime,
      originalStartTime,
      originalEndTime,
    });
  }

  return normalized;
};

export function isSubtitleFile(fileName: string): boolean {
  return SUBTITLE_EXTENSIONS.some((ext) =>
    fileName.toLowerCase().endsWith(ext),
  );
}

export function parseSRT(content: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    const timeRegex =
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
    const timeMatch = lines[1].match(timeRegex);

    if (timeMatch) {
      const startTime =
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) +
        parseInt(timeMatch[4]) / 1000;

      const endTime =
        parseInt(timeMatch[5]) * 3600 +
        parseInt(timeMatch[6]) * 60 +
        parseInt(timeMatch[7]) +
        parseInt(timeMatch[8]) / 1000;

      // Preserve true line breaks from the source; only normalize CRLF
      const text = lines.slice(2).join('\n').replace(/\r/g, '');

      segments.push({
        startTime,
        endTime,
        text,
        index,
      });
    }
  }

  return segments;
}

export function parseVTT(content: string): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const lines = content.split('\n');
  let i = 0;

  // Skip header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      const timeRegex =
        /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
      const timeMatch = line.match(timeRegex);

      if (timeMatch) {
        const startTime =
          parseInt(timeMatch[1]) * 3600 +
          parseInt(timeMatch[2]) * 60 +
          parseInt(timeMatch[3]) +
          parseInt(timeMatch[4]) / 1000;

        const endTime =
          parseInt(timeMatch[5]) * 3600 +
          parseInt(timeMatch[6]) * 60 +
          parseInt(timeMatch[7]) +
          parseInt(timeMatch[8]) / 1000;

        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim());
          i++;
        }

        const text = textLines.join('\n');

        segments.push({
          startTime,
          endTime,
          text,
        });
      }
    }
    i++;
  }

  return segments;
}

export function parseSubtitleContent(
  content: string,
  fileName: string,
): SubtitleSegment[] {
  const extension = fileName.toLowerCase().split('.').pop();

  switch (extension) {
    case 'srt':
      return parseSRT(content);
    case 'vtt':
      return parseVTT(content);
    default:
      return parseSRT(content);
  }
}

export async function processSubtitleFile(
  fileInfo: {
    name: string;
    path: string;
    type: string;
    extension: string;
    size: number;
  },
  fileContent: string,
  currentTrackCount: number,
  fps: number,
  getTrackColor: (index: number) => string,
  trackRowIndex: number,
  previewUrl?: string,
): Promise<Omit<VideoTrack, 'id'>[]> {
  try {
    const segments = parseSubtitleContent(fileContent, fileInfo.name);
    const sortedSegments = [...segments].sort(
      (a, b) => a.startTime - b.startTime,
    );
    const normalizedSegments = normalizeSubtitleSegments(
      sortedSegments,
      SAFE_SUBTITLE_GAP_SECONDS,
    );

    if (normalizedSegments.length > 0) {
      const subtitleTracks = normalizedSegments.map((segment, segmentIndex) => {
        // Convert precise seconds to frames using Math.floor for start (inclusive)
        // and Math.ceil for end (exclusive) to ensure full coverage
        const startFrame = Math.floor(segment.normalizedStartTime * fps);
        const endFrame = Math.ceil(segment.normalizedEndTime * fps);

        return {
          type: 'subtitle' as const,
          name: `${
            segment.text.length > 30
              ? segment.text.substring(0, 30) + '...'
              : segment.text
          }`,
          source: fileInfo.path,
          previewUrl,
          duration: endFrame - startFrame,
          startFrame,
          endFrame,
          visible: true,
          locked: false,
          color: getTrackColor(currentTrackCount + segmentIndex),
          trackRowIndex,
          subtitleText: segment.text,
          subtitleType: 'regular' as const,
          // Store original precise timing from SRT for reference
          subtitleStartTime: segment.originalStartTime,
          subtitleEndTime: segment.originalEndTime,
          normalizedSubtitleStartTime: segment.normalizedStartTime,
          normalizedSubtitleEndTime: segment.normalizedEndTime,
          subtitleSafeGapSeconds: SAFE_SUBTITLE_GAP_SECONDS,
        };
      });

      return subtitleTracks;
    }
  } catch (error) {
    console.error(`❌ Error parsing subtitle file ${fileInfo.name}:`, error);
  }

  // Fallback: create single subtitle track if parsing fails
  return [
    {
      type: 'subtitle' as const,
      name: fileInfo.name,
      source: fileInfo.path,
      previewUrl,
      duration: 150,
      startFrame: 0,
      endFrame: 150,
      visible: true,
      locked: false,
      color: getTrackColor(currentTrackCount),
      subtitleText: `Subtitle: ${fileInfo.name}`,
      subtitleType: 'regular' as const,
      trackRowIndex,
    },
  ];
}
