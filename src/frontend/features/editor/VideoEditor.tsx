import { cn } from '@/frontend/utils/utils';
import React, { useCallback } from 'react';
import { VideoPreviewWrapper } from './preview/VideoPreviewWrapper';
import { useVideoEditorStore } from './stores/videoEditor/index';

interface VideoEditorProps {
  className?: string;
}

const VideoEditor: React.FC<VideoEditorProps> = ({ className }) => {
  const { importMediaFromFiles } = useVideoEditorStore();

  // Legacy file import for drag & drop (will show warning)
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
      className={cn('flex flex-col h-full p-4 bg-accent', className)}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        {/* Main Content Area */}
        <VideoPreviewWrapper
          className="w-full h-full max-w-full max-h-full"
          useDirectOptimization={true}
        />
      </div>
    </div>
  );
};

export default VideoEditor;
