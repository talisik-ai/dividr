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
  Maximize,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SplitSquareHorizontal,
  Trash,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
// eslint-disable-next-line import/no-unresolved
import { useVideoEditorStore } from '../../../Store/VideoEditorStore';

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

export const TimelineControls: React.FC = React.memo(
  () => {
    // Get current zoom level reactively for the slider
    const currentZoom = useVideoEditorStore((state) => state.timeline.zoom);
    const setZoom = useVideoEditorStore((state) => state.setZoom);

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

    // Helper: Snap to next segment if in blank
    const snapToNextSegmentIfBlank = useCallback(() => {
      const currentFrame = getCurrentFrame();
      const { tracks } = useVideoEditorStore.getState();
      const isInBlank = !tracks.some(
        (track) =>
          track.type === 'video' &&
          track.visible &&
          track.previewUrl &&
          currentFrame >= track.startFrame &&
          currentFrame < track.endFrame,
      );
      if (isInBlank) {
        const nextSegment = tracks
          .filter(
            (track) =>
              track.type === 'video' &&
              track.visible &&
              track.previewUrl &&
              track.startFrame > currentFrame,
          )
          .sort((a, b) => a.startFrame - b.startFrame)[0];
        if (nextSegment) {
          useVideoEditorStore
            .getState()
            .setCurrentFrame(nextSegment.startFrame);
          return true;
        }
      }
      return false;
    }, [getCurrentFrame]);

    // Wrap the play toggle - all non-reactive
    const handlePlayToggle = useCallback(() => {
      const { playback, togglePlayback } = useVideoEditorStore.getState();
      if (!playback.isPlaying) {
        const snapped = snapToNextSegmentIfBlank();
        if (snapped) {
          setTimeout(() => {
            useVideoEditorStore.getState().togglePlayback();
          }, 0);
          return;
        }
      }
      togglePlayback();
    }, [snapToNextSegmentIfBlank]);

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
            onClick={() => useVideoEditorStore.getState().stop()}
            title="Duplicate"
          >
            <Trash />
          </Button>
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
            <ElasticSlider
              leftIcon={
                <ZoomOut className="translate scale-x-[-1]" size={16} />
              }
              rightIcon={
                <ZoomIn className="translate scale-x-[-1]" size={16} />
              }
              startingValue={0.2}
              defaultValue={currentZoom}
              maxValue={5}
              showLabel={false}
              thickness={4}
              isStepped={true}
              stepSize={0.1}
              onChange={(value) => setZoom(value)}
            />
            <Button 
              variant="native" 
              size="icon"
              onClick={() => {
                // Zoom to fit timeline content
                const { tracks, timeline } = useVideoEditorStore.getState();
                const effectiveEndFrame = tracks.length > 0
                  ? Math.max(...tracks.map(track => track.endFrame), timeline.totalFrames)
                  : timeline.totalFrames;
                
                // Calculate zoom to fit content in viewport (with some padding)
                const viewportWidth = window.innerWidth - 400; // Account for sidebars
                const idealFrameWidth = (viewportWidth * 0.8) / effectiveEndFrame;
                const idealZoom = idealFrameWidth / 2; // frameWidth = 2 * zoom
                const clampedZoom = Math.max(0.2, Math.min(idealZoom, 5));
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
    // Custom comparison - TimelineControls should re-render only when zoom changes
    // (currentZoom subscription is needed for the slider)
    return true;
  },
);
