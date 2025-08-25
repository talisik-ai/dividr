import React, { useCallback } from 'react';
import { useVideoEditorStore } from '../store/VideoEditorStore';
import { VideoPreview } from './Main/VideoPreview/VideoPreview';
interface VideoEditorProps {
  className?: string;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ className }) => {
  const { render, importMediaFromFiles, cancelRender } = useVideoEditorStore();

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
      className={`bg-secondary ${className || ''} flex flex-col h-full bg-body font-white p-4 rounded`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {/* Main Content Area */}
        <VideoPreview className="w-full h-full max-w-full max-h-full" />
      </div>

      {/* Render Progress Overlay */}
      {render.isRendering && (
        <div className="fixed top-0 left-0 right-0 bottom-0 bg-black bg-opacity-80 flex items-center justify-center z-1000">
          <div className="bg-black p-8 rounded text-center min-w-[200px] text-white border-2 border-white">
            <h3 className="m-0 mb-4">Rendering Video</h3>

            <div className="w-full h-2 bg-gray-700 rounded overflow-hidden mb-4">
              <div
                className={`h-full bg-green-500 transition-width duration-300 ease-in-out`}
                style={{ width: `${render.progress}%` }}
              />
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
