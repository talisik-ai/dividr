import { Button } from '@/frontend/components/ui/button';
import { Separator } from '@/frontend/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { cn } from '@/frontend/utils/utils';
import { Hand, MousePointer2, Redo2, Undo2 } from 'lucide-react';
import React, { useCallback } from 'react';
import { useVideoEditorStore } from '../../stores/videoEditor';
import { ZoomControls } from './zoomControls';

interface VideoPlayerControlsProps {
  className?: string;
}

/**
 * VideoPlayerControls Component
 * Optimized to prevent re-renders during playback by using selective Zustand selectors
 * Only subscribes to the specific values needed, not entire state objects
 */
export const VideoPlayerControls = React.memo(
  ({ className }: VideoPlayerControlsProps) => {
    // Selective selectors - only subscribe to specific values
    // This prevents re-renders when other preview/playback properties change
    const previewScale = useVideoEditorStore(
      (state) => state.preview.previewScale,
    );
    const interactionMode = useVideoEditorStore(
      (state) => state.preview.interactionMode,
    );

    // Subscribe to undo/redo stack lengths for reactive button states
    const hasUndoHistory = useVideoEditorStore(
      (state) => state.undoStack.length > 0,
    );
    const hasRedoHistory = useVideoEditorStore(
      (state) => state.redoStack.length > 0,
    );

    // Only subscribe to the action functions (these are stable references)
    const setPreviewScale = useVideoEditorStore(
      (state) => state.setPreviewScale,
    );
    const setPreviewInteractionMode = useVideoEditorStore(
      (state) => state.setPreviewInteractionMode,
    );
    const undo = useVideoEditorStore((state) => state.undo);
    const redo = useVideoEditorStore((state) => state.redo);

    // Memoize handlers to prevent unnecessary re-renders of child components
    const handleZoomChange = useCallback(
      (zoomPercent: number) => {
        // Convert percentage (10-800) to scale (0.1-8)
        const scale = zoomPercent / 100;
        setPreviewScale(scale);
      },
      [setPreviewScale],
    );

    const handleSelectMode = useCallback(() => {
      setPreviewInteractionMode('select');
    }, [setPreviewInteractionMode]);

    const handlePanMode = useCallback(() => {
      // Only allow pan mode if zoomed in
      if (previewScale > 1) {
        setPreviewInteractionMode('pan');
      }
    }, [previewScale, setPreviewInteractionMode]);

    const isSelectActive = interactionMode === 'select';
    const isPanActive = interactionMode === 'pan';
    const isPanDisabled = previewScale <= 1;

    const handleUndo = useCallback(() => {
      if (hasUndoHistory) {
        undo();
      }
    }, [undo, hasUndoHistory]);

    const handleRedo = useCallback(() => {
      if (hasRedoHistory) {
        redo();
      }
    }, [redo, hasRedoHistory]);

    return (
      <div className={cn('flex items-center h-full gap-6', className)}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="native"
              size="icon"
              onClick={handleSelectMode}
              className={cn(
                'transition-colors',
                isSelectActive && 'text-secondary hover:text-secondary/90',
              )}
            >
              <MousePointer2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Selection Tool (V)</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="native"
              size="icon"
              onClick={handlePanMode}
              disabled={isPanDisabled}
              className={cn(
                'transition-colors',
                isPanActive &&
                  !isPanDisabled &&
                  'text-secondary hover:text-secondary/90',
                isPanDisabled && 'opacity-40 cursor-not-allowed',
              )}
            >
              <Hand />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isPanDisabled ? (
              'Hand Tool (Zoom in to enable)'
            ) : (
              <>Hand Tool (H) - Pan around zoomed preview</>
            )}
          </TooltipContent>
        </Tooltip>
        <ZoomControls
          zoom={previewScale * 100}
          onZoomChange={handleZoomChange}
        />
        <Separator orientation="vertical" className="!h-3/4" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="native"
              size="icon"
              onClick={handleUndo}
              disabled={!hasUndoHistory}
              className={cn(
                'transition-colors',
                !hasUndoHistory && 'opacity-40',
              )}
            >
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Undo ( Ctrl+Z )</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="native"
              size="icon"
              onClick={handleRedo}
              disabled={!hasRedoHistory}
              className={cn(
                'transition-colors',
                !hasRedoHistory && 'opacity-40',
              )}
            >
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Redo ( Ctrl+Y or Ctrl+Shift+Z )</TooltipContent>
        </Tooltip>
      </div>
    );
  },
);

// Add display name for better debugging
VideoPlayerControls.displayName = 'VideoPlayerControls';
