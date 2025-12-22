import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Separator } from '@/frontend/components/ui/separator';
import { Slider } from '@/frontend/components/ui/slider';
import { Switch } from '@/frontend/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { RotateCcw, VolumeX } from 'lucide-react';
import React, { useCallback, useMemo, useRef } from 'react';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';
import { DEFAULT_AUDIO_METADATA } from '../../../stores/videoEditor/types/track.types';

interface AudioPropertiesProps {
  selectedTrackIds: string[];
  forceTrackId?: string; // Optional: force a specific track ID (allows video tracks with audio)
}

// Default audio properties for UI (concrete number type for slider compatibility)
const DEFAULT_AUDIO_PROPERTIES = {
  volumeDb: DEFAULT_AUDIO_METADATA.volumeDb as number,
  noiseReductionEnabled: DEFAULT_AUDIO_METADATA.noiseReductionEnabled,
};

const AudioPropertiesComponent: React.FC<AudioPropertiesProps> = ({
  selectedTrackIds,
  forceTrackId,
}) => {
  // Selective subscriptions to avoid re-renders during playback
  const tracks = useVideoEditorStore((state) => state.tracks);

  // Action subscriptions (these don't cause re-renders)
  const updateTrackAudio = useVideoEditorStore(
    (state) => state.updateTrackAudio,
  );
  const beginAudioUpdate = useVideoEditorStore(
    (state) => state.beginAudioUpdate,
  );
  const endAudioUpdate = useVideoEditorStore((state) => state.endAudioUpdate);

  // Track if we're in a slider drag to avoid multiple beginGroup calls
  const isDraggingRef = useRef(false);

  // Get selected audio tracks (or forced track)
  const selectedAudioTracks = useMemo(() => {
    if (forceTrackId) {
      const forcedTrack = tracks.find((track) => track.id === forceTrackId);
      return forcedTrack ? [forcedTrack] : [];
    }
    return tracks.filter(
      (track) => track.type === 'audio' && selectedTrackIds.includes(track.id),
    );
  }, [tracks, selectedTrackIds, forceTrackId]);

  // Don't render if no audio tracks are selected
  if (selectedAudioTracks.length === 0) {
    return null;
  }

  const isMultipleSelected = selectedAudioTracks.length > 1;
  const selectedTrack = selectedAudioTracks[0];
  const currentAudioProperties = {
    volumeDb: selectedTrack.volumeDb ?? DEFAULT_AUDIO_PROPERTIES.volumeDb,
    noiseReductionEnabled:
      selectedTrack.noiseReductionEnabled ??
      DEFAULT_AUDIO_PROPERTIES.noiseReductionEnabled,
  };

  // Format dB value for display
  const formatDbValue = useCallback((db: number) => {
    if (db === -Infinity) return '-∞';
    return db.toFixed(1);
  }, []);

  // Local state for input field to prevent cursor jumping
  const [localInputValue, setLocalInputValue] = React.useState(
    formatDbValue(currentAudioProperties.volumeDb),
  );

  // Update local input value when track changes
  React.useEffect(() => {
    setLocalInputValue(formatDbValue(currentAudioProperties.volumeDb));
  }, [currentAudioProperties.volumeDb]);

  // Helper function to update audio properties for selected tracks (batch-safe)
  const updateAudioProperties = useCallback(
    (propertyUpdates: Partial<typeof DEFAULT_AUDIO_PROPERTIES>) => {
      selectedAudioTracks.forEach((track) => {
        updateTrackAudio(track.id, propertyUpdates);
      });
    },
    [selectedAudioTracks, updateTrackAudio],
  );

  // Check if properties have changed from default
  const hasPropertiesChanged = useMemo(() => {
    return (
      currentAudioProperties.volumeDb !== DEFAULT_AUDIO_PROPERTIES.volumeDb ||
      currentAudioProperties.noiseReductionEnabled !==
        DEFAULT_AUDIO_PROPERTIES.noiseReductionEnabled
    );
  }, [currentAudioProperties]);

  // Handle volume slider drag start (begin batch transaction)
  const handleVolumeSliderDragStart = useCallback(() => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      beginAudioUpdate();
    }
  }, [beginAudioUpdate]);

  // Handle volume slider drag end (end batch transaction)
  const handleVolumeSliderDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      endAudioUpdate();
    }
  }, [endAudioUpdate]);

  // Handle volume slider change (dB scale) - called during drag
  const handleVolumeSliderChange = useCallback(
    (values: number[]) => {
      const dbValue = values[0];
      // Convert -60 dB slider range to actual dB value
      const actualDb = dbValue === -60 ? -Infinity : dbValue;
      updateAudioProperties({ volumeDb: actualDb });
    },
    [updateAudioProperties],
  );

  // Handle volume input change (local state)
  const handleVolumeInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalInputValue(e.target.value);
    },
    [],
  );

  // Commit volume input value (single action - creates undo entry)
  const commitVolumeInput = useCallback(() => {
    const inputValue = localInputValue.toLowerCase().trim();

    let dbValue: number;
    if (inputValue === '-inf' || inputValue === '-∞' || inputValue === '') {
      dbValue = -Infinity;
    } else {
      const parsed = parseFloat(inputValue);
      if (isNaN(parsed)) {
        // Reset to current value if invalid
        setLocalInputValue(formatDbValue(currentAudioProperties.volumeDb));
        return;
      }

      // Clamp to valid range
      dbValue = Math.max(-60, Math.min(12, parsed));
    }

    // Wrap in begin/end to create a single undo entry
    beginAudioUpdate();
    updateAudioProperties({ volumeDb: dbValue });
    endAudioUpdate();
    setLocalInputValue(formatDbValue(dbValue));
  }, [
    localInputValue,
    currentAudioProperties.volumeDb,
    updateAudioProperties,
    beginAudioUpdate,
    endAudioUpdate,
  ]);

  // Handle input key down for Enter/Escape
  const handleVolumeInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitVolumeInput();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setLocalInputValue(formatDbValue(currentAudioProperties.volumeDb));
      }
    },
    [commitVolumeInput, currentAudioProperties.volumeDb],
  );

  // Get slider value (convert -Inf to -60 for slider)
  const getSliderValue = useCallback((db: number) => {
    return db === -Infinity ? -60 : Math.max(-60, Math.min(12, db));
  }, []);

  // Handle noise reduction toggle (single action - creates undo entry)
  const handleNoiseReductionToggle = useCallback(
    (enabled: boolean) => {
      beginAudioUpdate();
      updateAudioProperties({ noiseReductionEnabled: enabled });
      endAudioUpdate();
    },
    [updateAudioProperties, beginAudioUpdate, endAudioUpdate],
  );

  // Handle reset to defaults (single action - creates undo entry)
  const handleReset = useCallback(() => {
    beginAudioUpdate();
    updateAudioProperties(DEFAULT_AUDIO_PROPERTIES);
    endAudioUpdate();
  }, [updateAudioProperties, beginAudioUpdate, endAudioUpdate]);

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">
      {/* Audio Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-foreground">Audio</h4>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-7 w-7 p-0"
              disabled={!hasPropertiesChanged || isMultipleSelected}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {hasPropertiesChanged
                ? 'Reset all audio properties'
                : 'No changes to reset'}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Volume Control */}
      <div className="space-y-3 pb-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Volume</label>
          {currentAudioProperties.volumeDb === -Infinity && (
            <div className="flex items-center gap-1">
              <VolumeX className="size-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Muted</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Slider with labels */}
          <div className="space-y-2 flex-1 px-2">
            <Slider
              value={[getSliderValue(currentAudioProperties.volumeDb)]}
              onValueChange={handleVolumeSliderChange}
              onPointerDown={handleVolumeSliderDragStart}
              onValueCommit={handleVolumeSliderDragEnd}
              min={-60}
              max={12}
              step={0.1}
              className="w-full"
              disabled={isMultipleSelected}
            />

            {/* Position labels relative to slider values */}
            <div className="relative px-3">
              <div className="text-xs text-muted-foreground">
                <span className="absolute left-0 transform -translate-x-1/2">
                  -∞
                </span>
                <span
                  className="absolute"
                  style={{ left: '41.67%', transform: 'translateX(-50%)' }}
                >
                  -30
                </span>
                <span
                  className="absolute"
                  style={{ left: '83.33%', transform: 'translateX(-50%)' }}
                >
                  0
                </span>
                <span className="absolute right-0 transform translate-x-1/2">
                  +12
                </span>
              </div>
            </div>
          </div>

          {/* Input and unit */}
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={localInputValue}
              onChange={handleVolumeInputChange}
              onBlur={commitVolumeInput}
              onKeyDown={handleVolumeInputKeyDown}
              placeholder="-∞"
              className="w-20 h-8 text-xs text-center"
              disabled={isMultipleSelected}
            />
            <span className="text-xs text-muted-foreground">dB</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Noise Reduction */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-foreground">
              Noise Reduction
            </label>
            {currentAudioProperties.noiseReductionEnabled && (
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
            )}
          </div>
          <Switch
            checked={currentAudioProperties.noiseReductionEnabled}
            onCheckedChange={handleNoiseReductionToggle}
            className="h-4 w-7"
            thumbClassName="size-3.5"
            disabled={isMultipleSelected}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {currentAudioProperties.noiseReductionEnabled
            ? 'Noise reduction is enabled for this audio clip'
            : 'Enable noise reduction to reduce background noise'}
        </p>
      </div>

      {isMultipleSelected && (
        <div className="pt-4">
          <p className="text-xs text-muted-foreground text-center">
            Multiple tracks selected. Select a single track to edit audio
            properties.
          </p>
        </div>
      )}
    </div>
  );
};

AudioPropertiesComponent.displayName = 'AudioProperties';

export const AudioProperties = React.memo(AudioPropertiesComponent);
