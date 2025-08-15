import React from 'react';
import { FaBackward, FaForward, FaPause, FaPlay } from 'react-icons/fa';
import {
  LuCopy,
  LuRedo2,
  LuSquareSplitHorizontal,
  LuTrash,
  LuUndo2,
} from 'react-icons/lu';
import { TbScissors } from 'react-icons/tb';

import { useVideoEditorStore } from '../../../Store/videoEditorStore';

export const TimelineControls: React.FC = () => {
  const {
    playback,
    timeline,
    setCurrentFrame,
    togglePlayback,
    stop,
    setPlaybackRate,
  } = useVideoEditorStore();

  const formatTime = (frame: number) => {
    const totalSeconds = frame / timeline.fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor((totalSeconds % 1) * timeline.fps);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-10 bg-secondary flex items-center justify-between px-4 border-t-8 border-black">
      {/* Playback Controls */}
      <div className="flex items-center gap-2">
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Stop"
        >
          <LuUndo2 />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Stop"
        >
          <LuRedo2 />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Stop"
        >
          <LuSquareSplitHorizontal />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Stop"
        >
          <TbScissors />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Stop"
        >
          <LuCopy />
        </button>
        <button
          onClick={stop}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Stop"
        >
          <LuTrash />
        </button>
      </div>

      {/* Time Display */}

      <div className="flex items-center justify-center">
        {/* 
        <button
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Go to start"
        >
          <FaFastBackward />
        </button>
        */}
        <button
          onClick={() =>
            setCurrentFrame(Math.max(0, timeline.currentFrame - 1))
          }
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Previous frame"
        >
          <FaBackward />
        </button>

        <button
          onClick={togglePlayback}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title={playback.isPlaying ? 'Pause' : 'Play'}
        >
          {playback.isPlaying ? <FaPause /> : <FaPlay />}
        </button>

        <button
          onClick={() =>
            setCurrentFrame(
              Math.min(timeline.totalFrames - 1, timeline.currentFrame + 1),
            )
          }
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Next frame"
        >
          <FaForward />
        </button>
        {/* 
        <button
          onClick={() => setCurrentFrame(timeline.totalFrames - 1)}
          className="border-none text-toolbarIcon text-sm cursor-pointer p-2 text-center rounded-full h-8 w-8 flex items-center justify-center bg-transparent hover:bg-gray-700"
          title="Go to end"
        >
          <FaFastForward />
        </button>
        */}
        <div className="text-xs p-2 text-gray-400">
          {formatTime(timeline.currentFrame)} /{' '}
          {formatTime(timeline.totalFrames)}
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
            className="bg-black bg-secondary font-toolbarIcon text-xs"
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
