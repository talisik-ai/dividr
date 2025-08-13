import React, { useCallback, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { VideoTrack, useVideoEditorStore } from '../../store/videoEditorStore';



interface TimelineTracksProps {
  tracks: VideoTrack[];
  frameWidth: number;
  timelineWidth: number;
  scrollX: number;
  currentFrame: number;
  selectedTrackIds: string[];
  onTrackSelect: (trackIds: string[]) => void;
}

interface TrackItemProps {
  track: VideoTrack;
  frameWidth: number;
  scrollX: number;
  isSelected: boolean;
  onSelect: () => void;
  onMove: (newStartFrame: number) => void;
  onResize: (newStartFrame?: number, newEndFrame?: number) => void;
}

export const TrackItem: React.FC<TrackItemProps> = ({
  track,
  frameWidth,
  scrollX,
  isSelected,
  onSelect,
  onMove,
  onResize,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | false>(false);
  const [dragStart, setDragStart] = useState({ x: 0, startFrame: 0, endFrame: 0 });

  // Calculate current width based on actual track duration
  const currentDuration = track.endFrame - track.startFrame;
  const width = currentDuration * frameWidth;
  const left = track.startFrame * frameWidth - scrollX;

  const handleDrag = useCallback(
    (_: any, data: { x: number }) => {
      if (isResizing) return; // Don't move while resizing
      const newStartFrame = Math.max(
        0,
        Math.round((data.x + scrollX) / frameWidth)
      );
      onMove(newStartFrame);
    },
    [frameWidth, scrollX, onMove, isResizing]
  );

  // Mouse handlers for resize
  const handleMouseDown = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(side);
    setDragStart({
      x: e.clientX,
      startFrame: track.startFrame,
      endFrame: track.endFrame
    });
  }, [track.startFrame, track.endFrame]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - dragStart.x;
    const deltaFrames = Math.round(deltaX / frameWidth);
    
    if (isResizing === 'left') {
      const newStartFrame = Math.max(
        0,
        Math.min(dragStart.endFrame - 1, dragStart.startFrame + deltaFrames)
      );
      onResize(newStartFrame, undefined);
    } else if (isResizing === 'right') {
      const newEndFrame = Math.max(
        dragStart.startFrame + 1,
        dragStart.endFrame + deltaFrames
      );
      onResize(undefined, newEndFrame);
    }
  }, [isResizing, dragStart, frameWidth, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add global mouse listeners when resizing
  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const getTrackGradient = (type: VideoTrack['type']) => {
    switch (type) {
      case 'video':
        return 'linear-gradient(135deg, #8e44ad, #9b59b6)';
      case 'audio':
        return 'linear-gradient(135deg, #27ae60, #2ecc71)';
      case 'image':
        return 'linear-gradient(135deg, #e67e22, #f39c12)';
      default:
        return 'linear-gradient(135deg, #34495e, #7f8c8d)';
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Main track - draggable for moving */}
      <Draggable
        nodeRef={nodeRef}
        axis="x"
        position={{ x: left, y: 0 }}
        onDrag={handleDrag}
        grid={[frameWidth, 1]}
        disabled={track.locked || isResizing !== false}
      >
        <div
          ref={nodeRef}
          style={{
            position: 'absolute',
            width: width,
            height: '50px',
            background: getTrackGradient(track.type),
            border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            cursor: track.locked ? 'not-allowed' : isResizing ? 'ew-resize' : 'grab',
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            opacity: track.visible ? 1 : 0.5,
            overflow: 'hidden',
            userSelect: 'none',
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <div
            style={{
              color: 'white',
              fontSize: '11px',
              fontWeight: 'bold',
              textShadow: '1px 1px 2px rgba(0,0,0,0.7)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {track.name}
          </div>

          {track.type === 'audio' && track.volume !== undefined && (
            <div
              style={{
                position: 'absolute',
                right: '4px',
                top: '4px',
                fontSize: '8px',
                color: 'rgba(255,255,255,0.8)',
              }}
            >
              {Math.round(track.volume * 100)}%
            </div>
          )}

          {track.locked && (
            <div
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                fontSize: '10px',
                color: 'rgba(255,255,255,0.6)',
              }}
            >
              🔒
            </div>
          )}
        </div>
      </Draggable>

      {/* Left resize handle */}
      {!track.locked && isSelected && (
        <div
          style={{
            position: 'absolute',
            left: left - 3,
            top: 0,
            width: '6px',
            height: '50px',
            backgroundColor: isResizing === 'left' ? '#2196F3' : '#4CAF50',
            cursor: 'ew-resize',
            zIndex: 15,
            borderRadius: '3px 0 0 3px',
          }}
          onMouseDown={(e) => handleMouseDown('left', e)}
        />
      )}

      {/* Right resize handle */}
      {!track.locked && isSelected && (
        <div
          style={{
            position: 'absolute',
            left: left + width - 3,
            top: 0,
            width: '6px',
            height: '50px',
            backgroundColor: isResizing === 'right' ? '#2196F3' : '#4CAF50',
            cursor: 'ew-resize',
            zIndex: 15,
            borderRadius: '0 3px 3px 0',
          }}
          onMouseDown={(e) => handleMouseDown('right', e)}
        />
      )}
    </div>
  );
};

export const TimelineTracks: React.FC<TimelineTracksProps> = ({
  tracks,
  frameWidth,
  timelineWidth,
  scrollX,
  currentFrame,
  selectedTrackIds,
  onTrackSelect,
}) => {
  const { moveTrack, resizeTrack } = useVideoEditorStore();
  
  const handleTrackSelect = useCallback((trackId: string, multiSelect = false) => {
    if (multiSelect) {
      const newSelection = selectedTrackIds.includes(trackId)
        ? selectedTrackIds.filter(id => id !== trackId)
        : [...selectedTrackIds, trackId];
      onTrackSelect(newSelection);
    } else {
      onTrackSelect([trackId]);
    }
  }, [selectedTrackIds, onTrackSelect]);

  const handleTrackMove = useCallback((trackId: string, newStartFrame: number) => {
    moveTrack(trackId, newStartFrame);
  }, [moveTrack]);

  const handleTrackResize = useCallback((trackId: string, newStartFrame?: number, newEndFrame?: number) => {
    resizeTrack(trackId, newStartFrame, newEndFrame);
  }, [resizeTrack]);

  return (
    <div style={{
      position: 'relative',
      width: timelineWidth,
      minHeight: '100%',
      backgroundColor: '#1a1a1a',
    }}>
      {/* Grid lines */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: -scrollX,
        width: timelineWidth,
        height: '100%',
        background: `repeating-linear-gradient(
          90deg,
          transparent,
          transparent ${frameWidth * 30 - 1}px,
          rgba(255,255,255,0.05) ${frameWidth * 30 - 1}px,
          rgba(255,255,255,0.05) ${frameWidth * 30}px
        )`,
        pointerEvents: 'none',
      }} />

      {/* Track rows */}
      {tracks.map((track, index) => (
        <div
          key={track.id}
          style={{
            position: 'relative',
            height: '60px',
            borderBottom: '1px solid #3d3d3d',
            paddingTop: '5px',
          }}
        >
          <TrackItem
            track={track}
            frameWidth={frameWidth}
            scrollX={scrollX}
            isSelected={selectedTrackIds.includes(track.id)}
            onSelect={() => handleTrackSelect(track.id)}
            onMove={(newStartFrame) => handleTrackMove(track.id, newStartFrame)}
            onResize={(newStartFrame, newEndFrame) => handleTrackResize(track.id, newStartFrame, newEndFrame)}
          />
        </div>
      ))}

      {/* Drop zone for new tracks */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40px',
          border: '2px dashed #555',
          borderRadius: '4px',
          margin: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#888',
          fontSize: '12px',
        }}
      >
        Drop media files here to add tracks
      </div>
    </div>
  );
}; 