/* eslint-disable @typescript-eslint/no-explicit-any */
import Spectrum from '@/frontend/assets/images/spectrum.png';
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import { cn } from '@/frontend/utils/utils';
import ColorPicker from '@rc-component/color-picker';
import '@rc-component/color-picker/assets/index.css';
import { Pipette } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';

interface ColorPickerPopoverProps {
  value: string;
  onChange: (color: string) => void;
  onChangeComplete: (color: string) => void;
  recentColors: string[];
  disabled?: boolean;
  showDiagonal?: boolean;
}

const ColorPickerPopoverComponent: React.FC<ColorPickerPopoverProps> = ({
  value,
  onChange,
  onChangeComplete,
  recentColors,
  disabled = false,
  showDiagonal = false,
}) => {
  // Memoize expensive calculations
  const isTransparent = useMemo(
    () => value === 'transparent' || value.includes('rgba(0, 0, 0, 0'),
    [value],
  );

  // Memoize recent colors slice to prevent recalculation
  const displayedRecentColors = useMemo(
    () => recentColors.slice(0, 18),
    [recentColors],
  );

  // Memoize handlers to prevent re-creation
  const handleTransparentClick = useCallback(() => {
    onChange('transparent');
    onChangeComplete('transparent');
  }, [onChange, onChangeComplete]);

  const handleColorChange = useCallback(
    (color: any) => {
      onChange(color.toHexString());
    },
    [onChange],
  );

  const handleApplyClick = useCallback(() => {
    onChangeComplete(value);
  }, [onChangeComplete, value]);

  const handleRecentColorClick = useCallback(
    (color: string) => {
      onChange(color);
      onChangeComplete(color);
    },
    [onChange, onChangeComplete],
  );

  const handleRecommendedColorClick = useCallback(
    (color: string) => {
      onChange(color);
      onChangeComplete(color);
    },
    [onChange, onChangeComplete],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'h-7 w-7 aspect-square rounded-md border border-border transition-colors relative overflow-hidden',
            disabled && 'cursor-not-allowed opacity-50',
          )}
          disabled={disabled}
          aria-label="Color picker"
        >
          {showDiagonal && isTransparent ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <svg className="w-full h-full" viewBox="0 0 28 28">
                <line
                  x1="0"
                  y1="0"
                  x2="28"
                  y2="28"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-border"
                />
              </svg>
            </div>
          ) : showDiagonal ? (
            <div
              className="absolute inset-0"
              style={{
                background: `repeating-linear-gradient(
                  45deg,
                  ${value},
                  ${value} 2px,
                  transparent 2px,
                  transparent 4px
                )`,
              }}
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: value }}
            />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[280px] p-0" align="end">
        <div className="p-3 space-y-3">
          {/* Current Color */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Current</p>
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 aspect-square rounded border border-border relative overflow-hidden"
                aria-label="Current color"
              >
                {isTransparent ? (
                  <svg
                    className="absolute inset-0 w-full h-full"
                    viewBox="0 0 28 28"
                  >
                    <line
                      x1="0"
                      y1="0"
                      x2="28"
                      y2="28"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      className="text-border"
                    />
                  </svg>
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{ backgroundColor: value }}
                  />
                )}
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {value}
              </span>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Recents Section */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Recents</p>
            <div className="grid grid-cols-7 gap-1.5">
              {/* No Color Button */}
              <button
                className="w-7 h-7 aspect-square rounded border border-border hover:scale-110 transition-transform relative overflow-hidden bg-background"
                onClick={handleTransparentClick}
                aria-label="No color"
              >
                <svg
                  className="absolute inset-0 w-full h-full"
                  viewBox="0 0 28 28"
                >
                  <line
                    x1="0"
                    y1="0"
                    x2="28"
                    y2="28"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-border"
                  />
                </svg>
              </button>

              {/* Eye Dropper Button */}
              <button
                className="w-7 h-7 aspect-square rounded border border-border hover:scale-110 transition-transform bg-background flex items-center justify-center"
                disabled
                aria-label="Eye dropper"
              >
                <Pipette className="size-3.5 text-muted-foreground" />
              </button>

              {/* Color Spectrum Picker Button - Opens nested picker */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="w-7 h-7 aspect-square rounded border border-border p-0 relative overflow-hidden">
                  <img
                    className="w-full h-full object-cover"
                    src={Spectrum}
                    alt="Color spectrum"
                  />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="p-3">
                  <ColorPicker value={value} onChange={handleColorChange} />
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="flex-1">
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleApplyClick}
                      className="flex-1"
                    >
                      Apply
                    </Button>
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>

              {/* Recent colors from history - max 18 (3 rows of 7, minus 3 fixed buttons = 18) */}
              {displayedRecentColors.map((color) => (
                <button
                  key={color}
                  className="w-7 h-7 aspect-square rounded border border-border hover:scale-110 transition-transform relative overflow-hidden"
                  onClick={() => handleRecentColorClick(color)}
                  aria-label={`Recent color ${color}`}
                >
                  {color === 'transparent' ? (
                    <svg
                      className="absolute inset-0 w-full h-full"
                      viewBox="0 0 28 28"
                    >
                      <line
                        x1="0"
                        y1="0"
                        x2="28"
                        y2="28"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-border"
                      />
                    </svg>
                  ) : (
                    <div
                      className="absolute inset-0"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Recommended Colors */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Recommended</p>
            <div className="grid grid-cols-7 gap-1.5">
              {[
                '#FFFFFF',
                '#000000',
                '#FF0000',
                '#00FF00',
                '#0000FF',
                '#FFFF00',
                '#FF00FF',
                '#00FFFF',
                '#FFA500',
                '#800080',
                '#FFC0CB',
                '#A52A2A',
                '#808080',
                '#00FF7F',
                '#FFD700',
                '#4B0082',
                '#FF1493',
                '#32CD32',
                '#FF4500',
                '#1E90FF',
                '#FF69B4',
              ].map((color) => (
                <button
                  key={color}
                  className="w-7 h-7 aspect-square rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => handleRecommendedColorClick(color)}
                  aria-label={`Set color to ${color}`}
                />
              ))}
            </div>
          </div>

          {/* Brand Colors - Coming Soon */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground">Brand Colors</p>
            <p className="text-xs text-muted-foreground text-center py-2">
              Coming soon
            </p>
          </div>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

ColorPickerPopoverComponent.displayName = 'ColorPickerPopover';

// Memoize the component to prevent unnecessary re-renders
export const ColorPickerPopover = React.memo(ColorPickerPopoverComponent);
