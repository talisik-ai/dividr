import React, { useCallback, useRef, useState } from 'react';
import Draggable from 'react-draggable';
import {
  VideoTrack,
  useVideoEditorStore,
} from '../../../Store/videoEditorStore';

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
    icon: '🎬',
  },
  {
    id: 'logo',
    name: 'Logo/Overlay',
    trackTypes: ['image'],
    color: '#e67e22',
    icon: '🖼️',
  },
  {
    id: 'audio',
    name: 'Audio',
    trackTypes: ['audio'],
    color: '#27ae60',
    icon: '🎵',
  },
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
  const [dragStart, setDragStart] = useState({
    x: 0,
    startFrame: 0,
    endFrame: 0,
  });

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
        Math.round((data.x + scrollX) / frameWidth),
      );

      // For now, just call onMove - collision detection will be handled in the store
      onMove(newStartFrame);
    },
    [frameWidth, scrollX, onMove, isResizing],
  );

  // Mouse handlers for resize
  const handleMouseDown = useCallback(
    (side: 'left' | 'right', e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setIsResizing(side);
      setDragStart({
        x: e.clientX,
        startFrame: track.startFrame,
        endFrame: track.endFrame,
      });
    },
    [track.startFrame, track.endFrame],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - dragStart.x;
      const deltaFrames = Math.round(deltaX / frameWidth);

      if (isResizing === 'left') {
        const newStartFrame = Math.max(
          0,
          Math.min(dragStart.endFrame - 1, dragStart.startFrame + deltaFrames),
        );
        onResize(newStartFrame, undefined);
      } else if (isResizing === 'right') {
        const newEndFrame = Math.max(
          dragStart.startFrame + 1,
          dragStart.endFrame + deltaFrames,
        );
        onResize(undefined, newEndFrame);
      }
    },
    [isResizing, dragStart, frameWidth, onResize],
  );

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
    <div className="relative w-full h-full">
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
          className={`
            absolute h-[30px] rounded flex items-center px-2 py-1 overflow-hidden select-none z-[1]
            ${isSelected ? 'border-2 border-white' : 'border border-white/20'}
            ${track.locked ? 'cursor-not-allowed' : isResizing ? 'cursor-ew-resize' : 'cursor-grab'}
            ${track.visible ? (isDragging ? 'opacity-80' : 'opacity-100') : 'opacity-50'}
            ${isDragging ? 'scale-[1.02] z-10 transition-none' : 'scale-100 transition-transform duration-100 ease-in-out'}
          `}
          style={{
            width: width,
            background: getTrackGradient(track.type),
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
        >
          <div
            className="text-white text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}
          >
            {track.name}
          </div>

          {track.type === 'audio' && track.volume !== undefined && (
            <div className="absolute right-1 top-1 text-[8px] text-white/80">
              {Math.round(track.volume * 100)}%
            </div>
          )}

          {track.locked && (
            <div className="absolute top-0.5 right-0.5 text-[10px] text-white/60">
              🔒
            </div>
          )}
        </div>
      </Draggable>

      {/* Left resize handle */}
      {!track.locked && isSelected && (
        <div
          className={`absolute top-0 w-1.5 h-[35px] cursor-ew-resize z-[15] rounded-l
            ${isResizing === 'left' ? 'bg-blue-500' : 'bg-green-500'}`}
          style={{ left: left - 3 }}
          onMouseDown={(e) => handleMouseDown('left', e)}
        />
      )}

      {/* Right resize handle */}
      {!track.locked && isSelected && (
        <div
          className={`absolute top-0 w-1.5 h-[35px] cursor-ew-resize z-[15] rounded-r
            ${isResizing === 'right' ? 'bg-blue-500' : 'bg-green-500'}`}
          style={{ left: left + width - 3 }}
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
  onTrackResize: (
    trackId: string,
    newStartFrame?: number,
    newEndFrame?: number,
  ) => void;
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

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files) {
        onDrop(rowDef.id, e.dataTransfer.files);
      }
    },
    [rowDef.id, onDrop],
  );

  return (
    <div
      className={`relative h-10 lg:h-16 border-b border-[#3d3d3d] border-l-[3px]
        ${isDragOver ? 'bg-green-500/10 border-l-green-500' : 'bg-transparent border-l-transparent'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Row background and grid */}
      <div
        className="absolute top-0 h-full pointer-events-none"
        style={{
          left: -scrollX,
          width: timelineWidth,
          background: `repeating-linear-gradient(
          90deg,
          transparent,
          transparent ${frameWidth * 30 - 1}px,
          rgba(255,255,255,0.02) ${frameWidth * 30 - 1}px,
          rgba(255,255,255,0.02) ${frameWidth * 30}px
        )`,
        }}
      />

      {/* Tracks in this row */}
      <div className="py-1.5 h-full">
        {tracks.map((track) => (
          <TrackItem
            key={track.id}
            track={track}
            frameWidth={frameWidth}
            scrollX={scrollX}
            isSelected={selectedTrackIds.includes(track.id)}
            onSelect={() => onTrackSelect(track.id)}
            onMove={(newStartFrame) => onTrackMove(track.id, newStartFrame)}
            onResize={(newStartFrame, newEndFrame) =>
              onTrackResize(track.id, newStartFrame, newEndFrame)
            }
            rowIndex={0}
          />
        ))}
      </div>

      {/* Drop hint */}
      {tracks.length === 0 && (
        <div
          className={`absolute top-1/2 left-5 transform -translate-y-1/2 text-xs pointer-events-none
            ${isDragOver ? 'text-green-500 font-bold' : 'text-gray-500 font-normal'}`}
        ></div>
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
  const { moveTrack, resizeTrack, importMediaFromFiles } =
    useVideoEditorStore();

  const handleTrackSelect = useCallback(
    (trackId: string, multiSelect = false) => {
      if (multiSelect) {
        const newSelection = selectedTrackIds.includes(trackId)
          ? selectedTrackIds.filter((id) => id !== trackId)
          : [...selectedTrackIds, trackId];
        onTrackSelect(newSelection);
      } else {
        onTrackSelect([trackId]);
      }
    },
    [selectedTrackIds, onTrackSelect],
  );

  const handleTrackMove = useCallback(
    (trackId: string, newStartFrame: number) => {
      moveTrack(trackId, newStartFrame);
    },
    [moveTrack],
  );

  const handleTrackResize = useCallback(
    (trackId: string, newStartFrame?: number, newEndFrame?: number) => {
      resizeTrack(trackId, newStartFrame, newEndFrame);
    },
    [resizeTrack],
  );

  const handleRowDrop = useCallback(
    async (rowId: string, files: FileList) => {
      console.log(`🎯 Dropped ${files.length} files on ${rowId} row`);

      // Filter files based on row type
      const fileArray = Array.from(files);
      const rowDef = TRACK_ROWS.find((row) => row.id === rowId);

      if (!rowDef) return;

      // Filter files that match the row's accepted types
      const validFiles = fileArray.filter((file) => {
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
        console.warn(
          `No valid ${rowDef.trackTypes.join('/')} files found for ${rowId} row`,
        );
      }
    },
    [importMediaFromFiles],
  );

  // Group tracks by their designated rows
  const tracksByRow = React.useMemo(() => {
    const grouped: Record<string, VideoTrack[]> = {};

    TRACK_ROWS.forEach((row) => {
      grouped[row.id] = tracks.filter((track) =>
        row.trackTypes.includes(track.type),
      );
    });

    console.log('🎬 Tracks grouped by rows:', grouped);
    return grouped;
  }, [tracks]);

  return (
    <div
      className="relative min-h-full bg-[#1a1a1a]"
      style={{ width: timelineWidth }}
    >
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
