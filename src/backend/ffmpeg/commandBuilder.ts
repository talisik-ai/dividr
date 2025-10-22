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
  TextClipData,
  TrackInfo,
  VideoEditJob,
  VideoProcessingContext,
} from './schema/ffmpegConfig';
import { getFontPathByStyle } from './fontMapper';

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
 * Calculates the actual duration of a track, accounting for trimming
 */
function calculateTrackDuration(
  trackInfo: TrackInfo,
  defaultDuration = 1,
): number {
  // If explicit duration is set, use it
  if (trackInfo.duration !== undefined) {
    return trackInfo.duration;
  }

  // For gaps, use duration or default
  if (isGapInput(trackInfo.path)) {
    return trackInfo.duration || defaultDuration;
  }

  return defaultDuration;
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

    const isVideo = !isGap && (FILE_EXTENSIONS.VIDEO.test(path) || FILE_EXTENSIONS.IMAGE.test(path));
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
      const modifiedTrackInfo = audioFileIndex !== undefined 
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
  const isImage = trackInfo.isImage || (trackInfo.trackType === 'image');

  if (isImage && trackInfo.duration !== undefined) {
    // For images, treat them like gaps but with the actual image content
    // Generate frames by looping the single image frame for the exact duration
    const trimmedRef = `[v${originalIndex}_trimmed]`;
    const fps = 30; // Default FPS, will be normalized later
    const duration = trackInfo.duration;
    const totalFrames = Math.round(duration * fps); // Round to nearest frame for exact timing
    
    console.log(`🖼️ Image input detected: generating ${duration}s (${totalFrames} frames) at ${fps}fps from static image`);
    
    // Use loop filter with exact frame count, then trim to exact duration
    // loop=-1 means infinite loop, then we trim to exact duration
    return {
      filterRef: trimmedRef,
      filters: [
        `${inputStreamRef}loop=loop=-1:size=1:start=0,trim=duration=${duration}[temp_trim_${originalIndex}]`,
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
      `anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}[temp_silent_pre_${originalIndex}]`,
      `[temp_silent_pre_${originalIndex}]atrim=duration=${duration}[temp_silent_${originalIndex}]`,
      `[temp_silent_${originalIndex}]asetpts=PTS-STARTPTS${silentAudioRef}`,
    ],
  };
}

/**
 * Builds separate video and audio timelines from inputs with proper layering
 * Images are prioritized over videos when they overlap
 */
function buildSeparateTimelines(
  inputs: (string | TrackInfo)[],
  targetFrameRate: number = VIDEO_DEFAULTS.FPS,
): { video: ProcessedTimeline; audio: ProcessedTimeline } {
  console.log('🎬 Building timelines with layering support');
  
  // Separate inputs by type
  const videoInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }> = [];
  const imageInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }> = [];
  const audioInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }> = [];

  inputs.forEach((input, originalIndex) => {
    const trackInfo = getTrackInfo(input);
    const path = getInputPath(input);

    if (isGapInput(path)) {
      // Skip gaps here, they'll be added later
      return;
    }

    if (FILE_EXTENSIONS.VIDEO.test(path)) {
      videoInputs.push({ trackInfo, originalIndex });
    } else if (FILE_EXTENSIONS.IMAGE.test(path)) {
      imageInputs.push({ trackInfo, originalIndex });
    } else if (FILE_EXTENSIONS.AUDIO.test(path)) {
      audioInputs.push({ trackInfo, originalIndex });
    }
  });

  console.log(`📊 Input counts: videos=${videoInputs.length}, images=${imageInputs.length}, audio=${audioInputs.length}`);

  // Build video timeline with layering
  let videoSegments = buildLayeredVideoTimeline(videoInputs, imageInputs, targetFrameRate);
  
  // Build audio timeline (simpler, no layering)
  let audioSegments = buildAudioTimeline(audioInputs, targetFrameRate);

  // Fill gaps in the timeline where there's no content
  videoSegments = fillTimelineGaps(videoSegments, targetFrameRate, 'video');
  audioSegments = fillTimelineGaps(audioSegments, targetFrameRate, 'audio');

  const videoTotalDuration = videoSegments.length > 0 
    ? Math.max(...videoSegments.map(s => s.endTime))
    : 0;
  
  const audioTotalDuration = audioSegments.length > 0
    ? Math.max(...audioSegments.map(s => s.endTime))
    : 0;

  return {
    video: {
      segments: videoSegments,
      totalDuration: videoTotalDuration,
      timelineType: 'video',
    },
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
  const sortedSegments = [...segments].sort((a, b) => a.startTime - b.startTime);
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
      console.log(`🕳️ Found ${timelineType} gap: ${currentTime.toFixed(2)}s-${segment.startTime.toFixed(2)}s (${gapDuration.toFixed(2)}s)`);
      
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
      console.log(`🔧 Adjusting segment to eliminate tiny gap of ${gapDuration.toFixed(4)}s`);
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

  console.log(`✅ ${timelineType} timeline after filling gaps: ${filledSegments.length} segments`);
  return filledSegments;
}

/**
 * Builds layered video timeline where images overlay videos
 * Creates a continuous timeline with proper layering priority
 */
function buildLayeredVideoTimeline(
  videoInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }>,
  imageInputs: Array<{ trackInfo: TrackInfo; originalIndex: number }>,
  targetFrameRate: number,
): ProcessedTimelineSegment[] {
  const segments: ProcessedTimelineSegment[] = [];

  // Combine all visual inputs with their timeline positions and layer priority
  const allVisualInputs = [
    ...videoInputs.map(v => ({ ...v, isImage: false, layer: 0 })), // Videos on bottom layer
    ...imageInputs.map(i => ({ ...i, isImage: true, layer: 1 })),  // Images on top layer
  ];

  // Sort by timeline start position, then by layer (images on top)
  allVisualInputs.sort((a, b) => {
    const aStart = a.trackInfo.timelineStartFrame || 0;
    const bStart = b.trackInfo.timelineStartFrame || 0;
    if (aStart !== bStart) return aStart - bStart;
    return b.layer - a.layer; // Higher layer first (images before videos)
  });

  console.log('📹 Visual inputs sorted by timeline position:');
  allVisualInputs.forEach(input => {
    const start = input.trackInfo.timelineStartFrame || 0;
    const end = input.trackInfo.timelineEndFrame || 0;
    console.log(`  ${input.isImage ? '🖼️' : '🎥'} ${input.trackInfo.path}: frames ${start}-${end} (layer ${input.layer})`);
  });

  // Determine the final timeline by resolving overlaps
  // Images hide videos when they overlap
  const resolvedSegments = resolveVideoLayerOverlaps(allVisualInputs, targetFrameRate);

  return resolvedSegments;
}

/**
 * Resolves overlapping video/image segments
 * Images take priority - videos are cut/hidden where images exist
 * Creates a flat timeline suitable for concat
 */
function resolveVideoLayerOverlaps(
  visualInputs: Array<{ trackInfo: TrackInfo; originalIndex: number; isImage: boolean; layer: number }>,
  targetFrameRate: number,
): ProcessedTimelineSegment[] {
  // Separate videos and images
  const videos = visualInputs.filter(v => !v.isImage);
  const images = visualInputs.filter(v => v.isImage);

  console.log(`🎬 Resolving overlaps: ${videos.length} videos, ${images.length} images`);

  // Build a timeline by determining what should be visible at each point
  // Images take priority over videos
  const timeline: Array<{
    startTime: number;
    endTime: number;
    content: { trackInfo: TrackInfo; originalIndex: number; isImage: boolean };
  }> = [];

  // First, add all image segments (they have priority)
  images.forEach(image => {
    const startFrame = image.trackInfo.timelineStartFrame || 0;
    const endFrame = image.trackInfo.timelineEndFrame || 0;
    timeline.push({
      startTime: startFrame / targetFrameRate,
      endTime: endFrame / targetFrameRate,
      content: image,
    });
  });

  // Then, add video segments, but cut them where images exist
  videos.forEach(video => {
    const startFrame = video.trackInfo.timelineStartFrame || 0;
    const endFrame = video.trackInfo.timelineEndFrame || 0;
    const videoStart = startFrame / targetFrameRate;
    const videoEnd = endFrame / targetFrameRate;

    // Check if this video overlaps with any images
    const overlappingImages = images.filter(img => {
      const imgStart = (img.trackInfo.timelineStartFrame || 0) / targetFrameRate;
      const imgEnd = (img.trackInfo.timelineEndFrame || 0) / targetFrameRate;
      // Check if there's any overlap
      return imgStart < videoEnd && imgEnd > videoStart;
    });

    if (overlappingImages.length === 0) {
      // No overlap - add the full video segment
      timeline.push({
        startTime: videoStart,
        endTime: videoEnd,
        content: video,
      });
      console.log(`📹 Video segment ${video.originalIndex}: ${videoStart.toFixed(2)}s-${videoEnd.toFixed(2)}s (no overlap)`);
    } else {
      // There are overlapping images - need to cut the video into pieces
      console.log(`📹 Video segment ${video.originalIndex} has ${overlappingImages.length} overlapping images, splitting...`);
      
      // Sort image overlaps by start time
      const sortedImageOverlaps = overlappingImages
        .map(img => ({
          start: (img.trackInfo.timelineStartFrame || 0) / targetFrameRate,
          end: (img.trackInfo.timelineEndFrame || 0) / targetFrameRate,
        }))
        .sort((a, b) => a.start - b.start);

      // Cut the video into segments around the images
      let currentVideoTime = videoStart;
      
      for (const imageOverlap of sortedImageOverlaps) {
        // Add video segment before this image (if there is one)
        if (currentVideoTime < imageOverlap.start) {
          const segmentDuration = imageOverlap.start - currentVideoTime;
          const sourceOffset = (video.trackInfo.startTime || 0) + (currentVideoTime - videoStart);
          
          // Create modified trackInfo with adjusted source trim
          const modifiedTrackInfo: TrackInfo = {
            ...video.trackInfo,
            startTime: sourceOffset,
            duration: segmentDuration,
          };
          
          timeline.push({
            startTime: currentVideoTime,
            endTime: imageOverlap.start,
            content: { ...video, trackInfo: modifiedTrackInfo },
          });
          console.log(`  📹 Video piece: ${currentVideoTime.toFixed(2)}s-${imageOverlap.start.toFixed(2)}s (source: ${sourceOffset.toFixed(2)}s, duration: ${segmentDuration.toFixed(2)}s)`);
        }
        
        // Skip the image overlap region
        currentVideoTime = Math.max(currentVideoTime, imageOverlap.end);
      }

      // Add remaining video segment after all images (if there is one)
      if (currentVideoTime < videoEnd) {
        const segmentDuration = videoEnd - currentVideoTime;
        const sourceOffset = (video.trackInfo.startTime || 0) + (currentVideoTime - videoStart);
        
        // Create modified trackInfo with adjusted source trim
        const modifiedTrackInfo: TrackInfo = {
          ...video.trackInfo,
          startTime: sourceOffset,
          duration: segmentDuration,
        };
        
        timeline.push({
          startTime: currentVideoTime,
          endTime: videoEnd,
          content: { ...video, trackInfo: modifiedTrackInfo },
        });
        console.log(`  📹 Video piece: ${currentVideoTime.toFixed(2)}s-${videoEnd.toFixed(2)}s (source: ${sourceOffset.toFixed(2)}s, duration: ${segmentDuration.toFixed(2)}s)`);
      }
    }
  });

  // Sort timeline by start time
  timeline.sort((a, b) => a.startTime - b.startTime);

  // Convert to ProcessedTimelineSegment format
  const segments: ProcessedTimelineSegment[] = timeline.map(item => {
    const { trackInfo, originalIndex, isImage } = item.content;
    const duration = item.endTime - item.startTime;
    const segmentInput: TrackInfo = { ...trackInfo, isImage };
    
    console.log(
      `${isImage ? '🖼️' : '📹'} Final segment ${originalIndex}: ${item.startTime.toFixed(2)}s-${item.endTime.toFixed(2)}s (${duration.toFixed(2)}s)`,
    );

    return {
      input: segmentInput,
      originalIndex,
      startTime: item.startTime,
      duration,
      endTime: item.endTime,
      timelineType: 'video',
    };
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
 * Generate drawtext filters for text clips
 * Converts text clip data into FFmpeg drawtext filter strings
 */
function generateDrawtextFilters(
  textClips: TextClipData[],
  fps: number,
  videoDimensions: { width: number; height: number },
): string {
  console.log('🎨 generateDrawtextFilters called:', {
    textClipsCount: textClips?.length || 0,
    fps,
    videoDimensions,
  });
  
  if (!textClips || textClips.length === 0) {
    console.log('⚠️ No text clips provided to generateDrawtextFilters');
    return '';
  }

  const filters: string[] = [];

  for (const clip of textClips) {
    console.log('🎨 Processing text clip:', {
      id: clip.id,
      content: clip.content,
      startFrame: clip.startFrame,
      endFrame: clip.endFrame,
    });
    const { content, startFrame, endFrame, style, transform } = clip;

    // Convert frames to seconds
    const startTime = startFrame / fps;
    const endTime = endFrame / fps;

    // Convert normalized coordinates (-1 to 1) to pixel coordinates
    // x: -1 = left edge, 0 = center, 1 = right edge
    // y: -1 = top edge, 0 = center, 1 = bottom edge
    const centerX = videoDimensions.width / 2;
    const centerY = videoDimensions.height / 2;
    
    // Calculate base position
    const basePixelX = Math.round(centerX + (transform.x * centerX));
    const basePixelY = Math.round(centerY + (transform.y * centerY));
    
    // Adjust for text alignment (FFmpeg drawtext uses top-left corner by default)
    // We need to offset to center the text at the specified position
    const textAlign = style.textAlign || 'center';
    let pixelX: string | number;
    let pixelY: string | number;
    
    if (textAlign === 'center') {
      pixelX = `(w-text_w)/2+${basePixelX - centerX}`;
      pixelY = `(h-text_h)/2+${basePixelY - centerY}`;
    } else if (textAlign === 'right') {
      pixelX = `w-text_w-${videoDimensions.width - basePixelX}`;
      pixelY = basePixelY;
    } else {
      // 'left' alignment
      pixelX = basePixelX;
      pixelY = basePixelY;
    }

    // Convert rotation from degrees to radians
    const rotationRadians = (transform.rotation * Math.PI) / 180;

    // Build font styling
    const fontSize = style.fontSize;
    const scaledFontSize = Math.round(fontSize * transform.scale);
    const fontFamily = style.fontFamily?.replace(/['"]/g, '') || 'Arial';
    
    // Get font path using font mapper
    const isBold = style.isBold || false;
    const isItalic = style.isItalic || false;
    const fontPath = getFontPathByStyle(fontFamily, isBold, isItalic);
    
    console.log(`🎨 Font mapping for "${fontFamily}" (bold: ${isBold}, italic: ${isItalic}): ${fontPath}`);

    // Parse colors (convert hex/rgba to FFmpeg format)
    const fillColor = parseColorForFFmpeg(style.fillColor || '#FFFFFF');
    const strokeColor = parseColorForFFmpeg(style.strokeColor || '#000000');
    const bgColor = parseColorForFFmpeg(style.backgroundColor || 'rgba(0,0,0,0)');

    // Calculate opacity (0-100 to 0.0-1.0)
    const opacity = (style.opacity !== undefined ? style.opacity : 100) / 100;

    // Escape text for FFmpeg
    const escapedText = content
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\n/g, '\\n');

    // Build drawtext filter with enable expression for timing
    let drawtextFilter = `drawtext=text='${escapedText}'`;
    
    // Use the dynamic font path with proper escaping for FFmpeg
    const escapedFontPath = convertToFfmpegPath(fontPath);
    drawtextFilter += `:fontfile='${escapedFontPath}'`;
    
    drawtextFilter += `:fontsize=${scaledFontSize}`;
    drawtextFilter += `:fontcolor=${fillColor}@${opacity}`;
    
    // Handle x,y as either numbers or expressions
    if (typeof pixelX === 'string') {
      drawtextFilter += `:x='${pixelX}'`;
    } else {
      drawtextFilter += `:x=${pixelX}`;
    }
    
    if (typeof pixelY === 'string') {
      drawtextFilter += `:y='${pixelY}'`;
    } else {
      drawtextFilter += `:y=${pixelY}`;
    }
    
    // Add border/stroke if specified
    if (style.strokeColor && style.strokeColor !== 'transparent') {
      drawtextFilter += `:borderw=2`;
      drawtextFilter += `:bordercolor=${strokeColor}`;
    }

    // Add background box if specified
    if (style.backgroundColor && style.backgroundColor !== 'transparent' && !style.backgroundColor.includes('rgba(0, 0, 0, 0)')) {
      drawtextFilter += `:box=1`;
      drawtextFilter += `:boxcolor=${bgColor}`;
      drawtextFilter += `:boxborderw=5`;
    }

    // Add shadow if specified
    if (style.hasShadow) {
      drawtextFilter += `:shadowx=2`;
      drawtextFilter += `:shadowy=2`;
      drawtextFilter += `:shadowcolor=black@0.5`;
    }

    // Add rotation
    if (rotationRadians !== 0) {
      drawtextFilter += `:text_angle=${rotationRadians}`;
    }

    // Add timing enable expression
    drawtextFilter += `:enable='between(t,${startTime},${endTime})'`;

    filters.push(drawtextFilter);

    console.log(`📝 Generated drawtext filter for text clip "${content}": ${startTime}s - ${endTime}s`);
  }

  return filters.join(',');
}

/**
 * Parse color from hex/rgba format to FFmpeg format
 */
function parseColorForFFmpeg(color: string): string {
  // Handle hex colors
  if (color.startsWith('#')) {
    return color; // FFmpeg supports hex colors directly
  }

  // Handle rgba colors
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const [, r, g, b] = rgbaMatch;
    // Convert to hex
    const hexR = parseInt(r).toString(16).padStart(2, '0');
    const hexG = parseInt(g).toString(16).padStart(2, '0');
    const hexB = parseInt(b).toString(16).padStart(2, '0');
    return `#${hexR}${hexG}${hexB}`;
  }

  // Default to white
  return '#FFFFFF';
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
    
    console.log(`📐 Checking input: ${path}, isVideo: ${FILE_EXTENSIONS.VIDEO.test(path)}, width: ${trackInfo.width}, height: ${trackInfo.height}`);
    
    if (!isGapInput(path) && FILE_EXTENSIONS.VIDEO.test(path)) {
      // Found a video file - check if it has explicit dimensions
      if (trackInfo.width && trackInfo.height) {
        console.log(`📐 ✅ Using video input dimensions from inputs: ${trackInfo.width}x${trackInfo.height}`);
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
        console.log(`📐 Using video input dimensions from timeline: ${segment.input.width}x${segment.input.height}`);
        return { width: segment.input.width, height: segment.input.height };
      }
    }
  }

  // Fallback to job's video dimensions
  const dimensions = job.videoDimensions || VIDEO_DEFAULTS.SIZE;
  console.log(`📐 Using project dimensions (fallback): ${dimensions.width}x${dimensions.height}`);
  return dimensions;
}

/**
 * Builds filter complex for separate video and audio timelines - FIXED VERSION
 */
function buildSeparateTimelineFilterComplex(
  videoTimeline: ProcessedTimeline,
  audioTimeline: ProcessedTimeline,
  job: VideoEditJob,
  categorizedInputs: CategorizedInputs,
): string {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  const videoConcatInputs: string[] = [];
  const audioConcatInputs: string[] = [];

  // Determine target dimensions (prioritize video input dimensions)
  const targetDimensions = determineTargetDimensions(videoTimeline, job);

  console.log('🎬 Building filter complex from timelines:');
  console.log('📝 Text clips in job:', job.textClips?.length || 0);
  console.log(
    'Video segments:',
    videoTimeline.segments.map(
      (s) =>
        `${s.input.path} [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s]`,
    ),
  );
  console.log(
    'Audio segments:',
    audioTimeline.segments.map(
      (s) =>
        `${s.input.path} [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s]`,
    ),
  );

  // Process video timeline segments IN ORDER
  videoTimeline.segments.forEach((segment, segmentIndex) => {
    const { input: trackInfo, originalIndex, timelineType } = segment;

    if (isGapInput(trackInfo.path)) {
      // Video gap - create black video using target dimensions
      const targetFps = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
      const gapResult = createGapVideoFilters(
        segmentIndex, // Use segment index to avoid conflicts
        trackInfo.duration || 1,
        targetFps,
        targetDimensions,
      );
      videoFilters.push(...gapResult.filters);
      videoConcatInputs.push(gapResult.filterRef);
      console.log(`🎬 Added video gap: ${gapResult.filterRef}`);
    } else {
      // Regular video file - find the original file index
      const fileIndex = findFileIndexForSegment(
        segment,
        categorizedInputs,
        'video',
      );

      if (fileIndex !== undefined) {
        console.log(
          `🎬 Processing video segment ${segmentIndex} with fileIndex ${fileIndex}`,
        );

        const context: VideoProcessingContext = {
          trackInfo,
          originalIndex: segmentIndex,
          fileIndex,
          inputStreamRef: `[${fileIndex}:v]`,
        };

        const trimResult = createVideoTrimFilters(context);

        if (trimResult.filters.length > 0) {
          videoFilters.push(...trimResult.filters);
        }

        // Apply FPS normalization if needed
        let videoStreamRef = trimResult.filterRef;

        if (job.operations.normalizeFrameRate) {
          const targetFps =
            job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
          const fpsResult = createFpsNormalizationFilters(
            segmentIndex,
            videoStreamRef,
            targetFps,
          );
          videoFilters.push(...fpsResult.filters);
          videoStreamRef = fpsResult.filterRef;
        }

        // Scale to match target dimensions if needed (for images and videos with different dimensions)
        const isImage = FILE_EXTENSIONS.IMAGE.test(trackInfo.path);
        const isVideoFile = FILE_EXTENSIONS.VIDEO.test(trackInfo.path);
        
        // For images, always scale to match target dimensions
        // For videos, only scale if dimensions are explicitly different
        const needsScaling = isImage || 
          (isVideoFile && trackInfo.width && trackInfo.height && 
           (trackInfo.width !== targetDimensions.width || 
            trackInfo.height !== targetDimensions.height));

        if (needsScaling) {
          const scaleRef = `[v${segmentIndex}_scaled]`;
          videoFilters.push(
            `${videoStreamRef}scale=${targetDimensions.width}:${targetDimensions.height}:force_original_aspect_ratio=decrease,pad=${targetDimensions.width}:${targetDimensions.height}:(ow-iw)/2:(oh-ih)/2:black${scaleRef}`
          );
          videoStreamRef = scaleRef;
          console.log(`📐 Scaled segment ${segmentIndex} to ${targetDimensions.width}x${targetDimensions.height}`);
        }

        videoConcatInputs.push(videoStreamRef);
      } else {
        console.warn(
          `❌ Could not find file index for video segment ${segmentIndex}`,
        );
      }
    }
  });

  // Process audio timeline segments IN ORDER
  audioTimeline.segments.forEach((segment, segmentIndex) => {
    const { input: trackInfo } = segment;

    console.log(
      `🎵 Processing audio segment ${segmentIndex}: ${trackInfo.path} [${segment.startTime.toFixed(2)}s-${segment.endTime.toFixed(2)}s]`,
    );

    if (isGapInput(trackInfo.path)) {
      // Audio gap - create silent audio
      const silentResult = createSilentAudioFilters(
        segmentIndex, // Use segment index to avoid conflicts
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

  // Build concatenation filters
  let videoConcatFilter = '';
  let audioConcatFilter = '';

  if (videoConcatInputs.length > 0) {
    if (videoConcatInputs.length === 1) {
      // Single input - no concatenation needed, just rename to temp stream
      const inputRef = videoConcatInputs[0].replace('[', '').replace(']', '');
      videoConcatFilter = `[${inputRef}]null[video_base]`;
    } else {
      // Multiple inputs - use concat filter, output to temp stream
      videoConcatFilter = `${videoConcatInputs.join('')}concat=n=${videoConcatInputs.length}:v=1:a=0[video_base]`;
    }
  }

  if (audioConcatInputs.length > 0) {
    if (audioConcatInputs.length === 1) {
      // Single audio input - no concatenation needed, use anull passthrough
      const inputRef = audioConcatInputs[0].replace('[', '').replace(']', '');
      audioConcatFilter = `[${inputRef}]anull[audio]`;
    } else {
      // Multiple inputs - use concat filter
      audioConcatFilter = `${audioConcatInputs.join('')}concat=n=${audioConcatInputs.length}:v=0:a=1[audio]`;
    }
  }

  // Apply subtitles to video stream if needed (must be in filter_complex)
  let subtitleFilter = '';
  let currentVideoLabel = 'video_base';
  
  if (job.operations.subtitles && videoConcatFilter) {
    const ffmpegPath = convertToFfmpegPath(job.operations.subtitles);
    const fileExtension = job.operations.subtitles.toLowerCase().split('.').pop();
    
    if (fileExtension === 'ass' || fileExtension === 'ssa') {
      // Use 'ass' filter for ASS/SSA files (better performance)
      subtitleFilter = `[video_base]ass='${ffmpegPath}'[video_subtitled]`;
      console.log('📝 Added ASS subtitle filter to filter_complex (optimized for ASS format)');
    } else {
      // Use 'subtitles' filter for other formats (SRT, VTT, etc.)
      subtitleFilter = `[video_base]subtitles='${ffmpegPath}'[video_subtitled]`;
      console.log(`📝 Added subtitles filter to filter_complex (format: ${fileExtension})`);
    }
    currentVideoLabel = 'video_subtitled';
  }

  // Apply text clips using drawtext filters (separate from subtitles)
  let textClipFilter = '';
  console.log('🔍 Text clip check:', {
    hasTextClips: !!job.textClips,
    textClipsLength: job.textClips?.length || 0,
    hasVideoConcatFilter: !!videoConcatFilter,
    currentVideoLabel,
  });
  
  if (job.textClips && job.textClips.length > 0 && videoConcatFilter) {
    const fps = job.operations.targetFrameRate || 30;
    const dimensions = job.videoDimensions || { width: 1920, height: 1080 };
    
    console.log('📝 Generating drawtext filters for text clips:', {
      count: job.textClips.length,
      fps,
      dimensions,
    });
    
    const drawtextFilters = generateDrawtextFilters(job.textClips, fps, dimensions);
    
    console.log('📝 Generated drawtext filters:', drawtextFilters);
    
    if (drawtextFilters) {
      textClipFilter = `[${currentVideoLabel}]${drawtextFilters}[video]`;
      console.log(`✅ Added ${job.textClips.length} text clip drawtext filters to filter_complex`);
    } else {
      // No valid drawtext filters, just pass through
      textClipFilter = `[${currentVideoLabel}]null[video]`;
      console.log('⚠️ No valid drawtext filters generated, using null passthrough');
    }
  } else if (videoConcatFilter) {
    // No text clips - just rename current label to video
    textClipFilter = `[${currentVideoLabel}]null[video]`;
    console.log('ℹ️ No text clips, using null passthrough');
  }

  // Combine all filters
  const allFilters = [...videoFilters, ...audioFilters];
  if (videoConcatFilter) allFilters.push(videoConcatFilter);
  if (audioConcatFilter) allFilters.push(audioConcatFilter);
  if (subtitleFilter) allFilters.push(subtitleFilter);
  if (textClipFilter) allFilters.push(textClipFilter);

  const filterComplex = allFilters.join(';');

  return filterComplex;
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
    audioFilter = `anullsrc=channel_layout=${AUDIO_DEFAULTS.CHANNEL_LAYOUT}:sample_rate=${AUDIO_DEFAULTS.SAMPLE_RATE}[temp_muted];[temp_muted]atrim=duration=${duration}[outa]`;
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
 * Builds and processes separate video and audio timelines
 */
function handleTimelineProcessing(
  job: VideoEditJob,
  targetFrameRate: number,
): {
  finalVideoTimeline: ProcessedTimeline;
  finalAudioTimeline: ProcessedTimeline;
  categorizedInputs: CategorizedInputs;
} {
  // Build separate initial timelines (now with automatic gap filling based on timeline positions)
  const initialTimelines = buildSeparateTimelines(job.inputs, targetFrameRate);

  // Use the timelines as-is (gaps are already filled based on timeline positions)
  const finalVideoTimeline = initialTimelines.video;
  const finalAudioTimeline = initialTimelines.audio;

  // NOTE: We no longer use job.gaps here because gaps are now calculated
  // based on actual timeline coverage from timelineStartFrame/timelineEndFrame

  console.log(
    'Final Video Timeline:',
    finalVideoTimeline.segments.map(
      (s) =>
        `${s.input.path}${s.input.gapType ? ` (${s.input.gapType} gap)` : ''} [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s]`,
    ),
  );
  console.log(
    'Final Audio Timeline:',
    finalAudioTimeline.segments.map(
      (s) =>
        `${s.input.path}${s.input.gapType ? ` (${s.input.gapType} gap)` : ''} [${s.startTime.toFixed(2)}s-${s.endTime.toFixed(2)}s]`,
    ),
  );

  // Log text clips if present
  if (job.textClips && job.textClips.length > 0) {
    console.log('📝 Text Clips:');
    job.textClips.forEach((clip, index) => {
      const startTime = clip.startFrame / targetFrameRate;
      const endTime = clip.endFrame / targetFrameRate;
      console.log(
        `  ${index + 1}. "${clip.content}" [${startTime.toFixed(2)}s-${endTime.toFixed(2)}s] (${clip.type}) - pos: (${clip.transform.x.toFixed(2)}, ${clip.transform.y.toFixed(2)}), scale: ${clip.transform.scale}, rotation: ${clip.transform.rotation}°`,
      );
    });
  } else {
    console.log('📝 No text clips in this job');
  }

  // Categorize inputs for file indexing
  const categorizedInputs = categorizeInputs(job.inputs);

  return { finalVideoTimeline, finalAudioTimeline, categorizedInputs };
}

/**
 * Builds and applies filter complex to command
 */
function handleFilterComplex(
  job: VideoEditJob,
  cmd: CommandParts,
  videoTimeline: ProcessedTimeline,
  audioTimeline: ProcessedTimeline,
  categorizedInputs: CategorizedInputs,
  hwAccel: HardwareAcceleration | null,
): void {
  let filterComplex = buildSeparateTimelineFilterComplex(
    videoTimeline,
    audioTimeline,
    job,
    categorizedInputs,
  );

  if (filterComplex) {
    // Add hardware upload filter for VAAPI if needed
    if (hwAccel?.type === 'vaapi') {
      console.log('🎮 Adding VAAPI hardware upload filter');
      filterComplex +=
        ';[video]format=nv12,hwupload=extra_hw_frames=64:derive_device=vaapi[video_hw]';
      cmd.args.push('-filter_complex', filterComplex);
      cmd.args.push('-map', '[video_hw]', '-map', '[audio]');
    } else {
      cmd.args.push('-filter_complex', filterComplex);
      cmd.args.push('-map', '[video]', '-map', '[audio]');
    }
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
  cmd.args.push('-crf', '29');
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

  // Step 2: Build and process timelines with gaps
  const { finalVideoTimeline, finalAudioTimeline, categorizedInputs } =
    handleTimelineProcessing(job, targetFrameRate);

  // Step 3: Build and apply filter complex (includes subtitles)
  handleFilterComplex(
    job,
    cmd,
    finalVideoTimeline,
    finalAudioTimeline,
    categorizedInputs,
    hwAccel,
  );

  // Step 4: Apply encoding settings with hardware acceleration
  handleEncodingSettings(job, cmd, hwAccel);
  handlePreset(job, cmd, hwAccel);
  handleThreads(job, cmd);

  // Step 5: Add output file
  handleOutput(job, cmd, location);

  console.log('Full FFmpeg Command:', ['ffmpeg', ...cmd.args].join(' '));
  return cmd.args;
}

// TODO: DELETE IF NOT NEEDED
// -------------------------
// Helpers
// -------------------------

// Test function for debugging command generation
export async function testConcatCommand() {
  const testJob: VideoEditJob = {
    inputs: ['video1.mp4', 'video2.mp4'],
    output: 'output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  const command = await buildFfmpegCommand(testJob);
  console.log('🧪 Test Concat Command:', command.join(' '));
  return command;
}

// Test function for mixed video/audio inputs (audio replacement)
export async function testAudioReplacementCommand() {
  const testJob: VideoEditJob = {
    inputs: ['video1.mp4', 'audio1.mp3', 'video2.mp4'],
    output: 'output.mp4',
    operations: {
      concat: true,
      normalizeFrameRate: true,
      targetFrameRate: 30,
    },
  };

  const command = await buildFfmpegCommand(testJob);
  console.log('🎵 Test Audio Replacement Command:', command.join(' '));
  return command;
}

// Test function for track trimming
export async function testTrackTrimmingCommand() {
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
  const command = await buildFfmpegCommand(testJob);
  console.log('✂️ Test Track Trimming Command:', command.join(' '));
  return command;
}

// Test function for single track trimming
export async function testSingleTrackTrimming() {
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

  const command = await buildFfmpegCommand(testJob);
  console.log('🎬 Single Track Trimming:', command.join(' '));
  return command;
}

// Test function for independent audio trimming
export async function testIndependentAudioTrimming() {
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
  const command = await buildFfmpegCommand(testJob);
  console.log('🎛️ Command:', command.join(' '));
  return command;
}

// Test function for the specific export error scenario
export async function testExportErrorScenario() {
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
  const command = await buildFfmpegCommand(testJob);
  console.log('🎬 Fixed Command:', command.join(' '));

  // Validate filter complex structure
  const filterIndex = command.indexOf('-filter_complex');
  if (filterIndex !== -1 && filterIndex + 1 < command.length) {
    const filterComplex = command[filterIndex + 1];

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
export async function testEncodingPresets() {
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
  const command = await buildFfmpegCommand(testJob);
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
export async function testAllPresets() {
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

  for (const preset of presets) {
    const testJob: VideoEditJob = {
      inputs: ['input.mp4'],
      output: `output_${preset}.mp4`,
      operations: {
        preset,
      },
    };

    const command = await buildFfmpegCommand(testJob);
    const presetIndex = command.indexOf('-preset');
    const appliedPreset =
      presetIndex !== -1 ? command[presetIndex + 1] : 'NOT_FOUND';
    console.log(`  ${preset.padEnd(10)} → ${appliedPreset}`);
  }
}
