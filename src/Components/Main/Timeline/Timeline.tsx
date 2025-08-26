import React, { useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../../../store/videoEditorStore';
import { TimelineControls } from './TimelineControls';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineRuler } from './TimelineRuler';
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
        // Horizontal scroll - let the native scroll handle this
        // The onScroll event will update the store
        e.stopPropagation();
      }
    },
    [timeline.zoom, setZoom],
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

  // Sync scrollX state with actual scroll position
  useEffect(() => {
    const tracksElement = tracksRef.current;
    if (
      tracksElement &&
      Math.abs(tracksElement.scrollLeft - timeline.scrollX) > 1
    ) {
      tracksElement.scrollLeft = timeline.scrollX;
    }
  }, [timeline.scrollX]);

  // Calculate frame width based on zoom
  const frameWidth = 2 * timeline.zoom; // Base width * zoom factor

  // Calculate effective timeline duration based on actual track content
  const effectiveEndFrame =
    tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame), timeline.totalFrames)
      : timeline.totalFrames;

  const timelineWidth = effectiveEndFrame * frameWidth;

  // Handle timeline click to set current frame
  const handleTimelineClick = useCallback(
    (e: React.MouseEvent) => {
      if (!tracksRef.current) return;

      const rect = tracksRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
      const frame = Math.floor(x / frameWidth);
      const clampedFrame = Math.max(
        0,
        Math.min(frame, timeline.totalFrames - 1),
      );
      setCurrentFrame(clampedFrame);
    },
    [frameWidth, timeline.totalFrames, setCurrentFrame],
  );

  return (
    <div
      ref={timelineRef}
      className={`timeline-container ${className || ''} flex flex-col h-full bg-gray-800 text-white overflow-hidden`}
    >
      {/* Timeline Header with Controls */}
      {/* TimelineHeader component removed as per edit hint */}

      {/* Timeline Controls */}
      <TimelineControls />

      {/* Timeline Content Area */}
      <div className="flex flex-col flex-1 relative overflow-hidden">
        {/* Timeline Ruler - Fixed at top but scrolls horizontally */}
        <div className="relative overflow-hidden z-10">
          <TimelineRuler
            frameWidth={frameWidth}
            totalFrames={timeline.totalFrames}
            scrollX={timeline.scrollX}
            fps={timeline.fps}
            tracks={tracks}
            inPoint={timeline.inPoint}
            outPoint={timeline.outPoint}
            onClick={handleTimelineClick}
          />
        </div>

        {/* Timeline Tracks Area */}
        <div
          ref={tracksRef}
          className="flex-1 relative overflow-auto"
          onClick={handleTimelineClick}
          onScroll={(e) => {
            // Synchronize horizontal scroll with the timeline store
            const scrollLeft = (e.target as HTMLElement).scrollLeft;
            setScrollX(scrollLeft);
          }}
        >
          <TimelineTracks
            tracks={tracks}
            frameWidth={frameWidth}
            timelineWidth={timelineWidth}
            scrollX={timeline.scrollX}
            selectedTrackIds={timeline.selectedTrackIds}
            onTrackSelect={setSelectedTracks}
          />
        </div>

        {/* Global Playhead - spans across ruler and tracks */}
        <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none z-1000">
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
