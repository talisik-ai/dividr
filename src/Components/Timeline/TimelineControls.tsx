import React from 'react';
import { useVideoEditorStore } from '../../store/videoEditorStore';

export const TimelineControls: React.FC = () => {
  const {
    playback,
    timeline,
    setCurrentFrame,
    togglePlayback,
    play,
    pause,
    stop,
    setPlaybackRate,
    toggleLoop,
    toggleMute,
    setVolume,
  } = useVideoEditorStore();

  const formatTime = (frame: number) => {
    const totalSeconds = frame / timeline.fps;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const frames = Math.floor((totalSeconds % 1) * timeline.fps);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  return (
    <div style={{
      height: '60px',
      backgroundColor: '#2d2d2d',
      borderTop: '1px solid #3d3d3d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
    }}>
      {/* Playback Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => setCurrentFrame(0)}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '4px',
          }}
          title="Go to start"
        >
          ⏮
        </button>
        
        <button
          onClick={() => setCurrentFrame(Math.max(0, timeline.currentFrame - 1))}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '4px',
          }}
          title="Previous frame"
        >
          ⏪
        </button>
        
        <button
          onClick={togglePlayback}
          style={{
            backgroundColor: '#FF5722',
            border: 'none',
            color: '#fff',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '12px 16px',
            borderRadius: '50%',
            width: '48px',
            height: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title={playback.isPlaying ? 'Pause' : 'Play'}
        >
          {playback.isPlaying ? '⏸' : '▶'}
        </button>
        
        <button
          onClick={() => setCurrentFrame(Math.min(timeline.totalFrames - 1, timeline.currentFrame + 1))}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '4px',
          }}
          title="Next frame"
        >
          ⏩
        </button>
        
        <button
          onClick={() => setCurrentFrame(timeline.totalFrames - 1)}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '4px',
          }}
          title="Go to end"
        >
          ⏭
        </button>
        
        <button
          onClick={stop}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#fff',
            fontSize: '16px',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '4px',
          }}
          title="Stop"
        >
          ⏹
        </button>
      </div>

      {/* Time Display */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{
          backgroundColor: '#1a1a1a',
          color: '#fff',
          padding: '4px 8px',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '14px',
          minWidth: '100px',
          textAlign: 'center',
        }}>
          {formatTime(timeline.currentFrame)}
        </div>
        
        <div style={{ color: '#888', fontSize: '12px' }}>
          / {formatTime(timeline.totalFrames)}
        </div>
      </div>

      {/* Additional Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Loop Toggle */}
        <button
          onClick={toggleLoop}
          style={{
            backgroundColor: playback.isLooping ? '#4CAF50' : 'transparent',
            border: '1px solid #555',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '4px',
          }}
          title="Toggle loop"
        >
          🔁
        </button>
        
        {/* Playback Rate */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <label style={{ fontSize: '11px', color: '#aaa' }}>Speed:</label>
          <select
            value={playback.playbackRate}
            onChange={(e) => setPlaybackRate(Number(e.target.value))}
            style={{
              backgroundColor: '#1a1a1a',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '3px',
              padding: '2px 4px',
              fontSize: '11px',
            }}
          >
            <option value={0.25}>0.25x</option>
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>
        
        {/* Volume Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={toggleMute}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              color: playback.muted ? '#f44336' : '#fff',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '4px',
            }}
            title="Toggle mute"
          >
            {playback.muted ? '🔇' : '🔊'}
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
      </div>
    </div>
  );
}; 