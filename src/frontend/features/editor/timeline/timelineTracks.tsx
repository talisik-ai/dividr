import { Film } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';
import { AudioWaveform } from './audioWaveform';
import { VideoSpriteSheetStrip } from './videoSpriteSheetStrip';

// Define track row types - easy to extend in the future

interface TimelineTracksProps {
  tracks: VideoTrack[];
  frameWidth: number;
  timelineWidth: number;
  scrollX: number;
  zoomLevel: number;
  selectedTrackIds: string[];
  onTrackSelect: (trackIds: string[]) => void;
  isSplitModeActive: boolean;
}

export interface TrackRowDefinition {
  id: string;
  name: string;
  trackTypes: VideoTrack['type'][];
  color: string;
  icon: string;
}

export const TRACK_ROWS: TrackRowDefinition[] = [
  {
    id: 'subtitle',
    name: 'Subtitles',
    trackTypes: ['subtitle'],
    color: '#9b59b6',
    icon: '💬',
  },
  {
    id: 'logo',
    name: 'Images/Overlays',
    trackTypes: ['image'],
    color: '#e67e22',
    icon: '🖼️',
  },
  {
    id: 'video',
    name: 'Video',
    trackTypes: ['video'],
    color: '#8e44ad',
    icon: '🎬',
  },
  {
    id: 'audio',
    name: 'Audio',
    trackTypes: ['audio'],
    color: '#27ae60',
    icon: '🎵',
  },
];

interface TrackItemProps {
  track: VideoTrack;
  frameWidth: number;
  zoomLevel: number;
  isSelected: boolean;
  onSelect: (multiSelect?: boolean) => void;
  onMove: (newStartFrame: number) => void;
  onResize: (newStartFrame?: number, newEndFrame?: number) => void;
  isSplitModeActive: boolean;
}

const TrackItemWrapper: React.FC<{
  track: VideoTrack;
  frameWidth: number;
  isSelected: boolean;
  isDragging: boolean;
  isResizing: 'left' | 'right' | false;
  isSplitModeActive: boolean;
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onContextMenu?: () => void;
}> = React.memo(
  ({
    track,
    frameWidth,
    isSelected,
    isDragging,
    isResizing,
    isSplitModeActive,
    children,
    onClick,
    onMouseDown,
    onContextMenu,
  }) => {
    const left = track.startFrame * frameWidth;
    const width = Math.max(1, (track.endFrame - track.startFrame) * frameWidth);

    const getTrackGradient = (type: VideoTrack['type']) => {
      switch (type) {
        case 'subtitle':
          return 'linear-gradient(135deg, #1f1f1f, #2a2a2a)';
        case 'video':
          return 'transparent';
        case 'audio':
          return 'hsl(var(--secondary) / 0.3)';
        case 'image':
          return 'linear-gradient(135deg, #e67e22, #f39c12)';
        default:
          return 'linear-gradient(135deg, #34495e, #7f8c8d)';
      }
    };

    // Determine cursor based on state priority
    const getCursorClass = () => {
      if (isResizing) return 'cursor-ew-resize';
      if (isSplitModeActive) return 'cursor-split';
      if (track.locked) return 'cursor-not-allowed';
      if (isDragging) return 'cursor-grabbing';
      return 'cursor-grab';
    };

    return (
      <div
        className={`
          absolute sm:h-[24px] md:h-[26px] lg:h-[40px] rounded z-10 flex items-center overflow-hidden select-none
          ${isSelected ? 'border-2 border-secondary' : ''}
          ${getCursorClass()}
          ${track.visible ? 'opacity-100' : 'opacity-50'}
        `}
        style={{
          transform: `translate3d(${left}px, 0, 0)`,
          width: `${width}px`,
          background: getTrackGradient(track.type),
          willChange: isDragging ? 'transform' : 'auto',
        }}
        onClick={onClick}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
      >
        {children}
      </div>
    );
  },
);

export const TrackItem: React.FC<TrackItemProps> = React.memo(
  ({
    track,
    frameWidth,
    zoomLevel,
    isSelected,
    onSelect,
    onMove,
    onResize,
    isSplitModeActive,
  }) => {
    const [isResizing, setIsResizing] = useState<'left' | 'right' | false>(
      false,
    );
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({
      x: 0,
      startFrame: 0,
      endFrame: 0,
    });
    const rafRef = useRef<number | null>(null);

    // Apply global cursor override during resize/drag to prevent flickering
    useEffect(() => {
      if (isResizing) {
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        return () => {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };
      } else if (isDragging) {
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        return () => {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        };
      }
    }, [isResizing, isDragging]);

    const width = Math.max(1, (track.endFrame - track.startFrame) * frameWidth);
    const left = track.startFrame * frameWidth;

    const handleClick = useCallback(
      (e: React.MouseEvent) => {
        if (isSplitModeActive || e.button === 2) return;
        e.stopPropagation();
        onSelect(e.altKey);
      },
      [isSplitModeActive, onSelect],
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (track.locked || isSplitModeActive || e.button === 2) return;
        e.stopPropagation();

        const { startDraggingTrack } = useVideoEditorStore.getState();
        startDraggingTrack();

        setIsDragging(true);
        setDragStart({
          x: e.clientX,
          startFrame: track.startFrame,
          endFrame: track.endFrame,
        });
      },
      [track.locked, track.startFrame, track.endFrame, isSplitModeActive],
    );

    const handleResizeMouseDown = useCallback(
      (side: 'left' | 'right', e: React.MouseEvent) => {
        if (isSplitModeActive) return;
        e.stopPropagation();
        e.preventDefault();

        const { startDraggingTrack } = useVideoEditorStore.getState();
        startDraggingTrack();

        setIsResizing(side);
        setDragStart({
          x: e.clientX,
          startFrame: track.startFrame,
          endFrame: track.endFrame,
        });
      },
      [track.startFrame, track.endFrame, isSplitModeActive],
    );

    // Throttled mouse move handler using RAF
    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        if (!isResizing && !isDragging) return;

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
          const deltaX = e.clientX - dragStart.x;
          const deltaFrames = Math.round(deltaX / frameWidth);

          if (isResizing === 'left') {
            const newStartFrame = Math.max(
              0,
              Math.min(
                dragStart.endFrame - 1,
                dragStart.startFrame + deltaFrames,
              ),
            );
            onResize(newStartFrame, undefined);
            // Playhead update removed - trim should not move playhead
          } else if (isResizing === 'right') {
            const newEndFrame = Math.max(
              dragStart.startFrame + 1,
              dragStart.endFrame + deltaFrames,
            );
            onResize(undefined, newEndFrame);

            // Playhead update removed - trim should not move playhead
          } else if (isDragging) {
            const newStartFrame = Math.max(
              0,
              dragStart.startFrame + deltaFrames,
            );
            onMove(newStartFrame);
          }
        });
      },
      [isResizing, isDragging, dragStart, frameWidth, onResize, onMove],
    );

    const handleMouseUp = useCallback(() => {
      const { endDraggingTrack } = useVideoEditorStore.getState();
      endDraggingTrack();

      setIsResizing(false);
      setIsDragging(false);

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    }, []);

    useEffect(() => {
      if (isResizing || isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [isResizing, isDragging, handleMouseMove, handleMouseUp]);

    // Render appropriate content based on track type
    const trackContent = useMemo(() => {
      const contentHeight =
        window.innerWidth <= 640 ? 24 : window.innerWidth <= 768 ? 26 : 40;

      if (track.type === 'video') {
        return (
          <VideoSpriteSheetStrip
            track={track}
            frameWidth={frameWidth}
            width={width}
            height={contentHeight}
            zoomLevel={zoomLevel}
          />
        );
      }

      if (track.type === 'audio') {
        return (
          <div
            className={`w-full h-full ${track.muted ? 'opacity-50 grayscale' : ''}`}
          >
            <AudioWaveform
              track={track}
              frameWidth={frameWidth}
              width={width}
              height={contentHeight}
              zoomLevel={zoomLevel}
            />
          </div>
        );
      }

      // Text content for other track types
      return (
        <div
          className="text-white text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis px-2 py-1"
          style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}
        >
          {track.type === 'subtitle' && track.subtitleText
            ? track.subtitleText
            : track.name}
        </div>
      );
    }, [track, frameWidth, width, zoomLevel]);

    return (
      <>
        <TrackItemWrapper
          track={track}
          frameWidth={frameWidth}
          isSelected={isSelected}
          isDragging={isDragging}
          isResizing={isResizing}
          isSplitModeActive={isSplitModeActive}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
        >
          {trackContent}

          {/* Status indicators */}
          {track.type === 'audio' && track.volume !== undefined && (
            <div className="absolute right-1 top-1 text-[8px] text-foreground z-20">
              {Math.round(track.volume * 100)}%
            </div>
          )}

          {track.locked && (
            <div className="absolute top-0.5 right-0.5 text-[10px] text-foreground/60 z-20">
              🔒
            </div>
          )}

          {track.isLinked && (
            <div
              className="absolute top-0.5 left-0.5 text-[10px] text-blue-400 z-20 animate-pulse"
              title={`Linked to ${track.type === 'video' ? 'audio' : 'video'} track`}
            >
              🔗
            </div>
          )}
        </TrackItemWrapper>

        {/* Resize handles */}
        {!track.locked && isSelected && !isSplitModeActive && (
          <>
            <div
              className={`absolute top-[calc(50%+2px)] -translate-y-1/2 w-2 sm:h-[16px] md:h-[18px] lg:h-[32px] cursor-ew-resize z-20 lg:rounded-r flex items-center justify-center
                ${isResizing === 'left' ? 'bg-blue-500' : 'bg-secondary'}`}
              style={{ left }}
              onMouseDown={(e) => handleResizeMouseDown('left', e)}
            >
              <div className="w-0.5 h-3/4 bg-primary-foreground rounded-full" />
            </div>

            <div
              className={`absolute top-[calc(50%+2px)] -translate-y-1/2 w-2 sm:h-[16px] md:h-[18px] lg:h-[32px] cursor-ew-resize z-20 lg:rounded-l flex items-center justify-center
                ${isResizing === 'right' ? 'bg-blue-500' : 'bg-secondary'}`}
              style={{ left: left + width - 8 }}
              onMouseDown={(e) => handleResizeMouseDown('right', e)}
            >
              <div className="w-0.5 h-3/4 bg-primary-foreground rounded-full" />
            </div>
          </>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    // Optimized comparison - only check what matters for visual changes
    return (
      prevProps.track.id === nextProps.track.id &&
      prevProps.track.startFrame === nextProps.track.startFrame &&
      prevProps.track.endFrame === nextProps.track.endFrame &&
      prevProps.track.visible === nextProps.track.visible &&
      prevProps.track.locked === nextProps.track.locked &&
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isSplitModeActive === nextProps.isSplitModeActive &&
      prevProps.frameWidth === nextProps.frameWidth &&
      prevProps.zoomLevel === nextProps.zoomLevel
    );
  },
);

interface TrackRowProps {
  rowDef: TrackRowDefinition;
  tracks: VideoTrack[];
  frameWidth: number;
  timelineWidth: number;
  scrollX: number;
  zoomLevel: number;
  selectedTrackIds: string[];
  onTrackSelect: (trackId: string, multiSelect?: boolean) => void;
  onTrackMove: (trackId: string, newStartFrame: number) => void;
  onTrackResize: (
    trackId: string,
    newStartFrame?: number,
    newEndFrame?: number,
  ) => void;
  onDrop: (rowId: string, files: FileList) => void;
  allTracksCount: number;
  onPlaceholderClick?: () => void;
  isSplitModeActive: boolean;
}

const TrackRow: React.FC<TrackRowProps> = React.memo(
  ({
    rowDef,
    tracks,
    frameWidth,
    timelineWidth,
    scrollX,
    zoomLevel,
    selectedTrackIds,
    onTrackSelect,
    onTrackMove,
    onTrackResize,
    onDrop,
    allTracksCount,
    onPlaceholderClick,
    isSplitModeActive,
  }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    // Viewport culling for performance optimization
    const visibleTracks = useMemo(() => {
      if (!window || tracks.length === 0) return tracks;

      const viewportWidth = window.innerWidth;
      const viewportStart = scrollX;
      const viewportEnd = scrollX + viewportWidth;
      const bufferSize = viewportWidth * 0.5; // 50% buffer on each side

      return tracks.filter((track) => {
        const trackStart = track.startFrame * frameWidth;
        const trackEnd = track.endFrame * frameWidth;

        // Include tracks that are visible or within buffer zone
        return (
          trackEnd >= viewportStart - bufferSize &&
          trackStart <= viewportEnd + bufferSize
        );
      });
    }, [tracks, scrollX, frameWidth]);

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
        className={`relative sm:h-6 md:h-8 lg:h-12 border-l-[3px]
        ${isDragOver ? 'bg-secondary/10 border-l-secondary' : 'bg-transparent border-l-transparent'}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Row background and grid */}
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{
            left: 0,
            width: timelineWidth,
            background: `repeating-linear-gradient(
          90deg,
          transparent,
          transparent ${frameWidth * 30 - 1}px,
          hsl(var(--foreground) / 0.05) ${frameWidth * 30 - 1}px,
          hsl(var(--foreground) / 0.05) ${frameWidth * 30}px
        )`,
          }}
        />

        {/* Tracks in this row */}
        <div className="py-1.5 h-full">
          {visibleTracks.map((track) => (
            <TrackItem
              key={`${track.id}-${track.source}-${track.name}`}
              track={track}
              frameWidth={frameWidth}
              zoomLevel={zoomLevel}
              isSelected={selectedTrackIds.includes(track.id)}
              onSelect={(multiSelect) => onTrackSelect(track.id, multiSelect)}
              onMove={(newStartFrame) => onTrackMove(track.id, newStartFrame)}
              onResize={(newStartFrame, newEndFrame) =>
                onTrackResize(track.id, newStartFrame, newEndFrame)
              }
              isSplitModeActive={isSplitModeActive}
            />
          ))}
        </div>

        {/* Drop hint */}
        {allTracksCount === 0 && rowDef.id === 'subtitle' && (
          <div
            className={`absolute inset-0 flex items-center px-8 cursor-pointer transition-all duration-200 rounded-lg border-2 border-dashed
            ${
              isDragOver
                ? 'border-secondary bg-secondary/10 text-secondary'
                : 'border-accent hover:border-secondary hover:bg-secondary/10 bg-accent text-muted-foreground hover:text-foreground'
            }`}
            onClick={onPlaceholderClick}
          >
            <div className="flex items-center gap-2 text-xs">
              <Film className="h-4 w-4" />
              <span>Drag and drop your media here</span>
            </div>
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check for TrackRow
    return (
      prevProps.rowDef.id === nextProps.rowDef.id &&
      prevProps.tracks.length === nextProps.tracks.length &&
      prevProps.tracks.every((track, index) => {
        const nextTrack = nextProps.tracks[index];
        return (
          track &&
          nextTrack &&
          track.id === nextTrack.id &&
          track.startFrame === nextTrack.startFrame &&
          track.endFrame === nextTrack.endFrame &&
          track.source === nextTrack.source &&
          track.name === nextTrack.name &&
          track.visible === nextTrack.visible &&
          track.locked === nextTrack.locked &&
          track.muted === nextTrack.muted &&
          track.isLinked === nextTrack.isLinked &&
          track.linkedTrackId === nextTrack.linkedTrackId &&
          track.previewUrl === nextTrack.previewUrl
        );
      }) &&
      prevProps.frameWidth === nextProps.frameWidth &&
      prevProps.timelineWidth === nextProps.timelineWidth &&
      prevProps.scrollX === nextProps.scrollX &&
      JSON.stringify(prevProps.selectedTrackIds) ===
        JSON.stringify(nextProps.selectedTrackIds) &&
      prevProps.allTracksCount === nextProps.allTracksCount
    );
  },
);

export const TimelineTracks: React.FC<TimelineTracksProps> = React.memo(
  ({
    tracks,
    frameWidth,
    timelineWidth,
    scrollX,
    zoomLevel,
    selectedTrackIds,
    onTrackSelect,
    isSplitModeActive,
  }) => {
    const {
      moveTrack,
      resizeTrack,
      importMediaFromFiles,
      importMediaFromDialog,
    } = useVideoEditorStore();

    const handleTrackSelect = useCallback(
      (trackId: string, multiSelect = false) => {
        const { tracks: allTracks } = useVideoEditorStore.getState();
        const selectedTrack = allTracks.find((t) => t.id === trackId);

        // Get tracks to select (include linked track if applicable)
        const tracksToSelect = [trackId];
        if (selectedTrack?.isLinked && selectedTrack.linkedTrackId) {
          tracksToSelect.push(selectedTrack.linkedTrackId);
          console.log(
            `🔗 Selecting linked track pair: ${trackId} and ${selectedTrack.linkedTrackId}`,
          );
        }

        if (multiSelect) {
          // Handle multi-select with linked tracks
          let newSelection = [...selectedTrackIds];

          const isCurrentlySelected = tracksToSelect.some((id) =>
            selectedTrackIds.includes(id),
          );
          if (isCurrentlySelected) {
            // Remove both tracks from selection
            newSelection = newSelection.filter(
              (id) => !tracksToSelect.includes(id),
            );
          } else {
            // Add both tracks to selection
            tracksToSelect.forEach((id) => {
              if (!newSelection.includes(id)) {
                newSelection.push(id);
              }
            });
          }
          onTrackSelect(newSelection);
        } else {
          // Single select - select both linked tracks
          onTrackSelect(tracksToSelect);
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

    const handlePlaceholderClick = useCallback(async () => {
      const result = await importMediaFromDialog();
      if (result.success && result.importedFiles.length > 0) {
        console.log(
          'Files imported successfully from timeline placeholder:',
          result.importedFiles,
        );
      }
    }, [importMediaFromDialog]);

    // Group tracks by their designated rows with subtitle optimization
    const tracksByRow = useMemo(() => {
      const grouped: Record<string, VideoTrack[]> = {};

      TRACK_ROWS.forEach((row) => {
        grouped[row.id] = tracks.filter((track) =>
          row.trackTypes.includes(track.type),
        );

        // Sort subtitle tracks by start time for better performance and visual organization
        if (row.id === 'subtitle' && grouped[row.id].length > 0) {
          grouped[row.id].sort((a, b) => a.startFrame - b.startFrame);
        }
      });

      // Tracks organized by row type for rendering
      return grouped;
    }, [tracks]);

    // Memoize individual callback handlers to prevent re-creation
    const memoizedHandlers = useMemo(
      () => ({
        onTrackSelect: (trackId: string, multiSelect?: boolean) =>
          handleTrackSelect(trackId, multiSelect || false),
        onTrackMove: handleTrackMove,
        onTrackResize: handleTrackResize,
        onDrop: handleRowDrop,
        onPlaceholderClick: handlePlaceholderClick,
      }),
      [
        handleTrackSelect,
        handleTrackMove,
        handleTrackResize,
        handleRowDrop,
        handlePlaceholderClick,
      ],
    );

    return (
      <div
        className="relative min-h-full overflow-visible"
        style={{
          width: timelineWidth,
          minWidth: timelineWidth,
        }}
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
            zoomLevel={zoomLevel}
            selectedTrackIds={selectedTrackIds}
            onTrackSelect={memoizedHandlers.onTrackSelect}
            onTrackMove={memoizedHandlers.onTrackMove}
            onTrackResize={memoizedHandlers.onTrackResize}
            onDrop={memoizedHandlers.onDrop}
            allTracksCount={tracks.length}
            onPlaceholderClick={memoizedHandlers.onPlaceholderClick}
            isSplitModeActive={isSplitModeActive}
          />
        ))}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check for TimelineTracks
    return (
      prevProps.tracks.length === nextProps.tracks.length &&
      prevProps.tracks.every((track, index) => {
        const nextTrack = nextProps.tracks[index];
        return (
          track &&
          nextTrack &&
          track.id === nextTrack.id &&
          track.startFrame === nextTrack.startFrame &&
          track.endFrame === nextTrack.endFrame &&
          track.source === nextTrack.source &&
          track.name === nextTrack.name &&
          track.visible === nextTrack.visible &&
          track.locked === nextTrack.locked &&
          track.muted === nextTrack.muted &&
          track.isLinked === nextTrack.isLinked &&
          track.linkedTrackId === nextTrack.linkedTrackId &&
          track.previewUrl === nextTrack.previewUrl
        );
      }) &&
      prevProps.frameWidth === nextProps.frameWidth &&
      prevProps.timelineWidth === nextProps.timelineWidth &&
      Math.abs(prevProps.scrollX - nextProps.scrollX) < 50 && // Prevent re-render for small scroll changes
      Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) < 0.1 && // Prevent re-render for small zoom changes
      JSON.stringify(prevProps.selectedTrackIds) ===
        JSON.stringify(nextProps.selectedTrackIds) &&
      prevProps.isSplitModeActive === nextProps.isSplitModeActive
    );
  },
);
