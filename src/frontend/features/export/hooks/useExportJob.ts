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
import { generateSubtitleContent } from '../utils/subtitleUtils';

export const useExportJob = () => {
  const tracks = useVideoEditorStore((state) => state.tracks);
  const mediaLibrary = useVideoEditorStore((state) => state.mediaLibrary);
  const timelineFps = useVideoEditorStore((state) => state.timeline.fps);
  const textStyle = useVideoEditorStore((state) => state.textStyle);
  const getTextStyleForSubtitle = useVideoEditorStore(
    (state) => state.getTextStyleForSubtitle,
  );

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

      // Process linked tracks
      const { processedTracks, videoDimensions } = processLinkedTracks(
        videoTracks,
        audioTracks,
        imageTracks,
        mediaLibrary,
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

      // Determine the target aspect ratio from the first video track
      let targetAspectRatio: string | undefined = undefined;
      for (const track of videoTracks) {
        if (track.detectedAspectRatioLabel) {
          targetAspectRatio = track.detectedAspectRatioLabel;
          console.log(`📐 Using aspect ratio from first video track: ${targetAspectRatio}`);
          break;
        }
      }

      // Calculate final video dimensions after aspect ratio conversion (scale+crop)
      // This ensures subtitles and text are positioned correctly relative to the final video
      const finalVideoDimensions = calculateFinalDimensions(
        videoDimensions,
        targetAspectRatio,
      );
      
      console.log(
        `📐 Video dimensions: source=${videoDimensions.width}x${videoDimensions.height}, ` +
        `final=${finalVideoDimensions.width}x${finalVideoDimensions.height} ` +
        `(aspect ratio: ${targetAspectRatio || 'none'})`
      );

      // Generate subtitle content (now includes text clips bundled together)
      // Use finalVideoDimensions so subtitles are positioned for the final video after scale+crop
      const { subtitleContent, currentTextStyle, fontFamilies } =
        generateSubtitleContent(
          subtitleTracks,
          textTracks, // Pass text tracks to be bundled with subtitles
          textStyle,
          getTextStyleForSubtitle,
          finalVideoDimensions, // Use final dimensions after aspect ratio conversion
          timelineStartFrame, // Pass start frame for time offset adjustment
        );

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
        },
        subtitleContent, // Now includes both subtitles and text clips
        subtitleFormat:
          subtitleTracks.length > 0 || textTracks.length > 0
            ? 'ass'
            : undefined,
        subtitleFontFamilies: fontFamilies, // Pass font families, main process will resolve paths
        videoDimensions: finalVideoDimensions, // Use final dimensions after aspect ratio conversion
        // textClips and textClipsContent removed - now bundled with subtitles
      };
    },
    [tracks, mediaLibrary, timelineFps, textStyle, getTextStyleForSubtitle],
  );

  return { createFFmpegJob };
};

/**
 * Calculate final video dimensions after aspect ratio conversion
 * This matches the logic in commandBuilder.ts for scale+crop operations
 */
function calculateFinalDimensions(
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

  // Calculate final dimensions after scale+crop
  // Universal strategy: Always preserve the SMALLER source dimension
  const smallerDimension = Math.min(sourceDimensions.width, sourceDimensions.height);
  
  let cropWidth: number;
  let cropHeight: number;
  
  if (targetRatio < 1) {
    // Portrait target (width < height) - smaller dimension becomes final width
    cropWidth = smallerDimension;
    cropHeight = Math.round(cropWidth / targetRatio);
  } else {
    // Landscape target (width > height) - smaller dimension becomes final height
    cropHeight = smallerDimension;
    cropWidth = Math.round(cropHeight * targetRatio);
  }
  
  console.log(
    `📐 Calculated final dimensions: ${cropWidth}x${cropHeight} from ${sourceDimensions.width}x${sourceDimensions.height} (ratio ${sourceRatio.toFixed(3)} → ${targetRatio.toFixed(3)})`
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
) {
  const processedTracks: VideoTrack[] = [];
  const processedTrackIds = new Set<string>();

  let videoWidth = 1920;
  let videoHeight = 1080;
  let dimensionsSet = false; // Track whether we've already extracted dimensions

  // Combine linked video/audio tracks
  for (const videoTrack of videoTracks) {
    if (processedTrackIds.has(videoTrack.id)) continue;

    // Extract dimensions from first visible video track
    if (videoTrack.visible && !dimensionsSet) {
      if (videoTrack.width && videoTrack.height) {
        videoWidth = videoTrack.width;
        videoHeight = videoTrack.height;
        dimensionsSet = true;
        console.log(
          `📐 Using video dimensions from track "${videoTrack.name}": ${videoWidth}x${videoHeight}`,
        );
      }
    }

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

    return trackInfo;
  });
}
