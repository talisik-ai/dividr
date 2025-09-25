import * as path from 'path';
import {
  AudioProcessingContext,
  AudioTrimResult,
  CategorizedInputs,
  CommandParts,
  InputCategory,
  TrackInfo,
  VideoEditJob,
  VideoProcessingContext,
} from '../Schema/ffmpegConfig';

const VIDEO_DEFAULTS = {
  SIZE: { width: 1920, height: 1080 },
  FPS: 30,
  DUMMY_DURATION: 0.1,
} as const;

const AUDIO_DEFAULTS = {
  CHANNEL_LAYOUT: 'stereo',
  SAMPLE_RATE: 48000,
} as const;

// Enhanced timeline processing with proper cumulative positioning

interface TimelineSegment {
  input: TrackInfo;
  originalIndex: number;
  startTime: number; // Timeline position where this segment starts
  duration: number; // How long this segment lasts
  endTime: number; // Timeline position where this segment ends
}

interface ProcessedTimeline {
  segments: TimelineSegment[];
  totalDuration: number;
}

/**
 * Converts Windows path to FFmpeg-compatible format and escapes special characters
 * @param filePath - The file path to convert
 * @returns FFmpeg-compatible path with proper escaping
 */
function convertToFfmpegPath(filePath: string): string {
  let ffmpegPath = filePath;

  // Convert Windows backslashes to forward slashes
  if (process.platform === 'win32') {
    ffmpegPath = filePath.replace(/\\/g, '/');

    // CRITICAL: Escape Windows drive letter colon (C: becomes C\:)
    // This prevents FFmpeg from misinterpreting the colon as a parameter separator
    ffmpegPath = ffmpegPath.replace(/^([a-zA-Z]):/, '$1\\:');
  }

  // Escape special characters that can cause issues in FFmpeg filters
  // Note: We're using single quotes around the path, so we mainly need to escape single quotes
  ffmpegPath = ffmpegPath.replace(/'/g, "\\'");

  console.log('🎬 Path conversion debug:');
  console.log('  - Original:', filePath);
  console.log('  - FFmpeg format:', ffmpegPath);
  console.log('  - Platform:', process.platform);
  console.log('  - Final quoted format:', `'${ffmpegPath}'`);

  return ffmpegPath;
}

const GAP_MARKER = '__GAP__' as const;

function escapePath(filePath: string) {
  // For Node.js spawn(), we don't need shell escaping or quotes
  // Just return the path as-is since spawn() passes arguments directly
  return filePath;
}

const FILE_EXTENSIONS = {
  VIDEO: /\.(mp4|mov|mkv|avi|webm)$/i,
  AUDIO: /\.(mp3|wav|aac|flac)$/i,
} as const;

const ENCODING_DEFAULTS = {
  VIDEO_CODEC: 'libx264',
  AUDIO_CODEC: 'aac',
} as const;

// -------------------------
// Input Processing Utilities
// -------------------------

/**
 * Helper to get path from input (string or TrackInfo)
 */
function getInputPath(input: string | TrackInfo): string {
  return typeof input === 'string' ? input : input.path;
}

/**
 * Helper to get track info from input
 */
function getTrackInfo(input: string | TrackInfo): TrackInfo {
  return typeof input === 'string' ? { path: input } : input;
}

/**
 * Helper to check if input is a gap marker
 */
function isGapInput(path: string): boolean {
  return path === GAP_MARKER;
}

/**
 * Helper to get gap duration from trackInfo
 */
function getGapDuration(trackInfo: TrackInfo): number {
  return trackInfo.duration || 1;
}

/**
 * Calculates the actual duration of a track, accounting for trimming
 */
function calculateTrackDuration(
  trackInfo: TrackInfo,
  defaultDuration: number = 1,
): number {
  // If explicit duration is set, use it
  if (trackInfo.duration !== undefined) {
    return trackInfo.duration;
  }

  // For gaps, use duration or default
  if (isGapInput(trackInfo.path)) {
    return trackInfo.duration || defaultDuration;
  }

  // For regular files, we'd ideally get duration from file metadata
  // For now, use a reasonable default or any provided duration
  return defaultDuration;
}

/**
 * Builds a timeline with proper cumulative positioning
 */
function buildCumulativeTimeline(
  inputs: (string | TrackInfo)[],
  targetFrameRate: number = VIDEO_DEFAULTS.FPS,
): ProcessedTimeline {
  const segments: TimelineSegment[] = [];
  let currentTime = 0;

  inputs.forEach((input, originalIndex) => {
    const trackInfo = getTrackInfo(input);
    const duration = calculateTrackDuration(trackInfo, 1);

    const segment: TimelineSegment = {
      input: trackInfo,
      originalIndex,
      startTime: currentTime,
      duration,
      endTime: currentTime + duration,
    };

    segments.push(segment);
    currentTime += duration;
  });

  return {
    segments,
    totalDuration: currentTime,
  };
}

/**
 * Converts frame position to time position
 */
function framesToTime(frames: number, frameRate: number): number {
  return frames / frameRate;
}

/**
 * Adjusts timeline positions after insertion
 */
function adjustTimelineAfterInsertion(
  timeline: ProcessedTimeline,
  insertIndex: number,
  gapDuration: number,
): void {
  // Adjust all segments after the insertion point
  for (let i = insertIndex + 1; i < timeline.segments.length; i++) {
    timeline.segments[i].startTime += gapDuration;
    timeline.segments[i].endTime += gapDuration;
  }

  timeline.totalDuration += gapDuration;
}

/**
 * Splits a segment at the specified time
 */
function splitSegmentAtTime(
  segment: TimelineSegment,
  splitTime: number,
  nextOriginalIndex: number,
): { beforeSplit: TimelineSegment; afterSplit: TimelineSegment } {
  const splitOffset = splitTime - segment.startTime;
  const remainingDuration = segment.duration - splitOffset;

  const beforeSplit: TimelineSegment = {
    ...segment,
    duration: splitOffset,
    endTime: splitTime,
  };

  // Create new TrackInfo for the second part with adjusted startTime
  const afterSplitTrackInfo: TrackInfo = {
    ...segment.input,
    startTime: (segment.input.startTime || 0) + splitOffset,
  };

  const afterSplit: TimelineSegment = {
    input: afterSplitTrackInfo,
    originalIndex: nextOriginalIndex,
    startTime: splitTime,
    duration: remainingDuration,
    endTime: splitTime + remainingDuration,
  };

  return { beforeSplit, afterSplit };
}

/**
 * Finds the correct insertion point for a gap based on cumulative timeline position
 */
function findGapInsertionPoint(
  timeline: ProcessedTimeline,
  gapStartFrame: number,
  frameRate: number,
): {
  insertIndex: number;
  splitSegment?: { segment: TimelineSegment; splitTime: number };
} {
  const gapStartTime = framesToTime(gapStartFrame, frameRate);

  // Find if the gap falls within an existing segment or between segments
  for (let i = 0; i < timeline.segments.length; i++) {
    const segment = timeline.segments[i];

    // Gap starts before this segment - insert here
    if (gapStartTime < segment.startTime) {
      return { insertIndex: i };
    }

    // Gap starts within this segment - need to split the segment
    if (gapStartTime >= segment.startTime && gapStartTime < segment.endTime) {
      return {
        insertIndex: i + 1,
        splitSegment: {
          segment,
          splitTime: gapStartTime,
        },
      };
    }
  }

  // Gap starts after all segments - insert at end
  return { insertIndex: timeline.segments.length };
}

/**
 * Categorizes inputs into video and audio arrays with proper indexing
 * @param inputs - Array of video edit job inputs
 * @returns Categorized inputs with proper file indexing
 */
function categorizeInputs(inputs: (string | TrackInfo)[]): CategorizedInputs {
  const videoInputs: InputCategory[] = [];
  const audioInputs: Omit<InputCategory, 'isGap'>[] = [];
  let fileInputIndex = 0;

  inputs.forEach((input, originalIndex) => {
    const path = getInputPath(input);
    const trackInfo = getTrackInfo(input);
    const isGap = isGapInput(path);
    const isVideo = FILE_EXTENSIONS.VIDEO.test(path) || isGap;
    const isAudio = FILE_EXTENSIONS.AUDIO.test(path);

    if (isVideo) {
      if (isGap) {
        videoInputs.push({
          originalIndex,
          fileIndex: -1,
          trackInfo,
          isGap: true,
        });
      } else {
        videoInputs.push({
          originalIndex,
          fileIndex: fileInputIndex,
          trackInfo,
          isGap: false,
        });
        fileInputIndex++;
      }
    } else if (isAudio) {
      audioInputs.push({
        originalIndex,
        fileIndex: fileInputIndex,
        trackInfo,
      });
      fileInputIndex++;
    }
  });

  return { videoInputs, audioInputs, fileInputIndex };
}

// -------------------------
// Video Processing Functions
// -------------------------

/**
 * Creates video trimming filters for a given video track
 * @param context - Video processing context with track info and references
 * @returns Filter reference and filter strings for video trimming
 */
function createVideoTrimFilters(
  context: VideoProcessingContext,
): AudioTrimResult {
  const { trackInfo, originalIndex, inputStreamRef } = context;

  if (trackInfo.startTime === undefined && trackInfo.duration === undefined) {
    // No trimming needed, just return the original reference
    return {
      filterRef: inputStreamRef,
      filters: [],
    };
  }

  const trimmedRef = `[v${originalIndex}_trimmed]`;
  let trimFilter = `${inputStreamRef}trim=`;

  // Build trim parameters
  const params = [];
  if (trackInfo.startTime !== undefined && trackInfo.startTime > 0) {
    params.push(`start=${trackInfo.startTime}`);
  }
  if (trackInfo.duration !== undefined) {
    params.push(`duration=${trackInfo.duration}`);
  }

  if (params.length > 0) {
    trimFilter += params.join(':') + `[temp_trim_${originalIndex}]`;
    return {
      filterRef: trimmedRef,
      filters: [
        trimFilter,
        `[temp_trim_${originalIndex}]setpts=PTS-STARTPTS${trimmedRef}`,
      ],
    };
  }

  return {
    filterRef: inputStreamRef,
    filters: [],
  };
}

/**
 * Creates gap video filters (black video generation)
 * @param originalIndex - Index of the gap input
 * @param duration - Duration of the gap
 * @param targetFps - Target frame rate
 * @returns Filter reference and filter strings for gap video
 */
function createGapVideoFilters(
  originalIndex: number,
  duration: number,
  targetFps: number,
  videoDimensions: { width: number; height: number },
): AudioTrimResult {
  const gapRef = `[gap_v${originalIndex}]`;
  return {
    filterRef: gapRef,
    filters: [
      `color=black:size=${videoDimensions.width}x${videoDimensions.height}:duration=${duration}:rate=${targetFps}[temp_gap_${originalIndex}]`,
      `[temp_gap_${originalIndex}]setpts=PTS-STARTPTS${gapRef}`,
    ],
  };
}

/**
 * Creates FPS normalization filters
 * @param originalIndex - Index of the input
 * @param inputRef - Input stream reference
 * @param targetFps - Target frame rate
 * @returns Filter reference and filter strings for FPS normalization
 */
function createFpsNormalizationFilters(
  originalIndex: number,
  inputRef: string,
  targetFps: number,
): AudioTrimResult {
  const fpsRef = `[v${originalIndex}_fps]`;
  return {
    filterRef: fpsRef,
    filters: [`${inputRef}fps=${targetFps}:start_time=0${fpsRef}`],
  };
}

// -------------------------
// Audio Processing Functions
// -------------------------

/**
 * Creates audio trimming filters for a given audio track
 * @param context - Audio processing context with track info and references
 * @returns AudioTrimResult with filter reference and filter strings
 */
function createAudioTrimFilters(
  context: AudioProcessingContext,
): AudioTrimResult {
  const { trackInfo, originalIndex, inputStreamRef } = context;

  if (trackInfo.startTime === undefined && trackInfo.duration === undefined) {
    // No trimming needed, just reset timestamps
    const resetRef = `[a${originalIndex}_reset]`;
    return {
      filterRef: resetRef,
      filters: [`${inputStreamRef}asetpts=PTS-STARTPTS${resetRef}`],
    };
  }

  const trimmedRef = `[a${originalIndex}_trimmed]`;
  let trimFilter = `${inputStreamRef}atrim=`;

  // Build trim parameters
  const params = [];
  if (trackInfo.startTime !== undefined && trackInfo.startTime > 0) {
    params.push(`start=${trackInfo.startTime}`);
  }
  if (trackInfo.duration !== undefined) {
    params.push(`duration=${trackInfo.duration}`);
  }

  if (params.length > 0) {
    trimFilter += params.join(':') + `[temp_atrim_${originalIndex}]`;
    return {
      filterRef: trimmedRef,
      filters: [
        trimFilter,
        `[temp_atrim_${originalIndex}]asetpts=PTS-STARTPTS${trimmedRef}`,
      ],
    };
  }

  // Fallback: just reset timestamps
  const resetRef = `[a${originalIndex}_reset]`;
  return {
    filterRef: resetRef,
    filters: [`${inputStreamRef}asetpts=PTS-STARTPTS${resetRef}`],
  };
}

/**
 * Creates silent audio filters for gap inputs
 * @param originalIndex - Index of the gap input
 * @param duration - Duration of the silent audio
 * @returns AudioTrimResult with filter reference and filter strings
 */
function createSilentAudioFilters(
  originalIndex: number,
  duration: number,
): AudioTrimResult {
  const silentAudioRef = `[silent_a${originalIndex}]`;
  return {
    filterRef: silentAudioRef,
    filters: [
      `anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[temp_silent_${originalIndex}]`,
      `[temp_silent_${originalIndex}]asetpts=PTS-STARTPTS${silentAudioRef}`,
    ],
  };
}

/**
 * Handles audio replacement when separate audio files are provided
 * @param job - The video edit job
 * @param audioInputs - Array of audio input information
 * @param cmd - Command parts to modify
 * @param filterComplex - Existing filter complex string
 * @returns Updated filter complex string
 */
function handleAudioReplacementProcessing(
  job: VideoEditJob,
  audioInputs: Array<{
    originalIndex: number;
    fileIndex: number;
    trackInfo: TrackInfo;
  }>,
  cmd: CommandParts,
  filterComplex: string,
): string {
  if (audioInputs.length === 0) return filterComplex;

  // Use the first audio file as replacement
  const audioTrackInfo = audioInputs[0].trackInfo;
  const audioIndex = audioInputs[0].fileIndex;
  let audioRef = `${audioIndex}:a`;

  // Handle muted audio tracks
  if (audioTrackInfo.muted && audioTrackInfo.trackType === 'audio') {
    // Generate silent audio for muted audio tracks
    const duration = audioTrackInfo.duration || 1;
    filterComplex += `;anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[outa]`;
    console.log(`🔇 Muted audio track - using silent audio`);
  } else {
    // Apply audio trimming if specified
    if (
      audioTrackInfo.startTime !== undefined ||
      audioTrackInfo.duration !== undefined
    ) {
      const context: AudioProcessingContext = {
        trackInfo: audioTrackInfo,
        originalIndex: audioInputs[0].originalIndex,
        fileIndex: audioIndex,
        inputStreamRef: `[${audioIndex}:a]`,
      };

      const audioTrimResult = createAudioTrimFilters(context);

      if (audioTrimResult.filters.length > 0) {
        filterComplex = filterComplex + ';' + audioTrimResult.filters.join(';');
        audioRef = audioTrimResult.filterRef.slice(1, -1); // Remove brackets for map
      }
    }
  }

  // Set up audio mapping
  let audioMapRef: string;
  if (audioTrackInfo.muted && audioTrackInfo.trackType === 'audio') {
    // For muted audio tracks, use the silent audio output
    audioMapRef = '[outa]';
  } else {
    audioMapRef =
      audioRef.includes('_trimmed') || audioRef.includes('_reset')
        ? `[${audioRef}]`
        : `${audioIndex}:a`;
  }

  cmd.args.push('-map', '[outv]', '-map', audioMapRef);

  // Add encoding and sync flags
  cmd.args.push(
    '-c:v',
    ENCODING_DEFAULTS.VIDEO_CODEC,
    '-c:a',
    ENCODING_DEFAULTS.AUDIO_CODEC,
  );
  cmd.args.push('-avoid_negative_ts', 'make_zero');
  cmd.args.push('-vsync', 'cfr'); // Constant frame rate to maintain sync
  cmd.args.push('-async', '1'); // Audio sync correction

  return filterComplex;
}

/**
 * Processes audio tracks for concatenation (from video files)
 * @param videoInputs - Array of video input information
 * @returns Object containing audio filters and concatenation inputs
 */
function processAudioForConcatenationWithGaps(
  videoInputs: Array<{
    originalIndex: number;
    fileIndex: number;
    trackInfo: TrackInfo;
    isGap: boolean;
  }>,
): {
  audioTrimFilters: string[];
  silentAudioFilters: string[];
  concatAudioInputs: string[];
} {
  const audioTrimFilters: string[] = [];
  const silentAudioFilters: string[] = [];
  const concatAudioInputs: string[] = [];

  videoInputs.forEach(({ originalIndex, fileIndex, trackInfo, isGap }) => {
    if (isGap) {
      // Generate silent audio for any type of gap
      const duration = trackInfo.duration || 1;
      const silentResult = createSilentAudioFilters(originalIndex, duration);
      silentAudioFilters.push(...silentResult.filters);
      concatAudioInputs.push(silentResult.filterRef);

      const gapTypeLabel = isVideoGap(trackInfo)
        ? 'video gap'
        : isAudioGap(trackInfo)
          ? 'audio gap'
          : 'gap';
      console.log(
        `Generated silent audio for ${gapTypeLabel} at index ${originalIndex}`,
      );
    } else if (trackInfo.muted && trackInfo.trackType === 'video') {
      // Generate silent audio for muted video tracks
      const duration = trackInfo.duration || 1;
      const silentResult = createSilentAudioFilters(originalIndex, duration);
      silentAudioFilters.push(...silentResult.filters);
      concatAudioInputs.push(silentResult.filterRef);
      console.log(
        `Muted video track - using silent audio for track at index ${originalIndex}`,
      );
    } else {
      // Handle regular video files with audio
      const context: AudioProcessingContext = {
        trackInfo,
        originalIndex,
        fileIndex,
        inputStreamRef: `[${fileIndex}:a]`,
      };

      const audioTrimResult = createAudioTrimFilters(context);
      audioTrimFilters.push(...audioTrimResult.filters);
      concatAudioInputs.push(audioTrimResult.filterRef);
    }
  });

  return { audioTrimFilters, silentAudioFilters, concatAudioInputs };
}

/**
 * Processes gaps and inserts them into the input timeline
 * @param inputs - Original array of inputs
 * @param gaps - Gap information from TimelineGaps interface
 * @param targetFrameRate - Target frame rate for frame-to-time conversion
 * @returns Processed inputs with gap markers inserted
 */
/**
 * Enhanced gap processing with proper timeline management
 */
function processGapsInTimeline(
  inputs: (string | TrackInfo)[],
  gaps?: {
    video?: Array<{ startFrame: number; length: number }>;
    audio?: Array<{ startFrame: number; length: number }>;
  },
  targetFrameRate: number = VIDEO_DEFAULTS.FPS,
): TrackInfo[] {
  if (!gaps || (!gaps.video?.length && !gaps.audio?.length)) {
    return inputs.map((input) =>
      typeof input === 'string' ? { path: input } : input,
    );
  }

  // Build initial timeline
  let timeline = buildCumulativeTimeline(inputs, targetFrameRate);
  let nextOriginalIndex = inputs.length;

  console.log(
    'Initial timeline:',
    timeline.segments.map(
      (s) =>
        `[${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s] ${s.input.path}`,
    ),
  );

  // Collect all gaps and sort by start frame (process in chronological order)
  const allGaps: Array<{
    startFrame: number;
    length: number;
    type: 'video' | 'audio';
  }> = [];

  if (gaps.video) {
    gaps.video.forEach((gap) => allGaps.push({ ...gap, type: 'video' }));
  }
  if (gaps.audio) {
    gaps.audio.forEach((gap) => allGaps.push({ ...gap, type: 'audio' }));
  }

  // Sort gaps by start frame to process in chronological order
  allGaps.sort((a, b) => a.startFrame - b.startFrame);

  // Process each gap
  allGaps.forEach((gap, gapIndex) => {
    const gapDuration = gap.length / targetFrameRate;
    const insertionResult = findGapInsertionPoint(
      timeline,
      gap.startFrame,
      targetFrameRate,
    );

    console.log(
      `Processing ${gap.type} gap at frame ${gap.startFrame} (${framesToTime(gap.startFrame, targetFrameRate).toFixed(2)}s), duration: ${gapDuration.toFixed(2)}s`,
    );

    let insertIndex = insertionResult.insertIndex;
    let newSegments: TimelineSegment[] = [];

    // Handle segment splitting if necessary
    if (insertionResult.splitSegment) {
      const { segment, splitTime } = insertionResult.splitSegment;
      const { beforeSplit, afterSplit } = splitSegmentAtTime(
        segment,
        splitTime,
        nextOriginalIndex++,
      );

      // Replace the original segment with the split parts
      timeline.segments[insertIndex - 1] = beforeSplit;
      newSegments.push(afterSplit);

      console.log(
        `Split segment at ${splitTime.toFixed(2)}s: before=[${beforeSplit.startTime.toFixed(2)}-${beforeSplit.endTime.toFixed(2)}], after=[${afterSplit.startTime.toFixed(2)}-${afterSplit.endTime.toFixed(2)}]`,
      );
    }

    // Create gap segment
    const gapStartTime = insertionResult.splitSegment
      ? insertionResult.splitSegment.splitTime
      : insertIndex < timeline.segments.length
        ? timeline.segments[insertIndex].startTime
        : timeline.totalDuration;

    const gapTrackInfo: TrackInfo = {
      path: GAP_MARKER,
      duration: gapDuration,
      startFrame: gap.startFrame,
      trackType: gap.type,
      gapType: gap.type,
    };

    const gapSegment: TimelineSegment = {
      input: gapTrackInfo,
      originalIndex: nextOriginalIndex++,
      startTime: gapStartTime,
      duration: gapDuration,
      endTime: gapStartTime + gapDuration,
    };

    // Insert gap and any split segments
    const segmentsToInsert = [gapSegment, ...newSegments];
    timeline.segments.splice(insertIndex, 0, ...segmentsToInsert);

    // Adjust timeline positions after insertion
    adjustTimelineAfterInsertion(timeline, insertIndex, gapDuration);

    console.log(
      `Inserted ${gap.type} gap: [${gapSegment.startTime.toFixed(2)}s-${gapSegment.endTime.toFixed(2)}s]`,
    );
  });

  console.log(
    'Final timeline:',
    timeline.segments.map(
      (s) =>
        `[${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s] ${s.input.path}${s.input.gapType ? ` (${s.input.gapType} gap)` : ''}`,
    ),
  );
  console.log(`Total timeline duration: ${timeline.totalDuration.toFixed(2)}s`);

  // Return the processed inputs
  return timeline.segments.map((segment) => segment.input);
}

/**
 * Finds the correct insertion index for a gap based on timeline position
 */
function findInsertionIndex(
  inputs: TrackInfo[],
  gapStartFrame: number,
  targetFrameRate: number,
): number {
  for (let i = 0; i < inputs.length; i++) {
    const track = inputs[i];
    const trackStartFrame =
      track.startFrame ??
      (track.startTime !== undefined ? track.startTime * targetFrameRate : 0);

    if (trackStartFrame > gapStartFrame) {
      return i;
    }
  }
  return inputs.length; // Insert at end if no suitable position found
}

/**
 * Enhanced helper to check if input is a gap marker with specific gap type
 */
function isVideoGap(trackInfo: TrackInfo): boolean {
  return isGapInput(trackInfo.path) && trackInfo.gapType === 'video';
}

/**
 * Helper to check if input is an audio gap marker
 */
function isAudioGap(trackInfo: TrackInfo): boolean {
  return isGapInput(trackInfo.path) && trackInfo.gapType === 'audio';
}

/**
 * Enhanced gap video filter creation that handles both video and audio gaps
 */
function createGapFilters(
  originalIndex: number,
  trackInfo: TrackInfo,
  targetFps: number,
  videoDimensions: { width: number; height: number },
): { videoFilter?: AudioTrimResult; audioFilter?: AudioTrimResult } {
  const duration = trackInfo.duration || 1;
  if (isVideoGap(trackInfo)) {
    // Video gap: black video + silent audio
    const videoGapRef = `[gap_v${originalIndex}]`;
    const audioGapRef = `[gap_a${originalIndex}]`;

    return {
      videoFilter: {
        filterRef: videoGapRef,
        filters: [
          `color=black:size=${videoDimensions.width}x${videoDimensions.height};:duration=${duration}:rate=${targetFps}[temp_gap_v${originalIndex}]`,
          `[temp_gap_v${originalIndex}]setpts=PTS-STARTPTS${videoGapRef}`,
        ],
      },
      audioFilter: {
        filterRef: audioGapRef,
        filters: [
          `anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[temp_gap_a${originalIndex}]`,
          `[temp_gap_a${originalIndex}]asetpts=PTS-STARTPTS${audioGapRef}`,
        ],
      },
    };
  } else if (isAudioGap(trackInfo)) {
    // Audio gap: silent audio only (video continues from previous track or is handled separately)
    const audioGapRef = `[gap_a${originalIndex}]`;

    return {
      audioFilter: {
        filterRef: audioGapRef,
        filters: [
          `anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[temp_gap_a${originalIndex}]`,
          `[temp_gap_a${originalIndex}]asetpts=PTS-STARTPTS${audioGapRef}`,
        ],
      },
    };
  }

  return {};
}

/**
 * Handles single track audio trimming
 * @param trackInfo - Track information with timing
 * @returns Object with video and audio filter strings, or null if no trimming needed
 */
function createSingleTrackTrimFilters(
  trackInfo: TrackInfo,
  videoDimensions: { width: number; height: number },
): { videoFilter: string; audioFilter: string } | null {
  if (trackInfo.startTime === undefined && trackInfo.duration === undefined) {
    return null;
  }

  const params = [];
  if (trackInfo.startTime !== undefined && trackInfo.startTime > 0) {
    params.push(`start=${trackInfo.startTime}`);
  }
  if (trackInfo.duration !== undefined) {
    params.push(`duration=${trackInfo.duration}`);
  }

  if (params.length === 0) {
    return null;
  }

  const paramString = params.join(':');

  let videoFilter: string;
  let audioFilter: string;

  // Handle video visibility
  if (
    trackInfo.visible === false &&
    (trackInfo.trackType === 'video' || trackInfo.trackType === 'image')
  ) {
    // Generate black video for hidden tracks
    const duration = trackInfo.duration || 1;
    videoFilter = `color=black:size=${videoDimensions.width}x${videoDimensions.height}:duration=${duration}:rate=${VIDEO_DEFAULTS.FPS}[outv]`;
    console.log(`🖤 Single hidden track - using black video`);
  } else {
    videoFilter = `[0:v]trim=${paramString}[outv]`;
  }

  // Handle audio muting
  if (trackInfo.muted && trackInfo.trackType === 'video') {
    // Generate silent audio for muted video tracks
    const duration = trackInfo.duration || 1;
    audioFilter = `anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[outa]`;
    console.log(`🔇 Single track trim with muted video - using silent audio`);
  } else {
    audioFilter = `[0:a]atrim=${paramString}[outa]`;
  }

  return {
    videoFilter,
    audioFilter,
  };
}

// -------------------------
// Filter Complex Builders
// -------------------------

/**
 * Builds a concatenation filter complex string
 * @param concatInputPairs - Array of interleaved video/audio input pairs
 * @param videoCount - Number of video inputs
 * @param audioCount - Number of audio inputs
 * @returns Concatenation filter string
 */
function buildConcatFilter(
  concatInputPairs: string[],
  videoCount: number,
  audioCount: number,
  subtitlePath?: string,
  crop?: { width: number; height: number; x: number; y: number },
): string {
  const concatFilter = `${concatInputPairs.join('')}concat=n=${videoCount}:v=${videoCount > 0 ? 1 : 0}:a=${audioCount > 0 ? 1 : 0}:unsafe=1[temp_outv][temp_outa]`;

  let currentVideoRef = '[temp_outv]';

  // Build the filter chain: concat -> crop -> subtitles -> setpts
  let filterChain = '';

  // Handle cropping first if needed
  if (crop) {
    filterChain += `${currentVideoRef}crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}[cropped];`;
    currentVideoRef = '[cropped]';
  }

  // Handle subtitles next if needed
  if (subtitlePath) {
    const ffmpegPath = convertToFfmpegPath(subtitlePath);
    const subtitleFilter = `${currentVideoRef}subtitles='${ffmpegPath}':force_style='BorderStyle=4,BackColour=&H80000000,Outline=0,Shadow=0'[subtitled];`;
    console.log('🎬 SUBTITLE FILTER CONSTRUCTED:', subtitleFilter);
    filterChain += subtitleFilter;
    currentVideoRef = '[subtitled]';
  }

  // Always add setpts at the end
  filterChain += `${currentVideoRef}setpts=PTS-STARTPTS[outv]`;

  const finalVideoFilter = filterChain;

  const finalAudioFilter = `[temp_outa]asetpts=PTS-STARTPTS[outa]`;
  return concatFilter + ';' + finalVideoFilter + ';' + finalAudioFilter;
}

/**
 * Builds filter complex for single gap input
 * @param duration - Duration of the gap
 * @param targetFps - Target frame rate
 * @returns Filter complex string for gap generation
 */
function buildSingleGapFilterComplex(
  duration: number,
  targetFps: number,
  videoDimensions: { width: number; height: number },
  subtitlePath?: string,
): string {
  if (subtitlePath) {
    const ffmpegPath = convertToFfmpegPath(subtitlePath);
    return `color=black:size=${videoDimensions.width}x${videoDimensions.height}:duration=${duration}:rate=${targetFps}[temp_outv];[temp_outv]subtitles='${ffmpegPath}':force_style='BorderStyle=4,BackColour=&H80000000,Outline=0,Shadow=0'[outv];anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[outa]`;
  }
  return `color=black:size=${videoDimensions.width}x${videoDimensions.height}duration=${duration}:rate=${targetFps}[outv];anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[outa]`;
}

/**
 * Interleaves video and audio inputs for concat filter
 * @param videoInputs - Array of video input references
 * @param audioInputs - Array of audio input references
 * @returns Interleaved input pairs for concat
 */
function interleaveInputsForConcat(
  videoInputs: string[],
  audioInputs: string[],
): string[] {
  const concatInputPairs: string[] = [];
  const maxLength = Math.max(videoInputs.length, audioInputs.length);

  for (let i = 0; i < maxLength; i++) {
    if (i < videoInputs.length) {
      concatInputPairs.push(videoInputs[i]);
    }
    if (i < audioInputs.length) {
      concatInputPairs.push(audioInputs[i]);
    }
  }

  return concatInputPairs;
}

// -------------------------
// Workflow Handlers
// -------------------------

/**
 * Handles concatenation workflow with multiple inputs
 * @param job - Video edit job
 * @param cmd - Command parts to modify
 */
function handleConcatenationWorkflow(
  job: VideoEditJob,
  cmd: CommandParts,
): void {
  // Add all real file inputs first
  job.inputs.forEach((input) => {
    const path = getInputPath(input);
    if (!isGapInput(path)) {
      cmd.args.push('-i', escapePath(path));
    }
  });

  // Categorize inputs
  const { videoInputs, audioInputs } = categorizeInputs(job.inputs);

  const fpsFilters: string[] = [];
  const trimFilters: string[] = [];
  const concatVideoInputs: string[] = [];
  let videoCount = 0;

  // Process video inputs with enhanced gap handling
  videoInputs.forEach(({ originalIndex, fileIndex, trackInfo, isGap }) => {
    videoCount++;
    let videoStreamRef: string;

    if (isGap) {
      const targetFps = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
      const videoDim = job.videoDimensions || VIDEO_DEFAULTS.SIZE;

      if (isVideoGap(trackInfo)) {
        // Handle video gap - creates black video
        const duration = getGapDuration(trackInfo);
        const gapResult = createGapVideoFilters(
          originalIndex,
          duration,
          targetFps,
          videoDim,
        );
        trimFilters.push(...gapResult.filters);
        videoStreamRef = gapResult.filterRef;
        console.log(
          `Inserted video gap at index ${originalIndex} with duration ${duration}s`,
        );
      } else {
        // For audio-only gaps in video timeline, we might need to extend previous video or create placeholder
        // This depends on your specific requirements - for now, create a black frame
        const duration = getGapDuration(trackInfo);
        const gapResult = createGapVideoFilters(
          originalIndex,
          duration,
          targetFps,
          videoDim,
        );
        trimFilters.push(...gapResult.filters);
        videoStreamRef = gapResult.filterRef;
        console.log(
          `Inserted placeholder video for audio gap at index ${originalIndex}`,
        );
      }
    } else if (
      trackInfo.visible === false &&
      (trackInfo.trackType === 'video' || trackInfo.trackType === 'image')
    ) {
      // Handle hidden video/image tracks - generate black
      const videoDim = job.videoDimensions || VIDEO_DEFAULTS.SIZE;
      const duration = trackInfo.duration || 1;
      const targetFps = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
      const blackVideoResult = createGapVideoFilters(
        originalIndex,
        duration,
        targetFps,
        videoDim,
      );
      trimFilters.push(...blackVideoResult.filters);
      videoStreamRef = blackVideoResult.filterRef;
      console.log(
        `Hidden track - using black video for track at index ${originalIndex}`,
      );
    } else {
      // Handle regular video file
      const context: VideoProcessingContext = {
        trackInfo,
        originalIndex,
        fileIndex,
        inputStreamRef: `[${fileIndex}:v]`,
      };

      const trimResult = createVideoTrimFilters(context);
      if (trimResult.filters.length > 0) {
        trimFilters.push(...trimResult.filters);
      }
      videoStreamRef = trimResult.filterRef;
    }

    // Apply FPS normalization if needed
    if (job.operations.normalizeFrameRate) {
      const targetFps = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
      const fpsResult = createFpsNormalizationFilters(
        originalIndex,
        videoStreamRef,
        targetFps,
      );
      fpsFilters.push(...fpsResult.filters);
      concatVideoInputs.push(fpsResult.filterRef);
    } else {
      concatVideoInputs.push(videoStreamRef);
    }
  });

  // Handle audio processing with enhanced gap support
  if (audioInputs.length > 0) {
    // Video-only concat + audio replacement
    const allFilters = [...trimFilters, ...fpsFilters];
    let filterComplex = allFilters.length > 0 ? allFilters.join(';') + ';' : '';

    let videoOnlyFilter: string;
    if (job.operations.subtitles) {
      const ffmpegPath = convertToFfmpegPath(job.operations.subtitles);
      videoOnlyFilter = `${concatVideoInputs.join('')}concat=n=${videoCount}:v=1:a=0[temp_outv];[temp_outv]subtitles='${ffmpegPath}':force_style='BorderStyle=4,BackColour=&H80000000,Outline=0,Shadow=0'[outv]`;
    } else {
      videoOnlyFilter = `${concatVideoInputs.join('')}concat=n=${videoCount}:v=1:a=0[outv]`;
    }
    filterComplex += videoOnlyFilter;

    filterComplex = handleAudioReplacementProcessing(
      job,
      audioInputs,
      cmd,
      filterComplex,
    );
    cmd.args.push('-filter_complex', filterComplex);
  } else {
    // Concat audio from video files with gap handling
    const { audioTrimFilters, silentAudioFilters, concatAudioInputs } =
      processAudioForConcatenationWithGaps(videoInputs);

    const allFilters = [
      ...trimFilters,
      ...fpsFilters,
      ...audioTrimFilters,
      ...silentAudioFilters,
    ];
    let filterComplex = allFilters.length > 0 ? allFilters.join(';') + ';' : '';

    const concatInputPairs = interleaveInputsForConcat(
      concatVideoInputs,
      concatAudioInputs,
    );
    const concatFilter = buildConcatFilter(
      concatInputPairs,
      videoCount,
      videoInputs.length,
      job.operations.subtitles,
      job.operations.crop,
    );
    filterComplex += concatFilter;

    cmd.args.push('-filter_complex', filterComplex);
    cmd.args.push('-map', '[outv]', '-map', '[outa]');
  }
}

/**
 * Handles single input workflow
 * @param job - Video edit job
 * @param cmd - Command parts to modify
 */
function handleSingleInputWorkflow(job: VideoEditJob, cmd: CommandParts): void {
  const input = job.inputs[0];
  const trackInfo = getTrackInfo(input);
  const path = getInputPath(input);

  if (isGapInput(path)) {
    const duration = getGapDuration(trackInfo);
    const targetFps = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
    const videoDimensions = job.videoDimensions || VIDEO_DEFAULTS.SIZE;

    // Generate black video + silent audio of exact gap length
    const filterComplex = `
      color=size=${videoDimensions.width}x${videoDimensions.height}:rate=${targetFps}:duration=${duration}:color=black[gapv];
      anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[gapa];
      [gapv]setpts=PTS-STARTPTS[outv];
      [gapa]asetpts=PTS-STARTPTS[outa]
    `;

    cmd.args.push('-filter_complex', filterComplex);
    cmd.args.push('-map', '[outv]', '-map', '[outa]');
  } else {
    // Handle regular file input
    cmd.args.push('-i', escapePath(path));
    const videoDimensions = job.videoDimensions || VIDEO_DEFAULTS.SIZE;
    const trimFilters = createSingleTrackTrimFilters(
      trackInfo,
      videoDimensions,
    );
    if (trimFilters) {
      let filterComplex = `${trimFilters.videoFilter};${trimFilters.audioFilter}`;

      // Add crop and/or subtitles if specified

      // Handle cropping first if needed
      if (job.operations.crop) {
        const crop = job.operations.crop;
        filterComplex = filterComplex.replace('[outv]', '[pre_crop]');
        filterComplex += `;[pre_crop]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}[outv]`;
      }

      // Add subtitles if specified
      if (job.operations.subtitles) {
        // Modify the video filter to output to temp, then add subtitles
        filterComplex = filterComplex.replace('[outv]', '[temp_outv]');
        const ffmpegPath = convertToFfmpegPath(job.operations.subtitles);
        filterComplex += `;[temp_outv]subtitles='${ffmpegPath}':force_style='BorderStyle=4,BackColour=&H80000000,Outline=0,Shadow=0'[outv]`;
      }

      cmd.args.push('-filter_complex', filterComplex);
      cmd.args.push('-map', '[outv]', '-map', '[outa]');
    } else if (
      job.operations.subtitles ||
      job.operations.crop ||
      (trackInfo.visible === false &&
        (trackInfo.trackType === 'video' || trackInfo.trackType === 'image'))
    ) {
      // No trimming but we have subtitles, cropping, or hidden track
      let filterComplex = '';
      let videoInput = '[0:v]';

      // Handle hidden video tracks first
      if (
        trackInfo.visible === false &&
        (trackInfo.trackType === 'video' || trackInfo.trackType === 'image')
      ) {
        const duration = trackInfo.duration || 1;
        filterComplex = `color=black:size=${videoDimensions.width}x${videoDimensions.height}:duration=${duration}:rate=${VIDEO_DEFAULTS.FPS}[hidden_black]`;
        videoInput = '[hidden_black]';
        console.log(`🖤 Single hidden track without trim - using black video`);
      }

      // Handle cropping first if needed
      if (job.operations.crop) {
        const crop = job.operations.crop;
        if (job.operations.subtitles) {
          // If we also have subtitles, crop first then subtitles
          filterComplex = `${videoInput}crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}[cropped]`;
          videoInput = '[cropped]';
        } else {
          // Only cropping, no subtitles
          filterComplex = `${videoInput}crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}[outv]`;
        }
      }

      // Add subtitles if specified
      if (job.operations.subtitles) {
        const ffmpegPath = convertToFfmpegPath(job.operations.subtitles);

        if (filterComplex) {
          // Already have cropping, add subtitles to the chain
          filterComplex += `;${videoInput}subtitles='${ffmpegPath}':force_style='BorderStyle=4,BackColour=&H80000000,Outline=0,Shadow=0'[outv]`;
        } else {
          // Only subtitles, no cropping
          filterComplex = `${videoInput}subtitles='${ffmpegPath}':force_style='BorderStyle=4,BackColour=&H80000000,Outline=0,Shadow=0'[outv]`;
        }
      }

      // Add audio handling (passthrough or silent for muted tracks)
      if (trackInfo.muted && trackInfo.trackType === 'video') {
        // Generate silent audio for muted video tracks
        const duration = trackInfo.duration || 1;
        filterComplex += `;anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}:duration=${duration}[outa]`;
        console.log(`🔇 Single muted video track - using silent audio`);
      } else {
        filterComplex += ';[0:a]acopy[outa]';
      }

      cmd.args.push('-filter_complex', filterComplex);
      cmd.args.push('-map', '[outv]', '-map', '[outa]');
    }
  }
}

/**
 * Handles multiple inputs without concatenation
 * @param job - Video edit job
 * @param cmd - Command parts to modify
 */
function handleMultipleInputsNoConcatWorkflow(
  job: VideoEditJob,
  cmd: CommandParts,
): void {
  job.inputs.forEach((input) => {
    const path = getInputPath(input);
    if (!isGapInput(path)) {
      cmd.args.push('-i', escapePath(path));
    }
  });
}

// -------------------------
// Step handlers
// -------------------------
const steps: ((job: VideoEditJob, cmd: CommandParts) => void)[] = [
  handleInputs,
  handleTrim,
  handleCrop,
  handleSubtitles,
  handleAspect,
  handleReplaceAudio,
  handlePreset,
  handleThreads,
];

function handleInputs(job: VideoEditJob, cmd: CommandParts) {
  const inputCount = job.inputs.length;

  if (job.operations.concat && inputCount > 1) {
    handleConcatenationWorkflow(job, cmd);
  } else if (inputCount === 1) {
    handleSingleInputWorkflow(job, cmd);
  } else {
    handleMultipleInputsNoConcatWorkflow(job, cmd);
  }
}

function handleTrim(job: VideoEditJob, cmd: CommandParts) {
  const trim = job.operations.trim;
  if (!trim) return;

  const { start, duration, end } = trim;
  if (start) cmd.args.unshift('-ss', start);
  if (duration) {
    cmd.args.push('-t', duration);
  } else if (end && start) {
    const dur = timeToSeconds(end) - timeToSeconds(start);
    cmd.args.push('-t', String(dur));
  }
}

function handleCrop(job: VideoEditJob, cmd: CommandParts) {
  const crop = job.operations.crop;
  if (crop)
    cmd.filters.push(`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
}

function handleSubtitles(job: VideoEditJob, cmd: CommandParts) {
  // Only add subtitles to -vf filters if we're NOT using concatenation
  // Concatenation uses -filter_complex, so subtitles must be integrated there
  if (
    job.operations.subtitles &&
    !(job.operations.concat && job.inputs.length > 1)
  ) {
    const ffmpegPath = convertToFfmpegPath(job.operations.subtitles);

    const subtitleFilter = `subtitles='${ffmpegPath}':force_style='BorderStyle=4,BackColour=&H80000000,Outline=0,Shadow=0'`;
    cmd.filters.push(subtitleFilter);
    console.log('📝 Added subtitle filter to -vf:', subtitleFilter);
  } else if (job.operations.subtitles) {
    console.log(
      '📝 Subtitle file detected, will be integrated into filter complex:',
      job.operations.subtitles,
    );
  }
}

function handleAspect(job: VideoEditJob, cmd: CommandParts) {
  if (job.operations.aspect) cmd.args.push('-aspect', job.operations.aspect);
}

function handleReplaceAudio(job: VideoEditJob, cmd: CommandParts) {
  if (!job.operations.replaceAudio) return;
  cmd.args.push('-i', job.operations.replaceAudio);
  cmd.args.push('-map', '0:v', '-map', `${job.inputs.length}:a`);
}

function handlePreset(job: VideoEditJob, cmd: CommandParts) {
  if (!job.operations.preset) return;

  // Add preset before codec specifications for optimal placement
  cmd.args.push('-c:v', 'libx264');
  cmd.args.push('-preset', job.operations.preset);
  cmd.args.push('-crf', '29');
  cmd.args.push('-c:a', 'aac');
  cmd.args.push('-b:a', '96k');

  console.log(`🚀 Applied encoding preset: ${job.operations.preset}`);
}

function handleThreads(job: VideoEditJob, cmd: CommandParts) {
  //if(!job.operations.threads) return;

  cmd.args.push('-threads', String(job.operations.threads));
  cmd.args.push('-movflags');
  cmd.args.push('+faststart');

  console.log(`🚀 Applied thread limit: ${job.operations.threads}`);
}

// -------------------------
// Main builder
// -------------------------
export function buildFfmpegCommand(
  job: VideoEditJob,
  location?: string,
): string[] {
  // Enhanced gap preprocessing
  let processedInputs = job.inputs;
  console.log('Taken inputs from VideoEditJob: ' + processedInputs);
  if (job.gaps && (job.gaps.video?.length || job.gaps.audio?.length)) {
    processedInputs = processGapsInTimeline(
      job.inputs,
      job.gaps,
      job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS,
    );

    console.log('Gap processing completed:');
    console.log('  - Video gaps:', job.gaps.video?.length || 0);
    console.log('  - Audio gaps:', job.gaps.audio?.length || 0);
    console.log('  - Total processed inputs:', processedInputs.length);
  }

  const cmd: CommandParts = { args: [], filters: [] };

  // Run all step handlers with processed inputs
  for (const step of steps) step({ ...job, inputs: processedInputs }, cmd);

  // Apply -vf filters ONLY if we're not using -filter_complex
  const usesFilterComplex = cmd.args.includes('-filter_complex');

  if (cmd.filters.length > 0 && !usesFilterComplex) {
    cmd.args.push('-vf', cmd.filters.join(','));
  } else if (cmd.filters.length > 0 && usesFilterComplex) {
    console.warn(
      'Attempted to use -vf filters when -filter_complex is already in use. Filters ignored:',
      cmd.filters,
    );
  }

  const outputFilePath = location
    ? path.join(location, job.output)
    : job.output;

  // Output file
  cmd.args.push(outputFilePath);
  console.log('FFmpeg Command Args:', cmd.args);
  console.log('Full FFmpeg Command:', ['ffmpeg', ...cmd.args].join(' '));
  return cmd.args;
}

// -------------------------
// Helpers
// -------------------------
function timeToSeconds(time: string): number {
  const parts = time.split(':').map(Number);
  return parts.reduce((acc, val) => acc * 60 + val);
}

// Test function for debugging command generation
export function testConcatCommand() {
  const testJob: VideoEditJob = {
    inputs: ['video1.mp4', 'video2.mp4'],
    output: 'output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  const command = buildFfmpegCommand(testJob);
  console.log('🧪 Test Concat Command:', command.join(' '));
  return command;
}

// Test function for mixed video/audio inputs (audio replacement)
export function testAudioReplacementCommand() {
  const testJob: VideoEditJob = {
    inputs: ['video1.mp4', 'audio1.mp3', 'video2.mp4'],
    output: 'output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  const command = buildFfmpegCommand(testJob);
  console.log('🎵 Test Audio Replacement Command:', command.join(' '));
  return command;
}

// Test function for track trimming
export function testTrackTrimmingCommand() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'video1.mp4', startTime: 10, duration: 20 }, // Start at 10s, take 20s
      { path: 'video2.mp4', startTime: 5, duration: 15 }, // Start at 5s, take 15s
      { path: 'audio1.mp3', startTime: 2, duration: 30 }, // Audio: independent timing! 2s start, 30s duration
    ],
    output: 'trimmed_output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  console.log(
    '✂️ Expected behavior: Video plays for full 35s, audio plays for 30s then silence for last 5s',
  );
  console.log(
    '📏 Note: Track durations should now be accurate (no more 50s estimates!)',
  );
  console.log(
    '🎵 Audio trimming: Independent of video - can trim start/end separately!',
  );
  const command = buildFfmpegCommand(testJob);
  console.log('✂️ Test Track Trimming Command:', command.join(' '));
  return command;
}

// Test function for single track trimming
export function testSingleTrackTrimming() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'video1.mp4', startTime: 5, duration: 10 }, // Start at 5s, take 10s
    ],
    output: 'single_trimmed.mp4',
    operations: {
      concat: false,
      normalizeFrameRate: false,
    },
  };

  const command = buildFfmpegCommand(testJob);
  console.log('🎬 Single Track Trimming:', command.join(' '));
  return command;
}

// Test function for independent audio trimming
export function testIndependentAudioTrimming() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'video1.mp4', startTime: 10, duration: 30 }, // Video: 10s-40s (30s duration)
      { path: 'audio1.mp3', startTime: 5, duration: 25 }, // Audio: 5s-30s (25s duration) - independent timing!
    ],
    output: 'independent_audio_trim.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: false,
    },
  };

  console.log(
    '🎵 Independent Audio Trimming: Audio trimmed separately from video',
  );
  console.log('📹 Video: 10s start, 30s duration');
  console.log('🎵 Audio: 5s start, 25s duration (completely independent!)');
  const command = buildFfmpegCommand(testJob);
  console.log('🎛️ Command:', command.join(' '));
  return command;
}

// Test function for the specific export error scenario
export function testExportErrorScenario() {
  const testJob: VideoEditJob = {
    inputs: [
      { path: 'uu.mp4', startTime: 0, duration: 10 },
      { path: 'eee.mp4', startTime: 0, duration: 15 },
    ],
    output: 'Untitled_Project.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  console.log('🐛 Testing Export Error Scenario Fix:');
  console.log('📹 Two video clips with FPS normalization');
  const command = buildFfmpegCommand(testJob);
  console.log('🎬 Fixed Command:', command.join(' '));

  // Validate filter complex structure
  const filterIndex = command.indexOf('-filter_complex');
  if (filterIndex !== -1 && filterIndex + 1 < command.length) {
    const filterComplex = command[filterIndex + 1];
    console.log('🎛️ Filter Complex:', filterComplex);

    // Check for proper video/audio interleaving
    if (
      filterComplex.includes('[v0_fps][a0_trimmed][v1_fps][a1_trimmed]concat')
    ) {
      console.log('✅ Video/Audio interleaving looks correct!');
    } else {
      console.log('⚠️ Check video/audio interleaving pattern');
    }
  }

  return command;
}

// Test function for encoding presets
export function testEncodingPresets() {
  const testJob: VideoEditJob = {
    inputs: ['video1.mp4', 'video2.mp4'],
    output: 'output_superfast.mp4',
    operations: {
      concat: true,
      preset: 'superfast', // Fast encoding for quick exports
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  console.log('🚀 Testing Encoding Presets:');
  console.log('⚡ Using "superfast" preset for speed optimization');
  const command = buildFfmpegCommand(testJob);
  console.log('🎬 Preset Command:', command.join(' '));

  // Validate preset is in the command
  const presetIndex = command.indexOf('-preset');
  if (presetIndex !== -1 && presetIndex + 1 < command.length) {
    const presetValue = command[presetIndex + 1];
    console.log(`✅ Preset applied: ${presetValue}`);
  } else {
    console.log('⚠️ Preset not found in command');
  }

  return command;
}

// Test all available presets
export function testAllPresets() {
  const presets = [
    'ultrafast',
    'superfast',
    'veryfast',
    'faster',
    'fast',
    'medium',
    'slow',
    'slower',
    'veryslow',
  ] as const;

  console.log('🎛️ Testing all available encoding presets:');

  presets.forEach((preset) => {
    const testJob: VideoEditJob = {
      inputs: ['input.mp4'],
      output: `output_${preset}.mp4`,
      operations: {
        preset,
      },
    };

    const command = buildFfmpegCommand(testJob);
    const presetIndex = command.indexOf('-preset');
    const appliedPreset =
      presetIndex !== -1 ? command[presetIndex + 1] : 'NOT_FOUND';
    console.log(`  ${preset.padEnd(10)} → ${appliedPreset}`);
  });
}
