import { cn } from '@/frontend/utils/utils';
import React, { useCallback } from 'react';
import { PropertiesPanel } from './components/properties-panel';
import { VideoPreviewWrapper } from './preview/VideoPreviewWrapper';
import { useVideoEditorStore } from './stores/videoEditor/index';

import { NavigationBlockerDialog } from '@/frontend/components/custom/NavigationAlertDialog';
import { useTranscodeListener } from '@/frontend/hooks/useTranscodeListener';
import { useUnsavedChangesWarning } from '@/frontend/hooks/useUnsavedChangesWarning';

interface VideoEditorProps {
  className?: string;
}

const VideoEditor: React.FC<VideoEditorProps> = ({ className }) => {
  const { importMediaFromFiles, timeline, isSaving } = useVideoEditorStore();
  const { blocker } = useUnsavedChangesWarning();

  // Listen for transcode progress and completion events
  useTranscodeListener();

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

  // Check if any tracks are selected
  const hasSelectedTracks = timeline.selectedTrackIds.length > 0;

  return (
    <>
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
        {/* Properties Panel - Dynamically renders based on selected track type */}
        {hasSelectedTracks && <PropertiesPanel className="" />}
      </div>

      <NavigationBlockerDialog
        isOpen={blocker.state === 'blocked'}
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
        isSaving={isSaving}
      />
    </>
  );
};

export default VideoEditor;
