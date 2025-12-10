/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState } from 'react';
import { importMediaUnified } from '../../services/mediaImportService';

export interface UseDragDropProps {
  importMediaToTimeline: (files: File[]) => Promise<any>;
  importMediaFromDrop: (files: File[]) => Promise<any>;
  addTrackFromMediaLibrary: (id: string, frame: number) => Promise<any>;
}

export function useDragDrop({
  importMediaToTimeline,
  importMediaFromDrop,
  addTrackFromMediaLibrary,
}: UseDragDropProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const hasMediaId = e.dataTransfer.types.includes('text/plain');
    const hasFiles = e.dataTransfer.types.includes('Files');

    if (e.type === 'dragenter' || e.type === 'dragover') {
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

      // Check if this is an internal media drag
      const mediaId = e.dataTransfer.getData('text/plain');
      if (mediaId) {
        return;
      }

      // Handle external file drops
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        await importMediaUnified(
          files,
          'preview-drop',
          {
            importMediaFromDrop,
            importMediaToTimeline,
            addTrackFromMediaLibrary,
          },
          { addToTimeline: true, showToasts: true },
        );
      }
    },
    [importMediaFromDrop, importMediaToTimeline, addTrackFromMediaLibrary],
  );

  return {
    dragActive,
    handleDrag,
    handleDrop,
  };
}
