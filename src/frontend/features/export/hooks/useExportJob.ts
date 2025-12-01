/**
 * useExportJob Hook
 * Handles FFmpeg job creation from video editor tracks
 */
import { TrackInfo, VideoEditJob } from '@/backend/ffmpeg/schema/ffmpegConfig';
import { useCallback } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../editor/stores/videoEditor/index';
import { detectAspectRatio } from '../../editor/stores/videoEditor/utils/aspectRatioHelpers';
import { generateSubtitleContent } from '../utils/subtitleUtils';
import { generateTextLayerSegments } from '../utils/textLayerUtils';

export const useExportJob = () => {
  const tracks = useVideoEditorStore((state) => state.tracks);
  const mediaLibrary = useVideoEditorStore((state) => state.mediaLibrary);
  const timelineFps = useVideoEditorStore((state) => state.timeline.fps);
  const textStyle = useVideoEditorStore((state) => state.textStyle);
  const getTextStyleForSubtitle = useVideoEditorStore(
    (state) => state.getTextStyleForSubtitle,
  );
  const preview = useVideoEditorStore((state) => state.preview);

  const createFFmpegJob = useCallback(
    (
      outputFilename = 'Untitled_Project.mp4',
      outputPath?: string,
    ): VideoEditJob => {
      if (tracks.length === 0) {
        return {
          inputs: [],
          output: outputFilename,
          outputPath,
          operations: {},
          videoDimensions: { width: 1920, height: 1080 },
        };
      }

      // Separate tracks by type
      const subtitleTracks = tracks.filter(
        (track) => track.type === 'subtitle',
      );
      const textTracks = tracks.filter((track) => track.type === 'text');
      const videoTracks = tracks.filter((track) => track.type === 'video');
      const audioTracks = tracks.filter((track) => track.type === 'audio');
      const imageTracks = tracks.filter((track) => track.type === 'image');

      console.log(
        `📊 Track counts: video=${videoTracks.length}, audio=${audioTracks.length}, image=${imageTracks.length}, subtitle=${subtitleTracks.length}, text=${textTracks.length}`,
      );
      console.log(
        `🎥 Video tracks:`,
        videoTracks.map((t) => ({
          id: t.id,
          name: t.name,
          startFrame: t.startFrame,
          endFrame: t.endFrame,
          isLinked: t.isLinked,
          linkedTrackId: t.linkedTrackId,
        })),
      );
      console.log(
        `🎵 Audio tracks:`,
        audioTracks.map((t) => ({
          id: t.id,
          name: t.name,
          source: t.source,
          startFrame: t.startFrame,
          endFrame: t.endFrame,
          isLinked: t.isLinked,
          linkedTrackId: t.linkedTrackId,
        })),
      );
      console.log(
        `🔤 Text tracks:`,
        textTracks.map((t) => ({
          id: t.id,
          type: t.textType,
          content: t.textContent,
          startFrame: t.startFrame,
          endFrame: t.endFrame,
        })),
      );

      // Get custom canvas dimensions (user-adjusted dimensions from preview)
      // These reflect aspect ratio changes or free transform scaling applied in the preview
      const customDimensions = getCustomDimensions(
        preview.canvasWidth,
        preview.canvasHeight,
        videoTracks,
      );

      console.log(
        `📐 Custom canvas dimensions: ${customDimensions.width}x${customDimensions.height}`,
      );

      // Process linked tracks
      const { processedTracks, videoDimensions } = processLinkedTracks(
        videoTracks,
        audioTracks,
        imageTracks,
        mediaLibrary,
        customDimensions, // Pass custom dimensions to use instead of track dimensions
      );

      // Sort by timeline position
      const sortedTracks = processedTracks.sort(
        (a, b) => a.startFrame - b.startFrame,
      );

      if (sortedTracks.length === 0) {
        return {
          inputs: [],
          output: outputFilename,
          outputPath,
          operations: {},
          videoDimensions,
        };
      }

      // Convert tracks to FFmpeg input format
      const trackInfos = convertTracksToFFmpegInputs(
        sortedTracks,
        timelineFps,
        mediaLibrary,
      );

      // Calculate the earliest start frame across all tracks (for subtitle time offset)
      const timelineStartFrame =
        sortedTracks.length > 0
          ? Math.min(...sortedTracks.map((t) => t.startFrame))
          : 0;

      console.log(
        `📍 Export timeline starts at frame ${timelineStartFrame} (${(timelineStartFrame / timelineFps).toFixed(3)}s)`,
      );

      // Determine the target aspect ratio
      // Priority 1: Detect from custom canvas dimensions (user-set aspect ratio)
      // Priority 2: Use aspect ratio from first video track (original source aspect ratio)
      let targetAspectRatio: string | undefined = undefined;

      // Try to detect aspect ratio from custom canvas dimensions first
      const customAspectRatio = detectAspectRatio(
        customDimensions.width,
        customDimensions.height,
      );

      if (customAspectRatio?.label) {
        targetAspectRatio = customAspectRatio.label;
        console.log(
          `📐 Using aspect ratio from custom canvas dimensions: ${targetAspectRatio} (${customDimensions.width}x${customDimensions.height})`,
        );
      } else {
        // Fallback to video track aspect ratio
        for (const track of videoTracks) {
          if (track.detectedAspectRatioLabel) {
            targetAspectRatio = track.detectedAspectRatioLabel;
            console.log(
              `📐 Using aspect ratio from first video track: ${targetAspectRatio}`,
            );
            break;
          }
        }
      }

      // Calculate dimensions for subtitle/image positioning
      // Subtitles and images are positioned at the aspect-ratio-cropped resolution (before final downscale)
      // We need to find the actual source video dimensions to calculate the intermediate dimensions
      const sourceVideoDimensions = getSourceVideoDimensions(videoTracks);
      
      // Calculate the intermediate dimensions after aspect ratio crop (at source resolution)
      const intermediateVideoDimensions = calculateIntermediateDimensions(
        sourceVideoDimensions,
        targetAspectRatio,
      );
      
      // The final output dimensions are the custom dimensions from the canvas
      const finalOutputDimensions = videoDimensions;

      console.log(
        `📐 Video dimensions: ` +
          `source=${sourceVideoDimensions.width}x${sourceVideoDimensions.height}, ` +
          `intermediate (after aspect crop)=${intermediateVideoDimensions.width}x${intermediateVideoDimensions.height}, ` +
          `final output=${finalOutputDimensions.width}x${finalOutputDimensions.height} ` +
          `(aspect ratio: ${targetAspectRatio || 'none'})`,
      );

      // Generate subtitle content (ONLY subtitles - text clips handled separately)
      // Use finalOutputDimensions so subtitles are positioned for the final output video
      // Subtitles will be applied AFTER the final downscale to match the output dimensions
      const { subtitleContent, currentTextStyle, fontFamilies } =
        generateSubtitleContent(
          subtitleTracks,
          [], // Text tracks are now processed separately
          textStyle,
          getTextStyleForSubtitle,
          finalOutputDimensions, // Use final output dimensions for subtitle positioning
          timelineStartFrame, // Pass start frame for time offset adjustment
        );

      // Generate text layer segments separately (for multi-track rendering)
      // Text layers will be converted to drawtext filters in the FFmpeg filter complex
      const textLayerResult = textTracks.length > 0 
        ? generateTextLayerSegments(
            textTracks,
            textStyle,
            getTextStyleForSubtitle,
            finalOutputDimensions,
            timelineStartFrame,
          )
        : { textSegments: [], currentTextStyle: undefined };

      return {
        inputs: trackInfos,
        output: outputFilename,
        outputPath,
        operations: {
          concat: trackInfos.length > 1,
          preset: 'superfast',
          threads: 8,
          targetFrameRate: timelineFps,
          normalizeFrameRate: trackInfos.length > 1,
          subtitles: subtitleContent ? 'temp_subtitles.ass' : undefined,
          textStyle: currentTextStyle,
          useHardwareAcceleration: false,
          hwaccelType: 'auto', // Auto-detect best available hardware acceleration
          preferHEVC: false, // Use H.264 (set to true for H.265/HEVC)
          aspect: targetAspectRatio, // Pass target aspect ratio for aspect ratio conversion
        },
        subtitleContent, // Only subtitles
        subtitleFormat: subtitleTracks.length > 0 ? 'ass' : undefined,
        textClips: textLayerResult.textSegments, // Text segments for drawtext filters
        subtitleFontFamilies: fontFamilies, // Subtitle fonts
        videoDimensions: finalOutputDimensions, // Pass final output dimensions for commandBuilder
      };
    },
    [
      tracks,
      mediaLibrary,
      timelineFps,
      textStyle,
      getTextStyleForSubtitle,
      preview,
    ],
  );

  return { createFFmpegJob };
};

/**
 * Get custom dimensions with validation and fallback
 * Uses custom canvas dimensions if valid, otherwise falls back to original track dimensions
 */
function getCustomDimensions(
  canvasWidth: number,
  canvasHeight: number,
  videoTracks: VideoTrack[],
): { width: number; height: number } {
  // Validate custom canvas dimensions
  const isValidCustomDimensions =
    canvasWidth > 0 &&
    canvasHeight > 0 &&
    !isNaN(canvasWidth) &&
    !isNaN(canvasHeight) &&
    isFinite(canvasWidth) &&
    isFinite(canvasHeight);

  if (isValidCustomDimensions) {
    console.log(
      `✅ Using custom canvas dimensions: ${canvasWidth}x${canvasHeight}`,
    );
    return { width: canvasWidth, height: canvasHeight };
  }

  // Fallback to original track dimensions
  console.warn(
    `⚠️ Custom dimensions invalid (${canvasWidth}x${canvasHeight}), falling back to track dimensions`,
  );

  // Find first visible video track with valid dimensions
  for (const track of videoTracks) {
    if (track.visible && track.width && track.height) {
      console.log(
        `📐 Fallback: Using track dimensions from "${track.name}": ${track.width}x${track.height}`,
      );
      return { width: track.width, height: track.height };
    }
  }

  // Final fallback to default dimensions
  console.warn(`⚠️ No valid track dimensions found, using default: 1920x1080`);
  return { width: 1920, height: 1080 };
}

/**
 * Get source video dimensions from the first video track
 */
function getSourceVideoDimensions(
  videoTracks: VideoTrack[],
): { width: number; height: number } {
  // Find first visible video track with valid dimensions
  for (const track of videoTracks) {
    if (track.visible && track.width && track.height) {
      console.log(
        `📐 Source video dimensions from track "${track.name}": ${track.width}x${track.height}`,
      );
      return { width: track.width, height: track.height };
    }
  }

  // Fallback to default dimensions
  console.warn(`⚠️ No valid video track dimensions found, using default: 1920x1080`);
  return { width: 1920, height: 1080 };
}

/**
 * Calculate intermediate video dimensions after aspect ratio conversion (scale+crop)
 * This is the resolution BEFORE final downscaling to custom dimensions
 * This matches the logic in commandBuilder.ts for scale+crop operations
 */
function calculateIntermediateDimensions(
  sourceDimensions: { width: number; height: number },
  targetAspectRatio?: string,
): { width: number; height: number } {
  if (!targetAspectRatio) {
    return sourceDimensions;
  }

  // Parse aspect ratio (e.g., "9:16" -> 0.5625)
  const parts = targetAspectRatio.split(':');
  if (parts.length !== 2) {
    console.warn(`Invalid aspect ratio format: ${targetAspectRatio}`);
    return sourceDimensions;
  }

  const targetRatio = parseFloat(parts[0]) / parseFloat(parts[1]);
  const sourceRatio = sourceDimensions.width / sourceDimensions.height;

  // If ratios are very close (within 1%), no conversion needed
  const ratioDifference = Math.abs(targetRatio - sourceRatio) / sourceRatio;
  if (ratioDifference < 0.01) {
    return sourceDimensions;
  }

  // Calculate intermediate dimensions after scale+crop at source resolution
  // Universal strategy: Always preserve the SMALLER source dimension
  const smallerDimension = Math.min(
    sourceDimensions.width,
    sourceDimensions.height,
  );

  let cropWidth: number;
  let cropHeight: number;

  if (targetRatio < 1) {
    // Portrait target (width < height) - smaller dimension becomes final width
    cropWidth = smallerDimension;
    cropHeight = Math.round(cropWidth / targetRatio);
  } else {
    // Landscape target (width >= height) - smaller dimension becomes final height
    cropHeight = smallerDimension;
    cropWidth = Math.round(cropHeight * targetRatio);
  }

  console.log(
    `📐 Calculated intermediate dimensions (after aspect crop): ${cropWidth}x${cropHeight} from ${sourceDimensions.width}x${sourceDimensions.height} (ratio ${sourceRatio.toFixed(3)} → ${targetRatio.toFixed(3)})`,
  );
  return { width: cropWidth, height: cropHeight };
}

/**
 * Process linked video/audio tracks into combined tracks
 */
function processLinkedTracks(
  videoTracks: VideoTrack[],
  audioTracks: VideoTrack[],
  imageTracks: VideoTrack[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mediaLibrary: {
    id: string;
    type: string;
    source: string;
    tempFilePath?: string;
    extractedAudio?: { audioPath: string };
  }[],
  customDimensions: { width: number; height: number },
) {
  const processedTracks: VideoTrack[] = [];
  const processedTrackIds = new Set<string>();

  // Use custom dimensions (from canvas/preview) instead of track dimensions
  // This ensures exported videos match what the user sees in the preview
  const videoWidth = customDimensions.width;
  const videoHeight = customDimensions.height;

  console.log(
    `📐 Using custom dimensions for export: ${videoWidth}x${videoHeight}`,
  );

  // Combine linked video/audio tracks
  for (const videoTrack of videoTracks) {
    if (processedTrackIds.has(videoTrack.id)) continue;

    // Process video and audio independently - video tracks are added as video-only
    // Audio tracks (whether linked or not) will be added separately below

    if (videoTrack.isLinked && videoTrack.linkedTrackId) {
      const linkedAudioTrack = audioTracks.find(
        (t) => t.id === videoTrack.linkedTrackId,
      );
      if (linkedAudioTrack) {
        // Add video track (will be muted in convertTracksToFFmpegInputs)
        processedTracks.push({
          ...videoTrack,
          visible: videoTrack.visible,
          // Don't use linkedAudioTrack.muted here - we'll process audio separately
        });
        processedTrackIds.add(videoTrack.id);
        // DON'T mark audio as processed - let it be added independently below
        console.log(
          `🔗 Processing linked video track: ${videoTrack.name} (audio will be processed separately)`,
        );
      } else {
        processedTracks.push(videoTrack);
        processedTrackIds.add(videoTrack.id);
      }
    } else {
      processedTracks.push(videoTrack);
      processedTrackIds.add(videoTrack.id);
    }
  }

  // Add all unprocessed audio tracks (process independently from video)
  console.log(`🔍 Adding unprocessed audio tracks...`);
  console.log(`   Total audio tracks: ${audioTracks.length}`);
  console.log(`   Processed track IDs:`, Array.from(processedTrackIds));

  for (const audioTrack of audioTracks) {
    if (!processedTrackIds.has(audioTrack.id)) {
      console.log(
        `   🎵 Adding audio track "${audioTrack.name}" (${audioTrack.id})`,
      );
      processedTracks.push(audioTrack);
    } else {
      console.log(
        `   ⏭️ Skipping already processed audio track "${audioTrack.name}"`,
      );
    }
  }

  // Add image tracks
  processedTracks.push(...imageTracks);

  return {
    processedTracks,
    videoDimensions: { width: videoWidth, height: videoHeight },
  };
}

/**
 * Convert VideoTracks to FFmpeg TrackInfo format
 * Processes video and audio as completely separate timelines
 */
function convertTracksToFFmpegInputs(
  tracks: VideoTrack[],
  timelineFps: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  mediaLibrary: {
    id: string;
    type: string;
    source: string;
    tempFilePath?: string;
    extractedAudio?: { audioPath: string };
  }[],
): TrackInfo[] {
  return tracks.map((track) => {
    const trackDurationSeconds = track.duration / timelineFps;
    const sourceStartTime = track.sourceStartTime || 0;

    console.log(
      `🎥 Adding track "${track.name}": type=${track.type}, timeline=${track.startFrame}-${track.endFrame}, source start ${sourceStartTime}s, duration ${trackDurationSeconds}s, dimensions: ${track.width}x${track.height}, aspect ratio: ${track.detectedAspectRatioLabel || 'custom'}`,
    );

    // DON'T attach audio to video tracks - process them independently
    // Video tracks will be video-only, audio tracks will be audio-only
    const trackInfo: TrackInfo = {
      path: track.source,
      audioPath: undefined, // Always undefined - no audio attached to video
      startTime: sourceStartTime, // Where to start reading from source file
      duration: Math.max(0.033, trackDurationSeconds), // How long to read from source
      timelineStartFrame: track.startFrame, // Timeline position where track starts
      timelineEndFrame: track.endFrame, // Timeline position where track ends
      muted: track.type === 'video' ? true : false, // Video tracks are "muted" (no audio from video file)
      trackType: track.type,
      visible: track.visible,
      width: track.width,
      height: track.height,
      aspectRatio: track.detectedAspectRatioLabel,
      detectedAspectRatioLabel: track.detectedAspectRatioLabel,
      sourceFps: track.sourceFps, // Original FPS from source media
      effectiveFps: track.effectiveFps, // User-set FPS for this track
    };

    // Add image transform for image tracks
    if (track.type === 'image' && track.textTransform) {
      trackInfo.imageTransform = {
        x: track.textTransform.x,
        y: track.textTransform.y,
        scale: track.textTransform.scale,
        rotation: track.textTransform.rotation,
        width: track.textTransform.width,
        height: track.textTransform.height,
      };
      console.log(
        `🎨 Image transform for "${track.name}": pos=(${track.textTransform.x.toFixed(2)}, ${track.textTransform.y.toFixed(2)}), scale=${track.textTransform.scale.toFixed(2)}, rotation=${track.textTransform.rotation.toFixed(1)}°`,
      );
    }

    // Add video transform for video tracks
    if (track.type === 'video' && track.textTransform) {
      trackInfo.videoTransform = {
        x: track.textTransform.x,
        y: track.textTransform.y,
        scale: track.textTransform.scale,
        rotation: track.textTransform.rotation,
        width: track.textTransform.width,
        height: track.textTransform.height,
      };
      console.log(
        `🎥 Video transform for "${track.name}": pos=(${track.textTransform.x.toFixed(2)}, ${track.textTransform.y.toFixed(2)}), scale=${track.textTransform.scale.toFixed(2)}, rotation=${track.textTransform.rotation.toFixed(1)}°, size=${track.textTransform.width}x${track.textTransform.height}`,
      );
    }

    return trackInfo;
  });
}
