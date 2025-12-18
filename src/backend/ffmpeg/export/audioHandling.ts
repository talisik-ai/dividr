import {
  AudioTrimResult,
  CategorizedInputs,
  ProcessedTimeline,
  ProcessedTimelineSegment,
  TrackInfo,
} from '../schema/ffmpegConfig';

const GAP_MARKER = '__GAP__' as const;

/**
 * Helper to get path from input (string or TrackInfo)
 */
function getInputPath(input: string | TrackInfo): string {
  return typeof input === 'string' ? input : input.path;
}

/**
 * Helper to check if input is a gap marker
 */
function isGapInput(path: string): boolean {
  return path === GAP_MARKER;
}

/**
 * Find file index for a segment in categorized inputs
 */
export function findFileIndexForSegment(
  segment: ProcessedTimelineSegment,
  categorizedInputs: CategorizedInputs,
  timelineType: 'video' | 'audio',
): number | undefined {
  const inputs =
    timelineType === 'video'
      ? categorizedInputs.videoInputs
      : categorizedInputs.audioInputs;
  const segmentPath = getInputPath(segment.input);

  console.log(`🔍 Looking for file index for ${timelineType} segment:`, {
    segmentOriginalIndex: segment.originalIndex,
    segmentPath: segmentPath,
    segmentStart: segment.input.startTime,
    segmentDuration: segment.input.duration,
    hasAudioPath: !!segment.input.audioPath,
  });

  // If it's a gap, no file index needed
  if (isGapInput(segmentPath)) {
    return undefined;
  }

  // Special handling for audio segments from video tracks with separate audio files
  if (timelineType === 'audio' && segment.input.audioPath) {
    // Strategy 1: Look for the video input with this originalIndex
    let videoInput = categorizedInputs.videoInputs.find(
      (vi) => vi.originalIndex === segment.originalIndex,
    );

    // Strategy 2: If not found by originalIndex, look by audioPath match (for segments created by gap insertion)
    if (!videoInput) {
      videoInput = categorizedInputs.videoInputs.find(
        (vi) => vi.trackInfo.audioPath === segment.input.audioPath,
      );
      if (videoInput) {
        console.log(
          `🔍 Found video input by audioPath match for audio segment with originalIndex ${segment.originalIndex}`,
        );
      }
    }

    if (videoInput && videoInput.trackInfo.audioFileIndex !== undefined) {
      const audioFileIndex = videoInput.trackInfo.audioFileIndex;
      console.log(
        `✅ Found audio file index ${audioFileIndex} from video track's separate audio file (path: ${segment.input.audioPath})`,
      );
      return audioFileIndex;
    }
  }

  // Strategy 1: Look for exact originalIndex match
  const fileIndex = inputs.find(
    (vi) => vi.originalIndex === segment.originalIndex,
  )?.fileIndex;

  if (fileIndex !== undefined) {
    console.log(`✅ Found file index ${fileIndex} by originalIndex match`);
    return fileIndex;
  }

  // Strategy 2: Look by path only (for split segments from the same source)
  const matchingByPath = inputs.find(
    (input) => getInputPath(input.trackInfo) === segmentPath,
  );

  if (matchingByPath) {
    console.log(
      `✅ Found file index ${matchingByPath.fileIndex} by path match`,
    );
    return matchingByPath.fileIndex;
  }

  // Strategy 3: Debug - log all available inputs to see what we have
  console.log(
    `❌ No file index found. Available ${timelineType} inputs:`,
    inputs.map((input) => ({
      originalIndex: input.originalIndex,
      fileIndex: input.fileIndex,
      path: getInputPath(input.trackInfo),
      startTime: input.trackInfo.startTime,
      duration: input.trackInfo.duration,
    })),
  );

  return undefined;
}

export interface ProcessAudioTimelineResult {
  audioFilters: string[];
  audioConcatInputs: string[];
}

/**
 * Apply volume control filter using decibels
 * @param inputRef - Input audio stream reference (e.g., "[a0_delayed]")
 * @param outputRef - Output audio stream reference (e.g., "[a0_volume]")
 * @param volumeDb - Volume adjustment in decibels as a float (e.g., 3.5 for +3.5dB, -6.2 for -6.2dB)
 *                    Defaults to 0dB if not specified (no volume change)
 * @returns FFmpeg volume filter string
 *
 * @example
 * applyVolumeFilter("[a0_delayed]", "[a0_volume]", 3.5)
 * // Returns: "[a0_delayed]volume=3.50dB[a0_volume]"
 */
export function applyVolumeFilter(
  inputRef: string,
  outputRef: string,
  volumeDb = 0.0,
): string {
  // FFmpeg volume filter accepts decibel values directly as floats
  // Positive values increase volume, negative values decrease volume
  // 0dB means no volume change
  const volumeFilter = `${inputRef}volume=${volumeDb.toFixed(2)}dB${outputRef}`;
  console.log(`🔊 Applied volume adjustment: ${volumeDb.toFixed(2)}dB`);
  return volumeFilter;
}

export function applyFadeFilter(
  inputRef: string,
  outputRef: string,
  fadeType: 'in' | 'out',
  startTime: number,
  duration: number,
): string {
  if (duration <= 0) {
    console.warn(
      `⚠️ Fade duration must be positive, got ${duration}. Skipping fade.`,
    );
    return `${inputRef}acopy${outputRef}`;
  }

  if (startTime < 0) {
    console.warn(
      `⚠️ Fade start time cannot be negative, got ${startTime}. Using 0.`,
    );
    startTime = 0;
  }

  const fadeFilter = `${inputRef}afade=t=${fadeType}:st=${startTime.toFixed(2)}:d=${duration.toFixed(2)}${outputRef}`;
  console.log(
    `🎵 Applied ${fadeType === 'in' ? 'fade in' : 'fade out'}: start=${startTime.toFixed(2)}s, duration=${duration.toFixed(2)}s`,
  );
  return fadeFilter;
}

/**
 * Optional function to get volume in decibels for a segment
 * Returns a float value in decibels (defaults to 0dB if not provided)
 * 0dB means no volume change, positive values increase volume, negative values decrease volume
 */
export type GetVolumeDbCallback = (segment: ProcessedTimelineSegment) => number;

/**
 * Process audio timeline segments with support for overlapping
 * Handles trimming, positioning, padding, and mixing of audio streams
 * @param audioTimeline - Processed audio timeline with segments
 * @param categorizedInputs - Categorized input files
 * @param hasVideoInputs - Whether video inputs exist (skip audio if false)
 * @param totalVideoDuration - Total duration of the video in seconds
 * @param createAudioTrimFilters - Function to create audio trim filters
 * @param getVolumeDb - Optional callback to get volume adjustment in decibels per segment
 */
export function processAudioTimeline(
  audioTimeline: ProcessedTimeline,
  categorizedInputs: CategorizedInputs,
  hasVideoInputs: boolean,
  totalVideoDuration: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createAudioTrimFilters: (context: any) => AudioTrimResult,
  getVolumeDb?: GetVolumeDbCallback,
): ProcessAudioTimelineResult {
  const audioFilters: string[] = [];
  const audioConcatInputs: string[] = [];

  if (!hasVideoInputs) {
    console.log(
      'ℹ️ Skipping audio processing - only image inputs detected (no video inputs)',
    );
    return { audioFilters, audioConcatInputs };
  }

  // Group audio segments by time to detect overlaps
  const audioSegmentsWithTiming: Array<{
    segment: ProcessedTimelineSegment;
    segmentIndex: number;
    filterRef: string;
  }> = [];

  audioTimeline.segments.forEach((segment, segmentIndex) => {
    const { input: trackInfo } = segment;

    console.log(
      `🎵 Processing audio segment ${segmentIndex}: ${trackInfo.path} [${segment.startTime.toFixed(2)}s-${segment.endTime.toFixed(2)}s]`,
    );

    if (isGapInput(trackInfo.path)) {
      // Skip silent gaps - we'll use adelay to position audio instead
      console.log(`🎵 Skipping audio gap (will use adelay for positioning)`);
      return;
    } else {
      // Regular audio file - find the original file index
      const fileIndex = findFileIndexForSegment(
        segment,
        categorizedInputs,
        'audio',
      );

      if (fileIndex !== undefined) {
        console.log(
          `🎵 Processing audio segment ${segmentIndex} with fileIndex ${fileIndex}`,
        );

        const context = {
          trackInfo,
          originalIndex: segmentIndex,
          fileIndex,
          inputStreamRef: `[${fileIndex}:a]`,
        };

        const trimResult = createAudioTrimFilters(context);
        audioFilters.push(...trimResult.filters);

        // Apply volume control (before delay/positioning)
        // Defaults to 0dB if callback not provided or returns undefined
        let currentAudioRef = trimResult.filterRef;
        const volumeDb: number = getVolumeDb?.(segment) ?? 0.0;

        // Only apply volume filter if adjustment is non-zero (0dB means no change)
        if (volumeDb !== 0.0) {
          const volumeRef = `[a${segmentIndex}_volume]`;
          audioFilters.push(
            applyVolumeFilter(currentAudioRef, volumeRef, volumeDb),
          );
          currentAudioRef = volumeRef;
        }

        // Add delay to position audio at correct timeline position
        const delayMs = Math.round(segment.startTime * 1000);
        const delayedRef = `[a${segmentIndex}_delayed]`;

        if (delayMs > 0) {
          audioFilters.push(
            `${currentAudioRef}adelay=${delayMs}|${delayMs}${delayedRef}`,
          );
          console.log(
            `🎵 Added ${delayMs}ms delay to position audio at ${segment.startTime.toFixed(2)}s`,
          );
        } else {
          // No delay needed - use acopy for audio
          audioFilters.push(`${currentAudioRef}acopy${delayedRef}`);
        }

        // Trim all audio streams to totalVideoDuration to prevent amix from extending beyond video duration
        // This fixes the issue where adelay extends stream duration and amix matches the longest stream
        // We pad first to ensure streams are at least totalVideoDuration, then trim to exact duration
        const paddedRef = `[a${segmentIndex}_padded]`;
        const finalRef = `[a${segmentIndex}_final]`;
        audioFilters.push(
          `${delayedRef}apad=pad_dur=${totalVideoDuration.toFixed(6)}${paddedRef}`,
        );
        audioFilters.push(
          `${paddedRef}atrim=duration=${totalVideoDuration.toFixed(6)}${finalRef}`,
        );
        console.log(
          `🎵 Padded and trimmed audio stream ${segmentIndex} to exact ${totalVideoDuration.toFixed(3)}s to match video duration`,
        );

        audioSegmentsWithTiming.push({
          segment,
          segmentIndex,
          filterRef: finalRef,
        });
      } else {
        console.warn(
          `❌ Could not find file index for audio segment ${segmentIndex}`,
        );
      }
    }
  });

  // Mix overlapping audio streams using amix
  if (audioSegmentsWithTiming.length > 0) {
    console.log(
      `🎵 Mixing ${audioSegmentsWithTiming.length} audio streams (supports overlapping)`,
    );

    if (audioSegmentsWithTiming.length === 1) {
      // Single audio stream - trim to exact totalVideoDuration to match video
      const inputRef = audioSegmentsWithTiming[0].filterRef;
      const finalAudioRef = '[audio]';
      audioFilters.push(
        `${inputRef}atrim=duration=${totalVideoDuration.toFixed(6)}${finalAudioRef}`,
      );
      audioConcatInputs.push(finalAudioRef);
      console.log(
        `✅ Trimmed single audio stream to exact ${totalVideoDuration.toFixed(3)}s`,
      );
    } else {
      // Multiple audio streams - use amix for overlapping support
      const mixInputs = audioSegmentsWithTiming
        .map((a) => a.filterRef)
        .join('');
      const mixRef = '[audio_mixed]';

      // amix filter: inputs=N:duration=longest:dropout_transition=0
      // - inputs=N: number of input streams
      // - duration=longest: output duration is the longest input (all streams are padded to totalVideoDuration)
      // - dropout_transition=0: no fade when streams start/end
      // NOTE: All streams are padded to totalVideoDuration before mixing, so longest will match video duration
      audioFilters.push(
        `${mixInputs}amix=inputs=${audioSegmentsWithTiming.length}:duration=longest:dropout_transition=0:normalize=0${mixRef}`,
      );

      // This ensures the audio duration matches the video duration exactly
      const finalAudioRef = '[audio]';
      audioFilters.push(
        `${mixRef}atrim=duration=${totalVideoDuration.toFixed(6)}${finalAudioRef}`,
      );
      audioConcatInputs.push(finalAudioRef);
      console.log(
        `✅ Created audio mix with ${audioSegmentsWithTiming.length} overlapping streams, trimmed to exact ${totalVideoDuration.toFixed(3)}s`,
      );
    }
  }

  return { audioFilters, audioConcatInputs };
}
