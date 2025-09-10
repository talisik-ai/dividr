import { Button } from '@/Components/sub/ui/Button';
import ElasticSlider from '@/Components/sub/ui/Elastic-Slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/Components/sub/ui/Select';
import { useTimelineDuration } from '@/Hooks/useTimelineDuration';
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
import React, { useCallback } from 'react';
// eslint-disable-next-line import/no-unresolved
import { useVideoEditorStore } from '../../../Store/VideoEditorStore';

export const TimelineControls: React.FC = () => {
  const {
    playback,
    timeline,
    tracks,
    setCurrentFrame,
    togglePlayback,
    stop,
    setPlaybackRate,
    splitAtPlayhead,
  } = useVideoEditorStore();
  const duration = useTimelineDuration();

  // Helper: Snap to next segment if in blank
  const snapToNextSegmentIfBlank = useCallback(() => {
    const isInBlank = !tracks.some(
      (track) =>
        track.type === 'video' &&
        track.visible &&
        track.previewUrl &&
        timeline.currentFrame >= track.startFrame &&
        timeline.currentFrame < track.endFrame,
    );
    if (isInBlank) {
      const nextSegment = tracks
        .filter(
          (track) =>
            track.type === 'video' &&
            track.visible &&
            track.previewUrl &&
            track.startFrame > timeline.currentFrame,
        )
        .sort((a, b) => a.startFrame - b.startFrame)[0];
      if (nextSegment) {
        setCurrentFrame(nextSegment.startFrame);
        return true;
      }
    }
    return false;
  }, [tracks, timeline.currentFrame, setCurrentFrame]);

  // Wrap the play toggle
  const handlePlayToggle = useCallback(() => {
    if (!playback.isPlaying) {
      const snapped = snapToNextSegmentIfBlank();
      if (snapped) {
        setTimeout(() => {
          togglePlayback();
        }, 0);
        return;
      }
    }
    togglePlayback();
  }, [playback.isPlaying, snapToNextSegmentIfBlank, togglePlayback]);

  // Calculate effective end frame considering all tracks
  const effectiveEndFrame =
    tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame), timeline.totalFrames)
      : timeline.totalFrames;

  const formatTime = (frame: number) => {
    const totalSeconds = frame / timeline.fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor((totalSeconds % 1) * timeline.fps);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-10 grid grid-cols-[364px_1fr] px-4 border-t border-accent">
      {/* Playback Controls */}
      <div className="flex items-center gap-6">
        <Button variant="native" onClick={splitAtPlayhead} title="Split">
          <SplitSquareHorizontal />
        </Button>
        <Button variant="native" onClick={stop} title="Duplicate">
          <CopyPlus />
        </Button>
        <Button variant="native" onClick={stop} title="Duplicate">
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
          <div className="flex items-center justify-center gap-2">
            <label className="text-xs">Speed:</label>
            <Select
              value={playback.playbackRate.toString()}
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
              setCurrentFrame(Math.max(0, timeline.currentFrame - 1))
            }
            title="Previous frame"
            variant="native"
            size="icon"
          >
            <SkipBack />
          </Button>

          <Button
            onClick={handlePlayToggle}
            title={playback.isPlaying ? 'Pause' : 'Play'}
            variant="native"
            size="icon"
          >
            {playback.isPlaying ? (
              <Pause className="fill-zinc-900 dark:fill-zinc-100" />
            ) : (
              <Play className="fill-zinc-900 dark:fill-zinc-100" />
            )}
          </Button>

          <Button
            onClick={() =>
              setCurrentFrame(
                Math.min(effectiveEndFrame - 1, timeline.currentFrame + 1),
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
          <div className="text-xs p-2 text-muted-foreground font-semibold min-w-[140px] text-center">
            {formatTime(timeline.currentFrame)} / {duration.formattedTime}
          </div>
        </div>

        <div className="flex justify-end items-center gap-4 w-full">
          <ElasticSlider
            leftIcon={<ZoomOut className="translate scale-x-[-1]" size={16} />}
            rightIcon={<ZoomIn className="translate scale-x-[-1]" size={16} />}
            startingValue={500}
            defaultValue={750}
            maxValue={1000}
            showLabel={false}
            thickness={4}
          />
          <Button variant="native" size="icon">
            <Maximize className="translate scale-x-[-1]" size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
};
