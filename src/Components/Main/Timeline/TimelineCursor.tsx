import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useTimelineWidth } from './TimelineProvider';
import { getFrameFromX, getXFromFrame } from './TimelineUtils';

interface TimelineCursorProps {
  currentFrame: number;
  totalFrames: number;
  onFrameChange?: (frame: number) => void;
}

export interface TimelineCursorRef {
  updatePosition: (frame: number) => void;
}

export const TimelineCursor = forwardRef<TimelineCursorRef, TimelineCursorProps>(
  ({ currentFrame, totalFrames, onFrameChange }, ref) => {
    const { width, scrollAreaRef, pixelsPerFrame } = useTimelineWidth();
    const cursorRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);

    const cursorPosition = useMemo(() => {
      if (!width) return 0;
      return getXFromFrame({ frame: currentFrame, totalFrames, width });
    }, [currentFrame, totalFrames, width]);

    // Imperative update method for performance
    useImperativeHandle(ref, () => ({
      updatePosition: (frame: number) => {
        if (!cursorRef.current || !width) return;
        const x = getXFromFrame({ frame, totalFrames, width });
        cursorRef.current.style.transform = `translateX(${x}px)`;
      },
    }), [width, totalFrames]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    }, []);

    const handlePointerMove = useCallback((e: PointerEvent) => {
      if (!isDragging || !width || !scrollAreaRef.current || !onFrameChange) return;

      const rect = scrollAreaRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left + scrollAreaRef.current.scrollLeft;
      
      const frame = getFrameFromX({
        clientX,
        totalFrames,
        width,
        pixelsPerFrame,
        extrapolate: 'clamp',
      });

      onFrameChange(frame);
    }, [isDragging, width, scrollAreaRef, totalFrames, pixelsPerFrame, onFrameChange]);

    const handlePointerUp = useCallback(() => {
      setIsDragging(false);
    }, []);

    // Global event listeners for cursor dragging
    useEffect(() => {
      if (!isDragging) return;

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };
    }, [isDragging, handlePointerMove, handlePointerUp]);

    // Handle scroll synchronization
    useEffect(() => {
      const scrollElement = scrollAreaRef.current;
      if (!scrollElement || !cursorRef.current) return;

      const handleScroll = () => {
        if (cursorRef.current) {
          cursorRef.current.style.top = scrollElement.scrollTop + 'px';
        }
      };

      scrollElement.addEventListener('scroll', handleScroll);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }, [scrollAreaRef]);

    if (!width) return null;

    return (
      <div
        ref={cursorRef}
        className="absolute top-0 bottom-0 pointer-events-none z-20"
        style={{
          transform: `translateX(${cursorPosition}px)`,
          width: '2px',
        }}
      >
        {/* Cursor line */}
        <div className="w-full h-full bg-red-500 shadow-lg" />
        
        {/* Cursor handle - now draggable */}
        <div 
          className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full border-2 border-white shadow-lg pointer-events-auto cursor-grab"
          onPointerDown={handlePointerDown}
          style={{
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
        />
      </div>
    );
  }
); 