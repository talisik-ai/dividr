/**
 * ExportButton Component
 * A specialized button component for exporting video projects
 * Handles all export logic and modal management
 */
import {
  FfmpegCallbacks,
  runFfmpegWithProgress,
} from '@/backend/ffmpeg/ffmpegRunner';
import { TrackInfo, VideoEditJob } from '@/backend/ffmpeg/schema/ffmpegConfig';
import {
  extractSubtitleSegments,
  generateASSContent,
} from '@/backend/ffmpeg/subtitleExporter';
import { Button } from '@/frontend/components/ui/button';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { Upload } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { ExportModal } from '../../../export/ExportModal';
import {
  useTimelineUtils,
  useVideoEditorStore,
  VideoTrack,
} from '../../stores/VideoEditorStore';

interface ExportButtonProps {
  className?: string;
  variant?:
    | 'default'
    | 'destructive'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link';
  disabled?: boolean;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  className = '',
  variant = 'secondary',
  disabled = false,
}) => {
  // Subscribe to only the state and actions we need, not the entire store
  const tracks = useVideoEditorStore((state) => state.tracks);
  // Only subscribe to fps from timeline, not the entire timeline object (which includes currentFrame)
  const timelineFps = useVideoEditorStore((state) => state.timeline.fps);
  const render = useVideoEditorStore((state) => state.render);
  const startRender = useVideoEditorStore((state) => state.startRender);
  const updateRenderProgress = useVideoEditorStore(
    (state) => state.updateRenderProgress,
  );
  const finishRender = useVideoEditorStore((state) => state.finishRender);
  const cancelRender = useVideoEditorStore((state) => state.cancelRender);
  const textStyle = useVideoEditorStore((state) => state.textStyle);
  const getTextStyleForSubtitle = useVideoEditorStore(
    (state) => state.getTextStyleForSubtitle,
  );
  const { currentProject } = useProjectStore();
  const { getTimelineGaps } = useTimelineUtils();
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Function to generate .ass content from subtitle tracks using the subtitle exporter
  const generateAssContent = useCallback(
    (subtitleTracks: VideoTrack[]): string => {
      if (subtitleTracks.length === 0) return '';

      // Extract subtitle segments from tracks
      // Get timeline data non-reactively for subtitle extraction
      const { timeline } = useVideoEditorStore.getState();
      const segments = extractSubtitleSegments(subtitleTracks, timeline);

      // Get current text style
      const currentTextStyle = getTextStyleForSubtitle(textStyle.activeStyle);

      // Generate ASS content with styling
      return generateASSContent(segments, currentTextStyle);
    },
    [textStyle, getTextStyleForSubtitle],
  );

  // Convert tracks to FFmpeg job with timeline-aware processing
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
          videoDimensions: { width: 1920, height: 1080 }, // Default dimensions
        };
      }

      // Separate subtitle tracks for separate processing
      const subtitleTracks = tracks.filter(
        (track) => track.type === 'subtitle',
      );

      // Process linked video/audio tracks into combined tracks for export
      const videoTracks = tracks.filter((track) => track.type === 'video');
      const audioTracks = tracks.filter((track) => track.type === 'audio');
      const imageTracks = tracks.filter((track) => track.type === 'image');

      const processedTracks: VideoTrack[] = [];
      const processedTrackIds = new Set<string>();

      // Variables to store video dimensions
      let videoWidth = 1920; // Default width
      let videoHeight = 1080; // Default height

      // Combine linked video/audio tracks for export
      for (const videoTrack of videoTracks) {
        if (processedTrackIds.has(videoTrack.id)) continue;

        // Extract video dimensions from the first visible video track
        if (videoTrack.visible && videoWidth === 1920 && videoHeight === 1080) {
          if (videoTrack) {
            videoWidth = videoTrack.width;
            videoHeight = videoTrack.height;
            console.log(
              `📐 Using video dimensions from track "${videoTrack.name}": ${videoWidth}x${videoHeight}`,
            );
          } else if (videoTrack.width && videoTrack.height) {
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
            // Create a combined track that represents the original video file
            const combinedTrack: VideoTrack = {
              ...videoTrack,
              // Use video track's visibility
              visible: videoTrack.visible,
              // Use audio track's mute state (the actual audio that gets muted)
              muted: linkedAudioTrack.muted,
            };
            processedTracks.push(combinedTrack);
            processedTrackIds.add(videoTrack.id);
            processedTrackIds.add(linkedAudioTrack.id);
            console.log(
              `🔗 Combined linked tracks for export: ${videoTrack.name} (visible: ${videoTrack.visible}, muted: ${linkedAudioTrack.muted})`,
            );
          } else {
            // Video track without linked audio (shouldn't happen but handle it)
            processedTracks.push(videoTrack);
            processedTrackIds.add(videoTrack.id);
          }
        } else {
          // Standalone video track (old format)
          processedTracks.push(videoTrack);
          processedTrackIds.add(videoTrack.id);
        }
      }

      // If no video dimensions found from video tracks, check image tracks
      if (
        videoWidth === 1920 &&
        videoHeight === 1080 &&
        imageTracks.length > 0
      ) {
        const firstVisibleImage = imageTracks.find((track) => track.visible);
        if (firstVisibleImage) {
          if (firstVisibleImage) {
            videoWidth = firstVisibleImage.width;
            videoHeight = firstVisibleImage.height;
            console.log(
              `📐 Using image dimensions from track "${firstVisibleImage.name}": ${videoWidth}x${videoHeight}`,
            );
          } else if (firstVisibleImage.width && firstVisibleImage.height) {
            videoWidth = firstVisibleImage.width;
            videoHeight = firstVisibleImage.height;
            console.log(
              `📐 Using image dimensions from track "${firstVisibleImage.name}": ${videoWidth}x${videoHeight}`,
            );
          }
        }
      }

      // Add standalone audio tracks that aren't linked
      for (const audioTrack of audioTracks) {
        if (!processedTrackIds.has(audioTrack.id)) {
          processedTracks.push(audioTrack);
        }
      }

      // Add image tracks
      processedTracks.push(...imageTracks);

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
          videoDimensions: { width: videoWidth, height: videoHeight },
        };
      }

      const trackInfos: TrackInfo[] = [];

      // Process tracks in timeline order, adding black video for gaps
      // let currentTimelineFrame = 0;

      for (const track of sortedTracks) {
        // If there's a gap before this track, add a black video segment
        // if (track.startFrame > currentTimelineFrame) {
        //   // const gapDurationFrames = track.startFrame - currentTimelineFrame;
        //   // const gapDurationSeconds = gapDurationFrames / timelineFps;
        //   /**
        //   if (gapDurationSeconds > 0.033) {
        //     // Only add significant gaps (> 1 frame)
        //     console.log(
        //       `🗬 Adding ${gapDurationSeconds}s gap before "${track.name}"`,
        //     );

        //     // Create a black video segment for the gap
        //     // We'll mark this as a gap and handle it specially in the command builder
        //     trackInfos.push({
        //       path: '__GAP__',
        //       duration: gapDurationSeconds,
        //       startTime: 0,
        //     });
        //   }*/
        // }

        // Add the actual track with proper source timing
        const trackDurationSeconds = track.duration / timelineFps;
        const sourceStartTime = track.sourceStartTime || 0;

        console.log(
          `🎥 Adding track "${track.name}": source start ${sourceStartTime}s, duration ${trackDurationSeconds}s`,
        );

        trackInfos.push({
          path: track.source,
          startTime: sourceStartTime,
          duration: Math.max(0.033, trackDurationSeconds),
          muted: track.muted || false,
          trackType: track.type,
          visible: track.visible,
        });

        // Update current position to the end of this track
        // currentTimelineFrame = track.endFrame;
      }

      // Generate subtitle content if there are subtitle tracks
      let subtitleContent = '';
      let currentTextStyle = undefined;
      if (subtitleTracks.length > 0) {
        subtitleContent = generateAssContent(subtitleTracks);
        currentTextStyle = getTextStyleForSubtitle(textStyle.activeStyle);
        console.log(
          '📝 Generated subtitle content for export with text style:',
          textStyle.activeStyle,
        );
      }

      return {
        inputs: trackInfos,
        output: outputFilename,
        outputPath,
        operations: {
          concat: trackInfos.length > 1,
          preset: 'superfast', // ⚡ This adds -preset superfast to the FFmpeg command
          threads: 8, // uses 8 threads
          targetFrameRate: timelineFps,
          normalizeFrameRate: trackInfos.length > 1,
          subtitles: subtitleContent ? 'temp_subtitles.ass' : undefined, // FFmpeg will look for this file
          textStyle: currentTextStyle,
          useHardwareAcceleration: true, 
          hwaccelType: 'auto', // Auto-detect best available hardware acceleration
          preferHEVC: false, // Use H.264 (set to true for H.265/HEVC)
        },
        subtitleContent, // Pass the subtitle content separately so main process can create the file
        subtitleFormat: subtitleTracks.length > 0 ? 'ass' : undefined,
        videoDimensions: { width: videoWidth, height: videoHeight }, // Store video dimensions
      };
    },
    [
      tracks,
      timelineFps,
      generateAssContent,
      textStyle,
      getTextStyleForSubtitle,
    ],
  );

  // Handle export button click - shows modal
  const handleRender = useCallback(() => {
    if (tracks.length === 0) {
      alert('No tracks to render');
      return;
    }
    setIsExportModalOpen(true);
  }, [tracks.length]);

  // Render video using FFmpeg with specified config
  const handleActualRender = useCallback(
    async (outputFilename: string, outputPath?: string) => {
      if (tracks.length === 0) {
        alert('No tracks to render');
        return;
      }
      try {
        // 1. Get the gaps data from the new hook
        const gaps = getTimelineGaps();
        console.log('Gaps detected:', gaps);

        // 2. Prepare the FFmpeg job data with the new gaps property
        const job = createFFmpegJob(outputFilename, outputPath);

        // Add the gaps to the FFmpeg job
        job.gaps = gaps;

        //const job = createFFmpegJob(outputFilename, outputPath);
        console.log('🎬 FFmpeg Job:', job);
        console.log('🗂️ Output Path:', outputPath);

        // Store the latest currentTime to avoid race conditions
        let latestCurrentTime = render.currentTime;

        const callbacks: FfmpegCallbacks = {
          onProgress: (progress) => {
            // Always update if we have outTime, even without percentage
            if (progress.outTime) {
              // Update our local tracking variable
              latestCurrentTime = progress.outTime;

              updateRenderProgress(
                progress.percentage || render.progress,
                progress.percentage
                  ? `Rendering... ${progress.percentage.toFixed(1)}%`
                  : render.status,
                progress.outTime, // Pass the current time from FFmpeg
              );
            } else if (progress.percentage) {
              updateRenderProgress(
                progress.percentage,
                `Rendering... ${progress.percentage.toFixed(1)}%`,
                latestCurrentTime, // Use latest currentTime
              );
            }
          },
          onStatus: (status) => {
            updateRenderProgress(render.progress, status, latestCurrentTime);
            console.log(render.progress);
          },
          onLog: () => {
            // Disabled logging for now
          },
        };

        console.log('🚀 Starting render process...');
        startRender({
          outputPath: job.output,
          format: 'mp4',
          quality: 'high',
        });

        console.log('📞 Calling runFfmpegWithProgress...');
        const result = await runFfmpegWithProgress(job, callbacks);
        console.log('✅ runFfmpegWithProgress completed:', result);

        finishRender();
        alert('Render completed successfully!');
      } catch (error) {
        //console.error('Render failed:', error);
        cancelRender();
        alert(`Render failed: ${error}`);
      }
    },
    [
      tracks,
      createFFmpegJob,
      render.progress,
      startRender,
      updateRenderProgress,
      finishRender,
      cancelRender,
      getTimelineGaps,
    ],
  );

  // Handle export modal confirmation
  const handleExportConfirm = useCallback(
    (config: { filename: string; format: string; outputPath: string }) => {
      setIsExportModalOpen(false);
      handleActualRender(config.filename, config.outputPath);
    },
    [handleActualRender],
  );

  const isButtonDisabled =
    disabled || render.isRendering || tracks.length === 0;

  return (
    <>
      <Button
        variant={variant}
        onClick={handleRender}
        disabled={isButtonDisabled}
        className={className}
        size="sm"
      >
        {render.isRendering
          ? `Exporting... ${render.progress.toFixed(0)}%`
          : 'Export'}
        <Upload className="size-3.5" />
      </Button>

      {/* Export Configuration Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportConfirm}
        defaultFilename={
          currentProject?.metadata?.title?.trim() || 'Untitled_Project'
        }
      />
    </>
  );
};

export { ExportButton };
