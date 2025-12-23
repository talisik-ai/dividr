/* eslint-disable @typescript-eslint/no-explicit-any */
import { KaraokeIcon } from '@/frontend/assets/icons/karaoke';
import { RuntimeDownloadModal } from '@/frontend/components/custom/RuntimeDownloadModal';
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import { Kbd } from '@/frontend/components/ui/kbd';
import { Separator } from '@/frontend/components/ui/separator';
import { Slider } from '@/frontend/components/ui/slider';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import {
  ChevronDown,
  CopyPlus,
  Link,
  Magnet,
  Maximize,
  Minimize,
  MousePointer2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Slice,
  SplitSquareHorizontal,
  Trash,
  Unlink,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { KaraokeConfirmationDialog } from '../components/dialogs/karaokeConfirmationDialog';
import { useVideoEditorStore } from '../stores/videoEditor/index';
import { getDisplayFps } from '../stores/videoEditor/types/timeline.types';

// Throttle utility for zoom operations to prevent lag
const useThrottledCallback = <T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): T => {
  const lastCall = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      const now = Date.now();

      // Clear any pending timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // If enough time has passed, call immediately
      if (now - lastCall.current >= delay) {
        lastCall.current = now;
        callback(...args);
      } else {
        // Otherwise, schedule for later
        timeoutRef.current = setTimeout(
          () => {
            lastCall.current = Date.now();
            callback(...args);
          },
          delay - (now - lastCall.current),
        );
      }
    }) as T,
    [callback, delay],
  );
};

// Separate component for time display that only re-renders when currentFrame changes
const TimeDisplay: React.FC = React.memo(() => {
  const currentFrame = useVideoEditorStore(
    (state) => state.timeline.currentFrame,
  );
  const tracks = useVideoEditorStore((state) => state.tracks);
  const totalFrames = useVideoEditorStore(
    (state) => state.timeline.totalFrames,
  );
  // Get display FPS from source video tracks (dynamic but static once determined)
  const displayFps = React.useMemo(() => getDisplayFps(tracks), [tracks]);

  const formatTime = useCallback(
    (frame: number) => {
      const totalSeconds = frame / displayFps;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const frames = Math.floor((totalSeconds % 1) * displayFps);
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    },
    [displayFps],
  );

  const effectiveEndFrame = useMemo(() => {
    // When tracks exist, use the maximum track end frame
    // Only use totalFrames as fallback when no tracks exist
    return tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame))
      : totalFrames;
  }, [tracks, totalFrames]);

  const formattedDuration = formatTime(effectiveEndFrame);

  return (
    <div className="text-xs p-2 text-muted-foreground font-semibold min-w-[140px] text-center">
      {formatTime(currentFrame)} / {formattedDuration}
    </div>
  );
});

// Separate component for play/pause button that only re-renders when isPlaying changes
const PlayPauseButton: React.FC<{
  onPlayToggle: () => void;
}> = React.memo(({ onPlayToggle }) => {
  const isPlaying = useVideoEditorStore((state) => state.playback.isPlaying);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button onClick={onPlayToggle} variant="native" size="icon">
          {isPlaying ? (
            <Pause className="fill-zinc-900 dark:fill-zinc-100" />
          ) : (
            <Play className="fill-zinc-900 dark:fill-zinc-100" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isPlaying ? 'Pause' : 'Play'} (Space)</TooltipContent>
    </Tooltip>
  );
});

// Separate component for playback rate selector
// const PlaybackRateSelector: React.FC = React.memo(() => {
//   const playbackRate = useVideoEditorStore(
//     (state) => state.playback.playbackRate,
//   );
//   const setPlaybackRate = useVideoEditorStore((state) => state.setPlaybackRate);

//   return (
//     <div className="flex items-center justify-center gap-2">
//       <label className="text-xs">Speed:</label>
//       <Select
//         value={playbackRate.toString()}
//         onValueChange={(value) => setPlaybackRate(Number(value))}
//       >
//         <SelectTrigger variant="ghost" className="text-xs w-[50px]">
//           <SelectValue />
//         </SelectTrigger>
//         <SelectContent>
//           <SelectItem value="0.25">0.25x</SelectItem>
//           <SelectItem value="0.5">0.5x</SelectItem>
//           <SelectItem value="1">1x</SelectItem>
//           <SelectItem value="1.5">1.5x</SelectItem>
//           <SelectItem value="2">2x</SelectItem>
//           <SelectItem value="4">4x</SelectItem>
//         </SelectContent>
//       </Select>
//     </div>
//   );
// });

// Separate component for delete button that reacts to track selection
const DeleteButton: React.FC = React.memo(() => {
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );
  const removeSelectedTracks = useVideoEditorStore(
    (state) => state.removeSelectedTracks,
  );

  const handleDelete = useCallback(() => {
    removeSelectedTracks();
  }, [removeSelectedTracks]);

  const tooltipText =
    selectedTrackIds.length > 0
      ? `Delete ${selectedTrackIds.length} selected track${selectedTrackIds.length > 1 ? 's' : ''} (Delete)`
      : 'Delete selected tracks (Delete)';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="native"
          onClick={handleDelete}
          disabled={selectedTrackIds.length === 0}
        >
          <Trash />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
});

// Separate component for duplicate button that reacts to track selection
const DuplicateButton: React.FC = React.memo(() => {
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );
  const tracks = useVideoEditorStore((state) => state.tracks);
  const duplicateTrack = useVideoEditorStore((state) => state.duplicateTrack);
  const setSelectedTracks = useVideoEditorStore(
    (state) => state.setSelectedTracks,
  );

  const beginGroup = useVideoEditorStore((state) => state.beginGroup);
  const endGroup = useVideoEditorStore((state) => state.endGroup);

  const handleDuplicate = useCallback(() => {
    if (selectedTrackIds.length === 0) return;

    console.log('[DuplicateButton] Duplicating selected tracks:', {
      selectedCount: selectedTrackIds.length,
      selectedIds: selectedTrackIds,
    });

    // Begin grouped transaction for batch duplicate
    beginGroup?.(
      `Duplicate ${selectedTrackIds.length} Track${selectedTrackIds.length > 1 ? 's' : ''}`,
    );

    const processedTrackIds = new Set<string>();
    const newlyCreatedIds: string[] = [];

    selectedTrackIds.forEach((trackId: string) => {
      if (processedTrackIds.has(trackId)) {
        console.log(
          `[DuplicateButton] Skipping ${trackId} - already processed`,
        );
        return;
      }

      const track = tracks.find((t) => t.id === trackId);
      if (!track) {
        console.error(
          `❌ Track ${trackId} not found in tracks array, skipping`,
        );
        return;
      }

      const bothSidesSelected =
        track.isLinked &&
        track.linkedTrackId &&
        selectedTrackIds.includes(track.linkedTrackId);

      processedTrackIds.add(trackId);

      if (bothSidesSelected && track.linkedTrackId) {
        processedTrackIds.add(track.linkedTrackId);
      }

      // Use skipGrouping=true since we're managing the group at batch level
      const result = duplicateTrack(trackId, bothSidesSelected, true);

      if (result) {
        if (Array.isArray(result)) {
          newlyCreatedIds.push(...result);
        } else {
          newlyCreatedIds.push(result);
        }
      }
    });

    // End grouped transaction
    endGroup?.();

    if (newlyCreatedIds.length > 0) {
      setSelectedTracks(newlyCreatedIds);
    } else {
      console.error('❌ Duplication produced no new tracks');
    }
  }, [
    selectedTrackIds,
    tracks,
    duplicateTrack,
    setSelectedTracks,
    beginGroup,
    endGroup,
  ]);

  const tooltipText =
    selectedTrackIds.length > 0
      ? `Duplicate ${selectedTrackIds.length} selected track${selectedTrackIds.length > 1 ? 's' : ''} (Ctrl+D)`
      : 'Duplicate selected tracks (Ctrl+D)';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="native"
          onClick={handleDuplicate}
          disabled={selectedTrackIds.length === 0}
        >
          <CopyPlus className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
});

// Link/Unlink button component
const LinkUnlinkButton: React.FC = React.memo(() => {
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );
  const tracks = useVideoEditorStore((state) => state.tracks);
  // Subscribe to only the actions we need, not the entire store
  const linkTracks = useVideoEditorStore((state) => state.linkTracks);
  const unlinkTracks = useVideoEditorStore((state) => state.unlinkTracks);
  const setSelectedTracks = useVideoEditorStore(
    (state) => state.setSelectedTracks,
  );

  // Determine link state of selected tracks
  const linkState = useMemo(() => {
    const selectedTracks = tracks.filter((track) =>
      selectedTrackIds.includes(track.id),
    );

    if (selectedTracks.length === 0) {
      return { canLink: false, canUnlink: false, hasLinked: false };
    }

    const videoTracks = selectedTracks.filter(
      (track) => track.type === 'video',
    );
    const audioTracks = selectedTracks.filter(
      (track) => track.type === 'audio',
    );

    // Check if we have linked tracks in selection
    const hasLinkedTracks = selectedTracks.some((track) => track.isLinked);

    // Check if we can link (unlinked video + audio with same source)
    // Look for unlinked video tracks that have matching unlinked audio tracks
    const unlinkedVideoTracks = videoTracks.filter((track) => !track.isLinked);
    const unlinkedAudioTracks = audioTracks.filter((track) => !track.isLinked);

    const canLink = unlinkedVideoTracks.some((videoTrack) => {
      const matchingAudio = unlinkedAudioTracks.find((audioTrack) => {
        // For extracted audio, we need to match by name pattern rather than source
        // since extracted audio has a different temp file path

        // Get base video name (remove .mp4 extension if present)
        const videoBaseName = videoTrack.name.replace(
          /\.(mp4|mov|avi|mkv|webm)$/i,
          '',
        );

        // Check various name patterns for extracted audio
        const nameMatches =
          audioTrack.name === videoTrack.name ||
          audioTrack.name === `${videoTrack.name} (Audio)` ||
          audioTrack.name === `${videoBaseName} (Audio)` ||
          audioTrack.name === `${videoBaseName} (Extracted Audio)` ||
          (audioTrack.name.startsWith(videoBaseName) &&
            audioTrack.name.includes('Audio'));

        // For extracted audio, source paths won't match, so we primarily rely on name matching
        // But for regular audio files, we can still check source matching
        const sourceMatches = audioTrack.source === videoTrack.source;

        return nameMatches || sourceMatches;
      });

      return !!matchingAudio;
    });

    return {
      canLink,
      canUnlink: hasLinkedTracks,
      hasLinked: hasLinkedTracks,
    };
  }, [selectedTrackIds, tracks]);

  const handleLink = useCallback(() => {
    const selectedTracks = tracks.filter((track) =>
      selectedTrackIds.includes(track.id),
    );
    const videoTracks = selectedTracks.filter(
      (track) => track.type === 'video' && !track.isLinked,
    );
    const audioTracks = selectedTracks.filter(
      (track) => track.type === 'audio' && !track.isLinked,
    );

    videoTracks.forEach((videoTrack) => {
      const matchingAudio = audioTracks.find((audioTrack) => {
        // Use the same improved matching logic as in canLink check
        const videoBaseName = videoTrack.name.replace(
          /\.(mp4|mov|avi|mkv|webm)$/i,
          '',
        );

        const nameMatches =
          audioTrack.name === videoTrack.name ||
          audioTrack.name === `${videoTrack.name} (Audio)` ||
          audioTrack.name === `${videoBaseName} (Audio)` ||
          audioTrack.name === `${videoBaseName} (Extracted Audio)` ||
          (audioTrack.name.startsWith(videoBaseName) &&
            audioTrack.name.includes('Audio'));

        const sourceMatches = audioTrack.source === videoTrack.source;

        return nameMatches || sourceMatches;
      });

      if (matchingAudio) {
        linkTracks(videoTrack.id, matchingAudio.id);
      }
    });
  }, [selectedTrackIds, tracks, linkTracks]);

  const handleUnlink = useCallback(() => {
    const selectedTracks = tracks.filter((track) =>
      selectedTrackIds.includes(track.id),
    );
    const linkedTracks = selectedTracks.filter((track) => track.isLinked);

    // Track which tracks to keep selected after unlinking
    const tracksToKeepSelected: string[] = [];

    linkedTracks.forEach((track) => {
      if (track.type === 'video' || track.type === 'audio') {
        unlinkTracks(track.id);
        tracksToKeepSelected.push(track.id);
      }
    });

    // Update selection to only keep the originally selected tracks (remove auto-selected linked partners)
    if (tracksToKeepSelected.length > 0) {
      setSelectedTracks(tracksToKeepSelected);
    }
  }, [selectedTrackIds, tracks, unlinkTracks, setSelectedTracks]);

  const handleToggleLinkState = useCallback(() => {
    if (linkState.canUnlink) {
      handleUnlink();
    } else if (linkState.canLink) {
      handleLink();
    }
  }, [linkState.canLink, linkState.canUnlink, handleLink, handleUnlink]);

  const isDisabled = !linkState.canLink && !linkState.canUnlink;
  const isUnlinkMode = linkState.canUnlink;

  const tooltipText = isUnlinkMode
    ? 'Unlink selected tracks'
    : 'Link selected video and audio tracks';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="native"
          onClick={handleToggleLinkState}
          disabled={isDisabled}
        >
          {isUnlinkMode ? (
            <Unlink className="text-orange-500" />
          ) : (
            <Link
              className={linkState.canLink ? 'text-blue-500' : 'text-gray-400'}
            />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
});

// Generate Karaoke button component for Timeline Controller workflow
const GenerateKaraokeButton: React.FC = React.memo(() => {
  const tracks = useVideoEditorStore((state) => state.tracks);
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );
  const generateKaraokeSubtitlesFromTrack = useVideoEditorStore(
    (state) => state.generateKaraokeSubtitlesFromTrack,
  );
  const removeTrack = useVideoEditorStore((state) => state.removeTrack);
  const currentTranscribingTrackId = useVideoEditorStore(
    (state) => state.currentTranscribingTrackId,
  );

  const [karaokeConfirmation, setKaraokeConfirmation] = useState<{
    show: boolean;
    trackIds: string[];
    trackNames: string[];
    existingSubtitleCount: number;
  }>({
    show: false,
    trackIds: [],
    trackNames: [],
    existingSubtitleCount: 0,
  });

  // Runtime download modal state
  const [showRuntimeModal, setShowRuntimeModal] = useState(false);
  const [pendingKaraokeAction, setPendingKaraokeAction] = useState<{
    trackIds: string[];
    deleteExisting: boolean;
  } | null>(null);

  // Check if transcription is in progress
  const isTranscribing = !!currentTranscribingTrackId;

  // Determine which tracks to generate subtitles for based on selection
  // IMPORTANT: Only process SELECTED tracks (no fallback to all tracks)
  const targetTracks = useMemo(() => {
    // Require explicit selection - don't process all tracks automatically
    if (selectedTrackIds.length === 0) {
      return []; // No selection = disabled
    }

    // Get video and audio tracks that can generate subtitles from selection
    const selectedEligible = tracks.filter(
      (t) =>
        selectedTrackIds.includes(t.id) &&
        (t.type === 'video' || t.type === 'audio') &&
        !t.muted,
    );

    return selectedEligible;
  }, [tracks, selectedTrackIds]);

  const handleGenerateKaraoke = useCallback(() => {
    if (targetTracks.length === 0) {
      toast.error('No video or audio tracks found on timeline');
      return;
    }

    // Check if there are existing subtitle tracks
    const existingSubtitles = tracks.filter(
      (track) => track.type === 'subtitle',
    );

    if (existingSubtitles.length > 0) {
      // Show confirmation dialog
      setKaraokeConfirmation({
        show: true,
        trackIds: targetTracks.map((t) => t.id),
        trackNames: targetTracks.map((t) => t.name),
        existingSubtitleCount: existingSubtitles.length,
      });
    } else {
      // No existing subtitles, proceed directly
      handleConfirmKaraokeGeneration(
        targetTracks.map((t) => t.id),
        false,
      );
    }
  }, [targetTracks, tracks]);

  const handleConfirmKaraokeGeneration = useCallback(
    async (trackIds: string[], deleteExisting: boolean) => {
      // Delete existing subtitles if requested
      if (deleteExisting) {
        const existingSubtitles = tracks.filter(
          (track) => track.type === 'subtitle',
        );
        console.log(
          `🗑️ Deleting ${existingSubtitles.length} existing subtitle tracks...`,
        );
        for (const track of existingSubtitles) {
          removeTrack(track.id);
        }
      }

      // Close dialog
      setKaraokeConfirmation({
        show: false,
        trackIds: [],
        trackNames: [],
        existingSubtitleCount: 0,
      });

      // Generate karaoke subtitles for multiple tracks sequentially
      let totalSubtitlesGenerated = 0;
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < trackIds.length; i++) {
        const trackId = trackIds[i];
        const track = tracks.find((t) => t.id === trackId);

        if (!track) continue;

        console.log(
          `🎤 Generating subtitles for track ${i + 1}/${trackIds.length}: ${track.name}`,
        );

        try {
          const result = await generateKaraokeSubtitlesFromTrack(trackId, {
            model: 'base',
            processOnlyThisSegment: true, // Timeline Controller: only process the selected segment
            keepExistingSubtitles:
              !deleteExisting &&
              tracks.some((t) => t.type === 'subtitle'),
          });

          if (result.success) {
            totalSubtitlesGenerated += result.trackIds?.length || 0;
            successCount++;
            console.log(
              `✅ Generated ${result.trackIds?.length || 0} subtitles for ${track.name}`,
            );
          } else if (result.requiresDownload) {
            // Runtime not installed - show download modal and stop processing
            setPendingKaraokeAction({ trackIds, deleteExisting });
            setShowRuntimeModal(true);
            return; // Exit early, will retry after download
          } else {
            failCount++;
            console.error(
              `❌ Failed to generate subtitles for ${track.name}:`,
              result.error,
            );
          }
        } catch (error) {
          failCount++;
          console.error(
            `❌ Error generating subtitles for ${track.name}:`,
            error,
          );
        }
      }

      // Show summary toast
      if (successCount > 0) {
        const message =
          trackIds.length === 1
            ? `Generated ${totalSubtitlesGenerated} karaoke subtitle tracks`
            : `Generated ${totalSubtitlesGenerated} karaoke subtitle tracks for ${successCount} video${successCount > 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`;
        toast.success(message);
      } else {
        toast.error('Failed to generate karaoke subtitles for all tracks');
      }
    },
    [tracks, removeTrack, generateKaraokeSubtitlesFromTrack],
  );

  // Handler for successful runtime download - retry pending karaoke generation
  const handleRuntimeDownloadSuccess = useCallback(() => {
    if (pendingKaraokeAction) {
      const { trackIds, deleteExisting } = pendingKaraokeAction;
      setPendingKaraokeAction(null);
      // Retry the karaoke generation
      handleConfirmKaraokeGeneration(trackIds, deleteExisting);
    }
  }, [pendingKaraokeAction, handleConfirmKaraokeGeneration]);

  const isDisabled = targetTracks.length === 0 || isTranscribing;

  // Generate tooltip text based on selection state
  const tooltipText = useMemo(() => {
    if (isTranscribing) {
      return 'Transcription in progress...';
    }
    if (selectedTrackIds.length === 0) {
      return 'Select video or audio tracks to generate subtitles';
    }
    if (targetTracks.length === 0) {
      return 'Selected tracks cannot generate subtitles (muted or wrong type)';
    }
    return `Generate Karaoke Subtitles for ${targetTracks.length} selected track${targetTracks.length > 1 ? 's' : ''}`;
  }, [isTranscribing, targetTracks.length, selectedTrackIds.length]);

  // Generate confirmation dialog message
  const confirmationMessage = useMemo(() => {
    if (karaokeConfirmation.trackNames.length === 0) return '';

    if (karaokeConfirmation.trackNames.length === 1) {
      return karaokeConfirmation.trackNames[0];
    }

    return `${karaokeConfirmation.trackNames.length} tracks`;
  }, [karaokeConfirmation.trackNames]);

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="native"
            onClick={handleGenerateKaraoke}
            disabled={isDisabled}
            className={isTranscribing ? 'opacity-50 cursor-not-allowed' : ''}
          >
            <KaraokeIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>

      <KaraokeConfirmationDialog
        open={karaokeConfirmation.show}
        onOpenChange={(open) => {
          if (!open) {
            setKaraokeConfirmation({
              show: false,
              trackIds: [],
              trackNames: [],
              existingSubtitleCount: 0,
            });
          }
        }}
        mediaName={confirmationMessage}
        existingSubtitleCount={karaokeConfirmation.existingSubtitleCount}
        onConfirm={(deleteExisting) => {
          if (karaokeConfirmation.trackIds.length > 0) {
            handleConfirmKaraokeGeneration(
              karaokeConfirmation.trackIds,
              deleteExisting,
            );
          }
        }}
      />

      {/* Runtime download modal for transcription feature */}
      <RuntimeDownloadModal
        isOpen={showRuntimeModal}
        onClose={() => {
          setShowRuntimeModal(false);
          setPendingKaraokeAction(null);
        }}
        onSuccess={handleRuntimeDownloadSuccess}
        featureName="Karaoke Subtitle Generation"
      />
    </>
  );
});

// Mode Selector component for switching between Selection and Slice tools
const ModeSelector: React.FC = React.memo(() => {
  const isSplitModeActive = useVideoEditorStore(
    (state) => state.timeline.isSplitModeActive,
  );
  const setSplitMode = useVideoEditorStore((state) => state.setSplitMode);

  const currentMode = isSplitModeActive ? 'slice' : 'selection';

  const handleSelectionMode = useCallback(() => {
    setSplitMode(false);
  }, [setSplitMode]);

  const handleSliceMode = useCallback(() => {
    setSplitMode(true);
  }, [setSplitMode]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="native">
          {currentMode === 'selection' ? (
            <>
              <MousePointer2 className="size-4" />
            </>
          ) : (
            <>
              <Slice className="size-4" />
            </>
          )}
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem
          onClick={handleSelectionMode}
          className="flex items-center gap-2 cursor-pointer"
        >
          <MousePointer2 className="size-4" />
          <span>Selection Tool</span>
          <DropdownMenuShortcut>
            <Kbd>V</Kbd>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleSliceMode}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Slice className="size-4" />
          <span>Slice Tool</span>
          <DropdownMenuShortcut>
            <Kbd>B</Kbd>
            <span className="text-muted-foreground mx-1">/</span>
            <Kbd>C</Kbd>
          </DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

// Optimized zoom slider component to prevent timeline lag
const ZoomSlider: React.FC = React.memo(() => {
  // Get current zoom level and tracks from store
  const storeZoom = useVideoEditorStore((state) => state.timeline.zoom);
  const tracks = useVideoEditorStore((state) => state.tracks);
  const totalFrames = useVideoEditorStore(
    (state) => state.timeline.totalFrames,
  );
  const setZoom = useVideoEditorStore((state) => state.setZoom);

  // Local state for smooth slider interaction
  const [localZoom, setLocalZoom] = useState(storeZoom);
  const isUserInteracting = useRef(false);

  // Calculate dynamic zoom range based on timeline content
  const zoomRange = useMemo(() => {
    // Calculate effective timeline duration
    const effectiveEndFrame =
      tracks.length > 0
        ? Math.max(...tracks.map((track) => track.endFrame))
        : totalFrames;

    // Calculate minimum zoom needed to fit entire timeline in viewport
    const viewportWidth = window.innerWidth - 400; // Account for sidebars
    const minFrameWidth = (viewportWidth * 0.9) / effectiveEndFrame;
    const calculatedMinZoom = minFrameWidth / 2; // frameWidth = 2 * zoom

    // Set dynamic minimum (never below 0.01, but allow going lower for long timelines)
    const minZoom = Math.max(0.01, Math.min(calculatedMinZoom * 0.5, 0.2));

    return {
      min: minZoom,
      max: 10,
    };
  }, [tracks, totalFrames]);

  // Sync local zoom with store zoom when not user-controlled
  useEffect(() => {
    if (!isUserInteracting.current) {
      setLocalZoom(storeZoom);
    }
  }, [storeZoom]);

  // Throttled zoom update to store (key optimization)
  const throttledSetZoom = useThrottledCallback((value: number) => {
    setZoom(value);
  }, 16); // ~60fps throttle for smooth performance

  // Handle zoom change with local state + throttled store update
  const handleZoomChange = useCallback(
    (value: number) => {
      isUserInteracting.current = true;
      setLocalZoom(value);
      throttledSetZoom(value);

      // Reset interaction flag after a delay
      setTimeout(() => {
        isUserInteracting.current = false;
      }, 100);
    },
    [throttledSetZoom],
  );

  return (
    <div className="flex items-center gap-2 w-48">
      <ZoomOut className="scale-x-[-1] text-muted-foreground" size={16} />
      <Slider
        value={[localZoom]}
        onValueChange={(values) => handleZoomChange(values[0])}
        min={zoomRange.min}
        max={zoomRange.max}
        step={0.01}
        className="flex-1"
      />
      <ZoomIn className="scale-x-[-1] text-muted-foreground" size={16} />
    </div>
  );
});

// Separate component for fullscreen button
const FullscreenButton: React.FC = React.memo(() => {
  const isFullscreen = useVideoEditorStore(
    (state) => state.preview.isFullscreen,
  );
  const toggleFullscreen = useVideoEditorStore(
    (state) => state.toggleFullscreen,
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="native" size="icon" onClick={toggleFullscreen}>
          {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isFullscreen ? 'Exit Fullscreen (Esc)' : 'Enter Fullscreen (F)'}
      </TooltipContent>
    </Tooltip>
  );
});

export const TimelineControls: React.FC = React.memo(
  () => {
    // Remove reactive zoom subscription to prevent unnecessary re-renders
    const snapEnabled = useVideoEditorStore(
      (state) => state.timeline.snapEnabled,
    );
    const toggleSnap = useVideoEditorStore((state) => state.toggleSnap);

    // Get current frame non-reactively
    const getCurrentFrame = useCallback(() => {
      return useVideoEditorStore.getState().timeline.currentFrame;
    }, []);

    // Get other values non-reactively when needed
    const getEffectiveEndFrame = useCallback(() => {
      const { tracks, timeline } = useVideoEditorStore.getState();
      return tracks.length > 0
        ? Math.max(
            ...tracks.map((track) => track.endFrame),
            timeline.totalFrames,
          )
        : timeline.totalFrames;
    }, []);

    // Direct play toggle - no gap skipping, respect timeline gaps like Premiere Pro
    const handlePlayToggle = useCallback(() => {
      const { togglePlayback } = useVideoEditorStore.getState();
      togglePlayback();
    }, []);

    return (
      <div className="h-10 grid grid-cols-[364px_1fr] px-4 border-t border-accent">
        {/* Playback Controls */}
        <div className="flex items-center gap-4">
          <ModeSelector />
          <Separator orientation="vertical" className="!h-6" />
          <div className="flex items-center gap-6">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="native"
                  onClick={() =>
                    useVideoEditorStore.getState().splitAtPlayhead()
                  }
                >
                  <SplitSquareHorizontal />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Split at Playhead Ctrl+K</TooltipContent>
            </Tooltip>
            <DuplicateButton />
            <DeleteButton />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="native"
                  onClick={toggleSnap}
                  className={snapEnabled ? 'text-green-500' : ''}
                >
                  <Magnet className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {snapEnabled ? 'Snap Enabled' : 'Snap Disabled'} (S)
              </TooltipContent>
            </Tooltip>
            <LinkUnlinkButton />
            <GenerateKaraokeButton />
          </div>
        </div>

        <div className="flex items-center flex-1 justify-center relative">
          {/* Additional Controls */}
          <div className="flex justify-start gap-2 w-full"></div>

          {/* Time Display */}
          <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() =>
                    useVideoEditorStore
                      .getState()
                      .setCurrentFrame(Math.max(0, getCurrentFrame() - 1))
                  }
                  variant="native"
                  size="icon"
                >
                  <SkipBack />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Previous Frame (←)</TooltipContent>
            </Tooltip>

            <PlayPauseButton onPlayToggle={handlePlayToggle} />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() =>
                    useVideoEditorStore
                      .getState()
                      .setCurrentFrame(
                        Math.min(
                          getEffectiveEndFrame() - 1,
                          getCurrentFrame() + 1,
                        ),
                      )
                  }
                  variant="native"
                  size="icon"
                >
                  <SkipForward />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Next Frame (→)</TooltipContent>
            </Tooltip>
            <TimeDisplay />
          </div>

          <div className="flex justify-end items-center gap-4 w-full">
            <ZoomSlider />
            <FullscreenButton />
          </div>
        </div>
      </div>
    );
  },
  () => {
    // TimelineControls should almost never re-render since we removed zoom subscription
    // and moved zoom slider to its own optimized component
    return true;
  },
);

ModeSelector.displayName = 'ModeSelector';
ZoomSlider.displayName = 'ZoomSlider';
FullscreenButton.displayName = 'FullscreenButton';
