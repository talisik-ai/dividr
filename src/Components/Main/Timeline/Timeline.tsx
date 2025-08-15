import React, { useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../../../Store/videoEditorStore';
import { TimelineControls } from './TimelineControls';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineTracks } from './TimelineTracks';

interface TimelineProps {
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = ({ className }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLDivElement>(null);

  const {
    timeline,
    tracks,
    playback,
    setCurrentFrame,
    setScrollX,
    setZoom,
    togglePlayback,
    setInPoint,
    setOutPoint,
    setSelectedTracks,
  } = useVideoEditorStore();

  // Animation loop for playback
  useEffect(() => {
    if (!playback.isPlaying) return;

    const targetFPS = Math.min(15, timeline.fps); // Cap at 15fps for smoother performance
    const interval = setInterval(() => {
      const currentFrame = timeline.currentFrame;
      const nextFrame =
        currentFrame + Math.max(1, Math.round(timeline.fps / targetFPS)); // Skip frames for better performance
      if (nextFrame >= timeline.totalFrames) {
        setCurrentFrame(playback.isLooping ? 0 : timeline.totalFrames - 1);
      } else {
        setCurrentFrame(nextFrame);
      }
    }, 1000 / targetFPS);

    return () => clearInterval(interval);
  }, [
    playback.isPlaying,
    playback.isLooping,
    timeline.fps,
    timeline.totalFrames,
    timeline.currentFrame,
    setCurrentFrame,
  ]);

  // Keyboard shortcuts
  useHotkeys('space', (e) => {
    e.preventDefault();
    togglePlayback();
  });

  useHotkeys('home', () => setCurrentFrame(0));
  useHotkeys('end', () => setCurrentFrame(timeline.totalFrames - 1));
  useHotkeys('left', () =>
    setCurrentFrame(Math.max(0, timeline.currentFrame - 1)),
  );
  useHotkeys('right', () =>
    setCurrentFrame(
      Math.min(timeline.totalFrames - 1, timeline.currentFrame + 1),
    ),
  );
  useHotkeys('i', () => setInPoint(timeline.currentFrame));
  useHotkeys('o', () => setOutPoint(timeline.currentFrame));

  // Zoom controls
  useHotkeys('equal', () => setZoom(Math.min(timeline.zoom * 1.2, 10)));
  useHotkeys('minus', () => setZoom(Math.max(timeline.zoom / 1.2, 0.1)));
  useHotkeys('0', () => setZoom(1));

  // Handle wheel zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        setZoom(Math.max(0.1, Math.min(timeline.zoom * zoomFactor, 10)));
      } else {
        // Horizontal scroll
        setScrollX(Math.max(0, timeline.scrollX + e.deltaX));
      }
    },
    [timeline.zoom, timeline.scrollX, setZoom, setScrollX],
  );

  useEffect(() => {
    const timelineElement = timelineRef.current;
    if (timelineElement) {
      timelineElement.addEventListener('wheel', handleWheel, {
        passive: false,
      });
      return () => timelineElement.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Calculate frame width based on zoom
  const frameWidth = 2 * timeline.zoom; // Base width * zoom factor
  const timelineWidth = timeline.totalFrames * frameWidth;

  // Handle timeline click to set current frame
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!tracksRef.current) return;

      const rect = tracksRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + timeline.scrollX;
      const frame = Math.floor(x / frameWidth);
      const clampedFrame = Math.max(
        0,
        Math.min(frame, timeline.totalFrames - 1),
      );
      setCurrentFrame(clampedFrame);
    },
    [frameWidth, timeline.scrollX, timeline.totalFrames, setCurrentFrame],
  );

  return (
    <div
      ref={timelineRef}
      className={`timeline-container ${className || ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
        overflow: 'hidden',
      }}
    >
      {/* Timeline Header with Controls */}
      {/* TimelineHeader component removed as per edit hint */}

      {/* Timeline Controls */}
      <TimelineControls />
      {/* Timeline Content Area */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Timeline Tracks Area */}
        <div
          ref={tracksRef}
          style={{
            flex: 1,
            position: 'relative',
            overflow: 'auto',
          }}
          onClick={handleTimelineClick}
        >
          <TimelineTracks
            tracks={tracks}
            frameWidth={frameWidth}
            timelineWidth={timelineWidth}
            scrollX={timeline.scrollX}
            currentFrame={timeline.currentFrame}
            selectedTrackIds={timeline.selectedTrackIds}
            onTrackSelect={setSelectedTracks}
          />

          {/* Playhead */}
          <TimelinePlayhead
            currentFrame={timeline.currentFrame}
            frameWidth={frameWidth}
            scrollX={timeline.scrollX}
            visible={timeline.playheadVisible}
          />
        </div>
      </div>
    </div>
  );
};
