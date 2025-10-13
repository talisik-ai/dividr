import { Button } from '@/frontend/components/ui/button';
import { Separator } from '@/frontend/components/ui/separator';
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
  const { preview, setPreviewScale, setPreviewInteractionMode } =
    useVideoEditorStore();

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

  return (
    <div className={cn('flex items-center h-full gap-6', className)}>
      <Button
        variant="native"
        size="icon"
        onClick={handleSelectMode}
        className={cn(
          'transition-colors',
          isSelectActive && 'text-secondary hover:text-secondary/90',
        )}
        title="Selection Tool (V)"
      >
        <MousePointer2 />
      </Button>
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
        title={
          isPanDisabled
            ? 'Hand Tool (Zoom in to enable)'
            : 'Hand Tool (H) - Pan around zoomed preview'
        }
      >
        <Hand />
      </Button>
      <ZoomControls
        defaultZoom={preview.previewScale * 100}
        onZoomChange={handleZoomChange}
      />
      <Separator orientation="vertical" className="!h-3/4" />
      <Button variant="native" size="icon" disabled>
        <Undo2 />
      </Button>
      <Button variant="native" size="icon" disabled>
        <Redo2 />
      </Button>
    </div>
  );
};
