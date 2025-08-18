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
import { useVideoEditorStore } from '../../Store/videoEditorStore';
import {
  FfmpegCallbacks,
  runFfmpegWithProgress,
} from '../../Utility/ffmpegRunner';
import { useTheme } from '../../Utility/ThemeProvider';
import { Input } from '../ui/input';
interface TitleBarProps {
  className?: string;
}

const TitleBar: React.FC<TitleBarProps> = ({ className }) => {
  const { theme } = useTheme();
  const location = useLocation();
  const [isMaximized, setIsMaximized] = React.useState<boolean>(false);
  const {
    tracks,
    timeline,
    render,
    startRender,
    updateRenderProgress,
    finishRender,
    cancelRender,
    importMediaFromDialog,
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

  // Convert tracks to FFmpeg job
  const createFFmpegJob = useCallback((): VideoEditJob => {
    // Build a comprehensive job with per-track timing information
    const trackInfos = tracks.map((track) => {
      // Ensure we have valid frame ranges
      const startFrame = Math.max(0, track.startFrame);
      const endFrame = Math.max(startFrame + 1, track.endFrame); // Ensure minimum 1 frame duration
      const duration = (endFrame - startFrame) / timeline.fps;

      return {
        path: track.source,
        startTime: startFrame / timeline.fps, // Convert frames to seconds
        duration: Math.max(0.033, duration), // Minimum 1 frame at 30fps
        endTime: endFrame / timeline.fps,
      };
    });

    return {
      inputs: trackInfos,
      output: 'final_video.mp4',
      operations: {
        concat: tracks.length > 1,
        targetFrameRate: timeline.fps,
        normalizeFrameRate: true,
      },
    };
  }, [tracks, timeline.fps]);

  // Render video using FFmpeg
  const handleRender = useCallback(async () => {
    if (tracks.length === 0) {
      alert('No tracks to render');
      return;
    }

    const job = createFFmpegJob();
    console.log(job);

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
      onLog: (log, type) => {
        console.log(`[${type}] ${log}`);
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
      console.error('Render failed:', error);
      cancelRender();
      alert(`Render failed: ${error}`);
    }
  }, [
    tracks,
    createFFmpegJob,
    render.progress,
    startRender,
    updateRenderProgress,
    finishRender,
    cancelRender,
  ]);

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
    </>
  );
};

export default TitleBar;
