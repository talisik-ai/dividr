/**
 * ExportButton Component
 * A specialized button component for exporting video projects
 * Handles all export logic and modal management
 */
import { ExportModal } from '@/Components/Main/Modal/ExportModal';
import { Button } from '@/Components/sub/ui/Button';
import { TrackInfo, VideoEditJob } from '@/Schema/ffmpegConfig';
import { useProjectStore } from '@/Store/ProjectStore';
import { useVideoEditorStore, VideoTrack } from '@/Store/VideoEditorStore';
import { FfmpegCallbacks, runFfmpegWithProgress } from '@/Utility/ffmpegRunner';
import {
  extractSubtitleSegments,
  generateASSContent,
} from '@/Utility/subtitleExporter';
import { Upload } from 'lucide-react';
import React, { useCallback, useState } from 'react';

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
  const {
    tracks,
    timeline,
    render,
    startRender,
    updateRenderProgress,
    finishRender,
    cancelRender,
    textStyle,
    getTextStyleForSubtitle,
  } = useVideoEditorStore();
  const { currentProject } = useProjectStore();

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  console.log(isExportModalOpen);

  // Function to generate .ass content from subtitle tracks using the subtitle exporter
  const generateAssContent = useCallback(
    (subtitleTracks: VideoTrack[]): string => {
      if (subtitleTracks.length === 0) return '';

      // Extract subtitle segments from tracks
      const segments = extractSubtitleSegments(subtitleTracks, timeline);

      // Get current text style
      const currentTextStyle = getTextStyleForSubtitle(textStyle.activeStyle);

      // Generate ASS content with styling
      return generateASSContent(segments, currentTextStyle);
    },
    [timeline, textStyle, getTextStyleForSubtitle],
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
        };
      }

      // Separate subtitle tracks for separate processing
      const subtitleTracks = tracks.filter(
        (track) => track.type === 'subtitle',
      );

      // Sort non-subtitle tracks by timeline position to process them in order
      const sortedTracks = [...tracks]
        .filter((track) => track.type !== 'subtitle') // Exclude subtitle tracks - they'll be handled as .srt file
        .filter((track) => {
          // For audio tracks, exclude if muted
          if (track.type === 'audio') {
            return !track.muted;
          }
          // For video and image tracks, always include (visibility/mute state will be handled in FFmpeg)
          return true;
        })
        .sort((a, b) => a.startFrame - b.startFrame);

      if (sortedTracks.length === 0) {
        return {
          inputs: [],
          output: outputFilename,
          outputPath,
          operations: {},
        };
      }

      const trackInfos: TrackInfo[] = [];

      // Process tracks in timeline order, adding black video for gaps
      let currentTimelineFrame = 0;

      for (const track of sortedTracks) {
        // If there's a gap before this track, add a black video segment
        if (track.startFrame > currentTimelineFrame) {
          const gapDurationFrames = track.startFrame - currentTimelineFrame;
          const gapDurationSeconds = gapDurationFrames / timeline.fps;

          if (gapDurationSeconds > 0.033) {
            // Only add significant gaps (> 1 frame)
            console.log(
              `🗬 Adding ${gapDurationSeconds}s gap before "${track.name}"`,
            );

            // Create a black video segment for the gap
            // We'll mark this as a gap and handle it specially in the command builder
            trackInfos.push({
              path: '__GAP__',
              duration: gapDurationSeconds,
              startTime: 0,
            });
          }
        }

        // Add the actual track with proper source timing
        const trackDurationSeconds = track.duration / timeline.fps;
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
        currentTimelineFrame = track.endFrame;
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
          targetFrameRate: timeline.fps,
          normalizeFrameRate: trackInfos.length > 1,
          subtitles: subtitleContent ? 'temp_subtitles.ass' : undefined, // FFmpeg will look for this file
          textStyle: currentTextStyle,
        },
        subtitleContent, // Pass the subtitle content separately so main process can create the file
        subtitleFormat: subtitleTracks.length > 0 ? 'ass' : undefined,
      };
    },
    [
      tracks,
      timeline.fps,
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

      const job = createFFmpegJob(outputFilename, outputPath);
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

      try {
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

export default ExportButton;
