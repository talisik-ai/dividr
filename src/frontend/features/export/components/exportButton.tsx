/**
 * ExportButton Component (Updated with RenderProcessDialog)
 * A clean, focused button component for triggering video exports
 * All heavy logic is delegated to specialized hooks and utilities
 */
import { Button } from '@/frontend/components/ui/button';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { Upload } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useVideoEditorStore } from '../../editor/stores/videoEditor/index';
import { useTimelineDuration } from '../../editor/timeline/hooks/useTimelineDuration';
import { ExportModal } from '../../export/ExportModal';
import { RenderProcessDialog } from '../components/renderProcessDialog';
import { useExportHandler } from '../hooks/useExportHandler';
import { useExportJob } from '../hooks/useExportJob';

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
  const tracks = useVideoEditorStore((state) => state.tracks);
  const render = useVideoEditorStore((state) => state.render);
  const { currentProject } = useProjectStore();
  const duration = useTimelineDuration();

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Use specialized hooks for heavy logic
  const { createFFmpegJob } = useExportJob();
  const {
    executeExport,
    isRenderDialogOpen,
    renderDialogState,
    renderError,
    handleCancelRender,
    handleCloseDialog,
  } = useExportHandler();

  // Store last export config for retry functionality
  const [lastExportConfig, setLastExportConfig] = useState<{
    filename: string;
    format: string;
    outputPath: string;
  } | null>(null);

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

  // Handle opening the export modal
  const handleOpenModal = useCallback(() => {
    if (tracks.length === 0) {
      alert('No tracks to render');
      return;
    }
    setIsExportModalOpen(true);
  }, [tracks.length]);

  // Handle export confirmation from modal
  const handleExportConfirm = useCallback(
    async (config: {
      filename: string;
      format: string;
      outputPath: string;
    }) => {
      setIsExportModalOpen(false);

      if (tracks.length === 0) {
        alert('No tracks to render');
        return;
      }

      // Store config for potential retry
      setLastExportConfig(config);

      // Build the FFmpeg job
      const job = createFFmpegJob(config.filename, config.outputPath);

      // Execute the export (this will open the render dialog)
      await executeExport(job);
    },
    [tracks.length, createFFmpegJob, executeExport],
  );

  // Handle retry from failed state
  const handleRetry = useCallback(async () => {
    if (!lastExportConfig) return;

    const job = createFFmpegJob(
      lastExportConfig.filename,
      lastExportConfig.outputPath,
    );
    await executeExport(job);
  }, [lastExportConfig, createFFmpegJob, executeExport]);

  const isButtonDisabled =
    disabled || render.isRendering || tracks.length === 0;

  return (
    <>
      <Button
        variant={variant}
        onClick={handleOpenModal}
        disabled={isButtonDisabled}
        className={className}
        size="sm"
      >
        {render.isRendering ? 'Exporting...' : 'Export'}
        <Upload className="size-3.5" />
      </Button>

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportConfirm}
        defaultFilename={
          currentProject?.metadata?.title?.trim() || 'Untitled_Project'
        }
      />

      <RenderProcessDialog
        isOpen={isRenderDialogOpen}
        state={renderDialogState}
        progress={calculateTimeProgress()}
        status={render.status}
        currentTime={render.currentTime || '00:00:00.00'}
        duration={duration.formattedTime || '00:00:00.00'}
        errorMessage={renderError}
        onCancel={handleCancelRender}
        onClose={handleCloseDialog}
        onRetry={lastExportConfig ? handleRetry : undefined}
      />
    </>
  );
};

export { ExportButton };
