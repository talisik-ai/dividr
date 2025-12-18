import {
  CategorizedInputs,
  ProcessedTimeline,
  ProcessedTimelineSegment,
  TrackInfo,
  VideoEditJob,
} from '../schema/ffmpegConfig';

const VIDEO_DEFAULTS = {
  SIZE: { width: 1920, height: 1080 },
  FPS: 30,
  DUMMY_DURATION: 0.1,
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
 * Builds separate video and audio timelines from inputs
 * Videos and images are organized by layers for multi-layer compositing
 */
export function buildSeparateTimelines(
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

    // Use trackRowIndex to determine layer (higher row index = higher layer)
    // Fallback to layerIndex or old layer field for backward compatibility
    const layer =
      trackInfo.trackRowIndex ?? trackInfo.layerIndex ?? trackInfo.layer ?? 0;

    if (FILE_EXTENSIONS.VIDEO.test(path)) {
      console.log(
        `📹 Adding video input ${originalIndex} to layer ${layer} (trackRowIndex: ${trackInfo.trackRowIndex ?? 'N/A'}): ${path}`,
      );
      if (!videoInputsByLayer.has(layer)) {
        videoInputsByLayer.set(layer, []);
      }
      const existing = videoInputsByLayer.get(layer);
      if (!existing) {
        return;
      }
      existing.push({ trackInfo, originalIndex });
    } else if (FILE_EXTENSIONS.IMAGE.test(path)) {
      console.log(
        `🖼️ Adding image input ${originalIndex} to layer ${layer} (trackRowIndex: ${trackInfo.trackRowIndex ?? 'N/A'}): ${path} (timeline: ${trackInfo.timelineStartFrame}-${trackInfo.timelineEndFrame})`,
      );
      if (!imageInputsByLayer.has(layer)) {
        imageInputsByLayer.set(layer, []);
      }
      const existing = imageInputsByLayer.get(layer);
      if (!existing) {
        return;
      }
      existing.push({ trackInfo, originalIndex });
    } else if (FILE_EXTENSIONS.AUDIO.test(path)) {
      console.log(`🎵 Adding audio input ${originalIndex}: ${path}`);
      audioInputs.push({ trackInfo, originalIndex });
    }
  });

  console.log(
    `📊 Input counts: video layers=${videoInputsByLayer.size}, image layers=${imageInputsByLayer.size}, audio=${audioInputs.length}`,
  );

  // Build video timelines for each layer
  // Only fill gaps for the bottom-most video/image layer (lowest layer number) - this serves as the background
  // Upper layers should not have gaps filled - they'll be transparent where there's no content
  // Note: Audio layers are not considered when determining the bottom-most layer
  const videoLayers = new Map<number, ProcessedTimeline>();
  const sortedVideoLayers = Array.from(videoInputsByLayer.entries()).sort(
    (a, b) => a[0] - b[0],
  );
  const sortedImageLayers = Array.from(imageInputsByLayer.entries()).sort(
    (a, b) => a[0] - b[0],
  );

  // Find the bottom-most video/image layer (lowest layer number across both video and image layers)
  // Audio layers are excluded from this determination
  const allVideoImageLayers = [
    ...sortedVideoLayers.map(([layer]) => layer),
    ...sortedImageLayers.map(([layer]) => layer),
  ].sort((a, b) => a - b);
  const bottomMostVideoImageLayer =
    allVideoImageLayers.length > 0 ? allVideoImageLayers[0] : null;

  for (const [layer, layerInputs] of videoInputsByLayer.entries()) {
    console.log(
      `🎥 Building video layer ${layer} with ${layerInputs.length} inputs`,
    );
    let videoSegments = buildVideoTimeline(layerInputs, targetFrameRate);

    // Only fill gaps for the bottom-most video/image layer - this creates the black background for all layers above
    // Audio layers are not considered when determining bottom-most layer
    if (layer === bottomMostVideoImageLayer) {
      console.log(
        `   🎬 Layer ${layer} is bottom-most video/image layer - filling gaps with black video clips`,
      );
      videoSegments = fillTimelineGaps(videoSegments, targetFrameRate, 'video');
    } else {
      console.log(
        `   🎬 Layer ${layer} is upper layer - skipping gap filling (will be transparent)`,
      );
      // Don't fill gaps for upper layers - they'll be transparent where there's no content
    }

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    // Use trackRowIndex to determine layer (higher row index = higher layer)
    // Fallback to layerIndex or old layer field for backward compatibility
    const layer =
      trackInfo.trackRowIndex ?? trackInfo.layerIndex ?? trackInfo.layer ?? 0;
    const trackRowIndex = trackInfo.trackRowIndex ?? 0;
    const layerIndex = trackInfo.layerIndex ?? trackInfo.trackRowIndex ?? 0;

    segments.push({
      input: trackInfo,
      originalIndex,
      startTime,
      duration,
      endTime,
      timelineType: 'video',
      layer,
      trackRowIndex,
      layerIndex,
    });

    console.log(
      `🎥 Video segment ${originalIndex} (layer ${layer}, trackRowIndex: ${trackRowIndex}): ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s (${duration.toFixed(2)}s)`,
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
    // Use trackRowIndex to determine layer (higher row index = higher layer)
    // Fallback to layerIndex or old layer field for backward compatibility
    const layer =
      trackInfo.trackRowIndex ?? trackInfo.layerIndex ?? trackInfo.layer ?? 0;
    const trackRowIndex = trackInfo.trackRowIndex ?? 0;
    const layerIndex = trackInfo.layerIndex ?? trackInfo.trackRowIndex ?? 0;

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
      trackRowIndex,
      layerIndex,
    });

    console.log(
      `🖼️ Image segment ${originalIndex} (layer ${layer}, trackRowIndex: ${trackRowIndex}): ${startTime.toFixed(2)}s-${endTime.toFixed(2)}s (${duration.toFixed(2)}s)`,
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
 * Builds and processes separate video and audio timelines with multi-layer support
 */
export function handleTimelineProcessing(
  job: VideoEditJob,
  targetFrameRate: number,
  categorizeInputs: (inputs: (string | TrackInfo)[]) => CategorizedInputs,
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
