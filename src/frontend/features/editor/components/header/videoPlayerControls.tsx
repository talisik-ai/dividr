import { Button } from '@/frontend/components/ui/button';
import { Separator } from '@/frontend/components/ui/separator';
import { cn } from '@/frontend/utils/utils';
import { Hand, MousePointer2, Redo2, Undo2 } from 'lucide-react';
import { useVideoEditorStore } from '../../stores/videoEditor';
import { ZoomControls } from './zoomControls';

interface VideoPlayerControlsProps {
  className?: string;
}

export const VideoPlayerControls = ({
  className,
}: VideoPlayerControlsProps) => {
  const { preview, setPreviewScale } = useVideoEditorStore();

  const handleZoomChange = (zoomPercent: number) => {
    // Convert percentage (10-800) to scale (0.1-8)
    const scale = zoomPercent / 100;
    setPreviewScale(scale);
  };

  return (
    <div className={cn('flex items-center h-full', className)}>
      <Button variant="ghost" size="icon">
        <MousePointer2 />
      </Button>
      <Button variant="ghost" size="icon">
        <Hand />
      </Button>
      <ZoomControls
        defaultZoom={preview.previewScale * 100}
        onZoomChange={handleZoomChange}
      />
      <Separator orientation="vertical" className="!h-3/4 mr-1" />
      <Button variant="ghost" size="icon" disabled>
        <Undo2 />
      </Button>
      <Button variant="ghost" size="icon" disabled>
        <Redo2 />
      </Button>
    </div>
  );
};
