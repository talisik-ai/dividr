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
      const videoTracks = tracks.filter((track) => track.type === 'video');
      const audioTracks = tracks.filter((track) => track.type === 'audio');
      const imageTracks = tracks.filter((track) => track.type === 'image');

      // Process linked tracks
      const { processedTracks, videoDimensions } = processLinkedTracks(
        videoTracks,
        audioTracks,
        imageTracks,
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
      const trackInfos = convertTracksToFFmpegInputs(sortedTracks, timelineFps);

      // Generate subtitle content if needed
      const { subtitleContent, currentTextStyle } = generateSubtitleContent(
        subtitleTracks,
        textStyle,
        getTextStyleForSubtitle,
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
        subtitleContent,
        subtitleFormat: subtitleTracks.length > 0 ? 'ass' : undefined,
        videoDimensions,
      };
    },
    [tracks, timelineFps, textStyle, getTextStyleForSubtitle],
  );

  return { createFFmpegJob };
};

/**
 * Process linked video/audio tracks into combined tracks
 */
function processLinkedTracks(
  videoTracks: VideoTrack[],
  audioTracks: VideoTrack[],
  imageTracks: VideoTrack[],
) {
  const processedTracks: VideoTrack[] = [];
  const processedTrackIds = new Set<string>();

  let videoWidth = 1920;
  let videoHeight = 1080;

  // Combine linked video/audio tracks
  for (const videoTrack of videoTracks) {
    if (processedTrackIds.has(videoTrack.id)) continue;

    // Extract dimensions from first visible video track
    if (videoTrack.visible && videoWidth === 1920 && videoHeight === 1080) {
      if (videoTrack.width && videoTrack.height) {
        videoWidth = videoTrack.width;
        videoHeight = videoTrack.height;
        console.log(
          `📐 Using video dimensions from track "${videoTrack.name}": ${videoWidth}x${videoHeight}`,
        );
      }
    }

    if (videoTrack.isLinked && videoTrack.linkedTrackId) {
      const linkedAudioTrack = audioTracks.find(
        (t) => t.id === videoTrack.linkedTrackId,
      );
      if (linkedAudioTrack) {
        processedTracks.push({
          ...videoTrack,
          visible: videoTrack.visible,
          muted: linkedAudioTrack.muted,
        });
        processedTrackIds.add(videoTrack.id);
        processedTrackIds.add(linkedAudioTrack.id);
        console.log(
          `🔗 Combined linked tracks: ${videoTrack.name} (visible: ${videoTrack.visible}, muted: ${linkedAudioTrack.muted})`,
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

  // Fallback to image dimensions if no video dimensions found
  if (videoWidth === 1920 && videoHeight === 1080 && imageTracks.length > 0) {
    const firstVisibleImage = imageTracks.find((track) => track.visible);
    if (firstVisibleImage?.width && firstVisibleImage?.height) {
      videoWidth = firstVisibleImage.width;
      videoHeight = firstVisibleImage.height;
      console.log(
        `📐 Using image dimensions from track "${firstVisibleImage.name}": ${videoWidth}x${videoHeight}`,
      );
    }
  }

  // Add standalone audio tracks
  for (const audioTrack of audioTracks) {
    if (!processedTrackIds.has(audioTrack.id)) {
      processedTracks.push(audioTrack);
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
 */
function convertTracksToFFmpegInputs(
  tracks: VideoTrack[],
  timelineFps: number,
): TrackInfo[] {
  return tracks.map((track) => {
    const trackDurationSeconds = track.duration / timelineFps;
    const sourceStartTime = track.sourceStartTime || 0;

    console.log(
      `🎥 Adding track "${track.name}": source start ${sourceStartTime}s, duration ${trackDurationSeconds}s`,
    );

    return {
      path: track.source,
      startTime: sourceStartTime,
      duration: Math.max(0.033, trackDurationSeconds),
      muted: track.muted || false,
      trackType: track.type,
      visible: track.visible,
    };
  });
}
