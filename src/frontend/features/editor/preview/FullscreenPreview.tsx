import { Button } from '@/frontend/components/ui/button';
import { Slider } from '@/frontend/components/ui/slider';
import { Minimize, Pause, Play } from 'lucide-react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useVideoEditorStore } from '../stores/videoEditor/index';
import { VideoBlobPreview } from './VideoBlobPreview';

export const FullscreenPreview: React.FC = () => {
  const {
    playback,
    timeline,
    tracks,
    preview,
    setCurrentFrame,
    togglePlayback,
    setFullscreen,
  } = useVideoEditorStore();

  // Track seek state for pause/resume behavior
  const seekTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const wasPlayingBeforeSeekRef = React.useRef(false);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
      // Clean up seek timeout on unmount
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, [setFullscreen]);

  // Format time helper
  const formatTime = useCallback(
    (frame: number) => {
      const totalSeconds = frame / timeline.fps;
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    },
    [timeline.fps],
  );

  // Calculate effective end frame
  const effectiveEndFrame = useMemo(() => {
    return tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame))
      : timeline.totalFrames;
  }, [tracks, timeline.totalFrames]);

  // Handle seek start (when user starts dragging)
  const handleSeekStart = useCallback(() => {
    // Remember if we were playing before seek
    wasPlayingBeforeSeekRef.current = playback.isPlaying;

    // Pause playback during seek for smooth scrubbing
    if (playback.isPlaying) {
      togglePlayback();
    }
  }, [playback.isPlaying, togglePlayback]);

  // Handle scrub/seek
  const handleSeek = useCallback(
    (value: number[]) => {
      const newFrame = Math.floor(value[0]);
      setCurrentFrame(newFrame);
    },
    [setCurrentFrame],
  );

  // Handle seek end (when user releases)
  const handleSeekEnd = useCallback(() => {
    // Clear any existing timeout
    if (seekTimeoutRef.current) {
      clearTimeout(seekTimeoutRef.current);
    }

    // Resume playback if it was playing before seek
    seekTimeoutRef.current = setTimeout(() => {
      if (wasPlayingBeforeSeekRef.current) {
        togglePlayback();
      }
    }, 100);
  }, [togglePlayback]);

  // Exit fullscreen handler
  const handleExitFullscreen = useCallback(() => {
    setFullscreen(false);
  }, [setFullscreen]);

  // Toggle play/pause
  const handlePlayToggle = useCallback(() => {
    togglePlayback();
  }, [togglePlayback]);

  if (!preview.isFullscreen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col animate-in fade-in duration-300 bg-black">
      {/* Video Preview - Takes up most of the screen */}
      <div className="flex-1 relative overflow-hidden flex items-center justify-center">
        <VideoBlobPreview className="w-full h-full rounded-none" />
      </div>

      {/* Compact Control Bar at Bottom */}
      <div>
        {/* Timeline Scrubber */}
        <div className="bg-black relative z-[999]">
          <Slider
            value={[timeline.currentFrame]}
            min={0}
            max={Math.max(effectiveEndFrame, 1)}
            step={1}
            onValueChange={handleSeek}
            onPointerDown={handleSeekStart}
            onPointerUp={handleSeekEnd}
            className="cursor-pointer"
          />
        </div>

        {/* Playback Controls */}
        <div className="flex items-center bg-black justify-between gap-4">
          {/* Left: Play/Pause + Time Display */}
          <div className="flex items-center gap-4">
            <Button
              onClick={handlePlayToggle}
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-white hover:bg-zinc-800/70 rounded-full transition-all"
              title={playback.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {playback.isPlaying ? (
                <Pause className="h-5 w-5 fill-white" />
              ) : (
                <Play className="h-5 w-5 fill-white" />
              )}
            </Button>

            <div className="font-semibold text-white text-xs tabular-nums">
              {formatTime(timeline.currentFrame)} /{' '}
              {formatTime(effectiveEndFrame)}
            </div>
          </div>

          {/* Right: Exit Fullscreen */}
          <Button
            onClick={handleExitFullscreen}
            variant="ghost"
            size="icon"
            className="h-10 w-10 text-white hover:bg-zinc-800/70 rounded-full transition-all"
            title="Exit Fullscreen (Esc or F)"
          >
            <Minimize className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};
