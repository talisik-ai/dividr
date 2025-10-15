import { cn } from '@/frontend/utils/utils';
import React, { useCallback } from 'react';
import { PropertiesPanel } from './components/propertiesPanel';
import { VideoPreviewWrapper } from './preview/VideoPreviewWrapper';
import { useVideoEditorStore } from './stores/videoEditor/index';

interface VideoEditorProps {
  className?: string;
}

const VideoEditor: React.FC<VideoEditorProps> = ({ className }) => {
  const { importMediaFromFiles, tracks, timeline } = useVideoEditorStore();

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

  // Check if any subtitle tracks are selected
  const hasSelectedSubtitles = tracks.some(
    (track) =>
      track.type === 'subtitle' && timeline.selectedTrackIds.includes(track.id),
  );

  return (
    <div className="flex flex-1">
      <div
        className={cn('flex flex-col flex-1 p-4 bg-accent/20', className)}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="flex flex-1 items-center justify-center overflow-hidden">
          {/* Video Preview */}
          <VideoPreviewWrapper
            className="flex-1 w-full h-full max-w-full max-h-full"
            useDirectOptimization={true}
          />
        </div>
      </div>
      {/* Properties Panel - Only visible when subtitle tracks are selected */}
      {hasSelectedSubtitles && <PropertiesPanel className="" />}
    </div>
  );
};

export default VideoEditor;
