import React, { useCallback, useRef, useState } from "react";
import { TimeIndicators } from "./TimeIndicators";
import { TimelineCursor, type TimelineCursorRef } from "./TimelineCursor";
import { TimelineProvider, useTimelineWidth } from "./TimelineProvider";
import { TimelineTracks } from "./TimelineTracks";

export interface ClipData {
  id: string;
  startFrame: number;
  endFrame: number;
  track: string;
}

interface TimelineProps {
  clips: ClipData[];
  totalFrames: number;
  fps: number;
  onCurrentFrameChange?: (frame: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ 
  clips: initialClips, 
  totalFrames, 
  fps,
  onCurrentFrameChange 
}) => {
  const [clips, setClips] = useState<ClipData[]>(initialClips);
  const [currentFrame, setCurrentFrame] = useState(0);
  const cursorRef = useRef<TimelineCursorRef>(null);

  const updateClip = useCallback((id: string, newStart: number, newEnd: number) => {
    setClips(prev =>
      prev.map(c =>
        c.id === id ? { ...c, startFrame: newStart, endFrame: newEnd } : c
      )
    );
  }, []);

  const handleFrameChange = useCallback((frame: number) => {
    setCurrentFrame(frame);
    onCurrentFrameChange?.(frame);
  }, [onCurrentFrameChange]);

  const handleSeek = useCallback((frame: number) => {
    setCurrentFrame(frame);
    onCurrentFrameChange?.(frame);
    // Ensure the frame is visible in the viewport
    // This will be handled by the timeline utils
  }, [onCurrentFrameChange]);

  const handleZoomIn = useCallback(() => {
    // Zoom will be handled by the TimelineProvider
    console.log('Zoom in');
  }, []);

  const handleZoomOut = useCallback(() => {
    // Zoom will be handled by the TimelineProvider  
    console.log('Zoom out');
  }, []);

  return (
    <TimelineProvider totalFrames={totalFrames} initialZoom={2}>
      <div className="bg-gray-900 text-white p-3 rounded-lg shadow-lg w-full select-none">
        {/* Header with time indicators */}
        <div className="mb-2">
          <TimeIndicators totalFrames={totalFrames} fps={fps} zoom={2} />
        </div>

        {/* Main timeline area */}
        <div className="relative border border-gray-700 rounded-lg bg-gray-800 overflow-hidden">
          {/* Timeline tracks container */}
          <TimelineScrollableArea>
            <TimelineTracks
              clips={clips}
              zoom={2}
              totalFrames={totalFrames}
              onUpdateClip={updateClip}
            />
            
            {/* Cursor overlay */}
            <TimelineCursor
              ref={cursorRef}
              currentFrame={currentFrame}
              totalFrames={totalFrames}
              onFrameChange={handleFrameChange}
            />
            
            {/* Remove the problematic drag handler for now */}
            {/* <TimelineDragHandler
              totalFrames={totalFrames}
              currentFrame={currentFrame}
              onFrameChange={handleFrameChange}
              onSeek={handleSeek}
              cursorRef={cursorRef}
            >
              <div className="h-40" />
            </TimelineDragHandler> */}
          </TimelineScrollableArea>
        </div>

        {/* Controls */}
        <div className="flex justify-between items-center mt-3">
          <div className="flex items-center space-x-3">
            <span className="text-sm text-gray-400">
              Frame: {currentFrame} / {totalFrames}
            </span>
            <span className="text-sm text-gray-400">
              Time: {(currentFrame / fps).toFixed(2)}s
            </span>
          </div>
          
          <div className="flex space-x-2">
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors text-sm"
              onClick={handleZoomOut}
            >
              Zoom Out
            </button>
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors text-sm"
              onClick={handleZoomIn}
            >
              Zoom In
            </button>
          </div>
        </div>
      </div>
    </TimelineProvider>
  );
};

// Scrollable area component that uses the timeline provider
const TimelineScrollableArea: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { scrollAreaRef } = useTimelineWidth();

  return (
    <div
      ref={scrollAreaRef}
      className="relative overflow-x-auto overflow-y-hidden"
      style={{
        height: '160px', // Fixed height for the timeline
      }}
    >
      <div className="relative min-w-full h-full">
        {children}
      </div>
    </div>
  );
};
