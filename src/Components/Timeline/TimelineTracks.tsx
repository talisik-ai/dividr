import React, { useCallback, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import { VideoTrack, useVideoEditorStore } from '../../store/videoEditorStore';

// Define track row types - easy to extend in the future
export interface TrackRowDefinition {
  id: string;
  name: string;
  trackTypes: VideoTrack['type'][];
  color: string;
  icon: string;
}

export const TRACK_ROWS: TrackRowDefinition[] = [
  {
    id: 'video',
    name: 'Video',
    trackTypes: ['video'],
    color: '#8e44ad',
    icon: '🎬'
  },
  {
    id: 'logo',
    name: 'Logo/Overlay',
    trackTypes: ['image'],
    color: '#e67e22',
    icon: '🖼️'
  },
  {
    id: 'audio',
    name: 'Audio',
    trackTypes: ['audio'],
    color: '#27ae60',
    icon: '🎵'
  }
];

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
  rowIndex: number;
}

export const TrackItem: React.FC<TrackItemProps> = ({
  track,
  frameWidth,
  scrollX,
  isSelected,
  onSelect,
  onMove,
  onResize,
  rowIndex,
}) => {
  const nodeRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState<'left' | 'right' | false>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, startFrame: 0, endFrame: 0 });

  // Calculate current width based on actual track duration
  const currentDuration = track.endFrame - track.startFrame;
  const width = currentDuration * frameWidth;
  const left = track.startFrame * frameWidth - scrollX;

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragStop = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrag = useCallback(
    (_: any, data: { x: number }) => {
      if (isResizing) return; // Don't move while resizing
      
      const newStartFrame = Math.max(
        0,
        Math.round((data.x + scrollX) / frameWidth)
      );
      
      // For now, just call onMove - collision detection will be handled in the store
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
        onStart={handleDragStart}
        onStop={handleDragStop}
      grid={[frameWidth, 1]}
        disabled={track.locked || isResizing !== false}
    >
      <div
          ref={nodeRef}
        style={{
          position: 'absolute',
          width: width,
            height: '45px',
          background: getTrackGradient(track.type),
          border: isSelected ? '2px solid #fff' : '1px solid rgba(255,255,255,0.2)',
          borderRadius: '4px',
            cursor: track.locked ? 'not-allowed' : isResizing ? 'ew-resize' : 'grab',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
            opacity: track.visible ? (isDragging ? 0.8 : 1) : 0.5,
          overflow: 'hidden',
          userSelect: 'none',
            transform: isDragging ? 'scale(1.02)' : 'scale(1)',
            transition: isDragging ? 'none' : 'transform 0.1s ease',
            zIndex: isDragging ? 10 : 1,
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
            height: '45px',
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
            height: '45px',
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

interface TrackRowProps {
  rowDef: TrackRowDefinition;
  tracks: VideoTrack[];
  frameWidth: number;
  timelineWidth: number;
  scrollX: number;
  selectedTrackIds: string[];
  onTrackSelect: (trackId: string) => void;
  onTrackMove: (trackId: string, newStartFrame: number) => void;
  onTrackResize: (trackId: string, newStartFrame?: number, newEndFrame?: number) => void;
  onDrop: (rowId: string, files: FileList) => void;
}

const TrackRow: React.FC<TrackRowProps> = ({
  rowDef,
  tracks,
  frameWidth,
  timelineWidth,
  scrollX,
  selectedTrackIds,
  onTrackSelect,
  onTrackMove,
  onTrackResize,
  onDrop,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
      onDrop(rowDef.id, e.dataTransfer.files);
    }
  }, [rowDef.id, onDrop]);

  return (
    <div
      style={{
        position: 'relative',
        height: '60px',
        borderBottom: '1px solid #3d3d3d',
        backgroundColor: isDragOver ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
        borderLeft: isDragOver ? '3px solid #4CAF50' : '3px solid transparent',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Row background and grid */}
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
          rgba(255,255,255,0.02) ${frameWidth * 30 - 1}px,
          rgba(255,255,255,0.02) ${frameWidth * 30}px
        )`,
        pointerEvents: 'none',
      }} />

      {/* Tracks in this row */}
      <div style={{ padding: '7px 0', height: '100%' }}>
        {tracks.map((track) => (
          <TrackItem
            key={track.id}
            track={track}
            frameWidth={frameWidth}
            scrollX={scrollX}
            isSelected={selectedTrackIds.includes(track.id)}
            onSelect={() => onTrackSelect(track.id)}
            onMove={(newStartFrame) => onTrackMove(track.id, newStartFrame)}
            onResize={(newStartFrame, newEndFrame) => onTrackResize(track.id, newStartFrame, newEndFrame)}
            rowIndex={0}
          />
        ))}
      </div>

      {/* Drop hint */}
      {tracks.length === 0 && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '20px',
            transform: 'translateY(-50%)',
            color: isDragOver ? '#4CAF50' : '#666',
            fontSize: '12px',
            pointerEvents: 'none',
            fontWeight: isDragOver ? 'bold' : 'normal',
          }}
        >
          {isDragOver ? `Drop ${rowDef.trackTypes.join('/')} files here!` : `${rowDef.icon} Drop ${rowDef.trackTypes.join('/')} files here`}
        </div>
      )}

      {/* Row indicator */}
      <div
        style={{
          position: 'absolute',
          left: '4px',
          top: '4px',
          fontSize: '10px',
          color: rowDef.color,
          fontWeight: 'bold',
          backgroundColor: 'rgba(0,0,0,0.3)',
          padding: '2px 4px',
          borderRadius: '2px',
          pointerEvents: 'none',
        }}
      >
        {rowDef.icon} {rowDef.name}
      </div>
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
  const { moveTrack, resizeTrack, importMediaFromFiles } = useVideoEditorStore();
  
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

  const handleRowDrop = useCallback(async (rowId: string, files: FileList) => {
    console.log(`🎯 Dropped ${files.length} files on ${rowId} row`);
    
    // Filter files based on row type
    const fileArray = Array.from(files);
    const rowDef = TRACK_ROWS.find(row => row.id === rowId);
    
    if (!rowDef) return;
    
    // Filter files that match the row's accepted types
    const validFiles = fileArray.filter(file => {
      if (rowDef.trackTypes.includes('video')) {
        return file.type.startsWith('video/');
      }
      if (rowDef.trackTypes.includes('audio')) {
        return file.type.startsWith('audio/');
      }
      if (rowDef.trackTypes.includes('image')) {
        return file.type.startsWith('image/');
      }
      return false;
    });
    
    if (validFiles.length > 0) {
      // Import files using the existing store method
      await importMediaFromFiles(validFiles);
    } else {
      console.warn(`No valid ${rowDef.trackTypes.join('/')} files found for ${rowId} row`);
    }
  }, [importMediaFromFiles]);

  // Group tracks by their designated rows
  const tracksByRow = React.useMemo(() => {
    const grouped: Record<string, VideoTrack[]> = {};
    
    TRACK_ROWS.forEach(row => {
      grouped[row.id] = tracks.filter(track => row.trackTypes.includes(track.type));
    });
    
    console.log('🎬 Tracks grouped by rows:', grouped);
    return grouped;
  }, [tracks]);

  return (
    <div style={{
      position: 'relative',
      width: timelineWidth,
      minHeight: '100%',
      backgroundColor: '#1a1a1a',
    }}>
      {/* Render each track row */}
      {TRACK_ROWS.map((rowDef) => (
        <TrackRow
          key={rowDef.id}
          rowDef={rowDef}
          tracks={tracksByRow[rowDef.id] || []}
            frameWidth={frameWidth}
          timelineWidth={timelineWidth}
            scrollX={scrollX}
          selectedTrackIds={selectedTrackIds}
          onTrackSelect={(trackId) => handleTrackSelect(trackId)}
          onTrackMove={handleTrackMove}
          onTrackResize={handleTrackResize}
          onDrop={handleRowDrop}
        />
      ))}
    </div>
  );
}; 