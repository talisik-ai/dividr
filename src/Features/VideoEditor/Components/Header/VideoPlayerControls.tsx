import { Button } from '@/Components/sub/ui/Button';
import { Separator } from '@/Components/sub/ui/Separator';
import { cn } from '@/Lib/utils';
import { Hand, MousePointer2, Redo2, Undo2 } from 'lucide-react';
import ZoomControls from './ZoomControls';

interface VideoPlayerControlsProps {
  className?: string;
}

export const VideoPlayerControls = ({
  className,
}: VideoPlayerControlsProps) => {
  const handleZoomChange = (zoom: number) => {
    console.log('Zoom changed to:', zoom);
    // Here you would typically update the video player zoom level
  };

  return (
    <div className={cn('flex items-center h-full', className)}>
      <Button variant="ghost" size="icon">
        <MousePointer2 />
      </Button>
      <Button variant="ghost" size="icon">
        <Hand />
      </Button>
      <ZoomControls onZoomChange={handleZoomChange} />
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
