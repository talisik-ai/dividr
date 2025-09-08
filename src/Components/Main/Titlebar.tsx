/**
 * A custom React fixed component
 * A Fixed element in the header portion of Downlodr, displays the title/logo of Downlodr with the window controls (maximize, minimize, and close)
 *
 * @param className - for UI of TitleBar
 * @returns JSX.Element - The rendered component displaying a TitleBar
 *
 */
import LogoDark from '@/Assets/Logo/Logo-Dark.svg';
import LogoLight from '@/Assets/Logo/Logo-Light.svg';
import { ExportModal } from '@/Components/Main/Modal/ExportModal';
import { ModeToggle } from '@/Components/sub/custom/ModeToggle';
import { Input } from '@/Components/sub/ui/Input';
import { cn } from '@/Lib/utils';
import { VideoEditJob } from '@/Schema/ffmpegConfig';
import { useProjectStore } from '@/Store/projectStore';
import { useVideoEditorStore, VideoTrack } from '@/Store/videoEditorStore';
import { FfmpegCallbacks, runFfmpegWithProgress } from '@/Utility/ffmpegRunner';
import {
  extractSubtitleSegments,
  generateASSContent,
} from '@/Utility/subtitleExporter';
import { useTheme } from '@/Utility/ThemeProvider';
import { Minus } from 'lucide-react';
import React, { useCallback } from 'react';
import { IoMdClose } from 'react-icons/io';
import { PiBrowsers, PiExportBold } from 'react-icons/pi';
import { RxBox } from 'react-icons/rx';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../sub/ui/Button';

interface TitleBarProps {
  className?: string;
}

const TitleBar: React.FC<TitleBarProps> = ({ className }) => {
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
    // importMediaFromDialog, // Unused for now
  } = useVideoEditorStore();
  const { metadata, setTitle } = useProjectStore();
  const { theme } = useTheme();

  const location = useLocation();

  const [isMaximized, setIsMaximized] = React.useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] =
    React.useState<boolean>(false);

  const navigate = useNavigate();

  // Determine context based on current route
  const isInVideoEditor = location.pathname.startsWith('/video-editor');
  const titleText = isInVideoEditor ? (
    <Input
      className="border-none text-center text-sm p-2 h-6"
      placeholder="Untitled Project"
      value={metadata.title}
      onChange={(e) => setTitle(e.target.value)}
    />
  ) : (
    'Dividr'
  );
  const showExportButton = isInVideoEditor;

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
        .filter((track) => track.visible) // Only include visible tracks
        .filter((track) => track.type !== 'subtitle') // Exclude subtitle tracks - they'll be handled as .srt file
        .sort((a, b) => a.startFrame - b.startFrame);

      if (sortedTracks.length === 0) {
        return {
          inputs: [],
          output: outputFilename,
          outputPath,
          operations: {},
        };
      }

      const trackInfos: Array<{
        path: string;
        startTime?: number;
        duration?: number;
      }> = [];

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

  const handleCreateProject = () => {
    navigate('/video-editor');
  };

  // Function to toggle maximize/restore
  const handleMaximizeRestore = () => {
    window.appControl.maximizeApp();
    setIsMaximized(!isMaximized);
  };

  // Handle close button click
  const handleCloseClick = () => {
    window.appControl.quitApp();
  };

  // Adjust downlodr logo used depending on the light/dark mode
  /*
  const getLogoSrc = () => {
    if (theme === 'system') {
      // Check system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? downlodrLogoDark
        : downlodrLogoLight;
    }
    // Direct theme selection
    return theme === 'dark' ? downlodrLogoDark : downlodrLogoLight;
  };
  */
  return (
    <>
      <div className={cn('bg-zinc-100 dark:bg-zinc-900', className)}>
        <div className="relative flex items-center h-8 px-4 py-1 drag-area">
          {/* Logo */}
          <div className="flex items-center">
            <img
              src={theme === 'dark' ? LogoDark : LogoLight}
              className="h-5 w-auto"
              alt="Dividr Logo"
            />
          </div>

          {/* Centered Title */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center">
            <span className="text-zinc-900 dark:text-zinc-100 no-drag">
              {titleText}
            </span>
          </div>

          {/* Right Side Controls */}
          <div className="flex items-center gap-2 no-drag text-gray-800 dark:text-gray-100 ml-auto h-6">
            {/* Export Button - Only show in video editor */}
            {showExportButton && (
              <button
                onClick={handleRender}
                disabled={render.isRendering || tracks.length === 0}
                className="h-6 bg-highlight border-none text-white text-xs lg:text-sm cursor-pointer px-3 py-1 rounded flex items-center gap-2 hover:bg-highlight/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {render.isRendering
                  ? `Exporting... ${render.progress.toFixed(0)}%`
                  : 'Export'}
                <PiExportBold size={14} />
              </button>
            )}

            {/* New Project Button - Only show when not in video editor */}
            {!showExportButton && (
              <Button onClick={handleCreateProject} variant="secondary">
                New Project
              </Button>
            )}

            {/* Dark Mode/Light Mode Toggle */}
            <div className="flex items-center">
              <ModeToggle />
            </div>

            {/* Window Controls */}
            <div className="flex items-center">
              {/* Minimize Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.appControl.minimizeApp()}
                title="Minimize"
              >
                <Minus size={16} />
              </Button>

              {/* Maximize Button with dynamic icon */}
              <button
                className="w-8 h-6 rounded-md hover:bg-gray-300 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                onClick={handleMaximizeRestore}
                title={isMaximized ? 'Restore' : 'Maximize'}
              >
                {isMaximized ? <PiBrowsers size={16} /> : <RxBox size={16} />}
              </button>

              {/* Close Button */}
              <button
                className="w-8 h-6 rounded-md hover:bg-red-600 flex items-center justify-center transition-colors"
                onClick={handleCloseClick}
                title="Close"
              >
                <IoMdClose size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Export Configuration Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportConfirm}
        defaultFilename={metadata.title.trim() || 'Untitled_Project'}
      />
    </>
  );
};

export default TitleBar;
