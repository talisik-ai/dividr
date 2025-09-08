import { useTimelineDuration } from '@/hooks/useTimelineDuration';
import React, { useCallback } from 'react';
import { FaBackward, FaForward, FaPause, FaPlay } from 'react-icons/fa';
import {
  LuCopy,
  LuRedo2,
  LuSquareSplitHorizontal,
  LuTrash,
  LuUndo2,
} from 'react-icons/lu';
import { TbScissors } from 'react-icons/tb';
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
    <div className="h-10 bg-primary dark:bg-primary-dark flex items-center justify-between px-4 border-t-8 border-secondary dark:border-secondary-dark">
      {/* Playback Controls */}
      <div className="flex items-center">
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Undo"
        >
          <LuUndo2 />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Revert"
        >
          <LuRedo2 />
        </button>
        <button
          onClick={splitAtPlayhead}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Split"
        >
          <LuSquareSplitHorizontal />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Clip"
        >
          <TbScissors />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Copy"
        >
          <LuCopy />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Remove"
        >
          <LuTrash />
        </button>
      </div>

      {/* Time Display */}

      <div className="flex items-center justify-center">
        {/* 
        <button
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Go to start"
        >
          <FaFastBackward />
        </button>
        */}
        <button
          onClick={() =>
            setCurrentFrame(Math.max(0, timeline.currentFrame - 1))
          }
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Previous frame"
        >
          <FaBackward />
        </button>

        <button
          onClick={handlePlayToggle}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title={playback.isPlaying ? 'Pause' : 'Play'}
        >
          {playback.isPlaying ? <FaPause /> : <FaPlay />}
        </button>

        <button
          onClick={() =>
            setCurrentFrame(
              Math.min(effectiveEndFrame - 1, timeline.currentFrame + 1),
            )
          }
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Next frame"
        >
          <FaForward />
        </button>
        {/* 
        <button
          onClick={() => setCurrentFrame(timeline.totalFrames - 1)}
          className="border-none text-toolbarIcon text-sm cursor-pointer  text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Go to end"
        >
          <FaFastForward />
        </button>
        */}
        <div className="text-xs p-2 text-gray-400">
          {formatTime(timeline.currentFrame)} / {duration.formattedTime}
        </div>
      </div>

      {/* Additional Controls */}
      <div className="flex items-center justify-center gap-2">
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
          <label className="font-toolbarIcon text-xs">Speed:</label>
          <select
            value={playback.playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            className="bg-primary font-toolbarIcon text-xs"
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
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
    </div>
  );
};
