import * as fs from 'fs';
import {
  CategorizedInputs,
  CommandParts,
  ProcessedTimeline,
  ProcessedTimelineSegment,
  TrackInfo,
  VideoEditJob,
  VideoProcessingContext,
  AudioTrimResult,
} from '../schema/ffmpegConfig';
import { getFontDirectoriesForFamilies } from '../subtitles/fontMapper';
import { generateDrawtextFilter } from '../subtitles/textLayers';
import type { HardwareAcceleration } from './hardwareAccelerationDetector';
import {
  collectAllLayers,
  sortLayersByNumber,
  calculateTotalVideoDuration,
  findBottomMostVideoImageLayer,
  buildOverlayOrder,
  type LayerTrack,
  type OverlayItem,
} from './layerHandling';
import {
  buildScaleFilter,
  buildOverlayFilter,
  buildCropFilter,
  buildAspectRatioScaleFilter,
  buildGPUUpload,
  buildGPUDownload,
  isNVENCAvailable,
  supportsCUDAFilters,
  getHardwareAccelerationStatus,
} from './hardwareFilters';

const VIDEO_DEFAULTS = {
  SIZE: { width: 1920, height: 1080 },
  FPS: 30,
} as const;

const GAP_MARKER = '__GAP__' as const;

const FILE_EXTENSIONS = {
  VIDEO: /\.(mp4|mov|mkv|avi|webm)$/i,
  AUDIO: /\.(mp3|wav|aac|flac)$/i,
  IMAGE: /\.(png|jpg|jpeg|gif|bmp|tiff|webp)$/i,
} as const;

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
 * Escapes path for FFmpeg filter syntax
 */
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
 * Find file index for a segment in categorized inputs
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
  hwAccel: HardwareAcceleration | null,
  createGapVideoFilters: (
    originalIndex: number,
    duration: number,
    targetFps: number,
    videoDimensions: { width: number; height: number },
  ) => AudioTrimResult,
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
    const scaleFilter = buildScaleFilter(
      videoStreamRef,
      normalizedVideoRef,
      targetDimensions.width,
      targetDimensions.height,
      hwAccel,
      { forceOriginalAspectRatio: 'decrease', pad: true, padColor: 'black' },
    );
    videoFilters.push(scaleFilter);
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
    const scaleFilter = buildScaleFilter(
      normalizedVideoRef,
      scaledVideoRef,
      scaledWidth,
      scaledHeight,
      hwAccel,
      { forceOriginalAspectRatio: 'decrease', pad: false },
    );
    videoFilters.push(scaleFilter);
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

  // Calculate overlay position based on transform (use original coordinates, not scaled)
  // The video is already scaled, so position offsets should use original transform values
  const transformX = trackInfo.videoTransform?.x ?? 0;
  const transformY = trackInfo.videoTransform?.y ?? 0;
  
  console.log(
    `📐 Transform values: x=${transformX.toFixed(3)}, y=${transformY.toFixed(3)}, scale=${transformScale.toFixed(2)} (normalized -1 to 1, 0=center)`,
  );
  
  // Calculate pixel coordinates for logging (using original transform values)
  const pixelOffsetX = (transformX * targetDimensions.width) / 2;
  const pixelOffsetY = (transformY * targetDimensions.height) / 2;
  const centerX = targetDimensions.width / 2;
  const centerY = targetDimensions.height / 2;
  const estimatedPixelX = Math.round(centerX + pixelOffsetX);
  const estimatedPixelY = Math.round(centerY + pixelOffsetY);
  
  // Apply transform positioning (using original coordinates, video already scaled)
  // Use proper addition/subtraction to ensure FFmpeg can parse the expression correctly
  const overlayX = transformX >= 0
    ? `(W-w)/2+${transformX}*W/2`
    : `(W-w)/2-${Math.abs(transformX)}*W/2`; // Use Math.abs to ensure proper subtraction
  const overlayY = transformY >= 0
    ? `(H-h)/2+${transformY}*H/2`
    : `(H-h)/2-${Math.abs(transformY)}*H/2`; // Use Math.abs to ensure proper subtraction

  console.log(`📍 Video overlay position (with transform):`);
  console.log(`   - Normalized: x=${transformX.toFixed(3)}, y=${transformY.toFixed(3)}`);
  console.log(`   - Scale factor: ${transformScale.toFixed(2)} (video already scaled)`);
  console.log(`   - Pixel offset: x=${pixelOffsetX.toFixed(2)}px, y=${pixelOffsetY.toFixed(2)}px`);
  console.log(`   - Estimated position: x≈${estimatedPixelX}px, y≈${estimatedPixelY}px`);
  console.log(`   - Background dimensions: ${targetDimensions.width}x${targetDimensions.height}`);
  console.log(`   - FFmpeg expression: overlay=${overlayX}:${overlayY}`);

  // Overlay the video on the background
  const overlayRef = `[${uniqueIndex}_overlay]`;
  const overlayFilter = buildOverlayFilter(
    blackBgRef,
    scaledVideoRef,
    overlayRef,
    overlayX,
    overlayY,
    hwAccel,
  );
  videoFilters.push(overlayFilter);
  
  console.log(`✅ Video overlaid on background at transform position (x=${transformX.toFixed(3)}, y=${transformY.toFixed(3)}, scale=${transformScale.toFixed(2)})`);
  console.log(`✅ Output dimensions: ${targetDimensions.width}x${targetDimensions.height} (ready for concat)`);

  // Return the overlay - it's already at targetDimensions and ready for concatenation
  return overlayRef;
}

/**
 * Processes a single layer's timeline segments and returns concat inputs
 * OPTIMIZED: Only trim clips and generate gaps before concat
 * FPS, setsar, overlay are applied AFTER concat
 */
export function processLayerSegments(
  timeline: ProcessedTimeline,
  layerIndex: number,
  layerType: 'video' | 'image',
  categorizedInputs: CategorizedInputs,
  job: VideoEditJob,
  targetDimensions: { width: number; height: number },
  targetFps: number,
  videoFilters: string[],
  hwAccel: HardwareAcceleration | null,
  createGapVideoFilters: (
    originalIndex: number,
    duration: number,
    targetFps: number,
    videoDimensions: { width: number; height: number },
  ) => AudioTrimResult,
  createVideoTrimFilters: (context: VideoProcessingContext) => AudioTrimResult,
  createFpsNormalizationFilters: (
    originalIndex: number,
    inputRef: string,
    targetFps: number,
  ) => AudioTrimResult,
  createSarNormalizationFilters: (
    originalIndex: number,
    inputRef: string,
  ) => AudioTrimResult,
  isBottomLayer: boolean = false, // Whether this is the bottom-most layer
): string[] {
  const concatInputs: string[] = [];

  timeline.segments.forEach((segment, segmentIndex) => {
    const { input: trackInfo, originalIndex } = segment;
    const uniqueIndex = `${layerType}_L${layerIndex}_${segmentIndex}`;

    if (isGapInput(trackInfo.path)) {
      // Gap handling: Only create black video clips for bottom-most layer
      // Upper layers should skip gaps (they'll be transparent where there's no content)
      if (isBottomLayer) {
        // Bottom layer - create black video for gaps (serves as background)
        const gapResult = createGapVideoFilters(
          9000 + layerIndex * 1000 + segmentIndex,
          trackInfo.duration || 1,
          targetFps,
          targetDimensions,
        );
        videoFilters.push(...gapResult.filters);
        concatInputs.push(gapResult.filterRef);
        console.log(
          `🎬 Layer ${layerIndex} (${layerType}): Added black gap ${gapResult.filterRef} (bottom layer)`,
        );
      } else {
        // Upper layer - skip gaps (will be transparent)
        console.log(
          `🎬 Layer ${layerIndex} (${layerType}): Skipping gap (upper layer - will be transparent)`,
        );
      }
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

        // Create a modified trackInfo with the correct startTime and duration for trimming
        // trackInfo.startTime is the source video position (where to start reading from source file)
        // segment.startTime is the timeline position (when the segment appears in output video)
        // If trackInfo.startTime is undefined, default to 0 (start of source video)
        const trimStartTime = trackInfo.startTime !== undefined 
          ? trackInfo.startTime 
          : 0; // Default to start of source video if not specified
        const trimDuration = trackInfo.duration !== undefined 
          ? trackInfo.duration 
          : segment.duration; // Use segment duration for trimming
        
        const modifiedTrackInfo: TrackInfo = {
          ...trackInfo,
          startTime: trimStartTime,
          duration: trimDuration,
        };

        console.log(
          `   🔪 Trim from source video: start=${trimStartTime.toFixed(3)}s, duration=${trimDuration.toFixed(3)}s (timeline: ${segment.startTime.toFixed(3)}s-${segment.endTime.toFixed(3)}s)`,
        );
        if (trackInfo.startTime === undefined) {
          console.log(
            `   ⚠️ trackInfo.startTime is undefined - defaulting to 0 (start of source video). If segments should show different parts, ensure trackInfo.startTime is set correctly.`,
          );
        }

        const context: VideoProcessingContext = {
          trackInfo: modifiedTrackInfo,
          originalIndex: 9000 + layerIndex * 1000 + segmentIndex,
          fileIndex,
          inputStreamRef: `[${fileIndex}:v]`,
        };

        const trimResult = createVideoTrimFilters(context);

        if (trimResult.filters.length > 0) {
          videoFilters.push(...trimResult.filters);
        }

        let videoStreamRef = trimResult.filterRef;

        // ✅ OPTIMIZATION: Don't apply FPS per-segment
        // FPS will be applied AFTER concat for better performance
        // However, setsar MUST be applied before concat for compatibility
        
        const isVideoFile = FILE_EXTENSIONS.VIDEO.test(trackInfo.path);
        const isImageFile = FILE_EXTENSIONS.IMAGE.test(trackInfo.path);
        
        // Check if this video has a non-zero transform position
        const hasTransform = isVideoFile && hasNonZeroTransform(trackInfo);

        if (hasTransform) {
          // Video has non-zero transform
          if (isBottomLayer) {
            // Bottom layer - always use overlay on black background
            const duration = trackInfo.duration || segment.duration || 1;
            videoStreamRef = createBlackBackgroundWithOverlay(
              videoStreamRef,
              trackInfo,
              targetDimensions,
              uniqueIndex,
              videoFilters,
              duration,
              targetFps,
              hwAccel,
              createGapVideoFilters,
            );
            console.log(
              `📐 Layer ${layerIndex}: Created black background overlay for video with transform (base layer)`,
            );
          } else {
            // Upper layer - don't create black background, just scale/position the video
            // The video will be transparent where there's no content, overlaying on the bottom layer
            
            // Step 1: Normalize to target dimensions if needed
            const sourceWidth = trackInfo.width || targetDimensions.width;
            const sourceHeight = trackInfo.height || targetDimensions.height;
            const needsNormalization = 
              sourceWidth !== targetDimensions.width || 
              sourceHeight !== targetDimensions.height;
            
            let normalizedVideoRef = videoStreamRef;
            if (needsNormalization) {
              normalizedVideoRef = `[${uniqueIndex}_normalized]`;
              const scaleFilter = buildScaleFilter(
                videoStreamRef,
                normalizedVideoRef,
                targetDimensions.width,
                targetDimensions.height,
                hwAccel,
                { forceOriginalAspectRatio: 'decrease', pad: false }, // No padding for upper layers
              );
              videoFilters.push(scaleFilter);
              console.log(
                `📐 Layer ${layerIndex}: Normalized video from ${sourceWidth}x${sourceHeight} to fit ${targetDimensions.width}x${targetDimensions.height}`,
              );
            }
            
            // Step 2: Apply transform scale factor
            const transformScale = trackInfo.videoTransform?.scale ?? 1.0;
            const scaledWidth = Math.round(targetDimensions.width * transformScale);
            const scaledHeight = Math.round(targetDimensions.height * transformScale);
            
            if (transformScale !== 1.0) {
              const scaleRef = `[${uniqueIndex}_transform_scaled]`;
              const scaleFilter = buildScaleFilter(
                normalizedVideoRef,
                scaleRef,
                scaledWidth,
                scaledHeight,
                hwAccel,
                { forceOriginalAspectRatio: 'decrease', pad: false }, // No padding for upper layers
              );
              videoFilters.push(scaleFilter);
              videoStreamRef = scaleRef;
              console.log(
                `📐 Layer ${layerIndex}: Applied transform scale ${transformScale.toFixed(2)} (${targetDimensions.width}x${targetDimensions.height} → ${scaledWidth}x${scaledHeight})`,
              );
            } else {
              videoStreamRef = normalizedVideoRef;
              console.log(
                `📐 Layer ${layerIndex}: No transform scale needed (scale = 1.0)`,
              );
            }
            // Transform positioning will be applied when overlaying this layer on the base layer
          }
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
            const scaleFilter = buildScaleFilter(
              videoStreamRef,
              scaleRef,
              targetDimensions.width,
              targetDimensions.height,
              hwAccel,
              { forceOriginalAspectRatio: 'decrease', pad: false },
            );
            videoFilters.push(scaleFilter);
            console.log(
              `📐 Layer ${layerIndex}: Scaled image from ${trackInfo.width}x${trackInfo.height} to fit ${targetDimensions.width}x${targetDimensions.height} (preserving transparency)`,
            );
            } else {
              // For videos: bottom layer gets black padding, upper layers get no padding (transparent)
              const padOption: {
                forceOriginalAspectRatio: 'decrease' | 'increase';
                pad: boolean;
                padColor?: string;
              } = isBottomLayer 
                ? { forceOriginalAspectRatio: 'decrease' as const, pad: true, padColor: 'black' }
                : { forceOriginalAspectRatio: 'decrease' as const, pad: false };
              
              const scaleFilter = buildScaleFilter(
                videoStreamRef,
                scaleRef,
                targetDimensions.width,
                targetDimensions.height,
                hwAccel,
                padOption,
              );
              videoFilters.push(scaleFilter);
              console.log(
                `📐 Layer ${layerIndex}: Scaled video segment from ${trackInfo.width}x${trackInfo.height} to ${targetDimensions.width}x${targetDimensions.height} ${isBottomLayer ? 'with black padding' : 'without padding (upper layer)'}`,
              );
            }
          videoStreamRef = scaleRef;
          }
        }

        // ⚠️ IMPORTANT: Normalize SAR BEFORE concat (required for concat compatibility)
        // The concat filter requires all inputs to have the same SAR
        // Scale/pad operations can change SAR, so we must normalize it here
        const sarRef = `[${uniqueIndex}_sar]`;
        videoFilters.push(`${videoStreamRef}setsar=1${sarRef}`);
        videoStreamRef = sarRef;
        console.log(
          `📐 Layer ${layerIndex}: Normalized SAR to 1:1 for segment ${segmentIndex} (required before concat)`,
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
  // Helper to get track info from input
  function getTrackInfo(input: string | TrackInfo): TrackInfo {
    return typeof input === 'string' ? { path: input } : input;
  }

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
export function buildSeparateTimelineFilterComplex(
  videoLayers: Map<number, ProcessedTimeline>,
  imageLayers: Map<number, ProcessedTimeline>,
  audioTimeline: ProcessedTimeline,
  job: VideoEditJob,
  categorizedInputs: CategorizedInputs,
  hwAccel: HardwareAcceleration | null,
  createGapVideoFilters: (
    originalIndex: number,
    duration: number,
    targetFps: number,
    videoDimensions: { width: number; height: number },
  ) => AudioTrimResult,
  createSilentAudioFilters: (
    originalIndex: number,
    duration: number,
  ) => AudioTrimResult,
  createAudioTrimFilters: (
    context: any,
  ) => AudioTrimResult,
  createVideoTrimFilters: (context: VideoProcessingContext) => AudioTrimResult,
  createFpsNormalizationFilters: (
    originalIndex: number,
    inputRef: string,
    targetFps: number,
  ) => AudioTrimResult,
  createSarNormalizationFilters: (
    originalIndex: number,
    inputRef: string,
  ) => AudioTrimResult,
): string {
  const videoFilters: string[] = [];
  const audioFilters: string[] = [];
  const audioConcatInputs: string[] = [];

  // Helper to get track info from input
  function getTrackInfo(input: string | TrackInfo): TrackInfo {
    return typeof input === 'string' ? { path: input } : input;
  }

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

  // Log hardware acceleration status
  const hwStatus = getHardwareAccelerationStatus(hwAccel);
  console.log(`🎮 Hardware Acceleration: ${hwStatus}`);
  
  console.log('\n🎬 ========================================');
  console.log('🎬 BUILDING FILTER COMPLEX - TRACK SUMMARY');
  console.log('🎬 ========================================\n');
  
  // Collect all tracks from job.inputs in frontend order with layer information
  interface TrackLogEntry {
    layer: number;
    type: 'video' | 'image' | 'text' | 'audio';
    name: string;
    startTime?: number;
    endTime?: number;
    duration?: number;
    path?: string;
    text?: string;
    trackInfo: TrackInfo;
    originalIndex: number;
  }
  
  const allTracks: TrackLogEntry[] = [];
  const fpsForLogging = job.operations.targetFrameRate || VIDEO_DEFAULTS.FPS;
  
  // Process job.inputs in order to preserve frontend layer order
  job.inputs.forEach((input, originalIndex) => {
    const trackInfo = getTrackInfo(input);
    const path = getInputPath(input);
    
    // Skip gaps
    if (isGapInput(path)) {
      return;
    }
    
    // Use trackRowIndex to determine layer (higher row index = higher layer)
    // Fallback to layerIndex or old layer field for backward compatibility
    const layer = trackInfo.trackRowIndex ?? trackInfo.layerIndex ?? trackInfo.layer ?? 0;
    const name = path.substring(path.lastIndexOf('/') + 1);
    
    // Calculate timeline times from frames if available
    let startTime: number | undefined;
    let endTime: number | undefined;
    let duration: number | undefined;
    
    if (trackInfo.timelineStartFrame !== undefined && trackInfo.timelineEndFrame !== undefined) {
      startTime = trackInfo.timelineStartFrame / fpsForLogging;
      endTime = trackInfo.timelineEndFrame / fpsForLogging;
      duration = endTime - startTime;
    } else if (trackInfo.duration) {
      duration = trackInfo.duration;
    }
    
    // Determine track type
    let type: 'video' | 'image' | 'text' | 'audio' = 'audio';
    if (FILE_EXTENSIONS.VIDEO.test(path)) {
      type = 'video';
    } else if (FILE_EXTENSIONS.IMAGE.test(path)) {
      type = 'image';
    } else if (trackInfo.trackType === 'text') {
      type = 'text';
    }
    
    allTracks.push({
      layer,
      type,
      name,
      startTime,
      endTime,
      duration,
      path,
      trackInfo,
      originalIndex,
    });
  });
  
  // Add text tracks from job.textClips (they're not in job.inputs)
  const textSegmentsForLogging = job.textClips ? job.textClips.filter((clip: any) => 
    clip.startTime !== undefined && clip.endTime !== undefined
  ) as any[] : [];
  
  textSegmentsForLogging.forEach((segment: any) => {
    const textPreview = segment.text.length > 50 ? segment.text.substring(0, 50) + '...' : segment.text;
    allTracks.push({
      layer: segment.layer ?? 0,
      type: 'text',
      name: `Text: "${textPreview}"`,
      startTime: segment.startTime,
      endTime: segment.endTime,
      duration: segment.endTime - segment.startTime,
      text: segment.text,
      trackInfo: {} as TrackInfo,
      originalIndex: -1, // Text tracks don't have original index
    });
  });
  
  // Sort by layer (preserving frontend order within same layer)
  allTracks.sort((a, b) => {
    if (a.layer !== b.layer) {
      return a.layer - b.layer;
    }
    // Within same layer, maintain original order (by originalIndex)
    if (a.originalIndex !== -1 && b.originalIndex !== -1) {
      return a.originalIndex - b.originalIndex;
    }
    // If startTime is available, use it as secondary sort
    if (a.startTime !== undefined && b.startTime !== undefined) {
      return a.startTime - b.startTime;
    }
    return 0;
  });
  
  // Log summary
  const tracksByType = {
    video: allTracks.filter(t => t.type === 'video').length,
    image: allTracks.filter(t => t.type === 'image').length,
    text: allTracks.filter(t => t.type === 'text').length,
    audio: allTracks.filter(t => t.type === 'audio').length,
  };
  
  console.log(`📊 Total Tracks: ${allTracks.length} (${tracksByType.video} video, ${tracksByType.image} image, ${tracksByType.text} text, ${tracksByType.audio} audio)`);
  console.log(`📊 Layers: ${new Set(allTracks.map(t => t.layer)).size} layer(s)\n`);
  
  // Log each track individually in layer order (no categorization by type)
  let currentLayer = -999;
  allTracks.forEach((track, idx) => {
    // Print layer header when layer changes
    if (track.layer !== currentLayer) {
      if (currentLayer !== -999) {
        console.log(''); // Blank line between layers
      }
      const layerTracks = allTracks.filter(t => t.layer === track.layer);
      console.log(`🎬 Layer ${track.layer} (${layerTracks.length} track(s))`);
      currentLayer = track.layer;
    }
    
    // Log individual track
    const typeIcon = {
      video: '📹',
      image: '🖼️',
      text: '📝',
      audio: '🎵',
    }[track.type];
    
    const trackNum = idx + 1;
    
    console.log(`   ${typeIcon} [${trackNum}] ${track.name}`);
    console.log(`      Type: ${track.type.toUpperCase()} | Layer: ${track.layer}`);
    
    if (track.duration !== undefined) {
      console.log(`      Duration: ${track.duration.toFixed(2)}s`);
    }
    if (track.startTime !== undefined && track.endTime !== undefined) {
      console.log(`      Timeline: ${track.startTime.toFixed(2)}s - ${track.endTime.toFixed(2)}s`);
    }
    
    // Add additional info based on type
    if (track.trackInfo) {
      if (track.trackInfo.width && track.trackInfo.height) {
        console.log(`      Dimensions: ${track.trackInfo.width}x${track.trackInfo.height}`);
      }
      if (track.trackInfo.detectedAspectRatioLabel) {
        console.log(`      Aspect Ratio: ${track.trackInfo.detectedAspectRatioLabel}`);
      }
      if (track.trackInfo.sourceFps) {
        console.log(`      Source FPS: ${track.trackInfo.sourceFps}`);
      }
    }
    if (track.text) {
      const fullText = track.text.length > 60 ? track.text.substring(0, 60) + '...' : track.text;
      console.log(`      Text: "${fullText}"`);
    }
  });
  
  console.log('\n🎬 ========================================\n');

  // Collect all layers using layer handling functions
  const allLayers = collectAllLayers(videoLayers, imageLayers, job);
  const sortedLayers = sortLayersByNumber(allLayers);
  const totalVideoDuration = calculateTotalVideoDuration(
    videoLayers,
    imageLayers,
    audioTimeline,
  );
  
  console.log(`\n🎬 Processing ${sortedLayers.length} independent layers in order:\n`);
  sortedLayers.forEach(([layerNum, track]) => {
    const types: string[] = [];
    if (track.videoTimeline) types.push(`video(${track.videoTimeline.segments.length})`);
    if (track.imageSegments) types.push(`image(${track.imageSegments.length})`);
    if (track.textSegments) types.push(`text(${track.textSegments.length})`);
    console.log(`   Layer ${layerNum}: ${types.join(', ')}`);
  });
  console.log('');

  const bottomMostVideoImageLayer = findBottomMostVideoImageLayer(sortedLayers);

  // ============================================
  // PHASE 1: Prepare all video layers first
  // ============================================
  console.log('\n📋 PHASE 1: Preparing all video layers...\n');
  const layerLabels = new Map<number, string>(); // Maps layer number to prepared layer label
  
  for (const [layerNum, track] of sortedLayers) {
    if (track.videoTimeline) {
      console.log(`   📹 Preparing video layer ${layerNum}`);
      
      const isBottomLayer = layerNum === bottomMostVideoImageLayer;
      
      const concatInputs = processLayerSegments(
        track.videoTimeline,
        layerNum,
        'video',
        categorizedInputs,
        job,
        targetDimensions,
        targetFps,
        videoFilters,
        hwAccel,
        createGapVideoFilters,
        createVideoTrimFilters,
        createFpsNormalizationFilters,
        createSarNormalizationFilters,
        isBottomLayer,
      );

      // Build concatenation filter for this layer
      if (concatInputs.length > 0) {
        let layerLabel = `layer_${layerNum}`;
        let layerLabelBeforePostProcessing = `layer_${layerNum}_raw`;
        
        if (concatInputs.length === 1) {
          const inputRef = concatInputs[0].replace('[', '').replace(']', '');
          layerLabelBeforePostProcessing = inputRef;
        } else {
          videoFilters.push(
            `${concatInputs.join('')}concat=n=${concatInputs.length}:v=1:a=0[${layerLabelBeforePostProcessing}]`,
          );
        }
        
        let postProcessedLabel = layerLabelBeforePostProcessing;
        
        // Apply FPS normalization if needed
        if (job.operations.normalizeFrameRate) {
          const fpsLabel = `layer_${layerNum}_fps`;
          videoFilters.push(`[${postProcessedLabel}]fps=${targetFps}:start_time=0[${fpsLabel}]`);
          postProcessedLabel = fpsLabel;
        }
        
        if (postProcessedLabel !== layerLabel) {
          videoFilters.push(`[${postProcessedLabel}]copy[${layerLabel}]`);
        } else {
          layerLabel = postProcessedLabel;
        }
        
        layerLabels.set(layerNum, layerLabel);
        console.log(`   ✅ Prepared video layer ${layerNum} -> [${layerLabel}]`);
      }
    }
  }

  // Pad overlay video layers with black frames ONLY at the start (not at the end)
  // This ensures videos don't start playing before their overlay is activated
  // The overlay enable expression will handle stopping the overlay when it should end
  for (const [layerNum, track] of sortedLayers) {
    if (track.videoTimeline && layerNum !== bottomMostVideoImageLayer) {
      // This is an overlay layer (not the base layer)
      const overlayStartTime = track.videoTimeline.segments.length > 0
        ? Math.min(...track.videoTimeline.segments.map(s => s.startTime))
        : 0;
      
      if (overlayStartTime > 0 && layerLabels.has(layerNum)) {
        const currentLabel = layerLabels.get(layerNum)!;
        const paddedLabel = `layer_${layerNum}_padded_start`;
        
        console.log(`   ⏱️ Padding overlay layer ${layerNum} with ${overlayStartTime.toFixed(3)}s black frames at start ONLY (no end padding)`);
        
        // Use tpad to add black frames ONLY at the start (no end_duration parameter = no end padding)
        videoFilters.push(
          `[${currentLabel}]tpad=start_duration=${overlayStartTime}:start_mode=add:color=black@0.0[${paddedLabel}]`,
        );
        
        // Update the layer label to use the padded version
        layerLabels.set(layerNum, paddedLabel);
        console.log(`   ✅ Padded overlay layer ${layerNum} -> [${paddedLabel}] (video content starts at ${overlayStartTime.toFixed(3)}s, no end padding)`);
      }
    }
  }

  // Ensure Layer 0 (base layer) extends to total video duration by padding with black clips
  // This ensures the base layer continues showing after overlays end
  if (bottomMostVideoImageLayer !== null && layerLabels.has(bottomMostVideoImageLayer)) {
    const baseLayerLabel = layerLabels.get(bottomMostVideoImageLayer)!;
    const baseLayerEntry = sortedLayers.find(([num]) => num === bottomMostVideoImageLayer);
    const baseLayerTimeline = baseLayerEntry?.[1]?.videoTimeline;
    
    if (baseLayerTimeline) {
      const baseLayerDuration = baseLayerTimeline.segments.length > 0
        ? Math.max(...baseLayerTimeline.segments.map((s: ProcessedTimelineSegment) => s.endTime))
        : 0;
      
      if (baseLayerDuration < totalVideoDuration) {
        const gapDuration = totalVideoDuration - baseLayerDuration;
        console.log(`\n   🕳️ Padding Layer ${bottomMostVideoImageLayer} (base layer) with black clip: ${baseLayerDuration.toFixed(3)}s -> ${totalVideoDuration.toFixed(3)}s (gap: ${gapDuration.toFixed(3)}s)`);
        
        // Create a black gap clip to extend the base layer
        const gapResult = createGapVideoFilters(
          99999, // High index to avoid conflicts
          gapDuration,
          targetFps,
          targetDimensions,
        );
        videoFilters.push(...gapResult.filters);
        
        // Concatenate the existing base layer with the gap clip
        const paddedBaseLabel = `layer_${bottomMostVideoImageLayer}_padded`;
        videoFilters.push(
          `[${baseLayerLabel}][${gapResult.filterRef.replace('[', '').replace(']', '')}]concat=n=2:v=1:a=0[${paddedBaseLabel}]`,
        );
        
        // Update the layer label to use the padded version
        layerLabels.set(bottomMostVideoImageLayer, paddedBaseLabel);
        console.log(`   ✅ Padded base layer ${bottomMostVideoImageLayer} -> [${paddedBaseLabel}] (extends to ${totalVideoDuration.toFixed(3)}s)`);
      }
    }
  }

  // ============================================
  // PHASE 2: Build complete overlay order
  // ============================================
  console.log('\n📋 PHASE 2: Building overlay order...\n');
  const overlayOrder = buildOverlayOrder(sortedLayers);
  
  // Update overlay items with prepared layer labels
  overlayOrder.forEach((overlay) => {
    if (overlay.type === 'video' && overlay.videoTimeline) {
      overlay.layerLabel = layerLabels.get(overlay.layer);
    }
  });
  
  console.log(`🎬 Overlay order (${overlayOrder.length} items):`);
  overlayOrder.forEach((overlay, idx) => {
    const info = overlay.type === 'video' 
      ? `video layer [${overlay.layerLabel}]`
      : overlay.type === 'image'
      ? `image segment`
      : `text segment`;
    console.log(`   ${idx + 1}. Layer ${overlay.layer} (${overlay.type}): ${info}`);
  });

  // ============================================
  // PHASE 3: Process overlays in layer order
  // ============================================
  console.log('\n📋 PHASE 3: Processing overlays in layer order...\n');
  let currentCompositeLabel = '';
  
  // Check if we need a base layer (black background) before processing overlays
  // This is needed if the first overlay is not a video layer
  const firstOverlay = overlayOrder[0];
  if (firstOverlay && firstOverlay.type !== 'video') {
    // Create a black base layer first
    videoFilters.push(
      `color=black:size=${targetDimensions.width}x${targetDimensions.height}:duration=${totalVideoDuration}:rate=${targetFps},setsar=1[video_base]`,
    );
    currentCompositeLabel = 'video_base';
    console.log(`   ✅ Created black base layer [${currentCompositeLabel}] for non-video overlays`);
  }
  
  for (let i = 0; i < overlayOrder.length; i++) {
    const overlay = overlayOrder[i];
    const isLast = i === overlayOrder.length - 1;
    
    console.log(`\n🎬 Processing overlay ${i + 1}/${overlayOrder.length}: Layer ${overlay.layer} (${overlay.type})`);
    
    if (overlay.type === 'video') {
      // Video overlay
      if (!overlay.layerLabel) {
        console.warn(`⚠️ No layer label for video layer ${overlay.layer}, skipping`);
        continue;
      }
      
      const videoTimeline = overlay.videoTimeline!;
      const layerLabel = overlay.layerLabel;
      
      // Determine if this is the base layer (first video layer)
      if (!currentCompositeLabel) {
        // This is the first video layer - it becomes the base
        currentCompositeLabel = layerLabel;
        console.log(`   ✅ Layer ${overlay.layer} is base layer -> [${currentCompositeLabel}]`);
      } else {
        // Overlay this video layer on top of current composite
        const overlayStartTime = videoTimeline.segments.length > 0
          ? Math.min(...videoTimeline.segments.map(s => s.startTime))
          : 0;
        // Use the timeline's end time (when the video actually ends) instead of totalVideoDuration
        // This ensures the overlay enable expression matches the actual video content duration
        const overlayEndTime = videoTimeline.segments.length > 0
          ? Math.max(...videoTimeline.segments.map(s => s.endTime))
          : totalVideoDuration;
        
        const startTime = Math.round(overlayStartTime * 1000) / 1000;
        const endTime = Math.round(overlayEndTime * 1000) / 1000;
        
        // Debug logging to verify overlay timing
        console.log(`   ⏱️ Layer ${overlay.layer} overlay timing:`);
        console.log(`      - Timeline start: ${overlayStartTime.toFixed(3)}s`);
        console.log(`      - Timeline end: ${overlayEndTime.toFixed(3)}s`);
        console.log(`      - Total video duration: ${totalVideoDuration.toFixed(3)}s`);
        console.log(`      - Enable expression: between(t,${startTime.toFixed(3)},${endTime.toFixed(3)})`);
        
        // Get transform positioning (use original coordinates, not scaled)
        // The video is already scaled, so position offsets should use original transform values
        let overlayX = '(W-w)/2';
        let overlayY = '(H-h)/2';
        
        const firstSegment = videoTimeline.segments[0];
        if (firstSegment && firstSegment.input.videoTransform) {
          const transform = firstSegment.input.videoTransform;
          const transformX = transform.x ?? 0;
          const transformY = transform.y ?? 0;
          const transformScale = transform.scale ?? 1.0;
          
          // Use original transform coordinates (not scaled)
          // The video scaling is already applied, so position should be relative to original coordinate system
          // Use proper addition/subtraction to ensure FFmpeg can parse the expression correctly
          if (transformX !== 0 || transformY !== 0 || transformScale !== 1.0) {
            overlayX = transformX >= 0
              ? `(W-w)/2+${transformX}*W/2`
              : `(W-w)/2-${Math.abs(transformX)}*W/2`; // Use Math.abs to ensure proper subtraction
            overlayY = transformY >= 0
              ? `(H-h)/2+${transformY}*H/2`
              : `(H-h)/2-${Math.abs(transformY)}*H/2`; // Use Math.abs to ensure proper subtraction
            
            console.log(`   📍 Using transform positioning: x=${transformX.toFixed(3)}, y=${transformY.toFixed(3)}, scale=${transformScale.toFixed(2)} (video already scaled)`);
          }
        }
        
        const compositeLabel = isLast && overlayOrder.length === i + 1 && overlayOrder.slice(i + 1).every(o => o.type !== 'video' && o.type !== 'image')
          ? 'video_composite'
          : `composite_${overlay.layer}`;
        
        const enableExpression = `between(t,${startTime},${endTime})`;
        const overlayFilter = buildOverlayFilter(
          `[${currentCompositeLabel}]`,
          `[${layerLabel}]`,
          `[${compositeLabel}]`,
          overlayX,
          overlayY,
          hwAccel,
          { 
            shortest: 0,
            enable: enableExpression,
          },
        );
        videoFilters.push(overlayFilter);
        currentCompositeLabel = compositeLabel;
        console.log(`   ✅ Overlaid video layer ${overlay.layer} on [${currentCompositeLabel}] (enabled from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s)`);
      }
    } else if (overlay.type === 'image') {
      // Image overlay
      const imageSegment = overlay.segment as ProcessedTimelineSegment;
      const { input: trackInfo, originalIndex, duration } = imageSegment;
      const startTime = Math.round(imageSegment.startTime * 1000) / 1000;
      const endTime = Math.round(imageSegment.endTime * 1000) / 1000;
      
      const fileIndex = findFileIndexForSegment(
        imageSegment,
        categorizedInputs,
        'video',
      );
      
      if (fileIndex === undefined) {
        console.warn(`❌ Could not find file index for image segment ${originalIndex}`);
        continue;
      }
      
      const transform = trackInfo.imageTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: trackInfo.width || targetDimensions.width,
        height: trackInfo.height || targetDimensions.height,
      };
      
      const imageInputRef = `[${fileIndex}:v]`;
      const imagePreparedRef = `[img_${overlay.layer}_${originalIndex}_prepared]`;
      const imageScaledRef = `[img_${overlay.layer}_${originalIndex}_scaled]`;
      const imageRotatedRef = `[img_${overlay.layer}_${originalIndex}_rotated]`;
      const compositeLabel = isLast ? 'video_composite' : `composite_${overlay.layer}_img_${originalIndex}`;
      
      // Prepare image
      const tpadFilter = startTime > 0 
        ? `,tpad=start_duration=${startTime}:start_mode=add:color=black@0.0`
        : '';
      videoFilters.push(
        `${imageInputRef}trim=duration=${duration},setsar=1${tpadFilter}${imagePreparedRef}`,
      );
      
      // Apply scaling if needed
      let currentImageRef = imagePreparedRef;
      if (transform.scale !== 1.0) {
        const scaledWidth = Math.round(transform.width * transform.scale);
        const scaledHeight = Math.round(transform.height * transform.scale);
        const scaleFilter = buildScaleFilter(
          imagePreparedRef,
          imageScaledRef,
          scaledWidth,
          scaledHeight,
          hwAccel,
          { forceOriginalAspectRatio: 'decrease', pad: false },
        );
        videoFilters.push(scaleFilter);
        currentImageRef = imageScaledRef;
      }
      
      // Apply rotation if needed
      if (transform.rotation !== 0) {
        const rotationRadians = (transform.rotation * Math.PI) / 180;
        const absRotation = Math.abs(rotationRadians);
        const cosTheta = Math.abs(Math.cos(absRotation));
        const sinTheta = Math.abs(Math.sin(absRotation));
        const rotatedWidth = Math.ceil(transform.width * cosTheta + transform.height * sinTheta);
        const rotatedHeight = Math.ceil(transform.width * sinTheta + transform.height * cosTheta);
        
        videoFilters.push(
          `${currentImageRef}rotate=${rotationRadians}:out_w=${rotatedWidth}:out_h=${rotatedHeight}:fillcolor=none${imageRotatedRef}`,
        );
        currentImageRef = imageRotatedRef;
      }
      
      // Calculate overlay position
      const overlayX = transform.x >= 0
        ? `(W-w)/2+${transform.x}*W/2`
        : `(W-w)/2${transform.x}*W/2`;
      const overlayY = transform.y >= 0
        ? `(H-h)/2+${transform.y}*H/2`
        : `(H-h)/2${transform.y}*H/2`;
      
      // Overlay the image
      const overlayFilter = buildOverlayFilter(
        `[${currentCompositeLabel}]`,
        currentImageRef,
        `[${compositeLabel}]`,
        overlayX,
        overlayY,
        hwAccel,
        { enable: `between(t,${startTime},${endTime})` },
      );
      videoFilters.push(overlayFilter);
      currentCompositeLabel = compositeLabel;
      console.log(`   ✅ Overlaid image at layer ${overlay.layer} -> [${compositeLabel}]`);
    } else if (overlay.type === 'text') {
      // Text overlay
      const textSegment = overlay.segment;
      const drawtextFilter = generateDrawtextFilter(
        textSegment,
        job.operations.textStyle,
        job.videoDimensions,
      );
      
      const compositeLabel = isLast ? 'video_composite' : `composite_${overlay.layer}_text`;
      videoFilters.push(`[${currentCompositeLabel}]${drawtextFilter}[${compositeLabel}]`);
      currentCompositeLabel = compositeLabel;
      console.log(`   ✅ Applied text overlay at layer ${overlay.layer} -> [${compositeLabel}]`);
    }
  }
  
  // Process audio timeline segments with support for overlapping
  // Skip audio processing if there are only image inputs (no video inputs)
  const hasVideoInputs = videoLayers.size > 0;
  
  const hasVideoContentForBase = sortedLayers.length > 0 || videoLayers.size > 0;
  
  // If no video layers, create a black base
  if (!currentCompositeLabel && hasVideoContentForBase) {
    videoFilters.push(
      `color=black:size=${targetDimensions.width}x${targetDimensions.height}:duration=${totalVideoDuration}:rate=${targetFps},setsar=1[video_base]`,
    );
    currentCompositeLabel = 'video_base';
  }
  
  // Set final base label for further processing (aspect ratio crop, downscale, etc.)
  const finalBaseLabel = currentCompositeLabel || 'video_base';
  
  if (hasVideoInputs) {
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
          
          // Add delay to position audio at correct timeline position
          const delayMs = Math.round(segment.startTime * 1000);
          const delayedRef = `[a${segmentIndex}_delayed]`;
          
          if (delayMs > 0) {
            audioFilters.push(`${trimResult.filterRef}adelay=${delayMs}|${delayMs}${delayedRef}`);
            console.log(`🎵 Added ${delayMs}ms delay to position audio at ${segment.startTime.toFixed(2)}s`);
          } else {
            // No delay needed - use acopy for audio
            audioFilters.push(`${trimResult.filterRef}acopy${delayedRef}`);
          }
          
          audioSegmentsWithTiming.push({
            segment,
            segmentIndex,
            filterRef: delayedRef,
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
      console.log(`🎵 Mixing ${audioSegmentsWithTiming.length} audio streams (supports overlapping)`);
      
      if (audioSegmentsWithTiming.length === 1) {
        // Single audio stream - just pad to total duration
        const inputRef = audioSegmentsWithTiming[0].filterRef.replace('[', '').replace(']', '');
        audioConcatInputs.push(`[${inputRef}]`);
      } else {
        // Multiple audio streams - use amix for overlapping support
        const mixInputs = audioSegmentsWithTiming.map(a => a.filterRef).join('');
        const mixRef = '[audio_mixed]';
        
        // amix filter: inputs=N:duration=longest:dropout_transition=0
        // - inputs=N: number of input streams
        // - duration=longest: output duration is the longest input
        // - dropout_transition=0: no fade when streams start/end
        audioFilters.push(
          `${mixInputs}amix=inputs=${audioSegmentsWithTiming.length}:duration=longest:dropout_transition=0:normalize=0${mixRef}`,
        );
        audioConcatInputs.push(mixRef);
        console.log(`✅ Created audio mix with ${audioSegmentsWithTiming.length} overlapping streams`);
      }
    }
  } else {
    console.log('ℹ️ Skipping audio processing - only image inputs detected (no video inputs)');
  }

  // Set the base video label for further processing
  let currentVideoLabel = finalBaseLabel || currentCompositeLabel;
  const hasVideoContent = sortedLayers.length > 0 || videoLayers.size > 0;
  
  if (!currentVideoLabel || currentVideoLabel === '') {
    // No video layers - create a black base if needed
    console.log('⚠️ No video layers found, creating black base');
    const totalDuration = audioTimeline.totalDuration || 1;
    videoFilters.push(
      `color=black:size=${targetDimensions.width}x${targetDimensions.height}:duration=${totalDuration}:rate=${targetFps},setsar=1[video_base]`,
    );
    currentVideoLabel = 'video_base';
  }

  // Build final audio filter (already mixed if multiple streams)
  let audioConcatFilter = '';
  if (audioConcatInputs.length > 0) {
    // Audio is already mixed/processed, just rename to [audio]
    const inputRef = audioConcatInputs[0].replace('[', '').replace(']', '');
    if (inputRef !== 'audio') {
      audioConcatFilter = `[${inputRef}]acopy[audio]`;
    }
    console.log(`✅ Final audio output: [audio]`);
  }

  // Note: Image overlays will be applied AFTER aspect ratio crop
  // This is handled later in the filter chain to ensure images are positioned correctly
  // relative to the cropped video dimensions

  // Apply aspect ratio conversion (scale + crop) BEFORE subtitles and images
  // This ensures subtitles and images are positioned correctly relative to the final video dimensions
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
        aspectRatioCropFilter = buildCropFilter(
          `[${currentVideoLabel}]`,
          '[video_cropped]',
          cropWidth,
          cropHeight,
          cropX,
          cropY,
        );
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

  // Apply final downscaling if desired output dimensions differ from aspect ratio cropped dimensions
  // This happens BEFORE subtitles and overlays so they are applied at the final output resolution
  let finalDownscaleFilter = '';
  let videoLabelAfterDownscale = croppedVideoLabel;
  
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
    }
    
    // Use hardware-accelerated scaling with padding
    finalDownscaleFilter = buildAspectRatioScaleFilter(
      `[${croppedVideoLabel}]`,
      '[video_downscaled]',
      desiredOutputDimensions.width,
      desiredOutputDimensions.height,
      hwAccel,
    );
    // Add setsar=1 after the scale
    finalDownscaleFilter = finalDownscaleFilter.replace('[video_downscaled]', ',setsar=1[video_downscaled]');
    videoLabelAfterDownscale = 'video_downscaled';
  } else {
    console.log('📐 No final downscale needed, dimensions match');
    videoLabelAfterDownscale = croppedVideoLabel;
  }
  
  // Apply subtitles to video stream (must be in filter_complex)
  // NOTE: Text and image overlays are now processed during main compositing loop in layer order
  // Subtitles are applied AFTER the final downscale
  let subtitleFilter = '';
  let currentVideoLabelForText = videoLabelAfterDownscale;

  // Get font directories for the fonts used in subtitles
  let fontsDirParam = '';
  if (job.subtitleFontFamilies && job.subtitleFontFamilies.length > 0) {
    const fontDirectories = getFontDirectoriesForFamilies(job.subtitleFontFamilies);
    // Verify font directories exist
    for (const fontDir of fontDirectories) {
      if (!fs.existsSync(fontDir)) {
        console.warn(`⚠️ Font directory does not exist: ${fontDir}`);
      }
    }
    fontsDirParam = buildFontDirectoriesParameter(job.subtitleFontFamilies);
  }

  // Step 1: Apply subtitles first (if present)
  if (job.operations.subtitles && hasVideoContent) {
    const subtitlePath = job.operations.subtitles;
    
    // Verify subtitle file exists
    if (!fs.existsSync(subtitlePath)) {
      throw new Error(
        `Subtitle file does not exist: ${subtitlePath}\n` +
        `Please ensure the subtitle file is created before building the FFmpeg command.`
      );
    }
    
    const escapedPath = escapePathForFilter(subtitlePath);
    const fileExtension = subtitlePath
      .toLowerCase()
      .split('.')
      .pop();

    console.log(`📝 [Subtitles] Using subtitle file: ${subtitlePath}`);
    console.log(`📝 [Subtitles] Escaped path for filter: ${escapedPath}`);

    if (fileExtension === 'ass' || fileExtension === 'ssa') {
      // Apply subtitles to the video after downscale
      subtitleFilter = `[${currentVideoLabelForText}]subtitles='${escapedPath}'${fontsDirParam}[video_with_subtitles]`;
      currentVideoLabelForText = 'video_with_subtitles';
      console.log(
        '📝 [Subtitles] Added ASS subtitles filter with fontsdir - applied AFTER downscale at final output dimensions',
      );
    } else {
      subtitleFilter = `[${currentVideoLabelForText}]subtitles='${escapedPath}'${fontsDirParam}[video_with_subtitles]`;
      currentVideoLabelForText = 'video_with_subtitles';
      console.log(`📝 [Subtitles] Added subtitles filter (format: ${fileExtension}) - applied AFTER downscale`);
    }
  }

  // Step 1.5: Force SAR=1 after subtitles to avoid aspect ratio propagation from ASS renderer
  // This ensures clean aspect ratio before final output
  if (currentVideoLabelForText === 'video_with_subtitles' && hasVideoContent) {
    // Add setsar=1 filter after subtitles
    videoFilters.push(`[${currentVideoLabelForText}]setsar=1[video]`);
  } else if (currentVideoLabelForText !== 'video') {
    // If no subtitles, rename final composite to [video]
    videoFilters.push(`[${currentVideoLabelForText}]copy[video]`);
  }

  // Combine all filters in the correct order:
  // 1. Video processing (concat, video/image/text overlays in layer order)
  // 2. Audio processing
  // 3. Aspect ratio crop (if needed) - scales and crops to correct aspect ratio at source resolution
  // 4. Final downscale (if needed) - downscales to custom dimensions
  // 5. Subtitles (applied AFTER downscale at final output dimensions)
  const allFilters = [...videoFilters, ...audioFilters];
  if (audioConcatFilter) allFilters.push(audioConcatFilter);
  if (aspectRatioCropFilter) {
    console.log('📐 ✅ ADDING ASPECT RATIO CROP FILTER TO CHAIN:', aspectRatioCropFilter);
    allFilters.push(aspectRatioCropFilter);
  } else {
    console.log('📐 ❌ NO ASPECT RATIO CROP FILTER TO ADD');
  }
  if (finalDownscaleFilter) {
    console.log('📐 ✅ ADDING FINAL DOWNSCALE FILTER TO CHAIN:', finalDownscaleFilter);
    allFilters.push(finalDownscaleFilter);
  }
  if (subtitleFilter) {
    console.log('📝 ✅ ADDING SUBTITLE FILTER TO CHAIN (AFTER DOWNSCALE)');
    allFilters.push(subtitleFilter);
  }
  // Note: Text and image overlays are already processed in layer order during main compositing loop
  const filterComplex = allFilters.join(';');

  return filterComplex;
}

/**
 * Builds and applies filter complex to command with multi-layer support
 */
export function handleFilterComplex(
  job: VideoEditJob,
  cmd: CommandParts,
  videoLayers: Map<number, ProcessedTimeline>,
  imageLayers: Map<number, ProcessedTimeline>,
  audioTimeline: ProcessedTimeline,
  categorizedInputs: CategorizedInputs,
  hwAccel: HardwareAcceleration | null,
  createGapVideoFilters: (
    originalIndex: number,
    duration: number,
    targetFps: number,
    videoDimensions: { width: number; height: number },
  ) => AudioTrimResult,
  createSilentAudioFilters: (
    originalIndex: number,
    duration: number,
  ) => AudioTrimResult,
  createAudioTrimFilters: (
    context: any,
  ) => AudioTrimResult,
  createVideoTrimFilters: (context: VideoProcessingContext) => AudioTrimResult,
  createFpsNormalizationFilters: (
    originalIndex: number,
    inputRef: string,
    targetFps: number,
  ) => AudioTrimResult,
  createSarNormalizationFilters: (
    originalIndex: number,
    inputRef: string,
  ) => AudioTrimResult,
): void {
  let filterComplex = buildSeparateTimelineFilterComplex(
    videoLayers,
    imageLayers,
    audioTimeline,
    job,
    categorizedInputs,
    hwAccel,
    createGapVideoFilters,
    createSilentAudioFilters,
    createAudioTrimFilters,
    createVideoTrimFilters,
    createFpsNormalizationFilters,
    createSarNormalizationFilters,
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

