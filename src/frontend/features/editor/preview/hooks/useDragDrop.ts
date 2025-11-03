import { useState, useCallback } from 'react';
import { toast } from 'sonner';

/**
 * Hook for managing drag and drop functionality
 */

export interface UseDragDropProps {
  importMediaToTimeline: (files: File[]) => Promise<{
    importedFiles: any[];
    rejectedFiles?: any[];
    error?: string;
    success?: boolean;
  }>;
}

export function useDragDrop({ importMediaToTimeline }: UseDragDropProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Check if this is an external file drag (not internal media)
    const hasMediaId = e.dataTransfer.types.includes('text/plain');
    const hasFiles = e.dataTransfer.types.includes('Files');

    if (e.type === 'dragenter' || e.type === 'dragover') {
      // Only activate for external file drops
      if (hasFiles && !hasMediaId) {
        setDragActive(true);
      }
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      // Check if this is an internal media drag (not a file drop)
      const mediaId = e.dataTransfer.getData('text/plain');
      if (mediaId) {
        // This is an internal drag from media library, ignore it
        return;
      }

      // Handle external file drops with validation
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        // Show immediate loading toast with promise
        const importPromise = importMediaToTimeline(files);

        toast.promise(importPromise, {
          loading: `Adding ${files.length} ${files.length === 1 ? 'file' : 'files'} to timeline...`,
          success: (result) => {
            const importedCount = result.importedFiles.length;
            const rejectedCount = result.rejectedFiles?.length || 0;

            // Return success message
            if (importedCount > 0) {
              return (
                `Added ${importedCount} ${importedCount === 1 ? 'file' : 'files'} to timeline` +
                (rejectedCount > 0 ? ` (${rejectedCount} rejected)` : '')
              );
            } else {
              throw new Error(
                'All files were rejected due to corruption or invalid format',
              );
            }
          },
          error: (error) => {
            // Use the actual error message from validation results
            const errorMessage =
              error?.error ||
              'All files were rejected due to corruption or invalid format';
            return errorMessage;
          },
        });

        try {
          await importPromise;
        } catch (error) {
          console.error('❌ Error importing files to preview:', error);
        }
      }
    },
    [importMediaToTimeline],
  );

  return {
    dragActive,
    handleDrag,
    handleDrop,
  };
}
