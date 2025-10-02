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

  const handleZoomChange = (newZoom: number) => {
    setZoom(newZoom);
    setInputValue(newZoom.toString());
    onZoomChange?.(newZoom);
  };

  const handleSliderChange = (values: number[]) => {
    const newZoom = values[0];
    handleZoomChange(newZoom);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    const numValue = parseInt(value);
    if (!isNaN(numValue) && numValue >= 20 && numValue <= 100) {
      setZoom(numValue);
      onZoomChange?.(numValue);
    }
  };

  const handleInputBlur = () => {
    const numValue = parseInt(inputValue);
    if (isNaN(numValue) || numValue < 20 || numValue > 100) {
      setInputValue(zoom.toString());
    }
  };

  const handlePresetZoom = (preset: number) => {
    handleZoomChange(preset);
  };

  const handleZoomToFit = () => {
    // This would typically calculate the zoom level to fit the content
    // For now, we'll use a reasonable default
    handleZoomChange(75);
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
        <DropdownMenuLabel>Size</DropdownMenuLabel>

        <div className="flex items-center gap-2">
          {/* Slider */}
          <div className="flex-1">
            <Slider
              value={[zoom]}
              onValueChange={handleSliderChange}
              min={20}
              max={100}
              step={1}
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
                min={20}
                max={100}
                className="h-8 text-center w-12"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* Zoom Presets */}
        <DropdownMenuItem onClick={handleZoomToFit}>
          <span>Zoom to fit</span>
          <DropdownMenuShortcut>⇧F</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handlePresetZoom(50)}>
          <span>Zoom to 50%</span>
          <DropdownMenuShortcut>⇧0</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handlePresetZoom(100)}>
          <span>Zoom to 100%</span>
          <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={() => handlePresetZoom(200)}>
          <span>Zoom to 200%</span>
          <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export { ZoomControls };
