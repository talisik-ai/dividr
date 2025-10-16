/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import { Kbd, KbdGroup } from '@/frontend/components/ui/kbd';
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
import { useVideoEditorStore } from '../stores/videoEditor/index';

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
  const fps = useVideoEditorStore((state) => state.timeline.fps);
  const tracks = useVideoEditorStore((state) => state.tracks);
  const totalFrames = useVideoEditorStore(
    (state) => state.timeline.totalFrames,
  );

  const formatTime = useCallback(
    (frame: number) => {
      const totalSeconds = frame / fps;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      const frames = Math.floor((totalSeconds % 1) * fps);
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
    },
    [fps],
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
      <TooltipContent>
        {isPlaying ? 'Pause' : 'Play'} (<Kbd>Space</Kbd>)
      </TooltipContent>
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

  const handleDuplicate = useCallback(() => {
    if (selectedTrackIds.length === 0) return;

    console.log('[DuplicateButton] Duplicating selected tracks:', {
      selectedCount: selectedTrackIds.length,
      selectedIds: selectedTrackIds,
    });

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

      const result = duplicateTrack(trackId, bothSidesSelected);

      if (result) {
        if (Array.isArray(result)) {
          newlyCreatedIds.push(...result);
        } else {
          newlyCreatedIds.push(result);
        }
      }
    });

    if (newlyCreatedIds.length > 0) {
      setSelectedTracks(newlyCreatedIds);
    } else {
      console.error('❌ Duplication produced no new tracks');
    }
  }, [selectedTrackIds, tracks, duplicateTrack, setSelectedTracks]);

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
              <TooltipContent>
                Split at Playhead (
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>K</Kbd>
                </KbdGroup>
                )
              </TooltipContent>
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
                {snapEnabled ? 'Snap Enabled' : 'Snap Disabled'} (<Kbd>S</Kbd>)
              </TooltipContent>
            </Tooltip>
            <LinkUnlinkButton />
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
              <TooltipContent>
                Previous Frame (<Kbd>←</Kbd>)
              </TooltipContent>
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
              <TooltipContent>
                Next Frame (<Kbd>→</Kbd>)
              </TooltipContent>
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
