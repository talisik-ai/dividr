import React, { useCallback, useEffect, useState } from "react";
import { ClipData } from "./Timeline";
import { useTimelineWidth } from "./TimelineProvider";
import { getXFromFrame } from "./TimelineUtils";

interface DraggableClipProps {
  clip: ClipData;
  totalFrames: number;
  trackHeight: number;
  onUpdateClip: (id: string, newStart: number, newEnd: number) => void;
}

export const DraggableClip: React.FC<DraggableClipProps> = ({
  clip,
  totalFrames,
  trackHeight,
  onUpdateClip
}) => {
  const { width, pixelsPerFrame } = useTimelineWidth();
  const [dragState, setDragState] = useState<{
    type: 'none' | 'move' | 'resize-start' | 'resize-end';
    startX: number;
    originalStart: number;
    originalEnd: number;
  }>({
    type: 'none',
    startX: 0,
    originalStart: 0,
    originalEnd: 0
  });

  // Enhanced frame calculation using the provider width
  const clipPosition = React.useMemo(() => {
    if (!width) return { left: 0, width: 0 };
    
    const left = getXFromFrame({ 
      frame: clip.startFrame, 
      totalFrames, 
      width 
    });
    
    const right = getXFromFrame({ 
      frame: clip.endFrame, 
      totalFrames, 
      width 
    });
    
    return {
      left,
      width: Math.max(4, right - left), // Minimum width for usability
    };
  }, [clip.startFrame, clip.endFrame, totalFrames, width]);

  const handleMouseDown = useCallback((e: React.MouseEvent, type: 'move' | 'resize-start' | 'resize-end') => {
    e.preventDefault();
    e.stopPropagation();
    
    setDragState({
      type,
      startX: e.clientX,
      originalStart: clip.startFrame,
      originalEnd: clip.endFrame
    });
  }, [clip.startFrame, clip.endFrame]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (dragState.type === 'none' || !width) return;

    const deltaX = e.clientX - dragState.startX;
    const deltaFrames = Math.round(deltaX / pixelsPerFrame);

    let newStart = dragState.originalStart;
    let newEnd = dragState.originalEnd;

    switch (dragState.type) {
      case 'move':
        newStart = Math.max(0, Math.min(totalFrames - (dragState.originalEnd - dragState.originalStart), 
                                        dragState.originalStart + deltaFrames));
        newEnd = newStart + (dragState.originalEnd - dragState.originalStart);
        break;
        
      case 'resize-start':
        newStart = Math.max(0, Math.min(dragState.originalEnd - 1, 
                                       dragState.originalStart + deltaFrames));
        newEnd = dragState.originalEnd;
        break;
        
      case 'resize-end':
        newStart = dragState.originalStart;
        newEnd = Math.min(totalFrames, Math.max(dragState.originalStart + 1, 
                                               dragState.originalEnd + deltaFrames));
        break;
    }

    onUpdateClip(clip.id, newStart, newEnd);
  }, [dragState, width, pixelsPerFrame, totalFrames, clip.id, onUpdateClip]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    e.stopPropagation();
    setDragState({ type: 'none', startX: 0, originalStart: 0, originalEnd: 0 });
  }, []);

  // Global event listeners for smooth dragging
  useEffect(() => {
    if (dragState.type === 'none') return;

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState.type, handleMouseMove, handleMouseUp]);

  if (!width) return null;

  return (
    <div
      className="absolute bg-blue-500 text-white rounded overflow-hidden select-none"
      style={{
        left: clipPosition.left,
        top: clip.track === "1" ? 2 : trackHeight + 2,
        height: trackHeight - 4,
        width: clipPosition.width,
        opacity: dragState.type !== 'none' ? 0.8 : 1,
        zIndex: dragState.type !== 'none' ? 30 : 15, // Higher z-index to ensure clips are above background
      }}
    >
      {/* Resize handle - left */}
      <div
        className="absolute left-0 top-0 h-full w-2 bg-blue-700 cursor-ew-resize hover:bg-blue-600 transition-colors"
        onMouseDown={(e) => handleMouseDown(e, 'resize-start')}
      />
      
      {/* Content area - draggable */}
      <div
        className="absolute inset-2 cursor-move hover:bg-blue-400 transition-colors flex items-center justify-center"
        onMouseDown={(e) => handleMouseDown(e, 'move')}
      >
        <span className="text-xs font-medium truncate px-1">
          {clip.id}
        </span>
      </div>
      
      {/* Resize handle - right */}
      <div
        className="absolute right-0 top-0 h-full w-2 bg-blue-700 cursor-ew-resize hover:bg-blue-600 transition-colors"
        onMouseDown={(e) => handleMouseDown(e, 'resize-end')}
      />
      
      {/* Visual feedback during drag */}
      {dragState.type !== 'none' && (
        <div className="absolute -top-6 left-0 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap">
          {clip.startFrame} - {clip.endFrame} ({clip.endFrame - clip.startFrame} frames)
        </div>
      )}
    </div>
  );
};
