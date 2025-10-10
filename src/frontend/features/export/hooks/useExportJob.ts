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
      const videoTracks = tracks.filter((track) => track.type === 'video');
      const audioTracks = tracks.filter((track) => track.type === 'audio');
      const imageTracks = tracks.filter((track) => track.type === 'image');
      
      console.log(`📊 Track counts: video=${videoTracks.length}, audio=${audioTracks.length}, image=${imageTracks.length}, subtitle=${subtitleTracks.length}`);
      console.log(`🎥 Video tracks:`, videoTracks.map(t => ({ id: t.id, name: t.name, startFrame: t.startFrame, endFrame: t.endFrame, isLinked: t.isLinked, linkedTrackId: t.linkedTrackId })));
      console.log(`🎵 Audio tracks:`, audioTracks.map(t => ({ id: t.id, name: t.name, source: t.source, startFrame: t.startFrame, endFrame: t.endFrame, isLinked: t.isLinked, linkedTrackId: t.linkedTrackId })));

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
    [tracks, mediaLibrary, timelineFps, textStyle, getTextStyleForSubtitle],
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

  // Add all unprocessed audio tracks (process independently from video)
  console.log(`🔍 Adding unprocessed audio tracks...`);
  console.log(`   Total audio tracks: ${audioTracks.length}`);
  console.log(`   Processed track IDs:`, Array.from(processedTrackIds));
  
  for (const audioTrack of audioTracks) {
    if (!processedTrackIds.has(audioTrack.id)) {
      console.log(`   🎵 Adding audio track "${audioTrack.name}" (${audioTrack.id})`);
      processedTracks.push(audioTrack);
    } else {
      console.log(`   ⏭️ Skipping already processed audio track "${audioTrack.name}"`);
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
      `🎥 Adding track "${track.name}": type=${track.type}, source start ${sourceStartTime}s, duration ${trackDurationSeconds}s`,
    );

    // DON'T attach audio to video tracks - process them independently
    // Video tracks will be video-only, audio tracks will be audio-only
    const trackInfo: TrackInfo = {
      path: track.source,
      audioPath: undefined, // Always undefined - no audio attached to video
      startTime: sourceStartTime,
      duration: Math.max(0.033, trackDurationSeconds),
      muted: track.type === 'video' ? true : false, // Video tracks are "muted" (no audio from video file)
      trackType: track.type,
      visible: track.visible,
    };

    return trackInfo;
  });
}
