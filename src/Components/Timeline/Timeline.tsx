import React, { useCallback, useEffect, useRef } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../../store/videoEditorStore';
import { TimelineControls } from './TimelineControls';
import { TimelineHeader } from './TimelineHeader';
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

  // Keyboard shortcuts
  useHotkeys('space', (e) => {
    e.preventDefault();
    togglePlayback();
  });

  useHotkeys('home', () => setCurrentFrame(0));
  useHotkeys('end', () => setCurrentFrame(timeline.totalFrames - 1));
  useHotkeys('left', () => setCurrentFrame(Math.max(0, timeline.currentFrame - 1)));
  useHotkeys('right', () => setCurrentFrame(Math.min(timeline.totalFrames - 1, timeline.currentFrame + 1)));
  useHotkeys('i', () => setInPoint(timeline.currentFrame));
  useHotkeys('o', () => setOutPoint(timeline.currentFrame));

  // Zoom controls
  useHotkeys('equal', () => setZoom(Math.min(timeline.zoom * 1.2, 10)));
  useHotkeys('minus', () => setZoom(Math.max(timeline.zoom / 1.2, 0.1)));
  useHotkeys('0', () => setZoom(1));

  // Handle wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(Math.max(0.1, Math.min(timeline.zoom * zoomFactor, 10)));
    } else {
      // Horizontal scroll
      setScrollX(Math.max(0, timeline.scrollX + e.deltaX));
    }
  }, [timeline.zoom, timeline.scrollX, setZoom, setScrollX]);

  useEffect(() => {
    const timelineElement = timelineRef.current;
    if (timelineElement) {
      timelineElement.addEventListener('wheel', handleWheel, { passive: false });
      return () => timelineElement.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Calculate frame width based on zoom
  const frameWidth = 2 * timeline.zoom; // Base width * zoom factor
  const timelineWidth = timeline.totalFrames * frameWidth;

  // Handle timeline click to set current frame
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!tracksRef.current) return;
    
    const rect = tracksRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timeline.scrollX;
    const frame = Math.floor(x / frameWidth);
    const clampedFrame = Math.max(0, Math.min(frame, timeline.totalFrames - 1));
    setCurrentFrame(clampedFrame);
  }, [frameWidth, timeline.scrollX, timeline.totalFrames, setCurrentFrame]);

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
      <TimelineHeader />
      
      {/* Timeline Ruler */}
      <TimelineRuler 
        frameWidth={frameWidth}
        totalFrames={timeline.totalFrames}
        currentFrame={timeline.currentFrame}
        scrollX={timeline.scrollX}
        fps={timeline.fps}
        inPoint={timeline.inPoint}
        outPoint={timeline.outPoint}
        onClick={handleTimelineClick}
      />

      {/* Timeline Content Area */}
      <div 
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Track Names Sidebar */}
        <div 
          style={{
            width: '200px',
            backgroundColor: '#2d2d2d',
            borderRight: '1px solid #3d3d3d',
            overflow: 'auto',
          }}
        >
          <div style={{ height: '40px', borderBottom: '1px solid #3d3d3d' }} />
          {tracks.map((track) => (
            <div
              key={track.id}
              style={{
                height: '60px',
                padding: '8px',
                borderBottom: '1px solid #3d3d3d',
                backgroundColor: timeline.selectedTrackIds.includes(track.id) ? '#4a4a4a' : 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
              }}
              onClick={() => setSelectedTracks([track.id])}
            >
              <div style={{ 
                width: '12px', 
                height: '12px', 
                backgroundColor: track.color,
                borderRadius: '50%',
                marginRight: '8px'
              }} />
              <div>
                <div style={{ fontSize: '12px', fontWeight: 'bold' }}>{track.name}</div>
                <div style={{ fontSize: '10px', color: '#888' }}>{track.type}</div>
              </div>
            </div>
          ))}
        </div>

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

      {/* Timeline Controls */}
      <TimelineControls />
    </div>
  );
}; 