import { RuntimeDownloadModal } from '@/frontend/components/custom/RuntimeDownloadModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/frontend/components/ui/alert-dialog';
import { Button } from '@/frontend/components/ui/button';
import { Input } from '@/frontend/components/ui/input';
import { Progress } from '@/frontend/components/ui/progress';
import { Separator } from '@/frontend/components/ui/separator';
import { Slider } from '@/frontend/components/ui/slider';
import { Switch } from '@/frontend/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { AlertCircle, Loader2, RotateCcw, VolumeX } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  NoiseReductionCache,
  ProcessingState,
} from '../../../preview/services/NoiseReductionCache';
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
  const isPlaying = useVideoEditorStore((state) => state.playback.isPlaying);
  const play = useVideoEditorStore((state) => state.play);
  const pause = useVideoEditorStore((state) => state.pause);

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
  // Track if playback was active before drag to resume after
  const wasPlayingRef = useRef(false);
  // Timer for delayed resume after drag
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Cleanup resume timer on unmount
  useEffect(() => {
    return () => {
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
      }
    };
  }, []);

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

  // Handle volume slider drag start (begin batch transaction + pause playback)
  const handleVolumeSliderDragStart = useCallback(() => {
    if (!isDraggingRef.current) {
      isDraggingRef.current = true;
      beginAudioUpdate();

      // Clear any pending resume timer
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }

      // Pause playback if playing (to avoid audio glitches during drag)
      if (isPlaying) {
        wasPlayingRef.current = true;
        pause();
      }
    }
  }, [beginAudioUpdate, isPlaying, pause]);

  // Handle volume slider drag end (end batch transaction + delayed resume)
  const handleVolumeSliderDragEnd = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      endAudioUpdate();

      // Resume playback after a short delay if it was playing before
      if (wasPlayingRef.current) {
        resumeTimerRef.current = setTimeout(() => {
          play();
          wasPlayingRef.current = false;
          resumeTimerRef.current = null;
        }, 150); // 150ms delay for smooth transition
      }
    }
  }, [endAudioUpdate, play]);

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

  // State for runtime download modal
  const [showRuntimeModal, setShowRuntimeModal] = useState(false);
  const [pendingNoiseReduction, setPendingNoiseReduction] = useState(false);

  // State for noise reduction processing
  const [nrCacheState, setNrCacheState] = useState<ProcessingState>('idle');
  const [nrProgress, setNrProgress] = useState(0);
  const [nrError, setNrError] = useState<string | null>(null);

  // Temporary state for error modal (for debugging)
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');

  // Get source URL for the selected track
  const sourceUrl = useMemo(() => {
    return selectedTrack?.previewUrl || selectedTrack?.source || null;
  }, [selectedTrack?.previewUrl, selectedTrack?.source]);

  // Subscribe to noise reduction cache state changes
  useEffect(() => {
    if (!sourceUrl) return;

    const sourceId = NoiseReductionCache.normalizeSourceId(sourceUrl);

    const updateState = () => {
      setNrCacheState(NoiseReductionCache.getState(sourceId));
      setNrProgress(NoiseReductionCache.getProgress(sourceId));
      setNrError(NoiseReductionCache.getError(sourceId));
    };

    // Initialize state
    updateState();

    // Subscribe to changes
    return NoiseReductionCache.subscribe(sourceId, updateState);
  }, [sourceUrl]);

  // Derived state for UI
  const isProcessing = nrCacheState === 'processing';
  const isCached = nrCacheState === 'cached';
  const hasError = nrCacheState === 'error';

  // Handle noise reduction toggle (single action - creates undo entry)
  const handleNoiseReductionToggle = useCallback(
    async (enabled: boolean) => {
      if (enabled) {
        // Check runtime before enabling
        try {
          const runtimeStatus = await window.electronAPI.runtimeStatus();
          if (!runtimeStatus.installed || runtimeStatus.needsUpdate) {
            // Show download modal instead of enabling
            setPendingNoiseReduction(true);
            setShowRuntimeModal(true);
            return;
          }
        } catch (error) {
          console.error('Failed to check runtime status:', error);

          // TEMPORARY: Show complete error details in modal for debugging
          const errorMessage =
            error instanceof Error
              ? `${error.name}: ${error.message}\n\nStack:\n${
                  error.stack || 'No stack trace available'
                }`
              : typeof error === 'string'
                ? error
                : JSON.stringify(error, null, 2);

          setErrorDetails(`Runtime Status Check Error:\n\n${errorMessage}`);
          setShowErrorModal(true);

          // Continue anyway - the actual noise reduction will fail with a clearer error
        }

        // Check if we have a valid source URL
        if (!sourceUrl) {
          console.error('No source URL available for noise reduction');
          return;
        }

        const sourceId = NoiseReductionCache.normalizeSourceId(sourceUrl);

        // Check if already cached - just enable the flag
        if (NoiseReductionCache.hasCached(sourceId)) {
          beginAudioUpdate();
          updateAudioProperties({ noiseReductionEnabled: true });
          endAudioUpdate();
          return;
        }

        // Start processing
        try {
          await NoiseReductionCache.processSource(sourceId, sourceUrl);

          // Processing complete - enable the flag
          beginAudioUpdate();
          updateAudioProperties({ noiseReductionEnabled: true });
          endAudioUpdate();
        } catch (error) {
          console.error('Noise reduction processing failed:', error);

          // TEMPORARY: Show complete error details in modal for debugging
          const errorMessage =
            error instanceof Error
              ? `${error.name}: ${error.message}\n\nStack:\n${
                  error.stack || 'No stack trace available'
                }`
              : typeof error === 'string'
                ? error
                : JSON.stringify(error, null, 2);

          setErrorDetails(errorMessage);
          setShowErrorModal(true);

          // Error is already stored in cache - UI will update via subscription
          // Don't enable the flag on error
        }
      } else {
        // Disable noise reduction
        beginAudioUpdate();
        updateAudioProperties({ noiseReductionEnabled: false });
        endAudioUpdate();
      }
    },
    [updateAudioProperties, beginAudioUpdate, endAudioUpdate, sourceUrl],
  );

  // Handle retry after error
  const handleRetry = useCallback(async () => {
    if (!sourceUrl) return;

    const sourceId = NoiseReductionCache.normalizeSourceId(sourceUrl);
    NoiseReductionCache.resetError(sourceId);

    // Trigger processing again
    handleNoiseReductionToggle(true);
  }, [sourceUrl, handleNoiseReductionToggle]);

  // Handle successful runtime download - enable noise reduction
  const handleRuntimeDownloadSuccess = useCallback(() => {
    if (pendingNoiseReduction) {
      beginAudioUpdate();
      updateAudioProperties({ noiseReductionEnabled: true });
      endAudioUpdate();
      setPendingNoiseReduction(false);
    }
  }, [
    pendingNoiseReduction,
    updateAudioProperties,
    beginAudioUpdate,
    endAudioUpdate,
  ]);

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
            {isProcessing && (
              <Loader2 className="size-4 animate-spin text-primary" />
            )}
            {currentAudioProperties.noiseReductionEnabled &&
              isCached &&
              !isProcessing && (
                <div className="w-2 h-2 bg-green-500 rounded-full" />
              )}
          </div>
          <Switch
            checked={currentAudioProperties.noiseReductionEnabled}
            onCheckedChange={handleNoiseReductionToggle}
            className="h-4 w-7"
            thumbClassName="size-3.5"
            disabled={isMultipleSelected || isProcessing}
          />
        </div>

        {/* Progress indicator */}
        {isProcessing && (
          <div className="space-y-1">
            <Progress value={nrProgress} className="h-1" />
            <p className="text-xs text-muted-foreground">
              Processing... {Math.round(nrProgress)}%
            </p>
          </div>
        )}

        {/* Error state */}
        {hasError && nrError && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/20">
            <AlertCircle className="size-4 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-destructive truncate">{nrError}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs mt-1"
                onClick={handleRetry}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {/* Status text */}
        {!isProcessing && !hasError && (
          <p className="text-xs text-muted-foreground">
            {currentAudioProperties.noiseReductionEnabled && isCached
              ? 'Noise reduction is active'
              : currentAudioProperties.noiseReductionEnabled
                ? 'Noise reduction enabled (processing pending)'
                : 'Enable to reduce background noise'}
          </p>
        )}
      </div>

      {isMultipleSelected && (
        <div className="pt-4">
          <p className="text-xs text-muted-foreground text-center">
            Multiple tracks selected. Select a single track to edit audio
            properties.
          </p>
        </div>
      )}

      {/* Runtime Download Modal for Noise Reduction */}
      <RuntimeDownloadModal
        isOpen={showRuntimeModal}
        onClose={() => {
          setShowRuntimeModal(false);
          setPendingNoiseReduction(false);
        }}
        onSuccess={handleRuntimeDownloadSuccess}
        featureName="Noise Reduction"
      />

      {/* TEMPORARY: Error Debug Modal */}
      <AlertDialog open={showErrorModal} onOpenChange={setShowErrorModal}>
        <AlertDialogContent className="min-w-[60vw] max-h-[80vh] overflow-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Noise Reduction Error Details</AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <pre className="mt-4 p-4 bg-muted rounded-md text-xs overflow-auto whitespace-pre-wrap break-words">
                {errorDetails || 'No error details available'}
              </pre>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowErrorModal(false)}>
              Close
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

AudioPropertiesComponent.displayName = 'AudioProperties';

export const AudioProperties = React.memo(AudioPropertiesComponent);
