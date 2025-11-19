import * as path from 'path';
import {
  getHardwareAcceleration,
  getSpecificHardwareAcceleration,
  type HardwareAcceleration,
} from './hardwareAccelerationDetector';
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
} from './schema/ffmpegConfig';
import { getFontDirectoriesForFamilies } from './subtitles/fontMapper';

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

/**
 * Parse aspect ratio string to numeric ratio
 * @param aspectRatio - Aspect ratio string (e.g., "16:9", "2.35:1")
 * @returns Numeric ratio (width/height)
 */
function parseAspectRatio(aspectRatio: string): number {
  const parts = aspectRatio.split(':');
  if (parts.length !== 2) {
    console.warn(`Invalid aspect ratio format: ${aspectRatio}, using 16:9`);
    return 16 / 9;
  }
  const width = parseFloat(parts[0]);
  const height = parseFloat(parts[1]);
  if (isNaN(width) || isNaN(height) || height === 0) {
    console.warn(`Invalid aspect ratio values: ${aspectRatio}, using 16:9`);
    return 16 / 9;
  }
  return width / height;
}

/**
 * Calculate dynamic crop X position based on video position within canvas
 * @param scaleWidth - Scaled video width (before crop)
 * @param cropWidth - Target crop width
 * @param videoPositionX - Normalized video X position in canvas (-1 to 1, 0 = center)
 * @returns Crop X position in pixels
 * 
 * Logic: If video is shifted RIGHT in canvas (+X), we crop to show the LEFT side of the video
 *        If video is shifted LEFT in canvas (-X), we crop to show the RIGHT side of the video
 */
function calculateDynamicCropX(
  scaleWidth: number,
  cropWidth: number,
  videoPositionX: number | undefined,
): number {
  // If no video position specified, default to center crop (current behavior)
  if (videoPositionX === undefined || videoPositionX === 0) {
    return Math.round((scaleWidth - cropWidth) / 2);
  }

  // Available panning range (how much we can shift the crop window)
  const maxPanRange = scaleWidth - cropWidth;
  
  // Convert video position to crop offset
  // videoPositionX = +1 (video shifted right) → cropX = 0 (crop left side - what's visible in canvas)
  // videoPositionX = 0 (video centered) → cropX = maxPanRange / 2 (crop center)
  // videoPositionX = -1 (video shifted left) → cropX = maxPanRange (crop right side - what's visible in canvas)
  const normalizedOffset = (videoPositionX + 1) / 2; // Convert -1..1 to 0..1
  const cropX = Math.round(maxPanRange * (1 - normalizedOffset));
  
  // Clamp to valid range
  return Math.max(0, Math.min(maxPanRange, cropX));
}

/**
 * Calculate dynamic crop Y position based on video position within canvas
 * @param scaleHeight - Scaled video height (before crop)
 * @param cropHeight - Target crop height
 * @param videoPositionY - Normalized video Y position in canvas (-1 to 1, 0 = center)
 * @returns Crop Y position in pixels
 * 
 * Logic: If video is shifted DOWN in canvas (+Y), we crop to show the TOP side of the video
 *        If video is shifted UP in canvas (-Y), we crop to show the BOTTOM side of the video
 */
function calculateDynamicCropY(
  scaleHeight: number,
  cropHeight: number,
  videoPositionY: number | undefined,
): number {
  // If no video position specified, default to center crop (current behavior)
  if (videoPositionY === undefined || videoPositionY === 0) {
    return Math.round((scaleHeight - cropHeight) / 2);
  }

  // Available panning range
  const maxPanRange = scaleHeight - cropHeight;
  
  // Convert video position to crop offset
  // videoPositionY = +1 (video shifted down) → cropY = 0 (crop top side - what's visible in canvas)
  // videoPositionY = 0 (video centered) → cropY = maxPanRange / 2 (crop center)
  // videoPositionY = -1 (video shifted up) → cropY = maxPanRange (crop bottom side - what's visible in canvas)
  const normalizedOffset = (videoPositionY + 1) / 2; // Convert -1..1 to 0..1
  const cropY = Math.round(maxPanRange * (1 - normalizedOffset));
  
  // Clamp to valid range
  return Math.max(0, Math.min(maxPanRange, cropY));
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

/**
 * Find file index for a segment in categorized inputs - FIXED VERSION
 */
function findFileIndexForSegment(
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

/**
 * Builds image overlay filters with time-based enable/disable
 * Images are only rendered during their timeline presence, not rendered at all outside
 * Supports transform settings: position (x, y), scale, and rotation
 */
function buildImageOverlayFilters(
  imageSegments: ProcessedTimelineSegment[],
  categorizedInputs: CategorizedInputs,
  targetDimensions: { width: number; height: number },
  targetFps: number,
  totalDuration: number,
  baseVideoLabel: string,
): { filters: string[]; outputLabel: string } {
  const filters: string[] = [];
  let currentLabel = baseVideoLabel;

  // Process each image segment
  imageSegments.forEach((segment, index) => {
    const { input: trackInfo, originalIndex, duration } = segment;
    // Round timing values to 3 decimals to avoid FFmpeg truncation inconsistencies
    const startTime = Math.round(segment.startTime * 1000) / 1000;
    const endTime = Math.round(segment.endTime * 1000) / 1000;

    // Find the file index for this image
    const fileIndex = findFileIndexForSegment(
      segment,
      categorizedInputs,
      'video',
    );

    if (fileIndex === undefined) {
      console.warn(
        `❌ Could not find file index for image segment ${originalIndex}`,
      );
      return;
    }

    console.log(
      `🖼️ Processing image overlay ${index}: ${trackInfo.path} [${startTime.toFixed(2)}s-${endTime.toFixed(2)}s]`,
    );

    // Get transform settings (default to centered, no rotation, 100% scale)
    const transform = trackInfo.imageTransform || {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      width: trackInfo.width || targetDimensions.width,
      height: trackInfo.height || targetDimensions.height,
    };

    // Log transform settings
    if (trackInfo.imageTransform) {
      console.log(
        `🎨 Image transform: pos=(${transform.x.toFixed(2)}, ${transform.y.toFixed(2)}), ` +
          `scale=${transform.scale.toFixed(2)}, rotation=${transform.rotation.toFixed(1)}°, ` +
          `size=${transform.width}x${transform.height}`,
      );
    }

    const imageInputRef = `[${fileIndex}:v]`;
    const imagePreparedRef = `[img${index}_prepared]`;
    const imageScaledRef = `[img${index}_scaled]`;
    const imageRotatedRef = `[img${index}_rotated]`;
    const overlayOutputRef =
      index === imageSegments.length - 1
        ? `[video_with_images]`
        : `[overlay${index}]`;

    // Step 1: Prepare image - trim to duration and reset timestamps
    // Static images don't need loop filter - trim alone will hold the frame for the duration
    // Add transparent padding at the start to align with timeline position
    // Also normalize SAR to 1:1 for consistency
    filters.push(
      `${imageInputRef}trim=duration=${duration},setpts=PTS-STARTPTS,setsar=1,` +
        `tpad=start_duration=${startTime}:start_mode=add:color=black@0.0${imagePreparedRef}`,
    );

    // Step 2: Apply scaling if needed
    // Calculate scaled dimensions based on transform.scale
    const scaledWidth = Math.round(transform.width * transform.scale);
    const scaledHeight = Math.round(transform.height * transform.scale);

    let currentImageRef = imagePreparedRef;
    let currentWidth = transform.width;
    let currentHeight = transform.height;

    if (transform.scale !== 1.0) {
      // Use scale with force_original_aspect_ratio to preserve aspect ratio
      // This ensures the image fits within the target dimensions without distortion
      filters.push(
        `${imagePreparedRef}scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease${imageScaledRef}`,
      );
      currentImageRef = imageScaledRef;
      currentWidth = scaledWidth;
      currentHeight = scaledHeight;
      console.log(
        `📐 Scaled image to fit ${scaledWidth}x${scaledHeight} (scale factor: ${transform.scale.toFixed(2)}, preserving aspect ratio)`,
      );
    }

    // Step 3: Apply rotation if needed
    if (transform.rotation !== 0) {
      const rotationRadians = (transform.rotation * Math.PI) / 180;

      const absRotation = Math.abs((transform.rotation * Math.PI) / 180);
      const cosTheta = Math.abs(Math.cos(absRotation));
      const sinTheta = Math.abs(Math.sin(absRotation));
      const rotatedWidth = Math.ceil(
        currentWidth * cosTheta + currentHeight * sinTheta,
      );
      const rotatedHeight = Math.ceil(
        currentWidth * sinTheta + currentHeight * cosTheta,
      );

      filters.push(
        `${currentImageRef}rotate=${rotationRadians}:out_w=${rotatedWidth}:out_h=${rotatedHeight}:fillcolor=none${imageRotatedRef}`,
      );
      currentImageRef = imageRotatedRef;
      currentWidth = rotatedWidth;
      currentHeight = rotatedHeight;
      console.log(
        `🔄 Rotated image by ${transform.rotation.toFixed(1)}° (clockwise) → ${rotationRadians.toFixed(3)} rad\n` +
          `   Expanded canvas from ${scaledWidth}x${scaledHeight} to ${rotatedWidth}x${rotatedHeight} to prevent cropping`,
      );
    }

    // Step 4: Calculate overlay position
    // Transform coordinates are normalized (-1 to 1, where 0 is center)
    // FFmpeg overlay uses pixel coordinates relative to video dimensions

    const overlayX =
      transform.x >= 0
        ? `(W-w)/2+${transform.x}*W/2`
        : `(W-w)/2${transform.x}*W/2`; // Negative sign already in value
    const overlayY =
      transform.y >= 0
        ? `(H-h)/2+${transform.y}*H/2` // Add because positive y moves down (matches preview)
        : `(H-h)/2${transform.y}*H/2`; // Negative sign already in value

    // Calculate actual pixel coordinates for logging
    // W = targetDimensions.width, H = targetDimensions.height, w = currentWidth, h = currentHeight
    const centerX = (targetDimensions.width - currentWidth) / 2;
    const centerY = (targetDimensions.height - currentHeight) / 2;
    const pixelX = Math.round(centerX + (transform.x * targetDimensions.width) / 2);
    const pixelY = Math.round(centerY + (transform.y * targetDimensions.height) / 2);

    console.log(`📍 Image overlay ${index} position coordinates:`);
    console.log(`   - Normalized: x=${transform.x.toFixed(3)}, y=${transform.y.toFixed(3)} (-1 to 1 range, 0=center)`);
    console.log(`   - Pixel coords: x=${pixelX}px, y=${pixelY}px`);
    console.log(`   - Video dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
    console.log(`   - Image dimensions (after scale/rotate): ${currentWidth}x${currentHeight}`);
    console.log(`   - FFmpeg expression: overlay=${overlayX}:${overlayY}`);

    // Step 5: Overlay the image onto the current video with time-based enable
    // The overlay is only active between startTime and endTime
    filters.push(
      `[${currentLabel}]${currentImageRef}overlay=${overlayX}:${overlayY}:enable='between(t,${startTime},${endTime})'${overlayOutputRef}`,
    );

    currentLabel = overlayOutputRef.replace('[', '').replace(']', '');

    console.log(
      `✅ Image overlay ${index} enabled between ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s`,
    );
  });

  return {
    filters,
    outputLabel: currentLabel,
  };
}

/**
 * Builds the font directories parameter for FFmpeg subtitle filter
 * Collects all unique font directories used by the subtitle font families
 * and formats them for FFmpeg's fontsdir parameter
 * @param fontFamilies - Array of font family names used in subtitles
 * @returns Formatted fontsdir parameter string, or empty string if no valid directories
 */
function buildFontDirectoriesParameter(fontFamilies: string[]): string {
  if (!fontFamilies || fontFamilies.length === 0) {
    return '';
  }

  console.log('📝 Font families used in subtitles:', fontFamilies);

  // Get all unique font directories
  const fontDirectories = getFontDirectoriesForFamilies(fontFamilies);
  console.log('📝 Resolved font directories:', fontDirectories);

  if (fontDirectories.length === 0) {
    return '';
  }

  // Escape each directory path for FFmpeg filter syntax
  const escapedDirs = fontDirectories.map((dir) => {
    const escapedDir = dir
      .replace(/\\/g, '/')
      .replace(/:/g, '\\:')
      .replace(/'/g, "\\'");
    return escapedDir;
  });

  // Join all directories with the platform-specific path separator
  // FFmpeg expects multiple directories separated by ':' on Unix or ';' on Windows
  const separator = process.platform === 'win32' ? ';' : ':';
  const joinedDirs = escapedDirs.join(separator);

  console.log('📝 Using fonts directories:', joinedDirs);

  return `:fontsdir='${joinedDirs}'`;
}

/**
 * Checks if a video has a non-zero transform (position or scale)
 */
function hasNonZeroTransform(trackInfo: TrackInfo): boolean {
  const hasTransform = 
    (trackInfo.videoTransform?.x !== undefined && trackInfo.videoTransform.x !== 0) ||
    (trackInfo.videoTransform?.y !== undefined && trackInfo.videoTransform.y !== 0) ||
    (trackInfo.videoTransform?.scale !== undefined && trackInfo.videoTransform.scale !== 1.0);
  
  if (hasTransform) {
    console.log(
      `🎯 Video has transform: x=${trackInfo.videoTransform?.x ?? 0}, y=${trackInfo.videoTransform?.y ?? 0}, scale=${trackInfo.videoTransform?.scale ?? 1.0}`,
    );
  }
  
  return hasTransform;
}

/**
 * Creates a background clip and overlays the video on top
 * Used for videos with non-zero transform positions
 * 
 * Process:
 * 1. Create background at target dimensions
 * 2. Normalize video to target dimensions first (if different)
 * 3. Apply transform scale on top of normalized dimensions
 * 4. Overlay video with transform positioning
 */
function createBlackBackgroundWithOverlay(
  videoStreamRef: string,
  trackInfo: TrackInfo,
  targetDimensions: { width: number; height: number },
  uniqueIndex: string,
  videoFilters: string[],
  duration: number,
  targetFps: number,
): string {
  const transformScale = trackInfo.videoTransform?.scale ?? 1.0;
  console.log(
    `🎬 Creating background overlay for video with transform (x=${trackInfo.videoTransform?.x ?? 0}, y=${trackInfo.videoTransform?.y ?? 0}, scale=${transformScale})`,
  );

  // Create background at target dimensions (which are already the export dimensions)
  // This ensures all clips can be concatenated at the same dimensions
  console.log(
    `📐 Background dimensions: ${targetDimensions.width}x${targetDimensions.height}`,
  );

  const blackBgRef = `[${uniqueIndex}_black_bg]`;
  videoFilters.push(
    `color=black:size=${targetDimensions.width}x${targetDimensions.height}:duration=${duration}:rate=${targetFps},setpts=PTS-STARTPTS,setsar=1${blackBgRef}`,
  );

  // Step 2: First normalize video to target dimensions if source dimensions differ
  const sourceWidth = trackInfo.width || targetDimensions.width;
  const sourceHeight = trackInfo.height || targetDimensions.height;
  
  let normalizedVideoRef = videoStreamRef;
  const needsNormalization = 
    sourceWidth !== targetDimensions.width || 
    sourceHeight !== targetDimensions.height;
  
  if (needsNormalization) {
    normalizedVideoRef = `[${uniqueIndex}_normalized]`;
    videoFilters.push(
      `${videoStreamRef}scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=decrease,pad=${targetDimensions.width}:${targetDimensions.height}:(ow-iw)/2:(oh-ih)/2:black${normalizedVideoRef}`,
    );
    console.log(
      `📐 Step 1: Normalized video from ${sourceWidth}x${sourceHeight} to ${targetDimensions.width}x${targetDimensions.height}`,
    );
  } else {
    console.log(
      `📐 Step 1: No normalization needed - video already at target dimensions (${sourceWidth}x${sourceHeight})`,
    );
  }

  // Step 3: Apply transform scale to the normalized dimensions
  // Calculate scaled dimensions based on transform.scale
  const scaledWidth = Math.round(targetDimensions.width * transformScale);
  const scaledHeight = Math.round(targetDimensions.height * transformScale);
  
  console.log(
    `📐 Step 2: Transform scale: ${transformScale.toFixed(2)} (${targetDimensions.width}x${targetDimensions.height} → ${scaledWidth}x${scaledHeight})`,
  );

  // Step 4: Scale video to the transform-scaled dimensions
  // Note: If scaled dimensions exceed canvas, video will overflow (zoom effect)
  // If scaled dimensions are smaller than canvas, we'll see black background
  let scaledVideoRef: string;
  const needsScaling = transformScale !== 1.0;
  
  if (needsScaling) {
    scaledVideoRef = `[${uniqueIndex}_video_scaled]`;
    // Scale with aspect ratio preservation
    videoFilters.push(
      `${normalizedVideoRef}scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease${scaledVideoRef}`,
    );
    console.log(
      `📐 Step 3: Scaled video to ${scaledWidth}x${scaledHeight} (scale factor: ${transformScale.toFixed(2)}, preserving aspect ratio)`,
    );
  } else {
    // No scaling needed (scale = 1.0)
    scaledVideoRef = normalizedVideoRef;
    console.log(
      `📐 Step 3: No scaling needed (scale = 1.0), video dimensions: ${targetDimensions.width}x${targetDimensions.height}`,
    );
  }

  // Calculate overlay position based on transform
  const transformX = trackInfo.videoTransform?.x ?? 0;
  const transformY = trackInfo.videoTransform?.y ?? 0;
  
  console.log(
    `📐 Transform values: x=${transformX.toFixed(3)}, y=${transformY.toFixed(3)} (normalized -1 to 1, 0=center)`,
  );
  
  // Calculate pixel coordinates for logging
  const pixelOffsetX = (transformX * targetDimensions.width) / 2;
  const pixelOffsetY = (transformY * targetDimensions.height) / 2;
  const centerX = targetDimensions.width / 2;
  const centerY = targetDimensions.height / 2;
  const estimatedPixelX = Math.round(centerX + pixelOffsetX);
  const estimatedPixelY = Math.round(centerY + pixelOffsetY);
  
  // Apply transform positioning
  const overlayX = transformX >= 0
    ? `(W-w)/2+${transformX}*W/2`
    : `(W-w)/2${transformX}*W/2`;
  const overlayY = transformY >= 0
    ? `(H-h)/2+${transformY}*H/2`
    : `(H-h)/2${transformY}*H/2`;

  console.log(`📍 Video overlay position (with transform):`);
  console.log(`   - Normalized: x=${transformX.toFixed(3)}, y=${transformY.toFixed(3)}`);
  console.log(`   - Pixel offset: x=${pixelOffsetX.toFixed(2)}px, y=${pixelOffsetY.toFixed(2)}px`);
  console.log(`   - Estimated position: x≈${estimatedPixelX}px, y≈${estimatedPixelY}px`);
  console.log(`   - Background dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
  console.log(`   - FFmpeg expression: overlay=${overlayX}:${overlayY}`);

  // Overlay the video on the background
  const overlayRef = `[${uniqueIndex}_overlay]`;
  videoFilters.push(
    `${blackBgRef}${scaledVideoRef}overlay=${overlayX}:${overlayY}${overlayRef}`,
  );
  
  console.log(`✅ Video overlaid on background at transform position (${transformX}, ${transformY})`);
  console.log(`✅ Output dimensions: ${targetDimensions.width}x${targetDimensions.height} (ready for concat)`);

  // Return the overlay - it's already at targetDimensions and ready for concatenation
  return overlayRef;
}

/**
 * Processes a single layer's timeline segments and returns concat inputs
 */
function processLayerSegments(
  timeline: ProcessedTimeline,
  layerIndex: number,
  layerType: 'video' | 'image',
  categorizedInputs: CategorizedInputs,
  job: VideoEditJob,
  targetDimensions: { width: number; height: number },
  targetFps: number,
  videoFilters: string[],
): string[] {
  const concatInputs: string[] = [];

  timeline.segments.forEach((segment, segmentIndex) => {
    const { input: trackInfo, originalIndex } = segment;
    const uniqueIndex = `${layerType}_L${layerIndex}_${segmentIndex}`;

    if (isGapInput(trackInfo.path)) {
      // Gap - create black/transparent video
      const gapResult = createGapVideoFilters(
        9000 + layerIndex * 1000 + segmentIndex,
        trackInfo.duration || 1,
        targetFps,
        targetDimensions,
      );
      videoFilters.push(...gapResult.filters);
      concatInputs.push(gapResult.filterRef);
      console.log(
        `🎬 Layer ${layerIndex} (${layerType}): Added gap ${gapResult.filterRef}`,
      );
    } else {
      // Regular video/image file
      const fileIndex = findFileIndexForSegment(
        segment,
        categorizedInputs,
        'video',
      );

      if (fileIndex !== undefined) {
        console.log(
          `🎬 Layer ${layerIndex} (${layerType}): Processing segment ${segmentIndex} with fileIndex ${fileIndex}`,
        );

        const context: VideoProcessingContext = {
          trackInfo,
          originalIndex: 9000 + layerIndex * 1000 + segmentIndex,
          fileIndex,
          inputStreamRef: `[${fileIndex}:v]`,
        };

        const trimResult = createVideoTrimFilters(context);

        if (trimResult.filters.length > 0) {
          videoFilters.push(...trimResult.filters);
        }

        let videoStreamRef = trimResult.filterRef;

        // Apply FPS normalization if needed
        if (job.operations.normalizeFrameRate) {
          const fpsResult = createFpsNormalizationFilters(
            9000 + layerIndex * 1000 + segmentIndex,
            videoStreamRef,
            targetFps,
          );
          videoFilters.push(...fpsResult.filters);
          videoStreamRef = fpsResult.filterRef;
        }

        const isVideoFile = FILE_EXTENSIONS.VIDEO.test(trackInfo.path);
        const isImageFile = FILE_EXTENSIONS.IMAGE.test(trackInfo.path);
        
        // Check if this video has a non-zero transform position
        const hasTransform = isVideoFile && hasNonZeroTransform(trackInfo);

        if (hasTransform) {
          // Video has non-zero transform - create background and overlay
          // targetDimensions is already set to export dimensions if specified
          const duration = trackInfo.duration || segment.duration || 1;
          videoStreamRef = createBlackBackgroundWithOverlay(
            videoStreamRef,
            trackInfo,
            targetDimensions,
            uniqueIndex,
            videoFilters,
            duration,
            targetFps,
          );
        } else {
          // No transform - use standard scaling logic
          // This scales video segments to match target dimensions (e.g., 608x1080 → 1080x1920)
          // before any additional processing
        const needsScaling =
          (isVideoFile || isImageFile) &&
          trackInfo.width &&
          trackInfo.height &&
          (trackInfo.width !== targetDimensions.width ||
            trackInfo.height !== targetDimensions.height);

        if (needsScaling) {
          const scaleRef = `[${uniqueIndex}_scaled]`;
          if (isImageFile) {
            // For images, scale without padding to preserve transparency
            // Images will be overlaid at their natural size, centered on the video
            videoFilters.push(
              `${videoStreamRef}scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=decrease${scaleRef}`,
            );
            console.log(
              `📐 Layer ${layerIndex}: Scaled image from ${trackInfo.width}x${trackInfo.height} to fit ${targetDimensions.width}x${targetDimensions.height} (preserving transparency)`,
            );
            } else {
              videoFilters.push(
                `${videoStreamRef}scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=decrease,pad=${targetDimensions.width}:${targetDimensions.height}:(ow-iw)/2:(oh-ih)/2:black${scaleRef}`,
              );
              console.log(
                `📐 Layer ${layerIndex}: Scaled video segment from ${trackInfo.width}x${trackInfo.height} to ${targetDimensions.width}x${targetDimensions.height} with black padding`,
              );
            }
          videoStreamRef = scaleRef;
          }
        }

        // Normalize SAR (Sample Aspect Ratio) to 1:1 for concat compatibility
        // This ensures all video streams have the same SAR before concatenation
        const sarResult = createSarNormalizationFilters(
          9000 + layerIndex * 1000 + segmentIndex,
          videoStreamRef,
        );
        videoFilters.push(...sarResult.filters);
        videoStreamRef = sarResult.filterRef;
        console.log(
          `📐 Layer ${layerIndex}: Normalized SAR to 1:1 for segment ${segmentIndex}`,
        );

        // Note: Aspect ratio cropping is now applied to the final output video
        // after all compositing is complete, not per-segment

        concatInputs.push(videoStreamRef);
      } else {
        console.warn(
          `❌ Layer ${layerIndex}: Could not find file index for segment ${segmentIndex}`,
        );
      }
    }
  });

  return concatInputs;
}

/**
 * Determines the target dimensions for video processing
 * Prioritizes actual video file dimensions over project dimensions
 */
function determineTargetDimensions(
  videoTimeline: ProcessedTimeline,
  job: VideoEditJob,
): { width: number; height: number } {
  // Strategy 1: Look for actual video files (not images or gaps) in the original inputs
  for (const input of job.inputs) {
    const trackInfo = getTrackInfo(input);
    const path = getInputPath(input);

    console.log(
      `📐 Checking input: ${path}, isVideo: ${FILE_EXTENSIONS.VIDEO.test(path)}, width: ${trackInfo.width}, height: ${trackInfo.height}`,
    );

    if (!isGapInput(path) && FILE_EXTENSIONS.VIDEO.test(path)) {
      // Found a video file - check if it has explicit dimensions
      if (trackInfo.width && trackInfo.height) {
        console.log(
          `📐 ✅ Using video input dimensions from inputs: ${trackInfo.width}x${trackInfo.height}`,
        );
        return { width: trackInfo.width, height: trackInfo.height };
      }
    }
  }

  // Strategy 2: Look in the timeline segments
  for (const segment of videoTimeline.segments) {
    const path = segment.input.path;
    if (!isGapInput(path) && FILE_EXTENSIONS.VIDEO.test(path)) {
      // Found a video file - check if it has explicit dimensions
      if (segment.input.width && segment.input.height) {
        console.log(
          `📐 Using video input dimensions from timeline: ${segment.input.width}x${segment.input.height}`,
        );
        return { width: segment.input.width, height: segment.input.height };
      }
    }
  }

  // Fallback to job's video dimensions
  const dimensions = job.videoDimensions || VIDEO_DEFAULTS.SIZE;
  console.log(
    `📐 Using project dimensions (fallback): ${dimensions.width}x${dimensions.height}`,
  );
  return dimensions;
}

/**
 * Builds filter complex with multi-layer video/image support
 * Layers are composited from bottom to top (layer 0 = base, higher layers overlay on top)
 */
function buildSeparateTimelineFilterComplex(
  videoLayers: Map<number, ProcessedTimeline>,
  imageLayers: Map<number, ProcessedTimeline>,
  audioTimeline: ProcessedTimeline,
  job: VideoEditJob,
  categorizedInputs: CategorizedInputs,
): string {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  const audioConcatInputs: string[] = [];

  // Determine target dimensions for processing
  // Priority 1: Use job.videoDimensions if explicitly set (export dimensions)
  // Priority 2: Fall back to first video's dimensions
  let targetDimensions: { width: number; height: number };
  
  if (job.videoDimensions) {
    // Export dimensions are explicitly set - use these as target for ALL clips
    targetDimensions = job.videoDimensions;
    console.log(`📐 Using explicit export dimensions as target: ${targetDimensions.width}x${targetDimensions.height}`);
  } else {
    // No explicit export dimensions - determine from first video
    let firstVideoTimeline: ProcessedTimeline | undefined;
    const sortedVideoLayers = Array.from(videoLayers.entries()).sort(
      (a, b) => a[0] - b[0],
    );
    if (sortedVideoLayers.length > 0) {
      firstVideoTimeline = sortedVideoLayers[0][1];
    }
    
    targetDimensions = firstVideoTimeline
      ? determineTargetDimensions(firstVideoTimeline, job)
      : VIDEO_DEFAULTS.SIZE;
    console.log(`📐 Determined target dimensions from first video: ${targetDimensions.width}x${targetDimensions.height}`);
  }
  
  const targetFps = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
  
  // Extract target aspect ratio
  // Priority 1: Use job.operations.aspect (set by useExportJob based on custom canvas dimensions)
  // Priority 2: Fall back to trackInfo.aspectRatio (source video aspect ratio)
  let targetAspectRatio: string | undefined = job.operations.aspect;
  
  if (targetAspectRatio) {
    console.log(`📐 Using target aspect ratio from job.operations.aspect: ${targetAspectRatio}`);
  } else {
    // Fallback to trackInfo aspect ratio
    for (const input of job.inputs) {
      const trackInfo = getTrackInfo(input);
      const path = getInputPath(input);
      if (!isGapInput(path) && FILE_EXTENSIONS.VIDEO.test(path) && trackInfo.aspectRatio) {
        targetAspectRatio = trackInfo.aspectRatio;
        console.log(`📐 Fallback: Using aspect ratio from trackInfo: ${targetAspectRatio}`);
        break;
      }
    }
  }

  console.log('🎬 Building filter complex with multi-layer support:');
    console.log(
    `📊 Video layers: ${videoLayers.size}, Image layers: ${imageLayers.size}`,
    );

  // Collect all image segments for overlay processing (images are NOT concatenated like video)
  const allImageSegments: ProcessedTimelineSegment[] = [];
  for (const [layerNum, timeline] of imageLayers.entries()) {
    console.log(
      `🖼️ Collecting ${timeline.segments.length} image segments from layer ${layerNum}`,
    );
    allImageSegments.push(...timeline.segments);
  }

  // Process video layers only (images will be overlaid later)
  const layerConcatOutputs = new Map<number, string>();

  for (const [layerNum, timeline] of videoLayers.entries()) {
    console.log(
      `🎬 Processing video layer ${layerNum} with ${timeline.segments.length} segments`,
    );

    const concatInputs = processLayerSegments(
      timeline,
      layerNum,
      'video',
      categorizedInputs,
      job,
      targetDimensions,
      targetFps,
      videoFilters,
    );

    // Build concatenation filter for this layer
    if (concatInputs.length > 0) {
      const layerLabel = `layer_${layerNum}`;
      if (concatInputs.length === 1) {
        const inputRef = concatInputs[0].replace('[', '').replace(']', '');
        videoFilters.push(`[${inputRef}]null[${layerLabel}]`);
      } else {
    videoFilters.push(
          `${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[${layerLabel}]`,
        );
      }
      layerConcatOutputs.set(layerNum, layerLabel);
      console.log(`✅ Layer ${layerNum} concatenated to [${layerLabel}]`);
    }
  }

  // Process audio timeline segments IN ORDER
  // Skip audio processing if there are only image inputs (no video inputs)
  const hasVideoInputs = videoLayers.size > 0;
  
  if (hasVideoInputs) {
    audioTimeline.segments.forEach((segment, segmentIndex) => {
      const { input: trackInfo } = segment;

      console.log(
        `🎵 Processing audio segment ${segmentIndex}: ${trackInfo.path} [${segment.startTime.toFixed(2)}s-${segment.endTime.toFixed(2)}s]`,
      );

      if (isGapInput(trackInfo.path)) {
        // Audio gap - create silent audio
        const silentResult = createSilentAudioFilters(
          segmentIndex,
          trackInfo.duration || 1,
        );
        audioFilters.push(...silentResult.filters);
        audioConcatInputs.push(silentResult.filterRef);
        console.log(`🎵 Added audio gap: ${silentResult.filterRef}`);
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

          const context: AudioProcessingContext = {
            trackInfo,
            originalIndex: segmentIndex,
            fileIndex,
            inputStreamRef: `[${fileIndex}:a]`,
          };

          const trimResult = createAudioTrimFilters(context);
          audioFilters.push(...trimResult.filters);
          audioConcatInputs.push(trimResult.filterRef);
        } else {
          console.warn(
            `❌ Could not find file index for audio segment ${segmentIndex}`,
          );
        }
      }
    });
  } else {
    console.log('ℹ️ Skipping audio processing - only image inputs detected (no video inputs)');
  }

  // Composite layers from bottom to top
  let currentVideoLabel = '';
  let hasVideoContent = false;

  if (layerConcatOutputs.size > 0) {
    const sortedLayerOutputs = Array.from(layerConcatOutputs.entries()).sort(
      (a, b) => a[0] - b[0],
    );

    if (sortedLayerOutputs.length === 1) {
      // Single layer - no overlay needed
      currentVideoLabel = sortedLayerOutputs[0][1];
      console.log(
        `🎬 Single layer detected: using [${currentVideoLabel}] as base`,
      );
    } else {
      // Multiple layers - overlay from bottom to top
      console.log(`🎬 Compositing ${sortedLayerOutputs.length} layers`);

      // Start with the base layer (layer 0 or lowest layer)
      currentVideoLabel = sortedLayerOutputs[0][1];

      // Overlay each subsequent layer on top
      for (let i = 1; i < sortedLayerOutputs.length; i++) {
        const [layerNum, layerLabel] = sortedLayerOutputs[i];
        const overlayOutputLabel =
          i === sortedLayerOutputs.length - 1 ? 'video_base' : `composite_${i}`;

        // Overlay this layer on top of the current composite
        // Use (W-w)/2:(H-h)/2 to center the overlay if it's smaller than the base
        videoFilters.push(
          `[${currentVideoLabel}][${layerLabel}]overlay=(W-w)/2:(H-h)/2[${overlayOutputLabel}]`,
        );

        currentVideoLabel = overlayOutputLabel;
        console.log(
          `🎬 Overlaid layer ${layerNum} (centered) onto composite -> [${overlayOutputLabel}]`,
        );
      }
    }

    // If we didn't end with 'video_base', rename it
    if (currentVideoLabel !== 'video_base') {
      videoFilters.push(`[${currentVideoLabel}]null[video_base]`);
      currentVideoLabel = 'video_base';
    }

    hasVideoContent = true;
  } else {
    // No video layers - create a black base if needed
    console.log('⚠️ No video layers found, creating black base');
    const totalDuration = audioTimeline.totalDuration || 1;
    videoFilters.push(
      `color=black:size=${targetDimensions.width}x${targetDimensions.height}:duration=${totalDuration}:rate=${targetFps},setsar=1[video_base]`,
    );
    currentVideoLabel = 'video_base';
    hasVideoContent = true;
  }

  // Build audio concatenation filter
  let audioConcatFilter = '';
  if (audioConcatInputs.length > 0) {
    if (audioConcatInputs.length === 1) {
      const inputRef = audioConcatInputs[0].replace('[', '').replace(']', '');
      audioConcatFilter = `[${inputRef}]anull[audio]`;
    } else {
      audioConcatFilter = `${audioConcatInputs.join('')}concat=n=${audioConcatInputs.length}:v=0:a=1[audio]`;
    }
  }

  // Note: Image overlays will be applied AFTER aspect ratio crop
  // This is handled later in the filter chain to ensure images are positioned correctly
  // relative to the cropped video dimensions

  // Apply aspect ratio conversion (scale + crop) BEFORE subtitles and images
  // This ensures subtitles and images are positioned correctly relative to the final video dimensions
  // targetAspectRatio is already set from job.operations.aspect (or trackInfo as fallback)
  const finalAspectRatio = targetAspectRatio;
  
  // Get the desired final output dimensions from the job
  // These are the custom dimensions set by the user (e.g., 500x500)
  const desiredOutputDimensions = job.videoDimensions || VIDEO_DEFAULTS.SIZE;
  
  let aspectRatioCropFilter = '';
  let croppedVideoLabel = currentVideoLabel; // Track the current video label after crop
  
  console.log('📐 Checking aspect ratio conversion conditions:');
  console.log('   - targetAspectRatio (from trackInfo):', targetAspectRatio);
  console.log('   - job.operations.aspect:', job.operations.aspect);
  console.log('   - finalAspectRatio (used):', finalAspectRatio);
  console.log('   - hasVideoContent:', hasVideoContent);
  console.log('   - targetDimensions (source video):', targetDimensions);
  console.log('   - desiredOutputDimensions (custom/final):', desiredOutputDimensions);
  
  // Store the dimensions after aspect ratio crop (before final downscale)
  let aspectRatioCroppedDimensions = targetDimensions;
  
  // Extract video position within canvas from the first video track for dynamic cropping
  // Default to (0, 0) which means video is centered → center crop (current behavior)
  let videoPositionX: number | undefined = undefined;
  let videoPositionY: number | undefined = undefined;
  
  if (videoLayers.size > 0) {
    const firstLayer = Array.from(videoLayers.values())[0];
    if (firstLayer.segments.length > 0) {
      const firstSegment = firstLayer.segments[0];
      videoPositionX = firstSegment.input.videoTransform?.x;
      videoPositionY = firstSegment.input.videoTransform?.y;
      
      if (videoPositionX !== undefined || videoPositionY !== undefined) {
        console.log(
          `📐 Video position in canvas detected for dynamic cropping: x=${videoPositionX ?? 0}, y=${videoPositionY ?? 0}`,
        );
      }
    }
  }
  
  // Check if the first video has a transform - if so, skip aspect ratio crop
  // because the background overlay already handles the aspect ratio
  let videoHasTransform = false;
  if (videoLayers.size > 0) {
    const firstLayer = Array.from(videoLayers.values())[0];
    if (firstLayer.segments.length > 0) {
      const firstSegment = firstLayer.segments[0];
      videoHasTransform = hasNonZeroTransform(firstSegment.input);
    }
  }
  
  if (videoHasTransform) {
    // Video has transform - aspect ratio conversion is handled inside createBlackBackgroundWithOverlay
    // using the same scale+crop logic as non-transform videos
    aspectRatioCroppedDimensions = desiredOutputDimensions;
    console.log(`📐 Video has transform - aspect ratio conversion handled in createBlackBackgroundWithOverlay (same logic as non-transform)`);
    console.log(`📐 Final dimensions after transform overlay + crop: ${desiredOutputDimensions.width}x${desiredOutputDimensions.height}`);
  }
  
  if (hasVideoContent && !videoHasTransform) {
    // Always check if aspect ratio conversion is needed based on desired output dimensions
    const sourceRatio = targetDimensions.width / targetDimensions.height;
    const desiredRatio = desiredOutputDimensions.width / desiredOutputDimensions.height;
    
    console.log(
      `📐 Aspect ratio analysis:`,
    );
    console.log(
      `   - Source video: ${sourceRatio.toFixed(3)} (${targetDimensions.width}x${targetDimensions.height})`,
    );
    if (finalAspectRatio) {
      const targetRatio = parseAspectRatio(finalAspectRatio);
      console.log(
        `   - Target aspect ratio: ${targetRatio.toFixed(3)} (${finalAspectRatio})`,
      );
    }
    console.log(
      `   - Desired output: ${desiredRatio.toFixed(3)} (${desiredOutputDimensions.width}x${desiredOutputDimensions.height})`,
    );

    // Check if we need to convert - compare source with DESIRED output ratio (not targetRatio)
    // This ensures we crop/scale when custom dimensions have a different aspect ratio
    const ratioDifference = Math.abs(desiredRatio - sourceRatio) / sourceRatio;
    console.log(`📐 Ratio difference (source vs desired output): ${(ratioDifference * 100).toFixed(2)}%`);
    
    if (ratioDifference > 0.01) {
      // Determine conversion type
      const isPortraitToLandscape = sourceRatio < 1 && desiredRatio > 1;
      const isLandscapeToPortrait = sourceRatio > 1 && desiredRatio < 1;
      
      if (isPortraitToLandscape) {
        // Portrait → Landscape: NO CROP, just pad/scale to fit
        console.log(`📐 Portrait → Landscape conversion: NO CROP, scale to fit with padding`);
        
        // Don't apply crop filter - let the video maintain its aspect ratio
        // The final downscale will handle fitting it into the landscape frame
        console.log(`📐 Skipping crop for portrait→landscape (will be handled by final downscale with padding)`);
        
        // Set aspectRatioCroppedDimensions to source dimensions (no crop applied)
        aspectRatioCroppedDimensions = targetDimensions;
      } else if (isLandscapeToPortrait) {
        // Landscape → Portrait: NO CROP (inverse of portrait→landscape)
        // Center the landscape video, allow width to be cropped, add padding top/bottom
        console.log(`📐 Landscape → Portrait conversion: NO CROP, scale to fit with padding (inverse of portrait→landscape)`);
        
        // Don't apply crop filter - let the video maintain its aspect ratio
        // The final downscale will handle fitting it into the portrait frame with padding
        console.log(`📐 Skipping crop for landscape→portrait (will be handled by final downscale with padding)`);
        
        // Set aspectRatioCroppedDimensions to source dimensions (no crop applied)
        aspectRatioCroppedDimensions = targetDimensions;
      } else {
        // Landscape → Portrait OR same orientation: Apply crop
        let scaleWidth: number;
        let scaleHeight: number;
        let cropWidth: number;
        let cropHeight: number;

        // Strategy: Crop to match the desired aspect ratio, then the final downscale will handle sizing
        // The crop dimensions should have the EXACT same aspect ratio as the desired output
        // to prevent any distortion during the final downscale
        
        if (desiredRatio > sourceRatio) {
          // Target is wider than source
          // Preserve width, crop height
          cropWidth = targetDimensions.width;
          cropHeight = Math.round(cropWidth / desiredRatio);
          
          // Check if crop height fits within source
          if (cropHeight > targetDimensions.height) {
            // Crop height too large, switch to preserving height
            cropHeight = targetDimensions.height;
            cropWidth = Math.round(cropHeight * desiredRatio);
          }
          
          // Ensure exact aspect ratio match by adjusting cropHeight to match cropWidth
          // This prevents rounding errors from causing distortion
          cropHeight = Math.round(cropWidth / desiredRatio);
          
          console.log(`📐 Wider target: preserving width (${cropWidth}), cropping height to ${cropHeight}`);
        } else {
          // Target is taller than source (e.g., landscape 16:9 → portrait 9:16)
          // Preserve height, crop width
          cropHeight = targetDimensions.height;
          cropWidth = Math.round(cropHeight * desiredRatio);
          
          // Check if crop width fits within source
          if (cropWidth > targetDimensions.width) {
            // Crop width too large, switch to preserving width
            cropWidth = targetDimensions.width;
            cropHeight = Math.round(cropWidth / desiredRatio);
          }
          
          // Ensure exact aspect ratio match by adjusting cropWidth to match cropHeight
          // This prevents rounding errors from causing distortion
          cropWidth = Math.round(cropHeight * desiredRatio);
          
          console.log(`📐 Taller target (landscape→portrait): preserving height (${cropHeight}), cropping width to ${cropWidth}`);
        }
        
        // No scaling needed before crop - we crop directly from the source dimensions
        scaleWidth = targetDimensions.width;
        scaleHeight = targetDimensions.height;

        // Calculate dynamic crop position based on video position within canvas
        // Defaults to center crop if videoPositionX/videoPositionY are undefined or 0
        const cropX = calculateDynamicCropX(scaleWidth, cropWidth, videoPositionX);
        const cropY = calculateDynamicCropY(scaleHeight, cropHeight, videoPositionY);

        // Log crop positioning info
        if (videoPositionX !== undefined || videoPositionY !== undefined) {
          console.log(
            `📐 Dynamic crop positioning: video position in canvas(${videoPositionX ?? 0}, ${videoPositionY ?? 0}) → crop offset(${cropX}, ${cropY})`,
          );
        } else {
          console.log(`📐 Center crop positioning (default): crop offset(${cropX}, ${cropY})`);
        }

        // Apply crop filter directly (no scale needed since we're cropping from source dimensions)
        // Also set SAR to 1:1 to ensure square pixels
        aspectRatioCropFilter = `[${currentVideoLabel}]crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},setsar=1[video_cropped]`;
        croppedVideoLabel = 'video_cropped';
        aspectRatioCroppedDimensions = { width: cropWidth, height: cropHeight };
        
        const croppedAspectRatio = cropWidth / cropHeight;
        console.log(`📐 Crop filter (no pre-scale): crop=${cropWidth}:${cropHeight}:${cropX}:${cropY},setsar=1`);
        console.log(`📐 Dimensions after aspect ratio crop: ${cropWidth}x${cropHeight}`);
        console.log(`📐 Cropped aspect ratio: ${croppedAspectRatio.toFixed(4)} (should be ${desiredRatio.toFixed(4)})`);
      }
    } else {
      console.log(
        `📐 Aspect ratios are similar (${(ratioDifference * 100).toFixed(2)}% difference), no conversion needed`,
      );
    }
  }

  // Determine the dimensions to use for image overlays
  // Images are applied BEFORE the final downscale, so they need to be positioned at the intermediate resolution
  let imagePositioningDimensions = aspectRatioCroppedDimensions;
  
  console.log(`📐 Dimensions for image positioning (before final downscale): ${imagePositioningDimensions.width}x${imagePositioningDimensions.height}`);

  // Apply image overlays AFTER aspect ratio crop (if any)
  // This ensures images are positioned relative to the cropped video dimensions
  let imageOverlayFilters: string[] = [];
  let videoLabelAfterImages = croppedVideoLabel;
  
  if (allImageSegments.length > 0 && hasVideoContent) {
    // Calculate total duration from all layers
    let totalDuration = audioTimeline.totalDuration;
    for (const timeline of videoLayers.values()) {
      totalDuration = Math.max(totalDuration, timeline.totalDuration);
    }
    for (const timeline of imageLayers.values()) {
      totalDuration = Math.max(totalDuration, timeline.totalDuration);
    }

    console.log(
      `🖼️ Applying ${allImageSegments.length} image overlays AFTER aspect ratio crop`,
    );
    console.log(
      `🖼️ Image positions will be relative to ${imagePositioningDimensions.width}x${imagePositioningDimensions.height}`,
    );
    
    const imageOverlayResult = buildImageOverlayFilters(
      allImageSegments,
      categorizedInputs,
      imagePositioningDimensions, // Use intermediate dimensions (before final downscale)
      targetFps,
      totalDuration,
      croppedVideoLabel, // Apply to cropped video
    );

    if (imageOverlayResult.filters.length > 0) {
      imageOverlayFilters = imageOverlayResult.filters;
      videoLabelAfterImages = imageOverlayResult.outputLabel;
      console.log(
        `✅ Image overlays will be applied after crop, output label: [${videoLabelAfterImages}]`,
      );
    }
  }

  // Apply final downscaling if desired output dimensions differ from aspect ratio cropped dimensions
  // This happens BEFORE subtitles so subtitles are applied at the final output resolution
  let finalDownscaleFilter = '';
  let videoLabelAfterDownscale = videoLabelAfterImages;
  
  console.log('📐 Checking final downscale conditions:');
  console.log('   - Desired output dimensions:', desiredOutputDimensions);
  console.log('   - Aspect ratio cropped dimensions:', aspectRatioCroppedDimensions);
  
  const needsDownscale = hasVideoContent && (
    desiredOutputDimensions.width !== aspectRatioCroppedDimensions.width ||
    desiredOutputDimensions.height !== aspectRatioCroppedDimensions.height
  );
  
  if (needsDownscale) {
    // Calculate aspect ratios to verify they match
    const croppedRatio = aspectRatioCroppedDimensions.width / aspectRatioCroppedDimensions.height;
    const desiredOutputRatio = desiredOutputDimensions.width / desiredOutputDimensions.height;
    const aspectRatioDiff = Math.abs(croppedRatio - desiredOutputRatio) / desiredOutputRatio;
    
    console.log(
      `📐 Final downscale needed: ${aspectRatioCroppedDimensions.width}x${aspectRatioCroppedDimensions.height} → ${desiredOutputDimensions.width}x${desiredOutputDimensions.height}`,
    );
    console.log(
      `📐 Aspect ratio check: cropped=${croppedRatio.toFixed(4)}, desired=${desiredOutputRatio.toFixed(4)}, diff=${(aspectRatioDiff * 100).toFixed(2)}%`,
    );
    
    // Simple scale since aspect ratios should already match from the crop
    // If there's a mismatch, log a warning
    if (aspectRatioDiff > 0.001) {
      console.warn(`⚠️ Aspect ratio mismatch detected! This may cause distortion.`);
      // Use force_original_aspect_ratio to prevent distortion, then pad to exact size
      finalDownscaleFilter = `[${videoLabelAfterImages}]scale=${desiredOutputDimensions.width}:${desiredOutputDimensions.height}:force_original_aspect_ratio=decrease,pad=${desiredOutputDimensions.width}:${desiredOutputDimensions.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[video_downscaled]`;
      console.log(`📐 Using scale with force_original_aspect_ratio due to aspect ratio mismatch (black padding)`);
    } else {
      // Aspect ratios match, but still use force_original_aspect_ratio as a safety measure
      // This ensures FFmpeg won't distort even if there are tiny rounding differences
      finalDownscaleFilter = `[${videoLabelAfterImages}]scale=${desiredOutputDimensions.width}:${desiredOutputDimensions.height}:force_original_aspect_ratio=decrease,pad=${desiredOutputDimensions.width}:${desiredOutputDimensions.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[video_downscaled]`;
      console.log(`📐 Using scale with force_original_aspect_ratio=decrease with black padding`);
    }
    videoLabelAfterDownscale = 'video_downscaled';
  } else {
    console.log('📐 No final downscale needed, dimensions match');
    videoLabelAfterDownscale = videoLabelAfterImages;
  }
  
  // Apply subtitles to video stream if needed (must be in filter_complex)
  // Note: Text clips are now bundled with subtitles in ASS format
  // Subtitles are applied AFTER the final downscale so they match the output dimensions
  let subtitleFilter = '';

  if (job.operations.subtitles && hasVideoContent) {
    // Use escapePathForFilter for proper filter syntax escaping
    const escapedPath = escapePathForFilter(job.operations.subtitles);
    const fileExtension = job.operations.subtitles
      .toLowerCase()
      .split('.')
      .pop();

    // Get font directories for the fonts used in subtitles
    let fontsDirParam = '';
    if (job.subtitleFontFamilies && job.subtitleFontFamilies.length > 0) {
      // Use the new method to build font directories parameter
      fontsDirParam = buildFontDirectoriesParameter(job.subtitleFontFamilies);
    }

    if (fileExtension === 'ass' || fileExtension === 'ssa') {
      // Use 'subtitles' filter for ASS files with fontsdir parameter
      // Apply to the video after downscale
      subtitleFilter = `[${videoLabelAfterDownscale}]subtitles='${escapedPath}'${fontsDirParam}[video]`;
      console.log(
        '📝 Added ASS subtitles filter (includes text clips) with fontsdir - applied AFTER downscale at final output dimensions',
      );
    } else {
      // Use 'subtitles' filter for other formats
      subtitleFilter = `[${videoLabelAfterDownscale}]subtitles='${escapedPath}'${fontsDirParam}[video]`;
      console.log(`📝 Added subtitles filter (format: ${fileExtension}) - applied AFTER downscale at final output dimensions`);
    }
  } else if (hasVideoContent) {
    // No subtitles - just rename current label to video
    if (videoLabelAfterDownscale !== 'video') {
      subtitleFilter = `[${videoLabelAfterDownscale}]null[video]`;
    }
    console.log('ℹ️ No subtitles, using null passthrough or skipping');
  }

  // Combine all filters in the correct order:
  // 1. Video processing (concat, etc.)
  // 2. Audio processing
  // 3. Aspect ratio crop (if needed) - scales and crops to correct aspect ratio at source resolution
  // 4. Image overlays (applied to cropped video at intermediate resolution)
  // 5. Final downscale (if needed) - downscales to custom dimensions
  // 6. Subtitles (applied AFTER downscale at final output dimensions)
  const allFilters = [...videoFilters, ...audioFilters];
  if (audioConcatFilter) allFilters.push(audioConcatFilter);
  if (aspectRatioCropFilter) {
    console.log('📐 ✅ ADDING ASPECT RATIO CROP FILTER TO CHAIN:', aspectRatioCropFilter);
    allFilters.push(aspectRatioCropFilter);
  } else {
    console.log('📐 ❌ NO ASPECT RATIO CROP FILTER TO ADD');
  }
  if (imageOverlayFilters.length > 0) {
    console.log(`🖼️ ✅ ADDING ${imageOverlayFilters.length} IMAGE OVERLAY FILTERS TO CHAIN (AFTER CROP, BEFORE DOWNSCALE)`);
    allFilters.push(...imageOverlayFilters);
  }
  if (finalDownscaleFilter) {
    console.log('📐 ✅ ADDING FINAL DOWNSCALE FILTER TO CHAIN:', finalDownscaleFilter);
    allFilters.push(finalDownscaleFilter);
  }
  if (subtitleFilter) {
    console.log('📝 ✅ ADDING SUBTITLE FILTER TO CHAIN (AFTER DOWNSCALE, LAST STEP)');
    allFilters.push(subtitleFilter);
  }
  const filterComplex = allFilters.join(';');

  return filterComplex;
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
 * Builds and applies filter complex to command with multi-layer support
 */
function handleFilterComplex(
  job: VideoEditJob,
  cmd: CommandParts,
  videoLayers: Map<number, ProcessedTimeline>,
  imageLayers: Map<number, ProcessedTimeline>,
  audioTimeline: ProcessedTimeline,
  categorizedInputs: CategorizedInputs,
  hwAccel: HardwareAcceleration | null,
): void {
  let filterComplex = buildSeparateTimelineFilterComplex(
    videoLayers,
    imageLayers,
    audioTimeline,
    job,
    categorizedInputs,
  );

  if (filterComplex) {
    // The final video output is always [video] now since:
    // 1. Aspect ratio crop is applied first (if needed): [video_with_images] -> [video_cropped]
    // 2. Subtitles are applied after crop: [video_cropped] -> [video]
    // So we always map [video] as the final output
    
    // Check if we have video inputs (not just images) to determine if we should map audio
    const hasVideoInputs = videoLayers.size > 0;
    
    // Add hardware upload filter for VAAPI if needed
    if (hwAccel?.type === 'vaapi') {
      console.log('🎮 Adding VAAPI hardware upload filter');
      filterComplex +=
        ';[video]format=nv12,hwupload=extra_hw_frames=64:derive_device=vaapi[video_hw]';
      cmd.args.push('-filter_complex', filterComplex);
      if (hasVideoInputs) {
        cmd.args.push('-map', '[video_hw]', '-map', '[audio]');
      } else {
        cmd.args.push('-map', '[video_hw]');
        console.log('ℹ️ Not mapping audio - only image inputs detected');
      }
    } else {
      cmd.args.push('-filter_complex', filterComplex);
      if (hasVideoInputs) {
        cmd.args.push('-map', '[video]', '-map', '[audio]');
      } else {
        cmd.args.push('-map', '[video]');
        console.log('ℹ️ Not mapping audio - only image inputs detected');
      }
    }
  }
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


