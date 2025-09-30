import { Film } from 'lucide-react';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  findBufferedSnapPoint,
  findSnapPoints,
  SNAP_THRESHOLD,
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';
import { AudioWaveform } from './AudioWaveform';
import { TrackContextMenu } from './TrackContextMenu';
import { VideoSpriteSheetStrip } from './VideoSpriteSheetStrip';

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

interface TrackItemProps {
  track: VideoTrack;
  frameWidth: number;
  scrollX: number;
  zoomLevel: number;
  isSelected: boolean;
  onSelect: (multiSelect?: boolean) => void;
  onMove: (newStartFrame: number) => void;
  onResize: (newStartFrame?: number, newEndFrame?: number) => void;
  isSplitModeActive: boolean;
}

export const TrackItem: React.FC<TrackItemProps> = React.memo(
  ({
    track,
    frameWidth,
    scrollX, // eslint-disable-line @typescript-eslint/no-unused-vars
    zoomLevel,
    isSelected,
    onSelect,
    onMove,
    onResize,
    isSplitModeActive,
  }) => {
    const nodeRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState<'left' | 'right' | false>(
      false,
    );
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({
      x: 0,
      startFrame: 0,
      endFrame: 0,
      originalStartFrame: 0, // Track original position for directional snapping
    });
    const [lastSnappedFrame, setLastSnappedFrame] = useState<number | null>(
      null,
    );
    const [, setIsApproachingSnap] = useState(false);

    // Calculate positions relative to the scrolled timeline
    const startX = track.startFrame * frameWidth;
    const endX = track.endFrame * frameWidth;
    const width = endX - startX;

    // Position relative to the scrolled container
    const left = startX;
    const clampedWidth = Math.max(1, width);
    // Mouse handlers for resize
    const handleMouseDown = useCallback(
      (side: 'left' | 'right', e: React.MouseEvent) => {
        if (isSplitModeActive) return; // Prevent resize in split mode

        e.stopPropagation();
        e.preventDefault();
        setIsResizing(side);
        setDragStart({
          x: e.clientX,
          startFrame: track.startFrame,
          endFrame: track.endFrame,
          originalStartFrame: track.startFrame,
        });
        setLastSnappedFrame(null); // Reset snap state when starting drag
        setIsApproachingSnap(false); // Reset approaching state
      },
      [track.startFrame, track.endFrame, isSplitModeActive],
    );

    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        if (!isResizing && !isDragging) return;

        const deltaX = e.clientX - dragStart.x;
        const deltaFrames = Math.round(deltaX / frameWidth);

        // Get snap settings from store
        const { timeline, tracks } = useVideoEditorStore.getState();
        const snapEnabled = timeline.snapEnabled;

        if (isResizing === 'left') {
          let newStartFrame = Math.max(
            0,
            Math.min(
              dragStart.endFrame - 1,
              dragStart.startFrame + deltaFrames,
            ),
          );

          // Apply snapping for left resize
          if (snapEnabled) {
            const snapPoints = findSnapPoints(
              timeline.currentFrame,
              tracks,
              timeline.inPoint,
              timeline.outPoint,
              track.id, // Exclude current track from snap points
            );

            // Check if we're approaching a snap point
            const approachingThreshold = SNAP_THRESHOLD * 1.5;
            let isApproaching = false;

            for (const snapPoint of snapPoints) {
              if (snapPoint.trackId !== track.id) {
                const distance = Math.abs(snapPoint.frame - newStartFrame);
                if (distance <= approachingThreshold) {
                  isApproaching = true;
                  break;
                }
              }
            }

            const snappedFrame = findBufferedSnapPoint(
              newStartFrame,
              snapPoints,
              SNAP_THRESHOLD,
              track.id,
              track.startFrame, // Current position to avoid snapping to same position
              lastSnappedFrame, // Previous snap frame for hysteresis
              isApproaching, // Whether we're approaching a snap point
            );
            if (snappedFrame !== null) {
              newStartFrame = snappedFrame;
              setLastSnappedFrame(snappedFrame);
            } else {
              setLastSnappedFrame(null);
            }
          }

          onResize(newStartFrame, undefined);
        } else if (isResizing === 'right') {
          let newEndFrame = Math.max(
            dragStart.startFrame + 1,
            dragStart.endFrame + deltaFrames,
          );

          // Apply snapping for right resize
          if (snapEnabled) {
            const snapPoints = findSnapPoints(
              timeline.currentFrame,
              tracks,
              timeline.inPoint,
              timeline.outPoint,
              track.id, // Exclude current track from snap points
            );

            // Check if we're approaching a snap point
            const approachingThreshold = SNAP_THRESHOLD * 1.5;
            let isApproaching = false;

            for (const snapPoint of snapPoints) {
              if (snapPoint.trackId !== track.id) {
                const distance = Math.abs(snapPoint.frame - newEndFrame);
                if (distance <= approachingThreshold) {
                  isApproaching = true;
                  break;
                }
              }
            }

            const snappedFrame = findBufferedSnapPoint(
              newEndFrame,
              snapPoints,
              SNAP_THRESHOLD,
              track.id,
              track.endFrame, // Current position to avoid snapping to same position
              lastSnappedFrame, // Previous snap frame for hysteresis
              isApproaching, // Whether we're approaching a snap point
            );
            if (snappedFrame !== null) {
              newEndFrame = snappedFrame;
              setLastSnappedFrame(snappedFrame);
            } else {
              setLastSnappedFrame(null);
            }
          }

          onResize(undefined, newEndFrame);
        } else if (isDragging) {
          let newStartFrame = Math.max(0, dragStart.startFrame + deltaFrames);

          // Apply snapping for drag - use smooth snap point for continuous dragging
          if (snapEnabled) {
            const snapPoints = findSnapPoints(
              timeline.currentFrame,
              tracks,
              timeline.inPoint,
              timeline.outPoint,
              track.id, // Exclude current track from snap points
            );

            // Check if we're approaching a snap point (within 1.5x threshold)
            const approachingThreshold = SNAP_THRESHOLD * 1.5;
            let isApproaching = false;

            for (const snapPoint of snapPoints) {
              if (snapPoint.trackId !== track.id) {
                const distance = Math.abs(snapPoint.frame - newStartFrame);
                if (distance <= approachingThreshold) {
                  isApproaching = true;
                  break;
                }
              }
            }

            setIsApproachingSnap(isApproaching);

            const snappedFrame = findBufferedSnapPoint(
              newStartFrame,
              snapPoints,
              SNAP_THRESHOLD,
              track.id,
              track.startFrame, // Current position to avoid snapping to same position
              lastSnappedFrame, // Previous snap frame for hysteresis
              isApproaching, // Whether we're approaching a snap point
            );
            if (snappedFrame !== null) {
              newStartFrame = snappedFrame;
              setLastSnappedFrame(snappedFrame);
            } else {
              setLastSnappedFrame(null);
            }
          }

          onMove(newStartFrame);
        }
      },
      [isResizing, isDragging, dragStart, frameWidth, onResize, onMove],
    );

    const handleMouseUp = useCallback(() => {
      setIsResizing(false);
      setIsDragging(false);
      setLastSnappedFrame(null); // Reset snap state when ending drag
      setIsApproachingSnap(false); // Reset approaching state
    }, []);

    // Add global mouse listeners when resizing or dragging
    React.useEffect(() => {
      if (isResizing || isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };
      }
    }, [isResizing, isDragging, handleMouseMove, handleMouseUp]);

    const getTrackGradient = (type: VideoTrack['type']) => {
      switch (type) {
        case 'subtitle':
          return 'linear-gradient(135deg, #1f1f1f, #2a2a2a)';
        case 'video':
          return 'linear-gradient(135deg, #8e44ad, #9b59b6)';
        case 'audio':
          return 'hsl(var(--secondary) / 0.3)';
        case 'image':
          return 'linear-gradient(135deg, #e67e22, #f39c12)';
        default:
          return 'linear-gradient(135deg, #34495e, #7f8c8d)';
      }
    };

    return (
      <>
        {/* Main track - positioned absolutely within the shared container */}
        <TrackContextMenu track={track}>
          <div
            ref={nodeRef}
            className={`
            absolute sm:h-[24px] md:h-[26px] lg:h-[40px] rounded z-10 flex items-center overflow-hidden select-none
            ${isSelected ? 'border-2 border-secondary' : ''}
            ${isSplitModeActive ? 'cursor-split' : track.locked ? 'cursor-not-allowed' : isDragging ? 'cursor-grabbing' : 'cursor-grab'}
            ${track.visible ? 'opacity-100' : 'opacity-50'}
          `}
            style={{
              left: `${left}px`,
              width: `${clampedWidth}px`,
              background:
                track.type === 'video'
                  ? 'transparent'
                  : getTrackGradient(track.type),
            }}
            onClick={(e) => {
              if (isSplitModeActive) return; // Prevent selection in split mode
              e.stopPropagation();
              onSelect(e.altKey); // Pass Alt key state for multi-select
            }}
            onMouseDown={(e) => {
              if (track.locked || isSplitModeActive) return; // Prevent drag in split mode
              e.stopPropagation();
              setIsDragging(true);
              setDragStart({
                x: e.clientX,
                startFrame: track.startFrame,
                endFrame: track.endFrame,
                originalStartFrame: track.startFrame,
              });
              setLastSnappedFrame(null); // Reset snap state when starting drag
              setIsApproachingSnap(false); // Reset approaching state
            }}
          >
            {/* Video sprite sheet strip for video tracks */}
            {track.type === 'video' && (
              <VideoSpriteSheetStrip
                track={track}
                frameWidth={frameWidth}
                width={clampedWidth}
                height={
                  window.innerWidth <= 640
                    ? 24
                    : window.innerWidth <= 768
                      ? 26
                      : 40
                }
                zoomLevel={zoomLevel}
              />
            )}

            {/* Audio waveform for audio tracks */}
            {track.type === 'audio' && (
              <div
                className={`w-full h-full ${
                  track.muted ? 'opacity-50 grayscale' : ''
                }`}
              >
                <AudioWaveform
                  track={track}
                  frameWidth={frameWidth}
                  width={clampedWidth}
                  height={
                    window.innerWidth <= 640
                      ? 24
                      : window.innerWidth <= 768
                        ? 26
                        : 40
                  }
                  zoomLevel={zoomLevel}
                />
              </div>
            )}

            {/* Text content for non-video, non-audio tracks */}
            {track.type !== 'video' && track.type !== 'audio' && (
              <div
                className="text-white text-[11px] font-bold whitespace-nowrap overflow-hidden text-ellipsis px-2 py-1"
                style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}
              >
                {track.type === 'subtitle' && track.subtitleText
                  ? track.subtitleText
                  : track.name}
              </div>
            )}

            {/* Volume indicator for audio tracks */}
            {track.type === 'audio' && track.volume !== undefined && (
              <div className="absolute right-1 top-1 text-[8px] text-foreground z-20">
                {Math.round(track.volume * 100)}%
              </div>
            )}

            {/* Lock indicator */}
            {track.locked && (
              <div className="absolute top-0.5 right-0.5 text-[10px] text-foreground/60 z-20">
                🔒
              </div>
            )}

            {/* Link indicator for linked video/audio tracks */}
            {track.isLinked && (
              <div
                className="absolute top-0.5 left-0.5 text-[10px] text-blue-400 z-20 animate-pulse"
                title={`Linked to ${track.type === 'video' ? 'audio' : 'video'} track`}
              >
                🔗
              </div>
            )}

            {/* Unlinked indicator for tracks that could be linked */}
            {!track.isLinked &&
              (track.type === 'video' || track.type === 'audio') && (
                <div
                  className="absolute top-0.5 left-0.5 text-[10px] text-gray-400 z-20 opacity-50"
                  title="Unlinked track - can be linked"
                >
                  ⚪
                </div>
              )}
          </div>
        </TrackContextMenu>

        {/* Left resize handle */}
        {!track.locked && isSelected && !isSplitModeActive && (
          <div
            className={`absolute top-[calc(50%+2px)] -translate-y-1/2 w-2 sm:h-[16px] md:h-[18px] lg:h-[32px] cursor-ew-resize z-20 lg:rounded-r flex items-center justify-center
            ${isResizing === 'left' ? 'bg-blue-500' : 'bg-secondary'}`}
            style={{ left: left }}
            onMouseDown={(e) => handleMouseDown('left', e)}
          >
            <div className="w-0.5 h-3/4 bg-primary-foreground rounded-full" />
          </div>
        )}

        {/* Right resize handle */}
        {!track.locked && isSelected && !isSplitModeActive && (
          <div
            className={`absolute top-[calc(50%+2px)] -translate-y-1/2 w-2 sm:h-[16px] md:h-[18px] lg:h-[32px] cursor-ew-resize z-20 lg:rounded-l flex items-center justify-center
            ${isResizing === 'right' ? 'bg-blue-500' : 'bg-secondary'}`}
            style={{ left: left + clampedWidth - 8 }}
            onMouseDown={(e) => handleMouseDown('right', e)}
          >
            <div className="w-0.5 h-3/4 bg-primary-foreground rounded-full" />
          </div>
        )}
      </>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check to prevent unnecessary re-renders
    const shouldRerender = !(
      prevProps.track.id === nextProps.track.id &&
      prevProps.track.startFrame === nextProps.track.startFrame &&
      prevProps.track.endFrame === nextProps.track.endFrame &&
      prevProps.track.name === nextProps.track.name &&
      prevProps.track.source === nextProps.track.source &&
      prevProps.track.visible === nextProps.track.visible &&
      prevProps.track.locked === nextProps.track.locked &&
      prevProps.track.muted === nextProps.track.muted &&
      prevProps.track.subtitleText === nextProps.track.subtitleText &&
      prevProps.track.volume === nextProps.track.volume &&
      prevProps.track.isLinked === nextProps.track.isLinked &&
      prevProps.track.linkedTrackId === nextProps.track.linkedTrackId &&
      prevProps.track.previewUrl === nextProps.track.previewUrl &&
      prevProps.frameWidth === nextProps.frameWidth &&
      Math.abs(prevProps.scrollX - nextProps.scrollX) < 50 && // Only re-render for significant scroll changes
      prevProps.zoomLevel === nextProps.zoomLevel && // Re-render on any zoom change for proper positioning
      prevProps.isSelected === nextProps.isSelected &&
      prevProps.isSplitModeActive === nextProps.isSplitModeActive
    );

    return !shouldRerender;
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
              scrollX={scrollX}
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
