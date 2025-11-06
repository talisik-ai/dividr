import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/frontend/components/ui/select';
import { Separator } from '@/frontend/components/ui/separator';
import { cn } from '@/frontend/utils/utils';
import React, { useEffect, useMemo, useState } from 'react';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';
import {
  ASPECT_RATIO_PRESETS,
  getAspectRatioDisplayLabel,
} from '../../../stores/videoEditor/utils/aspectRatioHelpers';

const FRAME_RATES = [24, 25, 30, 48, 50, 60] as const;

export const SettingsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  const { preview, timeline, tracks, setCanvasSize, setFps, updateTrack } =
    useVideoEditorStore();
  const [customWidth, setCustomWidth] = useState<string>(
    preview.canvasWidth.toString(),
  );
  const [customHeight, setCustomHeight] = useState<string>(
    preview.canvasHeight.toString(),
  );

  // Get the first selected video or image track
  const selectedTrack = useMemo(() => {
    const selectedTrackIds = timeline.selectedTrackIds;
    if (selectedTrackIds.length === 0) return null;

    // Find the first video or image track in selection
    return (
      tracks.find(
        (track) =>
          selectedTrackIds.includes(track.id) &&
          (track.type === 'video' || track.type === 'image'),
      ) || null
    );
  }, [tracks, timeline.selectedTrackIds]);

  // Sync settings panel inputs with canvas dimensions only
  // This allows users to see and edit the current canvas size
  useEffect(() => {
    setCustomWidth(preview.canvasWidth.toString());
    setCustomHeight(preview.canvasHeight.toString());
  }, [preview.canvasWidth, preview.canvasHeight]);

  // Determine if a preset is active based on canvas dimensions
  const activePreset = useMemo(() => {
    // Match by exact canvas dimensions
    return ASPECT_RATIO_PRESETS.find(
      (ratio) =>
        ratio.width === preview.canvasWidth &&
        ratio.height === preview.canvasHeight,
    );
  }, [preview.canvasWidth, preview.canvasHeight]);

  // Determine which preset matches the selected track's detected aspect ratio
  const detectedPreset = useMemo(() => {
    if (selectedTrack?.detectedAspectRatioLabel) {
      return ASPECT_RATIO_PRESETS.find(
        (preset) => preset.label === selectedTrack.detectedAspectRatioLabel,
      );
    }
    return null;
  }, [selectedTrack?.detectedAspectRatioLabel]);

  // Get the display label for the detected aspect ratio
  // This will show either a preset label (e.g., "16:9") or a computed ratio (e.g., "1.48:1")
  const detectedAspectRatioLabel = useMemo(() => {
    if (!selectedTrack) return null;

    // If we have a preset label stored, use it
    if (selectedTrack.detectedAspectRatioLabel) {
      return selectedTrack.detectedAspectRatioLabel;
    }

    // Otherwise, compute the exact ratio from dimensions
    if (selectedTrack.width && selectedTrack.height) {
      return getAspectRatioDisplayLabel(
        selectedTrack.width,
        selectedTrack.height,
      );
    }

    return null;
  }, [
    selectedTrack,
    selectedTrack?.detectedAspectRatioLabel,
    selectedTrack?.width,
    selectedTrack?.height,
  ]);

  // Determine if controls should be disabled (no track selected or canvas dimensions match a preset perfectly)
  const hasTrackSelected = selectedTrack !== null;

  // Determine if the selected track is a video (aspect ratio controls only apply to videos)
  const isVideoTrackSelected = selectedTrack?.type === 'video';

  // Handle preset selection
  const handlePresetSelect = (
    preset: (typeof ASPECT_RATIO_PRESETS)[number],
  ) => {
    // Always update canvas size
    setCanvasSize(preset.width, preset.height);

    // If a video/image track is selected, update its metadata
    if (selectedTrack) {
      updateTrack(selectedTrack.id, {
        aspectRatio: preset.ratio,
        detectedAspectRatioLabel: preset.label,
      });
    }
  };

  // Handle custom width change
  const handleCustomWidthChange = (value: string) => {
    // Only allow numeric input
    if (value === '' || /^\d+$/.test(value)) {
      setCustomWidth(value);
      const numValue = parseInt(value);
      if (numValue > 0 && !isNaN(numValue)) {
        // Always update canvas size
        const newHeight = parseInt(customHeight);
        if (newHeight > 0) {
          setCanvasSize(numValue, newHeight);

          // Update selected track's aspect ratio metadata if a track is selected
          if (selectedTrack) {
            const newRatio = numValue / newHeight;
            updateTrack(selectedTrack.id, {
              aspectRatio: newRatio,
              detectedAspectRatioLabel: undefined, // Custom ratio, no preset label
            });
          }
        }
      }
    }
  };

  // Handle custom height change
  const handleCustomHeightChange = (value: string) => {
    // Only allow numeric input
    if (value === '' || /^\d+$/.test(value)) {
      setCustomHeight(value);
      const numValue = parseInt(value);
      if (numValue > 0 && !isNaN(numValue)) {
        // Always update canvas size
        const newWidth = parseInt(customWidth);
        if (newWidth > 0) {
          setCanvasSize(newWidth, numValue);

          // Update selected track's aspect ratio metadata if a track is selected
          if (selectedTrack) {
            const newRatio = newWidth / numValue;
            updateTrack(selectedTrack.id, {
              aspectRatio: newRatio,
              detectedAspectRatioLabel: undefined, // Custom ratio, no preset label
            });
          }
        }
      }
    }
  };

  // Handle frame rate change
  const handleFrameRateChange = (value: string) => {
    const fps = parseInt(value);
    if (!isNaN(fps)) {
      setFps(fps);
    }
  };

  return (
    <BasePanel
      title="Settings"
      description="Configure project and export settings"
      className={className}
    >
      <div className="flex flex-col gap-6">
        {/* Aspect Ratio Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Aspect Ratio
            </label>
            {detectedAspectRatioLabel && isVideoTrackSelected && (
              <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded">
                Detected: {detectedAspectRatioLabel}
              </span>
            )}
          </div>

          {/* Show message when image track is selected */}
          {hasTrackSelected && !isVideoTrackSelected && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-4 text-center">
              Aspect ratio controls are not available for image tracks. Use the
              Image Properties Panel for scaling and cropping.
            </div>
          )}

          {/* Show message when no track is selected */}
          {!hasTrackSelected && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-4 text-center">
              Select a video track to adjust aspect ratio
            </div>
          )}

          {/* Show aspect ratio controls only for video tracks */}
          {isVideoTrackSelected && (
            <>
              {/* Show track dimensions when selected */}
              {selectedTrack?.width && selectedTrack?.height && (
                <div className="text-xs text-muted-foreground">
                  Track dimensions: {selectedTrack.width} ×{' '}
                  {selectedTrack.height}
                </div>
              )}

              {/* Show helper message and quick-apply button when track's ratio differs from canvas */}
              {selectedTrack?.width &&
                selectedTrack?.height &&
                (selectedTrack.width !== preview.canvasWidth ||
                  selectedTrack.height !== preview.canvasHeight) && (
                  <div className="text-xs bg-blue-500/10 border border-blue-500/20 rounded-md px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-blue-600 dark:text-blue-400">
                      Track is {detectedAspectRatioLabel} ({selectedTrack.width}
                      ×{selectedTrack.height})
                      {activePreset?.label &&
                        `, canvas is ${activePreset.label}`}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      onClick={() => {
                        // If there's a matching preset, use it. Otherwise, use exact dimensions
                        if (detectedPreset) {
                          handlePresetSelect(detectedPreset);
                        } else if (selectedTrack) {
                          // Apply exact track dimensions to canvas
                          setCanvasSize(
                            selectedTrack.width!,
                            selectedTrack.height!,
                          );
                          updateTrack(selectedTrack.id, {
                            aspectRatio:
                              selectedTrack.width! / selectedTrack.height!,
                            detectedAspectRatioLabel: undefined, // No preset label
                          });
                        }
                      }}
                    >
                      Match Track
                    </Button>
                  </div>
                )}

              {/* Preset Grid */}
              <div className="grid grid-cols-4 gap-2">
                {ASPECT_RATIO_PRESETS.map((ratio) => {
                  const isActive = activePreset?.label === ratio.label;
                  const isSuggested = detectedPreset?.label === ratio.label;
                  const aspectValue = ratio.width / ratio.height;

                  return (
                    <Button
                      key={ratio.label}
                      variant="outline"
                      onClick={() => handlePresetSelect(ratio)}
                      className={cn(
                        'flex flex-col items-center border-none justify-end gap-2 h-auto py-3 transition-all rounded-md relative',
                        isActive && 'bg-primary/10 dark:bg-primary/10',
                        isSuggested &&
                          !isActive &&
                          'ring-2 ring-blue-500/40 dark:ring-blue-400/40',
                      )}
                    >
                      {/* Visual shape representation */}
                      <div
                        className={cn(
                          'border-2 rounded transition-colors',
                          isActive
                            ? 'border-primary'
                            : isSuggested
                              ? 'border-blue-500 dark:border-blue-400'
                              : 'border-muted-foreground/40',
                        )}
                        style={{
                          width:
                            aspectValue >= 1 ? '32px' : `${32 * aspectValue}px`,
                          height:
                            aspectValue <= 1 ? '32px' : `${32 / aspectValue}px`,
                        }}
                      />
                      <span
                        className={cn(
                          'text-xs font-medium',
                          isSuggested &&
                            !isActive &&
                            'text-blue-600 dark:text-blue-400',
                        )}
                      >
                        {ratio.label}
                      </span>
                    </Button>
                  );
                })}
              </div>

              {/* Custom Dimensions */}
              <div className="flex items-center pt-2 justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  Custom
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground block text-center">
                      W
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={customWidth}
                      onChange={(e) => handleCustomWidthChange(e.target.value)}
                      placeholder="Width"
                      style={{ fieldSizing: 'content' } as React.CSSProperties}
                      className="max-w-20"
                    />
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground block text-center">
                      H
                    </span>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={customHeight}
                      onChange={(e) => handleCustomHeightChange(e.target.value)}
                      placeholder="Height"
                      style={{ fieldSizing: 'content' } as React.CSSProperties}
                      className="max-w-20"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <Separator />

        {/* Frame Rate Section */}
        <div className="flex justify-between items-center">
          <label className="text-xs font-medium text-muted-foreground">
            Frame Rate
          </label>
          <Select
            value={timeline.fps.toString()}
            onValueChange={handleFrameRateChange}
          >
            <SelectTrigger className="min-w-[166px]">
              <SelectValue placeholder="Select frame rate" />
            </SelectTrigger>
            <SelectContent>
              {FRAME_RATES.map((fps) => (
                <SelectItem key={fps} value={fps.toString()}>
                  {fps} fps
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </BasePanel>
  );
};
