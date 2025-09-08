import { VideoPreviewWrapper } from '@/Components/Main/VideoPreview/VideoPreviewWrapper';
import { useTimelineDuration } from '@/Hooks/useTimelineDuration';
import { useVideoEditorStore } from '@/Store/VideoEditorStore';
import React, { useCallback } from 'react';
interface VideoEditorProps {
  className?: string;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ className }) => {
  const { render, importMediaFromFiles, cancelRender } = useVideoEditorStore();
  const duration = useTimelineDuration();

  // Parse FFmpeg time format (HH:MM:SS.FF) to seconds
  const parseTimeToSeconds = useCallback((timeString: string): number => {
    if (!timeString) return 0;

    const match = timeString.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) return 0;

    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const centiseconds = parseInt(match[4], 10);

    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
  }, []);

  // Calculate time-based progress percentage
  const calculateTimeProgress = useCallback((): number => {
    if (!render.currentTime || duration.totalSeconds === 0) {
      return render.progress; // Fallback to percentage-based progress
    }

    const currentSeconds = parseTimeToSeconds(render.currentTime);
    const progressPercentage = (currentSeconds / duration.totalSeconds) * 100;

    return Math.min(100, Math.max(0, progressPercentage));
  }, [
    render.currentTime,
    render.progress,
    duration.totalSeconds,
    parseTimeToSeconds,
  ]);

  // Legacy fie import for drag & drop (will show warning)
  const handleFileImport = useCallback(
    (files: FileList) => {
      const fileArray = Array.from(files);
      importMediaFromFiles(fileArray);
    },
    [importMediaFromFiles],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files) {
        handleFileImport(e.dataTransfer.files);
      }
    },
    [handleFileImport],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      className={`${className || ''} flex flex-col h-full bg-primary dark:bg-primary-dark font-white p-4 rounded`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {/* Main Content Area */}
        <VideoPreviewWrapper
          className="w-full h-full max-w-full max-h-full"
          useDirectOptimization={true} // Use much better direct video approach
        />
      </div>

      {/* Render Progress Overlay */}
      {render.isRendering && (
        <div className="fixed top-0 left-0 right-0 bottom-0 bg-primary bg-opacity-80 flex items-center justify-center z-[1000]">
          <div className="bg-primary p-8 rounded text-center min-w-[200px] text-white border-2 border-primary">
            <h3 className="m-0 mb-4">Rendering Video</h3>
            <div className="w-full h-2 bg-gray-700 rounded overflow-hidden mb-4">
              <div
                className={`h-full bg-green-500 transition-width duration-300 ease-in-out`}
                style={{ width: `${calculateTimeProgress()}%` }}
              />
            </div>

            {/* Time Progress Display */}
            <div className="text-xs text-green-400 m-0 mb-2 font-mono">
              {render.currentTime || '00:00:00.00'} /{' '}
              {duration.formattedTime || '00:00:00.00'}
            </div>

            <p className="text-xs text-gray-400 m-0 mb-4">{render.status}</p>
            <button
              onClick={cancelRender}
              className="bg-red-600 border-none text-white text-xs cursor-pointer py-2 px-4 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
