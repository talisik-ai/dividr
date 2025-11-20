import * as path from 'path';
import {
  getHardwareAcceleration,
  getSpecificHardwareAcceleration,
  type HardwareAcceleration,
} from '../hardwareAccelerationDetector';
import {
  AudioProcessingContext,
  AudioTrimResult,
  CategorizedInputs,
  CommandParts,
  InputCategory,
  ProcessedTimeline,
  ProcessedTimelineSegment,
  TrackInfo,
  VideoEditJob,
  VideoProcessingContext,
} from '../schema/ffmpegConfig';
import {
  buildSeparateTimelineFilterComplex,
  handleFilterComplex,
} from './handleFilterComplex';

const VIDEO_DEFAULTS = {
  SIZE: { width: 1920, height: 1080 },
  FPS: 30,
  DUMMY_DURATION: 0.1,
} as const;

const AUDIO_DEFAULTS = {
  CHANNEL_LAYOUT: 'stereo',
  SAMPLE_RATE: 48000,
} as const;

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

  console.log('🎬 Filter path escaping debug:');
  console.log('  - Original:', filePath);
  console.log('  - Escaped for filter:', escapedPath);
  return escapedPath;
}

const GAP_MARKER = '__GAP__' as const;

function escapePath(filePath: string) {
  return filePath;
}

const FILE_EXTENSIONS = {
  VIDEO: /\.(mp4|mov|mkv|avi|webm)$/i,
  AUDIO: /\.(mp3|wav|aac|flac)$/i,
  IMAGE: /\.(png|jpg|jpeg|gif|bmp|tiff|webp)$/i,
} as const;

const ENCODING_DEFAULTS = {
  VIDEO_CODEC: 'libx264',
  AUDIO_CODEC: 'aac',
} as const;

/**
 * Gets the appropriate hardware acceleration settings for a job
 */
async function getHardwareAccelerationForJob(
  job: VideoEditJob,
  ffmpegPath?: string,
): Promise<HardwareAcceleration | null> {
  // If hardware acceleration is explicitly disabled, return null
  if (
    job.operations.useHardwareAcceleration === false ||
    job.operations.hwaccelType === 'none'
  ) {
    console.log('🚫 Hardware acceleration disabled by job config');
    return null;
  }
  console.log('🎮 Hardware acceleration is enabled');

  try {
    // If specific hardware type is requested
    if (job.operations.hwaccelType && job.operations.hwaccelType !== 'auto') {
      const specificHW = await getSpecificHardwareAcceleration(
        job.operations.hwaccelType,
        ffmpegPath,
      );
      if (specificHW) {
        console.log(
          `🎮 Using requested hardware acceleration: ${job.operations.hwaccelType.toUpperCase()}`,
        );
        return specificHW;
      } else {
        console.warn(
          `⚠️ Requested hardware acceleration "${job.operations.hwaccelType}" not available, falling back to software`,
        );
        return null;
      }
    }

    // Auto-detect best hardware acceleration
    const detection = await getHardwareAcceleration(ffmpegPath);
    if (detection.primary) {
      console.log(
        `🎮 Auto-detected hardware acceleration: ${detection.primary.type.toUpperCase()}`,
      );
      return detection.primary;
    }

    console.log(
      '⚠️ No hardware acceleration available, using software encoding',
    );
    return null;
  } catch (error) {
    console.error('❌ Error detecting hardware acceleration:', error);
    return null;
  }
}

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
 * Converts frame position to time position
 */
function framesToTime(frames: number, frameRate: number): number {
  return frames / frameRate;
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

  // Track which files we've already added
  const addedFiles = new Set<string>();
  // Track original file mappings for split segments
  const filePathToIndex = new Map<string, number>();

  inputs.forEach((input, originalIndex) => {
    const path = getInputPath(input);
    const trackInfo = getTrackInfo(input);
    const isGap = isGapInput(path);

    const isVideo =
      !isGap &&
      (FILE_EXTENSIONS.VIDEO.test(path) || FILE_EXTENSIONS.IMAGE.test(path));
    const isAudio = !isGap && FILE_EXTENSIONS.AUDIO.test(path);

    if (isVideo) {
      let fileIndex = -1;
      let audioFileIndex: number | undefined = undefined;

      if (!isGap) {
        // For non-gap files, assign file index
        if (!addedFiles.has(path)) {
          fileIndex = fileInputIndex;
          filePathToIndex.set(path, fileIndex);
          addedFiles.add(path);
          fileInputIndex++;
        } else {
          // Use the existing file index for this file
          fileIndex = filePathToIndex.get(path) ?? -1;
        }

        // If this video has a separate audio file, register it
        if (trackInfo.audioPath) {
          if (!addedFiles.has(trackInfo.audioPath)) {
            audioFileIndex = fileInputIndex;
            filePathToIndex.set(trackInfo.audioPath, audioFileIndex);
            addedFiles.add(trackInfo.audioPath);
            fileInputIndex++;
            console.log(
              `🎵 Registered audio file for video input ${originalIndex}: audio file index ${audioFileIndex}`,
            );
          } else {
            // Audio file was already added, get its index
            audioFileIndex = filePathToIndex.get(trackInfo.audioPath);
            console.log(
              `🎵 Reusing existing audio file index ${audioFileIndex} for video input ${originalIndex}`,
            );
          }
        }
      }

      // Create a modified trackInfo with the audio file index stored
      const modifiedTrackInfo =
        audioFileIndex !== undefined
          ? { ...trackInfo, audioFileIndex }
          : trackInfo;

      videoInputs.push({
        originalIndex,
        fileIndex,
        trackInfo: modifiedTrackInfo,
        isGap: false,
      });

      if (audioFileIndex !== undefined) {
        console.log(
          `📹 Video input ${originalIndex}: video file index ${fileIndex}, audio file index ${audioFileIndex}`,
        );
      }
    } else if (isAudio) {
      let fileIndex = -1;

      if (!isGap) {
        if (!addedFiles.has(path)) {
          fileIndex = fileInputIndex;
          filePathToIndex.set(path, fileIndex);
          addedFiles.add(path);
          fileInputIndex++;
        } else {
          fileIndex = filePathToIndex.get(path) ?? -1;
        }
      }

      audioInputs.push({
        originalIndex,
        fileIndex,
        trackInfo,
      });
    } else if (isGap) {
      // Handle gap markers
      if (trackInfo.gapType === 'video' || trackInfo.trackType === 'video') {
        videoInputs.push({
          originalIndex,
          fileIndex: -1,
          trackInfo,
          isGap: true,
        });
      } else if (
        trackInfo.gapType === 'audio' ||
        trackInfo.trackType === 'audio'
      ) {
        audioInputs.push({
          originalIndex,
          fileIndex: -1,
          trackInfo,
        });
      }
    }
  });

  return { videoInputs, audioInputs, fileInputIndex };
}
// -------------------------
// Video Processing Functions
// -------------------------

/**
 * Creates video trimming filters for a given video track
 * Handles images differently (uses loop filter instead of trim)
 * @param context - Video processing context with track info and references
 * @returns Filter reference and filter strings for video trimming
 */
function createVideoTrimFilters(
  context: VideoProcessingContext,
): AudioTrimResult {
  const { trackInfo, originalIndex, inputStreamRef } = context;

  // Check if this is an image
  const isImage = trackInfo.isImage || trackInfo.trackType === 'image';

  if (isImage && trackInfo.duration !== undefined) {
    // For images, treat them like gaps but with the actual image content
    // Generate frames by looping the single image frame for the exact duration
    const trimmedRef = `[v${originalIndex}_trimmed]`;
    const fps = 30; // Default FPS, will be normalized later
    const duration = trackInfo.duration;
    const totalFrames = Math.round(duration * fps); // Round to nearest frame for exact timing

    console.log(
      `🖼️ Image input detected: generating ${duration}s (${totalFrames} frames) at ${fps}fps from static image`,
    );

    // Use trim with exact duration instead of loop filter to avoid segfaults in FFmpeg 6.0
    // Static images don't need loop filter - trim alone will hold the frame for the duration
    return {
      filterRef: trimmedRef,
      filters: [
        `${inputStreamRef}trim=duration=${duration}[temp_trim_${originalIndex}]`,
        `[temp_trim_${originalIndex}]setpts=PTS-STARTPTS${trimmedRef}`,
      ],
    };
  }

  // For videos, use standard trim
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
      `[temp_gap_${originalIndex}]setpts=PTS-STARTPTS,setsar=1${gapRef}`,
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

/**
 * Creates SAR (Sample Aspect Ratio) normalization filters
 * Normalizes SAR to 1:1 to ensure compatibility with concat filter
 * @param originalIndex - Unique index for filter labeling
 * @param inputRef - Input filter reference (e.g., "[v0_trim]")
 * @returns AudioTrimResult with filter reference and filter strings
 */
function createSarNormalizationFilters(
  originalIndex: number,
  inputRef: string,
): AudioTrimResult {
  const sarRef = `[v${originalIndex}_sar]`;
  return {
    filterRef: sarRef,
    filters: [`${inputRef}setsar=1${sarRef}`],
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
      `anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}[temp_silent_pre_${originalIndex}]`,
      `[temp_silent_pre_${originalIndex}]atrim=duration=${duration}[temp_silent_${originalIndex}]`,
      `[temp_silent_${originalIndex}]asetpts=PTS-STARTPTS${silentAudioRef}`,
    ],
  };
}

/**
 * Builds separate video and audio timelines from inputs
 * Videos and images are organized by layers for multi-layer compositing
 */
function buildSeparateTimelines(
  inputs: (string | TrackInfo)[],
  targetFrameRate: number = VIDEO_DEFAULTS.FPS,
): {
  videoLayers: Map<number, ProcessedTimeline>;
  imageLayers: Map<number, ProcessedTimeline>;
  audio: ProcessedTimeline;
} {
  console.log('🎬 Building timelines with multi-layer support');

  // Separate inputs by type and organize by layer
  const videoInputsByLayer = new Map<
    number,
    Array<{ trackInfo: TrackInfo; originalIndex: number }>
  >();
  const imageInputsByLayer = new Map<
    number,
    Array<{ trackInfo: TrackInfo; originalIndex: number }>
  >();
  const audioInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }> =
    [];

  inputs.forEach((input, originalIndex) => {
    const trackInfo = getTrackInfo(input);
    const path = getInputPath(input);

    if (isGapInput(path)) {
      // Skip gaps here, they'll be added later
      return;
    }

    const layer = trackInfo.layer ?? 0; // Default to layer 0

    if (FILE_EXTENSIONS.VIDEO.test(path)) {
      console.log(
        `📹 Adding video input ${originalIndex} to layer ${layer}: ${path}`,
      );
      if (!videoInputsByLayer.has(layer)) {
        videoInputsByLayer.set(layer, []);
      }
      videoInputsByLayer.get(layer)!.push({ trackInfo, originalIndex });
    } else if (FILE_EXTENSIONS.IMAGE.test(path)) {
      console.log(
        `🖼️ Adding image input ${originalIndex} to layer ${layer}: ${path} (timeline: ${trackInfo.timelineStartFrame}-${trackInfo.timelineEndFrame})`,
      );
      if (!imageInputsByLayer.has(layer)) {
        imageInputsByLayer.set(layer, []);
      }
      imageInputsByLayer.get(layer)!.push({ trackInfo, originalIndex });
    } else if (FILE_EXTENSIONS.AUDIO.test(path)) {
      console.log(`🎵 Adding audio input ${originalIndex}: ${path}`);
      audioInputs.push({ trackInfo, originalIndex });
    }
  });

  console.log(
    `📊 Input counts: video layers=${videoInputsByLayer.size}, image layers=${imageInputsByLayer.size}, audio=${audioInputs.length}`,
  );

  // Build video timelines for each layer
  const videoLayers = new Map<number, ProcessedTimeline>();
  for (const [layer, layerInputs] of videoInputsByLayer.entries()) {
    console.log(
      `🎥 Building video layer ${layer} with ${layerInputs.length} inputs`,
    );
    let videoSegments = buildVideoTimeline(layerInputs, targetFrameRate);
    videoSegments = fillTimelineGaps(videoSegments, targetFrameRate, 'video');

    const totalDuration =
      videoSegments.length > 0
        ? Math.max(...videoSegments.map((s) => s.endTime))
        : 0;

    videoLayers.set(layer, {
      segments: videoSegments,
      totalDuration,
      timelineType: 'video',
    });
  }

  // Build image timelines for each layer
  const imageLayers = new Map<number, ProcessedTimeline>();
  for (const [layer, layerInputs] of imageInputsByLayer.entries()) {
    console.log(
      `🖼️ Building image layer ${layer} with ${layerInputs.length} inputs`,
    );
    const imageSegments = buildImageTimeline(layerInputs, targetFrameRate);

    const totalDuration =
      imageSegments.length > 0
        ? Math.max(...imageSegments.map((s) => s.endTime))
        : 0;

    imageLayers.set(layer, {
      segments: imageSegments,
      totalDuration,
      timelineType: 'video', // Images are video-like
    });
  }

  // Build audio timeline (simpler, no layering)
  let audioSegments = buildAudioTimeline(audioInputs, targetFrameRate);
  audioSegments = fillTimelineGaps(audioSegments, targetFrameRate, 'audio');

  const audioTotalDuration =
    audioSegments.length > 0
      ? Math.max(...audioSegments.map((s) => s.endTime))
      : 0;

  return {
    videoLayers,
    imageLayers,
    audio: {
      segments: audioSegments,
      totalDuration: audioTotalDuration,
      timelineType: 'audio',
    },
  };
}

/**
 * Fills gaps in the timeline where there's no content
 * Only adds gaps where segments don't cover the timeline
 */
function fillTimelineGaps(
  segments: ProcessedTimelineSegment[],
  targetFrameRate: number,
  timelineType: 'video' | 'audio',
): ProcessedTimelineSegment[] {
  if (segments.length === 0) {
    return segments;
  }

  // Sort segments by start time
  const sortedSegments = [...segments].sort(
    (a, b) => a.startTime - b.startTime,
  );
  const filledSegments: ProcessedTimelineSegment[] = [];

  let currentTime = 0;
  let gapIndex = 0;

  sortedSegments.forEach((segment, index) => {
    // Check if there's a gap before this segment
    const gapDuration = segment.startTime - currentTime;
    const frameDuration = 1 / targetFrameRate; // Duration of one frame
    const minGapThreshold = frameDuration * 0.5; // Half a frame as threshold

    if (gapDuration > minGapThreshold) {
      // Only add gap if it's larger than half a frame (to avoid rounding issues)
      console.log(
        `🕳️ Found ${timelineType} gap: ${currentTime.toFixed(2)}s-${segment.startTime.toFixed(2)}s (${gapDuration.toFixed(2)}s)`,
      );

      // Add gap segment
      const gapTrackInfo: TrackInfo = {
        path: GAP_MARKER,
        duration: gapDuration,
        trackType: timelineType,
        gapType: timelineType,
      };

      filledSegments.push({
        input: gapTrackInfo,
        originalIndex: 9000 + gapIndex++, // High index to avoid conflicts
        startTime: currentTime,
        duration: gapDuration,
        endTime: segment.startTime,
        timelineType,
      });

      // Add the actual segment at its original position
      filledSegments.push(segment);
      currentTime = Math.max(currentTime, segment.endTime);
    } else if (gapDuration > 0 && gapDuration <= minGapThreshold) {
      // Tiny gap (less than half a frame) - adjust segment to start at currentTime
      console.log(
        `🔧 Adjusting segment to eliminate tiny gap of ${gapDuration.toFixed(4)}s`,
      );
      const adjustedSegment = {
        ...segment,
        startTime: currentTime,
        endTime: currentTime + segment.duration,
      };
      filledSegments.push(adjustedSegment);
      currentTime = adjustedSegment.endTime;
    } else {
      // No gap or negative gap (overlapping) - just add the segment
      filledSegments.push(segment);
      currentTime = Math.max(currentTime, segment.endTime);
    }
  });

  console.log(
    `✅ ${timelineType} timeline after filling gaps: ${filledSegments.length} segments`,
  );
  return filledSegments;
}

/**
 * Builds video timeline without cutting - videos play continuously
 */
function buildVideoTimeline(
  videoInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }>,
  targetFrameRate: number,
): ProcessedTimelineSegment[] {
  const segments: ProcessedTimelineSegment[] = [];

  videoInputs.forEach(({ trackInfo, originalIndex }) => {
    const startFrame = trackInfo.timelineStartFrame || 0;
    const endFrame = trackInfo.timelineEndFrame || 0;
    const startTime = startFrame / targetFrameRate;
    const endTime = endFrame / targetFrameRate;
    const duration = endTime - startTime;
    const layer = trackInfo.layer ?? 0; // Default to layer 0 if not specified

    segments.push({
      input: trackInfo,
      originalIndex,
      startTime,
      duration,
      endTime,
      timelineType: 'video',
      layer,
    });

    console.log(
      `🎥 Video segment ${originalIndex} (layer ${layer}): ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s (${duration.toFixed(2)}s)`,
    );
  });

  return segments;
}

/**
 * Builds image timeline - images will be overlaid with opacity transitions
 */
function buildImageTimeline(
  imageInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }>,
  targetFrameRate: number,
): ProcessedTimelineSegment[] {
  const segments: ProcessedTimelineSegment[] = [];

  imageInputs.forEach(({ trackInfo, originalIndex }) => {
    const startFrame = trackInfo.timelineStartFrame || 0;
    const endFrame = trackInfo.timelineEndFrame || 0;
    const startTime = startFrame / targetFrameRate;
    const endTime = endFrame / targetFrameRate;
    const duration = endTime - startTime;
    const layer = trackInfo.layer ?? 0; // Default to layer 0 if not specified

    // Skip images with zero or negative duration
    if (duration <= 0) {
      console.warn(
        `⚠️ Skipping image segment ${originalIndex} - invalid duration: ${duration.toFixed(2)}s (startFrame: ${startFrame}, endFrame: ${endFrame})`,
      );
      return;
    }

    // Mark as image for special handling
    const imageTrackInfo: TrackInfo = { ...trackInfo, isImage: true };

    segments.push({
      input: imageTrackInfo,
      originalIndex,
      startTime,
      duration,
      endTime,
      timelineType: 'video',
      layer,
    });

    console.log(
      `🖼️ Image segment ${originalIndex} (layer ${layer}): ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s (${duration.toFixed(2)}s)`,
    );
  });

  return segments;
}

/**
 * Builds audio timeline from audio inputs
 */
function buildAudioTimeline(
  audioInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }>,
  targetFrameRate: number,
): ProcessedTimelineSegment[] {
  const segments: ProcessedTimelineSegment[] = [];

  audioInputs.forEach(({ trackInfo, originalIndex }) => {
    const startFrame = trackInfo.timelineStartFrame || 0;
    const endFrame = trackInfo.timelineEndFrame || 0;
    const startTime = startFrame / targetFrameRate;
    const endTime = endFrame / targetFrameRate;
    const duration = endTime - startTime;

    segments.push({
      input: trackInfo,
      originalIndex,
      startTime,
      duration,
      endTime,
      timelineType: 'audio',
    });

    console.log(
      `🎵 Audio segment ${originalIndex}: ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s (${duration.toFixed(2)}s)`,
    );
  });

  return segments;
}

/**
 * Processes gaps for a specific timeline type
 */
function processGapsInTimeline(
  timeline: ProcessedTimeline,
  gaps: Array<{ startFrame: number; length: number }>,
  targetFrameRate: number = VIDEO_DEFAULTS.FPS,
): ProcessedTimeline {
  if (!gaps || gaps.length === 0) {
    return timeline;
  }

  const processedSegments = [...timeline.segments];
  let nextOriginalIndex =
    Math.max(...processedSegments.map((s) => s.originalIndex)) + 1;
  /** 
  console.log(
    `Initial ${timeline.timelineType} timeline:`,
    processedSegments.map(
      (s) =>
        `[${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s] ${s.input.path}`
    ),
  );*/

  // Sort gaps by start frame to process in chronological order
  const sortedGaps = [...gaps].sort((a, b) => a.startFrame - b.startFrame);

  sortedGaps.forEach((gap, gapIndex) => {
    const gapDuration = gap.length / targetFrameRate;
    const gapStartTime = framesToTime(gap.startFrame, targetFrameRate);

    const insertionResult = findGapInsertionPointInTimeline(
      processedSegments,
      gapStartTime,
      // timeline.timelineType,
    );

    console.log(
      `Processing ${timeline.timelineType} gap at frame ${gap.startFrame} (${gapStartTime.toFixed(2)}s), duration: ${gapDuration.toFixed(2)}s`,
    );

    let insertIndex = insertionResult.insertIndex;
    const newSegments: ProcessedTimelineSegment[] = [];

    // Handle segment splitting if necessary
    if (insertionResult.splitSegment) {
      const { segment, splitTime } = insertionResult.splitSegment;
      const { beforeSplit, afterSplit } = splitSegmentAtTime(
        segment,
        splitTime,
        nextOriginalIndex++,
        timeline.timelineType,
      );

      // === ADD FILTER FOR 0-SECOND SEGMENTS HERE ===
      // Only keep split segments that have meaningful duration (> 0.001 seconds)
      if (beforeSplit.duration > 0.001) {
        processedSegments[insertionResult.segmentIndex] = beforeSplit;
      } else {
        // Remove the segment if it's 0 seconds by setting insertIndex earlier
        processedSegments.splice(insertionResult.segmentIndex, 1);
        insertIndex--; // Adjust insert index since we removed a segment
        console.log(`✂️ Removed 0-second beforeSplit segment`);
      }

      if (afterSplit.duration > 0.001) {
        newSegments.push(afterSplit);
      } else {
        console.log(`✂️ Removed 0-second afterSplit segment`);
      }

      console.log(
        `Split segment at ${splitTime.toFixed(2)}s: before=[${beforeSplit.startTime.toFixed(2)}-${beforeSplit.endTime.toFixed(2)}] (${beforeSplit.duration.toFixed(3)}s), after=[${afterSplit.startTime.toFixed(2)}-${afterSplit.endTime.toFixed(2)}] (${afterSplit.duration.toFixed(3)}s)`,
      );
    }

    // Create gap segment
    const gapStartTimeActual = insertionResult.splitSegment
      ? insertionResult.splitSegment.splitTime
      : insertIndex < processedSegments.length
        ? processedSegments[insertIndex].startTime
        : timeline.totalDuration;

    const gapTrackInfo: TrackInfo = {
      path: GAP_MARKER,
      duration: gapDuration,
      trackType: timeline.timelineType,
      gapType: timeline.timelineType,
    };

    const gapSegment: ProcessedTimelineSegment = {
      input: gapTrackInfo,
      originalIndex: nextOriginalIndex++,
      startTime: gapStartTimeActual,
      duration: gapDuration,
      endTime: gapStartTimeActual + gapDuration,
      timelineType: timeline.timelineType,
    };

    // Insert gap and any split segments (only if we have segments to insert)
    const segmentsToInsert = [gapSegment, ...newSegments];
    if (segmentsToInsert.length > 0) {
      processedSegments.splice(insertIndex, 0, ...segmentsToInsert);

      // Adjust timeline positions after insertion
      adjustTimelineAfterInsertionInPlace(
        processedSegments,
        insertIndex,
        gapDuration,
      );
    } else {
      console.log(
        `⏩ No segments to insert for gap at ${gapStartTime.toFixed(2)}s`,
      );
    }
  });

  const totalDuration =
    processedSegments.length > 0
      ? Math.max(...processedSegments.map((s) => s.endTime))
      : 0;

  console.log(
    `Final ${timeline.timelineType} timeline:`,
    processedSegments.map(
      (s) =>
        `[${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s] ${s.input.path}${s.input.gapType ? ` (${s.input.gapType} gap)` : ''}`,
    ),
  );
  console.log(
    `Total ${timeline.timelineType} duration: ${totalDuration.toFixed(2)}s`,
  );

  return {
    segments: processedSegments,
    totalDuration,
    timelineType: timeline.timelineType,
  };
}

/**
 * Modified splitSegmentAtTime to include timeline type
 */
function splitSegmentAtTime(
  segment: ProcessedTimelineSegment,
  splitTime: number,
  nextOriginalIndex: number,
  timelineType: 'video' | 'audio',
): {
  beforeSplit: ProcessedTimelineSegment;
  afterSplit: ProcessedTimelineSegment;
} {
  const splitOffset = splitTime - segment.startTime;
  const remainingDuration = segment.duration - splitOffset;

  const beforeSplit: ProcessedTimelineSegment = {
    ...segment,
    duration: splitOffset,
    endTime: splitTime,
  };

  // Create new TrackInfo for the second part with adjusted startTime
  const afterSplitTrackInfo: TrackInfo = {
    ...segment.input,
    startTime: (segment.input.startTime || 0) + splitOffset,
  };

  const afterSplit: ProcessedTimelineSegment = {
    input: afterSplitTrackInfo,
    originalIndex: nextOriginalIndex,
    startTime: splitTime,
    duration: remainingDuration,
    endTime: splitTime + remainingDuration,
    timelineType,
  };

  return { beforeSplit, afterSplit };
}
/**
 * Finds gap insertion point in a timeline
 */
function findGapInsertionPointInTimeline(
  segments: ProcessedTimelineSegment[],
  gapStartTime: number,
): {
  insertIndex: number;
  segmentIndex?: number;
  splitSegment?: { segment: ProcessedTimelineSegment; splitTime: number };
} {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Gap starts before this segment - insert here
    if (gapStartTime < segment.startTime) {
      return { insertIndex: i };
    }

    // Gap starts within this segment - need to split the segment
    if (gapStartTime >= segment.startTime && gapStartTime < segment.endTime) {
      return {
        insertIndex: i + 1,
        segmentIndex: i,
        splitSegment: {
          segment,
          splitTime: gapStartTime,
        },
      };
    }
  }

  // Gap starts after all segments - insert at end
  return { insertIndex: segments.length };
}

/**
 * Adjusts timeline positions after insertion
 */
function adjustTimelineAfterInsertionInPlace(
  segments: ProcessedTimelineSegment[],
  insertIndex: number,
  gapDuration: number,
): void {
  // Adjust all segments after the insertion point
  for (let i = insertIndex + 1; i < segments.length; i++) {
    segments[i].startTime += gapDuration;
    segments[i].endTime += gapDuration;
  }
}



// -------------------------
// Step handlers
// -------------------------

/**
 * Adds file inputs to the command
 * For video tracks with separate audio files, adds both the video and audio as inputs
 */
function handleFileInputs(job: VideoEditJob, cmd: CommandParts): void {
  const addedFiles = new Set<string>();

  job.inputs.forEach((input) => {
    const path = getInputPath(input);
    const trackInfo = getTrackInfo(input);

    if (!isGapInput(path)) {
      // Add the main file (video or audio)
      if (!addedFiles.has(path)) {
        cmd.args.push('-i', escapePath(path));
        addedFiles.add(path);
      }

      // If this is a video track with a separate audio file, add the audio file too
      if (trackInfo.audioPath && !addedFiles.has(trackInfo.audioPath)) {
        cmd.args.push('-i', escapePath(trackInfo.audioPath));
        addedFiles.add(trackInfo.audioPath);
        console.log(`🎵 Added separate audio input: ${trackInfo.audioPath}`);
      }
    }
  });
}

/**
 * Builds and processes separate video and audio timelines with multi-layer support
 */
function handleTimelineProcessing(
  job: VideoEditJob,
  targetFrameRate: number,
): {
  videoLayers: Map<number, ProcessedTimeline>;
  imageLayers: Map<number, ProcessedTimeline>;
  finalAudioTimeline: ProcessedTimeline;
  categorizedInputs: CategorizedInputs;
} {
  // Build separate initial timelines with multi-layer support
  const initialTimelines = buildSeparateTimelines(job.inputs, targetFrameRate);

  // Use the timelines as-is (gaps are already filled based on timeline positions)
  const videoLayers = initialTimelines.videoLayers;
  const imageLayers = initialTimelines.imageLayers;
  const finalAudioTimeline = initialTimelines.audio;

  // NOTE: We no longer use job.gaps here because gaps are now calculated
  // based on actual timeline coverage from timelineStartFrame/timelineEndFrame

  // Log video layers
  console.log('Final Video Layers:');
  for (const [layer, timeline] of videoLayers.entries()) {
    console.log(
      `  Layer ${layer}:`,
      timeline.segments.map(
        (s) =>
          `${s.input.path}${s.input.gapType ? ` (${s.input.gapType} gap)` : ''} [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s]`,
      ),
    );
  }

  // Log image layers
  console.log('Final Image Layers:');
  for (const [layer, timeline] of imageLayers.entries()) {
    console.log(
      `  Layer ${layer}:`,
      timeline.segments.map(
        (s) =>
          `${s.input.path} [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s]`,
      ),
    );
  }

  console.log(
    'Final Audio Timeline:',
    finalAudioTimeline.segments.map(
      (s) =>
        `${s.input.path}${s.input.gapType ? ` (${s.input.gapType} gap)` : ''} [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s]`,
    ),
  );

  // Categorize inputs for file indexing
  const categorizedInputs = categorizeInputs(job.inputs);

  return { videoLayers, imageLayers, finalAudioTimeline, categorizedInputs };
}

/**
 * Applies FPS control to command output
 * This sets the output frame rate independently of the filter_complex fps normalization
 */
function handleOutputFps(job: VideoEditJob, cmd: CommandParts): void {
  if (job.operations.targetFrameRate) {
    cmd.args.push('-r', String(job.operations.targetFrameRate));
    console.log(`🎞️ Applied output FPS: ${job.operations.targetFrameRate}`);
  }
}

/**
 * Applies encoding settings to command
 */
function handleEncodingSettings(
  job: VideoEditJob,
  cmd: CommandParts,
  hwAccel: HardwareAcceleration | null,
): void {
  let videoCodec: string = ENCODING_DEFAULTS.VIDEO_CODEC;

  if (hwAccel) {
    // Use hardware codec
    videoCodec =
      job.operations.preferHEVC && hwAccel.hevcCodec
        ? hwAccel.hevcCodec
        : hwAccel.videoCodec;

    console.log(`🎮 Using hardware video codec: ${videoCodec}`);
    console.log(
      `⚠️  Note: If encoding fails, FFmpeg may not support this codec on your system.`,
    );
  } else {
    console.log(`💻 Using software video codec: ${videoCodec}`);
  }

  cmd.args.push('-c:v', videoCodec);
  cmd.args.push('-c:a', ENCODING_DEFAULTS.AUDIO_CODEC);

  // Add hardware encoder flags if available
  if (hwAccel?.encoderFlags) {
    console.log(
      '🎮 Adding hardware encoder flags:',
      hwAccel.encoderFlags.join(' '),
    );
    cmd.args.push(...hwAccel.encoderFlags);
  }
}

/**
 * Applies encoding preset if specified (for software encoding only)
 */
function handlePreset(
  job: VideoEditJob,
  cmd: CommandParts,
  hwAccel: HardwareAcceleration | null,
): void {
  // Only apply software preset if not using hardware acceleration
  if (hwAccel) {
    console.log(
      'ℹ️  Skipping software preset (using hardware encoder settings instead)',
    );
    return;
  }

  if (!job.operations.preset) return;

  cmd.args.push('-preset', job.operations.preset);
  cmd.args.push('-crf', '28');
  cmd.args.push('-b:a', '96k');

  console.log(`🚀 Applied software encoding preset: ${job.operations.preset}`);
}

/**
 * Applies thread settings and faststart flag
 */
function handleThreads(job: VideoEditJob, cmd: CommandParts): void {
  cmd.args.push('-threads', String(job.operations.threads));

  console.log(`🚀 Applied thread limit: ${job.operations.threads}`);
}

/**
 * Adds output file path to command
 */
function handleOutput(
  job: VideoEditJob,
  cmd: CommandParts,
  location?: string,
): void {
  const outputFilePath = location
    ? path.join(location, job.output)
    : job.output;

  cmd.args.push(outputFilePath);
}

// -------------------------
// Main builder
// -------------------------
export async function buildFfmpegCommand(
  job: VideoEditJob,
  location?: string,
  ffmpegPath?: string,
): Promise<string[]> {
  const cmd: CommandParts = { args: [], filters: [] };
  const targetFrameRate = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;

  // Log aspect ratio from both sources
  console.log('📐 ASPECT RATIO from job.operations.aspect:', job.operations.aspect || 'NONE');
  
  // Check for aspect ratio in trackInfo
  let trackInfoAspectRatio: string | undefined = undefined;
  for (const input of job.inputs) {
    const trackInfo = getTrackInfo(input);
    if (trackInfo.aspectRatio) {
      trackInfoAspectRatio = trackInfo.aspectRatio;
      console.log('📐 ASPECT RATIO from trackInfo.aspectRatio:', trackInfoAspectRatio);
      break;
    }
  }
  if (!trackInfoAspectRatio) {
    console.log('📐 ASPECT RATIO from trackInfo.aspectRatio: NONE');
  }

  const hwAccel = await getHardwareAccelerationForJob(job, ffmpegPath);
  if (hwAccel) {
    console.log(
      `🎮 Hardware acceleration detected: ${hwAccel.type.toUpperCase()}`,
    );
    console.log(
      'ℹ️  Using hardware encoding only (software decoding for compatibility)',
    );
  }

  // Step 1: Add file inputs
  handleFileInputs(job, cmd);

  // Step 2: Build and process timelines with multi-layer support
  const { videoLayers, imageLayers, finalAudioTimeline, categorizedInputs } =
    handleTimelineProcessing(job, targetFrameRate);

  // Step 3: Build and apply filter complex with multi-layer compositing
  handleFilterComplex(
    job,
    cmd,
    videoLayers,
    imageLayers,
    finalAudioTimeline,
    categorizedInputs,
    hwAccel,
    createGapVideoFilters,
    createSilentAudioFilters,
    createAudioTrimFilters,
    createVideoTrimFilters,
    createFpsNormalizationFilters,
    createSarNormalizationFilters,
  );

  // Step 4: Apply encoding settings with hardware acceleration
  handleEncodingSettings(job, cmd, hwAccel);
  handlePreset(job, cmd, hwAccel);
  handleThreads(job, cmd);

  // Step 5: Apply aspect ratio and FPS controls
  handleOutputFps(job, cmd);

  // Step 6: Add output file
  handleOutput(job, cmd, location);

  console.log('Full FFmpeg Command:', ['ffmpeg', ...cmd.args].join(' '));
  return cmd.args;
}


