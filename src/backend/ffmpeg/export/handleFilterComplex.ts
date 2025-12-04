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
  hwAccel: HardwareAcceleration | null,
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

    // Step 1: Prepare image - trim to duration
    // ✅ OPTIMIZATION: Don't apply timestamp filters on images (images don't carry PTS)
    // Static images don't need loop filter - trim alone will hold the frame for the duration
    // Add transparent padding at the start to align with timeline position
    // Also normalize SAR to 1:1 for consistency
    const tpadFilter = startTime > 0 
      ? `,tpad=start_duration=${startTime}:start_mode=add:color=black@0.0`
      : '';
    filters.push(
      `${imageInputRef}trim=duration=${duration},setsar=1${tpadFilter}${imagePreparedRef}`,
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
      const scaleFilter = buildScaleFilter(
        imagePreparedRef,
        imageScaledRef,
        scaledWidth,
        scaledHeight,
        hwAccel,
        { forceOriginalAspectRatio: 'decrease', pad: false },
      );
      filters.push(scaleFilter);
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
    const overlayFilter = buildOverlayFilter(
      `[${currentLabel}]`,
      currentImageRef,
      overlayOutputRef,
      overlayX,
      overlayY,
      hwAccel,
      { enable: `between(t,${startTime},${endTime})` },
    );
    filters.push(overlayFilter);

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
  const overlayFilter = buildOverlayFilter(
    blackBgRef,
    scaledVideoRef,
    overlayRef,
    overlayX,
    overlayY,
    hwAccel,
  );
  videoFilters.push(overlayFilter);
  
  console.log(`✅ Video overlaid on background at transform position (${transformX}, ${transformY})`);
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

        // ✅ OPTIMIZATION: Don't apply FPS per-segment
        // FPS will be applied AFTER concat for better performance
        // However, setsar MUST be applied before concat for compatibility
        
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
            hwAccel,
            createGapVideoFilters,
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
              const scaleFilter = buildScaleFilter(
                videoStreamRef,
                scaleRef,
                targetDimensions.width,
                targetDimensions.height,
                hwAccel,
                { forceOriginalAspectRatio: 'decrease', pad: true, padColor: 'black' },
              );
              videoFilters.push(scaleFilter);
              console.log(
                `📐 Layer ${layerIndex}: Scaled video segment from ${trackInfo.width}x${trackInfo.height} to ${targetDimensions.width}x${targetDimensions.height} with black padding`,
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

  // Collect all tracks by layer (video, image, text) for independent layer-by-layer processing
  // This ensures tracks are processed in layer order regardless of type
  interface LayerTrack {
    type: 'video' | 'image' | 'text';
    layer: number;
    videoTimeline?: ProcessedTimeline;
    imageSegments?: ProcessedTimelineSegment[];
    textSegments?: any[];
  }
  
  const allLayers = new Map<number, LayerTrack>();
  
  // Add video layers
  for (const [layerNum, timeline] of videoLayers.entries()) {
    allLayers.set(layerNum, {
      type: 'video',
      layer: layerNum,
      videoTimeline: timeline,
    });
  }
  
  // Add image layers (may overlap with video layers)
  for (const [layerNum, timeline] of imageLayers.entries()) {
    if (allLayers.has(layerNum)) {
      // Layer already exists (has video) - add images to it
      const existing = allLayers.get(layerNum)!;
      existing.imageSegments = timeline.segments;
      // Update type to indicate mixed content
      if (existing.type === 'video') {
        // Keep as video, but note it has images
      }
    } else {
      allLayers.set(layerNum, {
        type: 'image',
        layer: layerNum,
        imageSegments: timeline.segments,
      });
    }
  }
  
  // Add text layers (may overlap with video/image layers)
  // Include ALL text segments, even empty ones, as they still occupy layer positions
  const textSegmentsForProcessing = job.textClips ? job.textClips.filter((clip: any) => 
    clip.startTime !== undefined && clip.endTime !== undefined
  ) as any[] : [];
  
  console.log(`📝 Found ${textSegmentsForProcessing.length} text segment(s) for processing`);
  textSegmentsForProcessing.forEach((seg, idx) => {
    console.log(`   Text segment ${idx + 1}: layer=${seg.layer ?? 0}, text="${seg.text || '(empty)'}", time=[${seg.startTime?.toFixed(2)}s-${seg.endTime?.toFixed(2)}s]`);
  });
  
  // Group text segments by layer
  const textByLayer = new Map<number, any[]>();
  textSegmentsForProcessing.forEach((segment: any) => {
    const layer = segment.layer ?? 0;
    if (!textByLayer.has(layer)) {
      textByLayer.set(layer, []);
    }
    textByLayer.get(layer)!.push(segment);
  });
  
  console.log(`📝 Text segments grouped by layer:`, Array.from(textByLayer.entries()).map(([layer, segs]) => `Layer ${layer}: ${segs.length} segment(s)`).join(', '));
  
  // Add text to layers
  for (const [layerNum, segments] of textByLayer.entries()) {
    if (allLayers.has(layerNum)) {
      // Layer already exists - add text to it
      const existing = allLayers.get(layerNum)!;
      existing.textSegments = segments;
    } else {
      allLayers.set(layerNum, {
        type: 'text',
        layer: layerNum,
        textSegments: segments,
      });
    }
  }
  
  // Sort layers by layer number
  const sortedLayers = Array.from(allLayers.entries()).sort((a, b) => a[0] - b[0]);
  
  console.log(`\n🎬 Processing ${sortedLayers.length} independent layers in order:\n`);
  sortedLayers.forEach(([layerNum, track]) => {
    const types: string[] = [];
    if (track.videoTimeline) types.push(`video(${track.videoTimeline.segments.length})`);
    if (track.imageSegments) types.push(`image(${track.imageSegments.length})`);
    if (track.textSegments) types.push(`text(${track.textSegments.length})`);
    console.log(`   Layer ${layerNum}: ${types.join(', ')}`);
  });
  console.log('');

  // Process each layer independently in order
  const layerOutputs = new Map<number, string>();
  let baseVideoLabel = '';

  for (const [layerNum, track] of sortedLayers) {
    console.log(`\n🎬 Processing Layer ${layerNum} (${track.type}${track.videoTimeline ? ' + video' : ''}${track.imageSegments ? ' + images' : ''}${track.textSegments ? ' + text' : ''})`);
    
    let layerInputLabel = baseVideoLabel || 'video_base';
    
    // Step 1: Process video tracks in this layer (if any)
    if (track.videoTimeline) {
      console.log(`   📹 Processing ${track.videoTimeline.segments.length} video segment(s) in layer ${layerNum}`);
      
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
        
        // If this is the first layer with video, it becomes the base
        if (!baseVideoLabel) {
          baseVideoLabel = layerLabel;
          layerInputLabel = baseVideoLabel;
        } else {
          // Overlay this video layer on top of previous layers
          // Use enable expression to only show overlay during its active time range
          // This allows the base layer to continue playing after overlay layer ends
          const overlayStartTime = track.videoTimeline.segments.length > 0
            ? Math.min(...track.videoTimeline.segments.map(s => s.startTime))
            : 0;
          const overlayEndTime = track.videoTimeline.totalDuration;
          
          // Round timing values to 3 decimals to avoid FFmpeg truncation inconsistencies
          const startTime = Math.round(overlayStartTime * 1000) / 1000;
          const endTime = Math.round(overlayEndTime * 1000) / 1000;
          
          const overlayLabel = `composite_${layerNum}`;
          const enableExpression = `between(t,${startTime},${endTime})`;
          
          const overlayFilter = buildOverlayFilter(
            `[${layerInputLabel}]`,
            `[${layerLabel}]`,
            `[${overlayLabel}]`,
            '(W-w)/2',
            '(H-h)/2',
            hwAccel,
            { 
              shortest: 0, // Continue for longest input duration
              enable: enableExpression, // Only show overlay during its active time range
            },
          );
          videoFilters.push(overlayFilter);
          layerInputLabel = overlayLabel;
          console.log(`   ✅ Overlaid video layer ${layerNum} on previous layers (enabled from ${startTime.toFixed(2)}s to ${endTime.toFixed(2)}s)`);
        }
        
        layerOutputs.set(layerNum, layerLabel);
      }
    }
    
    // Step 2: Skip image and text overlays here - they will be processed after subtitles
    // Images and text overlays are processed together in layer order after subtitles
    // to ensure proper layer compositing (higher layers on top of lower layers)
    if (track.imageSegments && track.imageSegments.length > 0) {
      console.log(`   🖼️ Found ${track.imageSegments.length} image overlay(s) in layer ${layerNum} (will process after subtitles)`);
    }
    if (track.textSegments && track.textSegments.length > 0) {
      console.log(`   📝 Found ${track.textSegments.length} text segment(s) in layer ${layerNum} (will process after subtitles)`);
    }
    
    // Update base label for next layer (only video layers affect this)
    if (track.videoTimeline) {
      baseVideoLabel = layerInputLabel;
    }
  }
  
  // Process audio timeline segments with support for overlapping
  // Skip audio processing if there are only image inputs (no video inputs)
  const hasVideoInputs = videoLayers.size > 0;
  
  // Calculate total duration from all layers for audio base
  let totalVideoDuration = audioTimeline.totalDuration;
  for (const timeline of videoLayers.values()) {
    totalVideoDuration = Math.max(totalVideoDuration, timeline.totalDuration);
  }
  for (const timeline of imageLayers.values()) {
    totalVideoDuration = Math.max(totalVideoDuration, timeline.totalDuration);
  }
  
  // Store the final base video label after all layers are composited
  const finalBaseLabel = baseVideoLabel || 'video_base';
  const hasVideoContentForBase = sortedLayers.length > 0 || videoLayers.size > 0;
  
  // If no video layers, create a black base
  if (!baseVideoLabel && hasVideoContentForBase) {
    videoFilters.push(
      `color=black:size=${targetDimensions.width}x${targetDimensions.height}:duration=${totalVideoDuration}:rate=${targetFps},setsar=1[video_base]`,
    );
    baseVideoLabel = 'video_base';
  }
  
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
  let currentVideoLabel = finalBaseLabel;
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
  
  // Apply subtitles and text layers to video stream (must be in filter_complex)
  // NOTE: Subtitles and text layers are now processed separately for proper multi-track rendering
  // Subtitles are applied AFTER the final downscale, then text layers as drawtext filters
  let subtitleFilter = '';
  const textLayerFilters: string[] = [];
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
  // This ensures clean aspect ratio before applying drawtext filters
  if (currentVideoLabelForText === 'video_with_subtitles' && hasVideoContent) {
    // Add setsar=1 filter after subtitles
    textLayerFilters.push(`[${currentVideoLabelForText}]setsar=1[with_sar]`);
    currentVideoLabelForText = 'with_sar';
    }

  // Step 2: Process text and image overlays in proper layer order (after subtitles)
  // Strategy: Collect ALL overlays (both text drawtext and image overlays) from ALL layers,
  // sort by layer number, then process them in layer order as a unified overlay chain.
  // Each overlay has enable expressions to control when it's visible, ensuring proper
  // z-ordering regardless of timeline positions. Drawtext filters are treated as overlays
  // and can be positioned between image overlays based on layer order.
  
  interface OverlayItem {
    layer: number;
    type: 'text' | 'image';
    segment: any; // TextSegment or ProcessedTimelineSegment
  }
  
  // Collect all overlays from all layers (both text drawtext and image overlays)
  const allOverlays: OverlayItem[] = [];
  
  for (const [layerNum, track] of sortedLayers) {
    // Add text segments (drawtext overlays)
    if (track.textSegments && track.textSegments.length > 0) {
      track.textSegments.forEach((textSegment: any) => {
        allOverlays.push({
          layer: layerNum,
          type: 'text',
          segment: textSegment,
        });
      });
    }
    
    // Add image segments (image overlays)
    if (track.imageSegments && track.imageSegments.length > 0) {
      track.imageSegments.forEach((imageSegment: ProcessedTimelineSegment) => {
        allOverlays.push({
          layer: layerNum,
          type: 'image',
          segment: imageSegment,
        });
      });
    }
  }
  
  // Sort by layer number (ascending) - lower layers processed first, higher layers on top
  // This ensures proper z-ordering: layer 2 image will be under layer 3 text, etc.
  allOverlays.sort((a, b) => a.layer - b.layer);
  
  console.log(`🎬 Processing ${allOverlays.length} overlay(s) in unified overlay chain (layer order):`);
  allOverlays.forEach((overlay, idx) => {
    const timeInfo = overlay.type === 'text' 
      ? `[${overlay.segment.startTime.toFixed(2)}s-${overlay.segment.endTime.toFixed(2)}s]`
      : `[${overlay.segment.startTime.toFixed(2)}s-${overlay.segment.endTime.toFixed(2)}s]`;
    console.log(`   ${idx + 1}. Layer ${overlay.layer} (${overlay.type}): ${timeInfo}`);
  });
  
  let currentOverlayLabel = currentVideoLabelForText;
  let overlayIndex = 0;
  const totalDuration = totalVideoDuration;
  
  // Process each overlay in layer order, building a unified overlay chain
  // Drawtext filters and image overlays are processed identically - each takes the
  // current overlay label as input and produces a new overlay label as output.
  // This allows drawtext filters to be positioned between image overlays.
  for (let i = 0; i < allOverlays.length; i++) {
    const overlay = allOverlays[i];
    const isLast = i === allOverlays.length - 1;
    
    if (overlay.type === 'text') {
      // Process text overlay (drawtext filter)
      // Drawtext filters are part of the overlay chain and can be positioned
      // between image overlays based on layer order
      const textSegment = overlay.segment;
      const drawtextFilter = generateDrawtextFilter(
        textSegment,
        job.operations.textStyle,
        job.videoDimensions,
      );
      
      // Apply drawtext filter to current overlay chain, producing next overlay label
      const outputLabel = isLast ? 'video' : `overlay_${overlayIndex}`;
      textLayerFilters.push(`[${currentOverlayLabel}]${drawtextFilter}[${outputLabel}]`);
      currentOverlayLabel = outputLabel;
      overlayIndex++;
      console.log(`  📝 Applied text overlay (drawtext) at layer ${overlay.layer} -> [${outputLabel}]`);
    } else {
      // Process image overlay
      // For images, we need to process them one at a time since buildImageOverlayFilters
      // processes multiple segments. We'll create a single-segment version.
      const imageSegment = overlay.segment;
      const { input: trackInfo, originalIndex, duration } = imageSegment;
      const startTime = Math.round(imageSegment.startTime * 1000) / 1000;
      const endTime = Math.round(imageSegment.endTime * 1000) / 1000;
      
      // Find the file index for this image
      const fileIndex = findFileIndexForSegment(
        imageSegment,
        categorizedInputs,
        'video',
      );
      
      if (fileIndex === undefined) {
        console.warn(`❌ Could not find file index for image segment ${originalIndex}`);
        continue;
      }
      
      // Get transform settings
      const transform = trackInfo.imageTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: trackInfo.width || (job.videoDimensions || desiredOutputDimensions).width,
        height: trackInfo.height || (job.videoDimensions || desiredOutputDimensions).height,
      };
      
      const imageInputRef = `[${fileIndex}:v]`;
      const imagePreparedRef = `[img${overlayIndex}_prepared]`;
      const imageScaledRef = `[img${overlayIndex}_scaled]`;
      const imageRotatedRef = `[img${overlayIndex}_rotated]`;
      const newOutputLabel = isLast ? 'video' : `overlay_${overlayIndex}`;
      
      // Step 1: Prepare image - trim to duration and add padding
      const tpadFilter = startTime > 0 
        ? `,tpad=start_duration=${startTime}:start_mode=add:color=black@0.0`
        : '';
      textLayerFilters.push(
        `${imageInputRef}trim=duration=${duration},setsar=1${tpadFilter}${imagePreparedRef}`,
      );
      
      // Step 2: Apply scaling if needed
      let currentImageRef = imagePreparedRef;
      let currentWidth = transform.width;
      let currentHeight = transform.height;
      
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
        textLayerFilters.push(scaleFilter);
        currentImageRef = imageScaledRef;
        currentWidth = scaledWidth;
        currentHeight = scaledHeight;
      }
      
      // Step 3: Apply rotation if needed
      if (transform.rotation !== 0) {
        const rotationRadians = (transform.rotation * Math.PI) / 180;
        const absRotation = Math.abs(rotationRadians);
        const cosTheta = Math.abs(Math.cos(absRotation));
        const sinTheta = Math.abs(Math.sin(absRotation));
        const rotatedWidth = Math.ceil(currentWidth * cosTheta + currentHeight * sinTheta);
        const rotatedHeight = Math.ceil(currentWidth * sinTheta + currentHeight * cosTheta);
        
        textLayerFilters.push(
          `${currentImageRef}rotate=${rotationRadians}:out_w=${rotatedWidth}:out_h=${rotatedHeight}:fillcolor=none${imageRotatedRef}`,
        );
        currentImageRef = imageRotatedRef;
        currentWidth = rotatedWidth;
        currentHeight = rotatedHeight;
      }
      
      // Step 4: Calculate overlay position
      const targetDims = job.videoDimensions || desiredOutputDimensions;
      const overlayX = transform.x >= 0
        ? `(W-w)/2+${transform.x}*W/2`
        : `(W-w)/2${transform.x}*W/2`;
      const overlayY = transform.y >= 0
        ? `(H-h)/2+${transform.y}*H/2`
        : `(H-h)/2${transform.y}*H/2`;
      
      // Step 5: Overlay the image with enable expression
      const overlayFilter = buildOverlayFilter(
        `[${currentOverlayLabel}]`,
        currentImageRef,
        `[${newOutputLabel}]`,
        overlayX,
        overlayY,
        hwAccel,
        { enable: `between(t,${startTime},${endTime})` },
      );
      textLayerFilters.push(overlayFilter);
      
      currentOverlayLabel = newOutputLabel;
      overlayIndex++;
      console.log(`  🖼️ Applied image overlay at layer ${overlay.layer} -> [${newOutputLabel}]`);
    }
  }
  
  // Final output label
  if (currentOverlayLabel !== 'video') {
    textLayerFilters.push(`[${currentOverlayLabel}]copy[video]`);
  }

  // Combine all filters in the correct order:
  // 1. Video processing (concat, etc.)
  // 2. Audio processing
  // 3. Aspect ratio crop (if needed) - scales and crops to correct aspect ratio at source resolution
  // 4. Final downscale (if needed) - downscales to custom dimensions
  // 5. Subtitles (applied AFTER downscale at final output dimensions)
  // 6. Overlays (text + images) applied in layer order AFTER subtitles
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
  // Text and image overlays are interleaved by layer in textLayerFilters
  if (textLayerFilters.length > 0) {
    console.log(`📝 ✅ ADDING ${textLayerFilters.length} OVERLAY FILTERS (TEXT + IMAGES) TO CHAIN IN LAYER ORDER`);
    allFilters.push(...textLayerFilters);
  }
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

