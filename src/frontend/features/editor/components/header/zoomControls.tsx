/**
 * ZoomControls Component
 * A dropdown menu with zoom controls including a slider and preset zoom levels
 *
 * Optimized to prevent unnecessary re-renders by:
 * 1. Using controlled component pattern with proper memoization
 * 2. Avoiding local state duplication (zoom prop is single source of truth)
 * 3. Memoizing the entire component
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { useVideoEditorStore } from '@/frontend/features/editor/stores/videoEditor';
import { cn } from '@/frontend/utils/utils';
import { ChevronDown } from 'lucide-react';
import React, { useCallback, useState } from 'react';

interface ZoomControlsProps {
  className?: string;
  zoom: number; // Changed from defaultZoom to zoom (controlled)
  onZoomChange?: (zoom: number) => void;
}

const ZoomControls: React.FC<ZoomControlsProps> = React.memo(
  ({ className, zoom, onZoomChange }) => {
    // Get resetPreviewPan from store for zoom to fit functionality
    const resetPreviewPan = useVideoEditorStore(
      (state) => state.resetPreviewPan,
    );

    // Local input value for typing (separate from actual zoom)
    // This allows users to type intermediate values without triggering changes
    const [inputValue, setInputValue] = useState<string>(zoom.toString());

    // Sync input value when zoom prop changes from external source
    React.useEffect(() => {
      setInputValue(zoom.toString());
    }, [zoom]);

    // Memoize handlers to prevent recreating on every render
    const handleZoomChange = useCallback(
      (newZoom: number) => {
        const clampedZoom = Math.max(10, Math.min(newZoom, 800));
        setInputValue(clampedZoom.toString());
        onZoomChange?.(clampedZoom);
      },
      [onZoomChange],
    );

    const handleSliderChange = useCallback(
      (values: number[]) => {
        const newZoom = values[0];
        handleZoomChange(newZoom);
      },
      [handleZoomChange],
    );

    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setInputValue(value);

        const numValue = parseInt(value);
        if (!isNaN(numValue) && numValue >= 10 && numValue <= 800) {
          onZoomChange?.(numValue);
        }
      },
      [onZoomChange],
    );

    const handleInputBlur = useCallback(() => {
      const numValue = parseInt(inputValue);
      if (isNaN(numValue) || numValue < 10 || numValue > 800) {
        setInputValue(zoom.toString());
      }
    }, [inputValue, zoom]);

    const handlePresetZoom = useCallback(
      (preset: number) => {
        handleZoomChange(preset);
      },
      [handleZoomChange],
    );

    const handleZoomToFit = useCallback(() => {
      // Zoom to fit means 100% (1:1 scale) and reset pan
      handleZoomChange(100);
      // Also reset pan position when zooming to fit
      resetPreviewPan();
    }, [handleZoomChange, resetPreviewPan]);

    const handleZoomIn = useCallback(() => {
      const newZoom = Math.min(zoom * 1.2, 800);
      handleZoomChange(newZoom);
    }, [zoom, handleZoomChange]);

    const handleZoomOut = useCallback(() => {
      const newZoom = Math.max(zoom / 1.2, 10);
      handleZoomChange(newZoom);
    }, [zoom, handleZoomChange]);

    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="native"
                className={cn('text-xs h-8 w-20', className)}
              >
                {Math.round(zoom)}%
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Preview Zoom (Ctrl+Scroll)</TooltipContent>
        </Tooltip>
        <DropdownMenuContent className="w-72" align="start">
          {/* Header */}
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Preview Zoom</span>
            <span className="text-xs text-muted-foreground font-normal">
              {Math.round(zoom)}%
            </span>
          </DropdownMenuLabel>

          {/* Zoom Slider with Controls */}
          <div className="px-2 pb-2 space-y-3">
            <div className="flex items-center gap-2">
              {/* Zoom Out Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleZoomOut}
                disabled={zoom <= 10}
              >
                <span className="text-lg">−</span>
              </Button>

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

              {/* Zoom In Button */}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleZoomIn}
                disabled={zoom >= 800}
              >
                <span className="text-lg">+</span>
              </Button>

              {/* Input Value */}
              <div className="flex items-center gap-1 shrink-0">
                <Input
                  type="number"
                  value={inputValue}
                  onChange={handleInputChange}
                  onBlur={handleInputBlur}
                  min={10}
                  max={800}
                  className="h-7 text-center w-14 text-xs"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Zoom Presets */}
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Preset Zoom Levels
          </DropdownMenuLabel>

          <DropdownMenuItem onClick={() => handlePresetZoom(25)}>
            <span>25% (Zoom Out)</span>
            <DropdownMenuShortcut>⇧0</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handlePresetZoom(50)}>
            <span>50%</span>
            <DropdownMenuShortcut>⇧1</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleZoomToFit} className="font-medium">
            <span>Zoom to Fit (100%)</span>
            <DropdownMenuShortcut>⇧F</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handlePresetZoom(200)}>
            <span>200% (Zoom In)</span>
            <DropdownMenuShortcut>⇧2</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => handlePresetZoom(400)}>
            <span>400% (Max Detail)</span>
            <DropdownMenuShortcut>⇧3</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Quick Actions */}
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            Quick Actions
          </DropdownMenuLabel>

          <DropdownMenuItem onClick={handleZoomIn}>
            <span>Zoom In</span>
            <DropdownMenuShortcut>Ctrl + +</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleZoomOut}>
            <span>Zoom Out</span>
            <DropdownMenuShortcut>Ctrl + −</DropdownMenuShortcut>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleZoomToFit}>
            <span>Reset Zoom</span>
            <DropdownMenuShortcut>Ctrl+0</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

// Add display name for better debugging
ZoomControls.displayName = 'ZoomControls';

export { ZoomControls };
