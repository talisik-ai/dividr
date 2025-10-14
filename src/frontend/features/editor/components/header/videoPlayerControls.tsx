import { Button } from '@/frontend/components/ui/button';
import { Separator } from '@/frontend/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { cn } from '@/frontend/utils/utils';
import { Hand, MousePointer2, Redo2, Undo2 } from 'lucide-react';
import { useCallback } from 'react';
import { useVideoEditorStore } from '../../stores/videoEditor';
import { ZoomControls } from './zoomControls';

interface VideoPlayerControlsProps {
  className?: string;
}

export const VideoPlayerControls = ({
  className,
}: VideoPlayerControlsProps) => {
  const {
    preview,
    setPreviewScale,
    setPreviewInteractionMode,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useVideoEditorStore();

  const handleZoomChange = (zoomPercent: number) => {
    // Convert percentage (10-800) to scale (0.1-8)
    const scale = zoomPercent / 100;
    setPreviewScale(scale);
  };

  const handleSelectMode = useCallback(() => {
    setPreviewInteractionMode('select');
  }, [setPreviewInteractionMode]);

  const handlePanMode = useCallback(() => {
    // Only allow pan mode if zoomed in
    if (preview.previewScale > 1) {
      setPreviewInteractionMode('pan');
    }
  }, [preview.previewScale, setPreviewInteractionMode]);

  const isSelectActive = preview.interactionMode === 'select';
  const isPanActive = preview.interactionMode === 'pan';
  const isPanDisabled = preview.previewScale <= 1;

  const handleUndo = useCallback(() => {
    if (canUndo()) {
      undo();
    }
  }, [undo, canUndo]);

  const handleRedo = useCallback(() => {
    if (canRedo()) {
      redo();
    }
  }, [redo, canRedo]);

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
          {isPanDisabled
            ? 'Hand Tool (Zoom in to enable)'
            : 'Hand Tool (H) - Pan around zoomed preview'}
        </TooltipContent>
      </Tooltip>
      <ZoomControls
        defaultZoom={preview.previewScale * 100}
        onZoomChange={handleZoomChange}
      />
      <Separator orientation="vertical" className="!h-3/4" />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="native"
            size="icon"
            onClick={handleUndo}
            disabled={!canUndo()}
            className={cn('transition-colors', !canUndo() && 'opacity-40')}
          >
            <Undo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="native"
            size="icon"
            onClick={handleRedo}
            disabled={!canRedo()}
            className={cn('transition-colors', !canRedo() && 'opacity-40')}
          >
            <Redo2 />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Redo (Ctrl+Shift+Z or Ctrl+Y)</TooltipContent>
      </Tooltip>
    </div>
  );
};
