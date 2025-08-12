import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineCursorRef } from './TimelineCursor';
import { useTimelineWidth } from './TimelineProvider';
import { canScrollInDirection, getFrameFromX, TIMELINE_PADDING } from './TimelineUtils';

interface TimelineDragHandlerProps {
  totalFrames: number;
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  onSeek?: (frame: number) => void;
  cursorRef?: React.RefObject<TimelineCursorRef>;
  children: React.ReactNode;
}

interface DragState {
  isDragging: boolean;
  wasPlaying?: boolean;
  startFrame?: number;
}

export const TimelineDragHandler: React.FC<TimelineDragHandlerProps> = ({
  totalFrames,
  currentFrame,
  onFrameChange,
  onSeek,
  cursorRef,
  children,
}) => {
  const { width, scrollAreaRef, pixelsPerFrame } = useTimelineWidth();
  const [dragState, setDragState] = useState<DragState>({ isDragging: false });
  const scrollInterval = useRef<NodeJS.Timeout | null>(null);

  const stopAutoScroll = useCallback(() => {
    if (scrollInterval.current) {
      clearInterval(scrollInterval.current);
      scrollInterval.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 || !width || !scrollAreaRef.current) return;

      // Only handle clicks on the timeline background, not on clips or other elements
      if (e.target !== e.currentTarget) return;

      e.preventDefault();
      e.stopPropagation();

      const rect = scrollAreaRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left + scrollAreaRef.current.scrollLeft;
      
      const frame = getFrameFromX({
        clientX,
        totalFrames,
        width,
        pixelsPerFrame,
        extrapolate: 'clamp',
      });

      setDragState({ isDragging: true, startFrame: frame });
      onFrameChange(frame);
      onSeek?.(frame);

      // Fast cursor update
      cursorRef?.current?.updatePosition(frame);
    },
    [width, scrollAreaRef, totalFrames, pixelsPerFrame, onFrameChange, onSeek, cursorRef]
  );

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragState.isDragging || !width || !scrollAreaRef.current) return;

      const rect = scrollAreaRef.current.getBoundingClientRect();
      const clientX = e.clientX - rect.left;
      
      // Check if we need to auto-scroll
      const isNearLeftEdge = clientX <= TIMELINE_PADDING;
      const isNearRightEdge = clientX >= rect.width - TIMELINE_PADDING;
      const { canScrollLeft, canScrollRight } = canScrollInDirection(scrollAreaRef);

      if (isNearLeftEdge && canScrollLeft) {
        if (!scrollInterval.current) {
          const scroll = () => {
            if (!scrollAreaRef.current) return;
            
            scrollAreaRef.current.scrollLeft -= 5;
            const adjustedClientX = clientX + scrollAreaRef.current.scrollLeft;
            
            const frame = getFrameFromX({
              clientX: adjustedClientX,
              totalFrames,
              width,
              pixelsPerFrame,
              extrapolate: 'clamp',
            });
            
            onFrameChange(frame);
            cursorRef?.current?.updatePosition(frame);
          };
          
          scroll();
          scrollInterval.current = setInterval(scroll, 16); // ~60fps
        }
        return;
      }

      if (isNearRightEdge && canScrollRight) {
        if (!scrollInterval.current) {
          const scroll = () => {
            if (!scrollAreaRef.current) return;
            
            scrollAreaRef.current.scrollLeft += 5;
            const adjustedClientX = clientX + scrollAreaRef.current.scrollLeft;
            
            const frame = getFrameFromX({
              clientX: adjustedClientX,
              totalFrames,
              width,
              pixelsPerFrame,
              extrapolate: 'clamp',
            });
            
            onFrameChange(frame);
            cursorRef?.current?.updatePosition(frame);
          };
          
          scroll();
          scrollInterval.current = setInterval(scroll, 16);
        }
        return;
      }

      // Stop auto-scroll if not near edges
      stopAutoScroll();

      // Normal dragging
      const adjustedClientX = clientX + scrollAreaRef.current.scrollLeft;
      const frame = getFrameFromX({
        clientX: adjustedClientX,
        totalFrames,
        width,
        pixelsPerFrame,
        extrapolate: 'clamp',
      });

      onFrameChange(frame);
      cursorRef?.current?.updatePosition(frame);
    },
    [
      dragState.isDragging,
      width,
      scrollAreaRef,
      totalFrames,
      pixelsPerFrame,
      onFrameChange,
      cursorRef,
      stopAutoScroll,
    ]
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (!dragState.isDragging) return;

      stopAutoScroll();
      setDragState({ isDragging: false });

      // Final seek to ensure state consistency
      if (width && scrollAreaRef.current) {
        const rect = scrollAreaRef.current.getBoundingClientRect();
        const clientX = e.clientX - rect.left + scrollAreaRef.current.scrollLeft;
        
        const frame = getFrameFromX({
          clientX,
          totalFrames,
          width,
          pixelsPerFrame,
          extrapolate: 'clamp',
        });

        onSeek?.(frame);
      }
    },
    [dragState.isDragging, stopAutoScroll, width, scrollAreaRef, totalFrames, pixelsPerFrame, onSeek]
  );

  // Global event listeners for dragging
  useEffect(() => {
    if (!dragState.isDragging) return;

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [dragState.isDragging, handlePointerMove, handlePointerUp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAutoScroll();
    };
  }, [stopAutoScroll]);

  return (
    <div
      className="absolute inset-0 z-10"
      style={{ 
        userSelect: 'none',
        WebkitUserSelect: 'none',
        cursor: dragState.isDragging ? 'grabbing' : 'grab',
      }}
      onPointerDown={handlePointerDown}
    >
      {children}
    </div>
  );
}; 