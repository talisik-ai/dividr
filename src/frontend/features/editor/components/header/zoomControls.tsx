/**
 * ZoomControls Component
 * A dropdown menu with zoom controls including a slider and preset zoom levels
 */
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import { Input } from '@/frontend/components/ui/input';
import { Slider } from '@/frontend/components/ui/slider';
import { cn } from '@/frontend/utils/utils';
import { ChevronDown } from 'lucide-react';
import React, { useState } from 'react';

interface ZoomControlsProps {
  className?: string;
  defaultZoom?: number;
  onZoomChange?: (zoom: number) => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = ({
  className,
  defaultZoom = 100,
  onZoomChange,
}) => {
  const [zoom, setZoom] = useState<number>(defaultZoom);
  const [inputValue, setInputValue] = useState<string>(defaultZoom.toString());

  // Update local state when defaultZoom prop changes (from store)
  React.useEffect(() => {
    setZoom(defaultZoom);
    setInputValue(defaultZoom.toString());
  }, [defaultZoom]);

  const handleZoomChange = (newZoom: number) => {
    const clampedZoom = Math.max(10, Math.min(newZoom, 800));
    setZoom(clampedZoom);
    setInputValue(clampedZoom.toString());
    onZoomChange?.(clampedZoom);
  };

  const handleSliderChange = (values: number[]) => {
    const newZoom = values[0];
    handleZoomChange(newZoom);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 10 && numValue <= 800) {
      setZoom(numValue);
      onZoomChange?.(numValue);
    }
  };

  const handleInputBlur = () => {
    const numValue = parseInt(inputValue);
    if (isNaN(numValue) || numValue < 10 || numValue > 800) {
      setInputValue(zoom.toString());
    }
  };

  const handlePresetZoom = (preset: number) => {
    handleZoomChange(preset);
  };

  const handleZoomToFit = () => {
    // Zoom to fit means 100% (1:1 scale)
    handleZoomChange(100);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={cn('text-xs px-2 h-8 w-20', className)}
        >
          {zoom}%
          <ChevronDown size={12} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="start">
        {/* Size Label */}
        <DropdownMenuLabel>Preview Zoom</DropdownMenuLabel>

        <div className="flex px-2 items-center gap-2">
          {/* Slider */}
          <div className="flex-1">
            <Slider
              value={[zoom]}
              onValueChange={handleSliderChange}
              min={10}
              max={800}
              step={10}
              className="w-full"
            />
          </div>

          {/* Input Value */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={inputValue}
                onChange={handleInputChange}
                onBlur={handleInputBlur}
                min={10}
                max={800}
                className="h-8 text-center w-14"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => handlePresetZoom(25)}>
          <span>Zoom to 25%</span>
          <DropdownMenuShortcut>⇧0</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handlePresetZoom(50)}>
          <span>Zoom to 50%</span>
          <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
        </DropdownMenuItem>

        {/* Zoom Presets */}
        <DropdownMenuItem onClick={handleZoomToFit}>
          <span>Zoom to 100%</span>
          <DropdownMenuShortcut>⇧F</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handlePresetZoom(200)}>
          <span>Zoom to 200%</span>
          <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handlePresetZoom(400)}>
          <span>Zoom to 400%</span>
          <DropdownMenuShortcut>⇧3</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ZoomControls };
