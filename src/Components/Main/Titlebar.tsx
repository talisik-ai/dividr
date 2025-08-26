/**
 * A custom React fixed component
 * A Fixed element in the header portion of Downlodr, displays the title/logo of Downlodr with the window controls (maximize, minimize, and close)
 *
 * @param className - for UI of TitleBar
 * @returns JSX.Element - The rendered component displaying a TitleBar
 *
 */
import React, { useCallback } from 'react';
import { FaPlus } from 'react-icons/fa';
import { IoMdClose, IoMdRemove } from 'react-icons/io';
import { PiBrowsers, PiExportBold } from 'react-icons/pi';
import { RxBox } from 'react-icons/rx';
import { useLocation, useNavigate } from 'react-router-dom';
import logo from '../../Assets/Logo/logo.svg';
import { VideoEditJob } from '../../Schema/ffmpegConfig';
import { useVideoEditorStore } from '../../store/VideoEditorStore';
import {
  FfmpegCallbacks,
  runFfmpegWithProgress,
} from '../../Utility/ffmpegRunner';
import { ExportModal } from '../ui/ExportModal';
import { Input } from '../ui/input';
interface TitleBarProps {
  className?: string;
}

const TitleBar: React.FC<TitleBarProps> = ({ className }) => {
  // const { theme } = useTheme(); // Unused for now
  const location = useLocation();
  const [isMaximized, setIsMaximized] = React.useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] =
    React.useState<boolean>(false);
  const {
    tracks,
    timeline,
    render,
    startRender,
    updateRenderProgress,
    finishRender,
    cancelRender,
    // importMediaFromDialog, // Unused for now
  } = useVideoEditorStore();
  const navigate = useNavigate();

  // Determine context based on current route
  const isInVideoEditor = location.pathname.startsWith('/video-editor');
  const titleText = isInVideoEditor ? (
    <Input className="border-none text-center text-sm p-2 h-6" />
  ) : (
    'Dividr'
  );
  const showExportButton = isInVideoEditor;

  // Convert tracks to FFmpeg job with timeline-aware processing
  const createFFmpegJob = useCallback(
    (outputFilename = 'final_video.mp4', outputPath?: string): VideoEditJob => {
      if (tracks.length === 0) {
        return {
          inputs: [],
          output: outputFilename,
          outputPath,
          operations: {},
        };
      }

      // Sort tracks by timeline position to process them in order
      const sortedTracks = [...tracks]
        .filter((track) => track.visible) // Only include visible tracks
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

      return {
        inputs: trackInfos,
        output: outputFilename,
        outputPath,
        operations: {
          concat: trackInfos.length > 1,
          targetFrameRate: timeline.fps,
          normalizeFrameRate: trackInfos.length > 1,
        },
      };
    },
    [tracks, timeline.fps],
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

      const callbacks: FfmpegCallbacks = {
        onProgress: (progress) => {
          if (progress.percentage) {
            updateRenderProgress(
              progress.percentage,
              `Rendering... ${progress.percentage.toFixed(1)}%`,
            );
          }
        },
        onStatus: (status) => {
          updateRenderProgress(render.progress, status);
        },
        onLog: () => {
          // Disabled logging for now
        },
      };

      try {
        startRender({
          outputPath: job.output,
          format: 'mp4',
          quality: 'high',
        });

        await runFfmpegWithProgress(job, callbacks);
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
      <div className={className}>
        <div className="relative flex items-center h-6 px-4 py-2 drag-area">
          {/* Title */}
          <div className="text-sm">
            <img src={logo} className="h-6" />
          </div>

          {/* Centered Title */}
          <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center justify-center">
            <span className="text-white no-drag">{titleText}</span>
          </div>

          {/* Buttons */}
          <div className="flex space-x-2 no-drag text-white ml-auto">
            {/* Export Button - Only show in video editor */}
            {showExportButton && (
              <button
                onClick={handleRender}
                disabled={render.isRendering || tracks.length === 0}
                className="m-2 h-6 lg:h-8 bg-primary border-none text-white text-xs lg:text-sm cursor-pointer px-2 py-0 rounded flex flex-row gap-1 items-center justify-center"
              >
                {render.isRendering
                  ? `Exporting... ${render.progress.toFixed(0)}%`
                  : 'Export'}
                <PiExportBold size={16} />
              </button>
            )}

            {/* Import Media Button - Only show when not in video editor */}
            {!showExportButton && (
              <button
                onClick={handleCreateProject}
                className="m-2 h-6 lg:h-8  bg-primary border-none text-white text-xs lg:text-sm cursor-pointer px-4 py-0 rounded flex flex-row gap-1 items-center justify-center"
              >
                <FaPlus size={16} />
                New Project
              </button>
            )}
            {/*Dark Mode/Light Mode 
            <ModeToggle />
            */}
            {/* Minimize Button */}
            <button
              className="rounded-md hover:bg-gray-700 dark:hover:bg-darkModeCompliment hover:opacity-100 p-1 m-2"
              onClick={() => window.appControl.minimizeApp()}
            >
              <IoMdRemove size={16} />
            </button>

            {/* Maximize Button with dynamic icon */}
            <button
              className="rounded-md hover:bg-gray-700 dark:hover:bg-darkModeCompliment hover:opacity-100 p-1 m-2"
              onClick={handleMaximizeRestore}
            >
              {isMaximized ? <PiBrowsers size={16} /> : <RxBox size={14} />}
            </button>

            {/* Close Button */}
            <button
              className="rounded-md hover:bg-gray-700 dark:hover:bg-darkModeCompliment hover:opacity-100 p-1 m-2"
              onClick={handleCloseClick}
            >
              <IoMdClose size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Export Configuration Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportConfirm}
        defaultFilename="final_video"
      />
    </>
  );
};

export default TitleBar;
