/**
 * ExportButton Component
 * A clean, focused button component for triggering video exports
 * All heavy logic is delegated to specialized hooks and utilities
 */
import { Button } from '@/frontend/components/ui/button';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { Upload } from 'lucide-react';
import React, { useCallback, useState } from 'react';
import { useVideoEditorStore } from '../../editor/stores/VideoEditorStore';
import { ExportModal } from '../../export/ExportModal';
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

  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Use specialized hooks for heavy logic
  const { createFFmpegJob } = useExportJob();
  const { executeExport } = useExportHandler();

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

      // Build the FFmpeg job
      const job = createFFmpegJob(config.filename, config.outputPath);

      // Execute the export
      await executeExport(job);
    },
    [tracks.length, createFFmpegJob, executeExport],
  );

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
        {render.isRendering
          ? `Exporting... ${render.progress.toFixed(0)}%`
          : 'Export'}
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
    </>
  );
};

export { ExportButton };
