import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Separator } from '@/frontend/components/ui/separator';
import { Slider } from '@/frontend/components/ui/slider';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/frontend/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { RotateCcw } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';

interface ImagePropertiesProps {
  selectedTrackIds: string[];
}

const DEFAULT_TRANSFORM = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  width: 0,
  height: 0,
};

const ImagePropertiesComponent: React.FC<ImagePropertiesProps> = ({
  selectedTrackIds,
}) => {
  const tracks = useVideoEditorStore((state) => state.tracks);
  const updateTrack = useVideoEditorStore((state) => state.updateTrack);

  // Get selected image tracks
  const selectedImageTracks = useMemo(
    () =>
      tracks.filter(
        (track) =>
          track.type === 'image' && selectedTrackIds.includes(track.id),
      ),
    [tracks, selectedTrackIds],
  );

  // Don't render if no image tracks are selected
  if (selectedImageTracks.length === 0) {
    return null;
  }

  const isMultipleSelected = selectedImageTracks.length > 1;
  const selectedTrack = selectedImageTracks[0];
  const currentTransform = selectedTrack.textTransform || DEFAULT_TRANSFORM;

  // Helper function to update transform for selected tracks
  const updateTransform = useCallback(
    (transformUpdates: Partial<typeof DEFAULT_TRANSFORM>) => {
      selectedImageTracks.forEach((track) => {
        const currentTrackTransform = track.textTransform || DEFAULT_TRANSFORM;
        updateTrack(track.id, {
          textTransform: {
            ...currentTrackTransform,
            ...transformUpdates,
          },
        });
      });
    },
    [selectedImageTracks, updateTrack],
  );

  // Check if transform has changed from default
  const hasTransformChanged = useMemo(() => {
    return (
      currentTransform.scale !== 1 ||
      currentTransform.x !== 0 ||
      currentTransform.y !== 0 ||
      currentTransform.rotation !== 0
    );
  }, [currentTransform]);

  const handleScaleSliderChange = useCallback(
    (values: number[]) => {
      updateTransform({ scale: values[0] / 100 });
    },
    [updateTransform],
  );

  const handleScaleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseFloat(e.target.value) || 0;
      updateTransform({ scale: value / 100 });
    },
    [updateTransform],
  );

  // Normalize rotation for display (-180 to 180)
  const displayRotation = useMemo(() => {
    const normalized = ((currentTransform.rotation % 360) + 360) % 360;
    return normalized > 180 ? normalized - 360 : normalized;
  }, [currentTransform.rotation]);

  // Local state for inputs to prevent focus loss
  const [localX, setLocalX] = React.useState(() =>
    currentTransform.x.toFixed(2),
  );
  const [localY, setLocalY] = React.useState(() =>
    currentTransform.y.toFixed(2),
  );
  const [localRotation, setLocalRotation] = React.useState(() =>
    displayRotation.toFixed(1),
  );

  // Update local state when track changes
  React.useEffect(() => {
    setLocalX(currentTransform.x.toFixed(2));
    setLocalY(currentTransform.y.toFixed(2));
    setLocalRotation(displayRotation.toFixed(1));
  }, [
    selectedTrack.id,
    currentTransform.x,
    currentTransform.y,
    displayRotation,
  ]);

  const handlePositionXChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalX(newValue);
      const value = parseFloat(newValue);
      if (!isNaN(value)) {
        updateTransform({ x: value });
      }
    },
    [updateTransform],
  );

  const handlePositionYChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalY(newValue);
      const value = parseFloat(newValue);
      if (!isNaN(value)) {
        updateTransform({ y: value });
      }
    },
    [updateTransform],
  );

  const handleRotationInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setLocalRotation(newValue);
      const value = parseFloat(newValue);
      if (!isNaN(value)) {
        // Convert display rotation (-180 to 180) back to full rotation value
        const currentNormalized =
          ((currentTransform.rotation % 360) + 360) % 360;
        const currentDisplay =
          currentNormalized > 180 ? currentNormalized - 360 : currentNormalized;

        // Calculate the difference and apply it
        const rotationDelta = value - currentDisplay;
        updateTransform({
          rotation: currentTransform.rotation + rotationDelta,
        });
      }
    },
    [updateTransform, currentTransform.rotation],
  );

  // Rotation knob handlers
  const [isDraggingKnob, setIsDraggingKnob] = React.useState(false);
  const knobRef = React.useRef<HTMLDivElement>(null);

  const handleKnobMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDraggingKnob(true);
    },
    [],
  );

  React.useEffect(() => {
    if (!isDraggingKnob) return;

    let lastAngle = displayRotation;

    const handleMouseMove = (e: MouseEvent) => {
      if (!knobRef.current) return;

      const rect = knobRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Calculate angle from center to mouse position
      const angle =
        Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);

      // Normalize to -180 to 180 range
      let normalizedAngle = (angle + 90 + 360) % 360;
      if (normalizedAngle > 180) normalizedAngle -= 360;

      // Calculate the delta from last angle to avoid jumps
      let delta = normalizedAngle - (lastAngle % 360);

      // Handle wrap-around (crossing -180/180 boundary)
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;

      const newRotation = currentTransform.rotation + delta;
      lastAngle = normalizedAngle;

      updateTransform({ rotation: newRotation });
    };

    const handleMouseUp = () => {
      setIsDraggingKnob(false);
      document.body.style.cursor = '';
    };

    // Set cursor to grabbing while dragging
    document.body.style.cursor = 'grabbing';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };
  }, [
    isDraggingKnob,
    updateTransform,
    displayRotation,
    currentTransform.rotation,
  ]);

  const handleResetTransform = useCallback(() => {
    updateTransform({
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
    });
  }, [updateTransform]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Tabs
        defaultValue="basic"
        className="flex-1 flex flex-col overflow-hidden"
      >
        <div className="px-4">
          <TabsList variant="underline">
            <TabsTrigger value="basic" variant="underline">
              Basic
            </TabsTrigger>
            <TabsTrigger value="advanced" disabled variant="underline">
              Advanced
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="basic"
          className="flex-1 overflow-y-auto px-4 pb-4 space-y-4"
        >
          {/* Transform Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">
                Transform
              </h4>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleResetTransform}
                    className="h-7 w-7 p-0"
                    disabled={!hasTransformChanged || isMultipleSelected}
                  >
                    <RotateCcw className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {hasTransformChanged
                      ? 'Reset all transforms'
                      : 'No changes to reset'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </div>

            {/* Scale */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Scale</label>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  value={[currentTransform.scale * 100]}
                  onValueChange={handleScaleSliderChange}
                  min={0}
                  max={200}
                  step={1}
                  className="flex-1"
                  disabled={isMultipleSelected}
                />
                <Input
                  type="number"
                  value={Math.round(currentTransform.scale * 100)}
                  onChange={handleScaleInputChange}
                  min={0}
                  max={200}
                  className="w-16 h-8 text-xs text-center"
                  disabled={isMultipleSelected}
                />
                <span className="text-xs text-muted-foreground w-4">%</span>
              </div>
            </div>

            <Separator />

            {/* Opacity */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">Opacity</label>
              </div>
              <div className="flex items-center gap-2">
                <Slider
                  value={[100]}
                  onValueChange={() => {
                    // Disabled - no-op
                  }}
                  min={0}
                  max={100}
                  step={1}
                  className="flex-1"
                  disabled
                />
                <Input
                  type="number"
                  value={100}
                  onChange={() => {
                    // Disabled - no-op
                  }}
                  min={0}
                  max={100}
                  className="w-16 h-8 text-xs text-center"
                  disabled
                />
                <span className="text-xs text-muted-foreground w-4">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Opacity controls coming soon
              </p>
            </div>

            <Separator />

            {/* Position */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">
                  Position
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">X</label>
                  <Input
                    type="number"
                    value={localX}
                    onChange={handlePositionXChange}
                    step={0.01}
                    className="h-8 text-xs"
                    disabled={isMultipleSelected}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Y</label>
                  <Input
                    type="number"
                    value={localY}
                    onChange={handlePositionYChange}
                    step={0.01}
                    className="h-8 text-xs"
                    disabled={isMultipleSelected}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Normalized coordinates (-1 to 1, 0 = center)
              </p>
            </div>

            <Separator />

            {/* Rotation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-muted-foreground">
                  Rotation
                </label>
              </div>
              <div className="grid grid-cols-2 items-center gap-3">
                <Input
                  type="number"
                  value={localRotation}
                  onChange={handleRotationInputChange}
                  step={1}
                  className="h-8 text-xs"
                  disabled={isMultipleSelected}
                />

                {/* Rotation Knob */}
                <div
                  ref={knobRef}
                  className="relative flex items-center justify-center size-10 rounded-full border-2 border-border bg-muted/50 cursor-grab active:cursor-grabbing hover:border-primary transition-colors select-none"
                  onMouseDown={handleKnobMouseDown}
                  style={{
                    opacity: isMultipleSelected ? 0.5 : 1,
                    pointerEvents: isMultipleSelected ? 'none' : 'auto',
                  }}
                >
                  {/* Rotation indicator line */}
                  <div
                    className="absolute w-0.5 h-4 bg-primary rounded-full"
                    style={{
                      transform: `rotate(${displayRotation}deg)`,
                      transformOrigin: 'center bottom',
                      bottom: '50%',
                    }}
                  />
                  {/* Center dot */}
                  <div className="absolute w-1.5 h-1.5 bg-primary rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {isMultipleSelected && (
            <div className="pt-4">
              <p className="text-xs text-muted-foreground text-center">
                Multiple tracks selected. Select a single track to edit
                properties.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="advanced"
          className="flex-1 overflow-y-auto px-4 pb-4 space-y-4 mt-4"
        >
          <div className="space-y-4">
            <h4 className="text-sm font-semibold text-foreground">Advanced</h4>
            <p className="text-xs text-muted-foreground">
              Advanced image controls coming soon. This section will include
              effects, filters, and more transform options.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

ImagePropertiesComponent.displayName = 'ImageProperties';

export const ImageProperties = React.memo(ImagePropertiesComponent);
