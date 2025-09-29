/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from '@/Components/sub/ui/Button';
import ElasticSlider from '@/Components/sub/ui/Elastic-Slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/Components/sub/ui/Select';
import {
  CopyPlus,
  Link,
  Magnet,
  Maximize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
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
// eslint-disable-next-line import/no-unresolved
import { useVideoEditorStore } from '../../../Store/VideoEditorStore';

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
    return tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame), totalFrames)
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
    <Button
      onClick={onPlayToggle}
      title={isPlaying ? 'Pause' : 'Play'}
      variant="native"
      size="icon"
    >
      {isPlaying ? (
        <Pause className="fill-zinc-900 dark:fill-zinc-100" />
      ) : (
        <Play className="fill-zinc-900 dark:fill-zinc-100" />
      )}
    </Button>
  );
});

// Separate component for playback rate selector
const PlaybackRateSelector: React.FC = React.memo(() => {
  const playbackRate = useVideoEditorStore(
    (state) => state.playback.playbackRate,
  );
  const setPlaybackRate = useVideoEditorStore((state) => state.setPlaybackRate);

  return (
    <div className="flex items-center justify-center gap-2">
      <label className="text-xs">Speed:</label>
      <Select
        value={playbackRate.toString()}
        onValueChange={(value) => setPlaybackRate(Number(value))}
      >
        <SelectTrigger variant="underline" className="text-xs w-[50px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="0.25">0.25x</SelectItem>
          <SelectItem value="0.5">0.5x</SelectItem>
          <SelectItem value="1">1x</SelectItem>
          <SelectItem value="1.5">1.5x</SelectItem>
          <SelectItem value="2">2x</SelectItem>
          <SelectItem value="4">4x</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
});

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

  return (
    <Button
      variant="native"
      onClick={handleDelete}
      title={`Delete ${selectedTrackIds.length > 0 ? `${selectedTrackIds.length} selected track${selectedTrackIds.length > 1 ? 's' : ''}` : 'selected tracks'}`}
      disabled={selectedTrackIds.length === 0}
    >
      <Trash />
    </Button>
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

  return (
    <Button
      variant="native"
      onClick={handleToggleLinkState}
      title={
        isUnlinkMode
          ? 'Unlink selected tracks'
          : 'Link selected video and audio tracks'
      }
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
  );
});

// Optimized zoom slider component to prevent timeline lag
const ZoomSlider: React.FC = React.memo(() => {
  // Get current zoom level from store
  const storeZoom = useVideoEditorStore((state) => state.timeline.zoom);
  const setZoom = useVideoEditorStore((state) => state.setZoom);

  // Local state for smooth slider interaction
  const [localZoom, setLocalZoom] = useState(storeZoom);
  const isUserInteracting = useRef(false);

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
    <ElasticSlider
      leftIcon={<ZoomOut className="translate scale-x-[-1]" size={16} />}
      rightIcon={<ZoomIn className="translate scale-x-[-1]" size={16} />}
      startingValue={0.2}
      defaultValue={localZoom}
      maxValue={10}
      showLabel={false}
      thickness={4}
      isStepped={true}
      stepSize={0.1}
      onChange={handleZoomChange}
    />
  );
});

export const TimelineControls: React.FC = React.memo(
  () => {
    // Remove reactive zoom subscription to prevent unnecessary re-renders
    const setZoom = useVideoEditorStore((state) => state.setZoom);
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
        <div className="flex items-center gap-6">
          <Button
            variant="native"
            onClick={() => useVideoEditorStore.getState().splitAtPlayhead()}
            title="Split"
          >
            <SplitSquareHorizontal />
          </Button>
          <Button
            variant="native"
            onClick={() => useVideoEditorStore.getState().stop()}
            title="Duplicate"
          >
            <CopyPlus />
          </Button>
          <Button
            variant="native"
            onClick={toggleSnap}
            title={`Snap ${snapEnabled ? 'On' : 'Off'} (S)`}
            className={snapEnabled ? 'text-green-500' : ''}
          >
            <Magnet className="w-4 h-4" />
          </Button>
          <LinkUnlinkButton />
          <DeleteButton />
        </div>

        <div className="flex items-center flex-1 justify-center relative">
          {/* Additional Controls */}
          <div className="flex justify-start gap-2 w-full">
            {/* Loop Toggle 
        <button
          onClick={toggleLoop}
          
          title="Toggle loop"
        >
          🔁
        </button>
        */}
            {/* Playback Rate */}
            <PlaybackRateSelector />

            {/* Volume Control 
        <div 
        className='flex items-center justify-center gap-2 border-none focus-none'>
          <button
            onClick={toggleMute}
            className='text-sm cursor-pointer'
            title="Toggle mute"
          >
            {playback.muted ? <FaVolumeMute /> : <FaVolumeDown />}
          </button>
          
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={playback.volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{ width: '60px' }}
            disabled={playback.muted}
          />
          
          <span style={{ fontSize: '10px', color: '#888', minWidth: '25px' }}>
            {Math.round(playback.volume * 100)}%
          </span>
        </div>
        */}
          </div>

          {/* Time Display */}
          <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
            {/* 
        <button
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Go to start"
        >
          <FaFastBackward />
        </button>
        */}
            <Button
              onClick={() =>
                useVideoEditorStore
                  .getState()
                  .setCurrentFrame(Math.max(0, getCurrentFrame() - 1))
              }
              title="Previous frame"
              variant="native"
              size="icon"
            >
              <SkipBack />
            </Button>

            <PlayPauseButton onPlayToggle={handlePlayToggle} />

            <Button
              onClick={() =>
                useVideoEditorStore
                  .getState()
                  .setCurrentFrame(
                    Math.min(getEffectiveEndFrame() - 1, getCurrentFrame() + 1),
                  )
              }
              title="Next frame"
              variant="native"
              size="icon"
            >
              <SkipForward />
            </Button>
            {/* 
        <button
          onClick={() => setCurrentFrame(timeline.totalFrames - 1)}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Go to end"
        >
          <FaFastForward />
        </button>
        */}
            <TimeDisplay />
          </div>

          <div className="flex justify-end items-center gap-4 w-full">
            <ZoomSlider />
            <Button
              variant="native"
              size="icon"
              onClick={() => {
                // Zoom to fit timeline content
                const { tracks, timeline } = useVideoEditorStore.getState();
                const effectiveEndFrame =
                  tracks.length > 0
                    ? Math.max(
                        ...tracks.map((track) => track.endFrame),
                        timeline.totalFrames,
                      )
                    : timeline.totalFrames;

                // Calculate zoom to fit content in viewport (with some padding)
                const viewportWidth = window.innerWidth - 400; // Account for sidebars
                const idealFrameWidth =
                  (viewportWidth * 0.8) / effectiveEndFrame;
                const idealZoom = idealFrameWidth / 2; // frameWidth = 2 * zoom
                const clampedZoom = Math.max(0.2, Math.min(idealZoom, 10));
                setZoom(clampedZoom);
              }}
              title="Zoom to fit"
            >
              <Maximize className="translate scale-x-[-1]" size={16} />
            </Button>
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

ZoomSlider.displayName = 'ZoomSlider';
