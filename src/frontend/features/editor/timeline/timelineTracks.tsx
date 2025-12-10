import { Skeleton } from '@/frontend/components/ui/skeleton';
import { cn } from '@/frontend/utils/utils';
import { Film } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { KaraokeConfirmationDialog } from '../components/dialogs/karaokeConfirmationDialog';
import {
  importMediaFromDialogUnified,
  importMediaUnified,
} from '../services/mediaImportService';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';
import { AudioWaveform } from './audioWaveform';
import { ImageTrackStrip } from './imageTrackStrip';
import {
  checkSnapPosition,
  findAllSnapPoints,
} from './utils/collisionDetection';
import {
  BASE_ROW_DEFINITIONS,
  calculateRowBoundsWithPlaceholders,
  detectInsertionPoint,
  generateDynamicRows,
  getNextAvailableRowIndex,
  getTrackRowId,
  migrateTracksWithRowIndex,
  parseRowId,
  TrackRowDefinition,
} from './utils/dynamicTrackRows';
import {
  getRowHeight,
  getRowHeightClasses,
  getTrackItemHeight,
  getTrackItemHeightClasses,
} from './utils/timelineConstants';
import { VideoSpriteSheetStrip } from './videoSpriteSheetStrip';

const DRAG_ACTIVATION_THRESHOLD = 5;

type MediaDragPayload = {
  mediaId: string;
  type?: VideoTrack['type'];
  duration?: number;
  mimeType?: string;
  thumbnail?: string;
  waveform?: string;
};

const parseMediaDragPayload = (
  dataTransfer: DataTransfer,
): MediaDragPayload | null => {
  const jsonPayload = dataTransfer.getData('application/json');
  if (jsonPayload) {
    try {
      const parsed = JSON.parse(jsonPayload);
      if (parsed?.mediaId) {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to parse drag payload', error);
    }
  }

  const mediaId = dataTransfer.getData('text/plain');
  if (mediaId) {
    return { mediaId };
  }

  return null;
};

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
  isDuplicationFeedback: boolean;
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
    isDuplicationFeedback,
    children,
    onClick,
    onMouseDown,
    onContextMenu,
  }) => {
    const left = track.startFrame * frameWidth;
    const width = Math.max(1, (track.endFrame - track.startFrame) * frameWidth);

    const dragGhost = useVideoEditorStore((state) => state.playback.dragGhost);

    const isBeingDragged =
      dragGhost?.isActive &&
      dragGhost.selectedTrackIds &&
      dragGhost.selectedTrackIds.includes(track.id);

    const getTrackGradient = (type: VideoTrack['type']) => {
      switch (type) {
        case 'text':
          return 'hsl(0, 0%, 35%)';
        case 'subtitle':
          return 'hsl(0, 0%, 35%)';
        case 'video':
          return 'transparent';
        case 'audio':
          return 'hsl(var(--secondary) / 0.3)';
        case 'image':
          return 'transparent';
        default:
          return 'linear-gradient(135deg, #34495e, #7f8c8d)';
      }
    };

    const getCursorClass = () => {
      if (isResizing) return 'cursor-trim';
      if (isSplitModeActive) return 'cursor-split';
      if (track.locked) return 'cursor-not-allowed';
      if (isDragging) return 'cursor-grabbing';
      return 'cursor-grab';
    };

    return (
      <div
        className={cn(
          'absolute rounded flex items-center select-none transition-opacity duration-150',
          getTrackItemHeightClasses(track.type),
          isDuplicationFeedback ? 'overflow-visible' : 'overflow-hidden',
          isSelected ? 'border-2 border-secondary' : '',
          getCursorClass(),
          track.visible ? 'opacity-100' : 'opacity-50',
          isDuplicationFeedback ? 'track-duplicate-feedback z-50' : 'z-10',
          isBeingDragged ? 'opacity-0' : '',
        )}
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
      y: 0,
      startFrame: 0,
      endFrame: 0,
    });
    const rafRef = useRef<number | null>(null);
    const hasAutoSelectedRef = useRef(false);
    const dragThresholdMetRef = useRef(false);
    const dragOffsetRef = useRef({ offsetX: 0, offsetY: 0 });

    const isDuplicationFeedback = useVideoEditorStore((state) =>
      state.duplicationFeedbackTrackIds.has(track.id),
    );

    const dragGhostForHandles = useVideoEditorStore(
      (state) => state.playback.dragGhost,
    );
    const isThisOrLinkedTrackBeingDragged =
      dragGhostForHandles?.isActive &&
      dragGhostForHandles.selectedTrackIds &&
      dragGhostForHandles.selectedTrackIds.includes(track.id);

    useEffect(() => {
      if (isResizing) {
        const isDark = document.documentElement.classList.contains('dark');
        const svgColor = isDark ? '%23ffffff' : '%23000';
        const fillColor = isDark ? '%23000' : '%23ffffff';
        document.body.style.cursor = `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="${fillColor}" stroke="${svgColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="m16 16 4-4-4-4"/><path d="m8 8-4 4 4 4"/></svg>') 12 12, ew-resize`;
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
        onSelect(e.shiftKey);
      },
      [isSplitModeActive, onSelect],
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (track.locked || isSplitModeActive || e.button === 2) return;
        e.stopPropagation();

        const { startDraggingTrack } = useVideoEditorStore.getState();
        startDraggingTrack(track.startFrame);

        const trackElement = e.currentTarget as HTMLElement;
        const trackRect = trackElement.getBoundingClientRect();
        dragOffsetRef.current = {
          offsetX: e.clientX - trackRect.left,
          offsetY: e.clientY - trackRect.top,
        };

        setIsDragging(true);
        setDragStart({
          x: e.clientX,
          y: e.clientY,
          startFrame: track.startFrame,
          endFrame: track.endFrame,
        });

        dragThresholdMetRef.current = false;
      },
      [
        track.locked,
        track.startFrame,
        track.endFrame,
        track.id,
        track.type,
        isSplitModeActive,
      ],
    );

    const handleResizeMouseDown = useCallback(
      (side: 'left' | 'right', e: React.MouseEvent) => {
        if (isSplitModeActive) return;
        e.stopPropagation();
        e.preventDefault();

        if (!isSelected) {
          onSelect(e.shiftKey);
        }

        const { startDraggingTrack } = useVideoEditorStore.getState();
        startDraggingTrack(track.startFrame);

        setIsResizing(side);
        setDragStart({
          x: e.clientX,
          y: e.clientY,
          startFrame: track.startFrame,
          endFrame: track.endFrame,
        });
      },
      [
        track.startFrame,
        track.endFrame,
        isSplitModeActive,
        isSelected,
        onSelect,
      ],
    );

    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        if (!isResizing && !isDragging) return;

        if (isDragging && !dragThresholdMetRef.current) {
          const deltaX = Math.abs(e.clientX - dragStart.x);
          const deltaY = Math.abs(e.clientY - dragStart.y);
          const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

          if (totalMovement >= DRAG_ACTIVATION_THRESHOLD) {
            dragThresholdMetRef.current = true;

            const { setDragGhost, timeline } = useVideoEditorStore.getState();

            const selectedTrackIds = timeline.selectedTrackIds;
            const isMultiSelectionDrag =
              selectedTrackIds.length > 1 &&
              selectedTrackIds.includes(track.id);

            const allSelectedTrackIds = isMultiSelectionDrag
              ? [...selectedTrackIds]
              : [track.id];

            if (track.isLinked && track.linkedTrackId) {
              if (!allSelectedTrackIds.includes(track.linkedTrackId)) {
                allSelectedTrackIds.push(track.linkedTrackId);
              }
            }

            const isMultiSelection = allSelectedTrackIds.length > 1;

            const scrollContainer = (e.target as HTMLElement).closest(
              '.overflow-auto',
            ) as HTMLElement | null;
            const currentScrollX = scrollContainer?.scrollLeft || 0;
            const scrollContainerRect =
              scrollContainer?.getBoundingClientRect();
            const mouseRelativeX = scrollContainerRect
              ? e.clientX - scrollContainerRect.left
              : e.clientX;

            const targetFrame = Math.max(
              0,
              Math.floor(
                (mouseRelativeX +
                  currentScrollX -
                  dragOffsetRef.current.offsetX) /
                  frameWidth,
              ),
            );

            setDragGhost({
              isActive: true,
              trackId: track.id,
              selectedTrackIds: allSelectedTrackIds,
              mouseX: e.clientX,
              mouseY: e.clientY,
              offsetX: dragOffsetRef.current.offsetX,
              offsetY: dragOffsetRef.current.offsetY,
              targetRow: track.type,
              targetFrame,
              isMultiSelection,
            });
          } else {
            return;
          }
        }

        if (
          isDragging &&
          !isSelected &&
          !hasAutoSelectedRef.current &&
          dragThresholdMetRef.current
        ) {
          onSelect(e.shiftKey);
          hasAutoSelectedRef.current = true;
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);

        rafRef.current = requestAnimationFrame(() => {
          const scrollContainer = (e.target as HTMLElement).closest(
            '.overflow-auto',
          ) as HTMLElement | null;
          const currentScrollX = scrollContainer?.scrollLeft || 0;
          const scrollContainerRect = scrollContainer?.getBoundingClientRect();

          const deltaX = e.clientX - dragStart.x;
          const deltaFrames = Math.round(deltaX / frameWidth);

          if (isResizing === 'left') {
            let newStartFrame = Math.max(
              0,
              Math.min(
                dragStart.endFrame - 1,
                dragStart.startFrame + deltaFrames,
              ),
            );

            const { timeline, tracks: allTracks } =
              useVideoEditorStore.getState();
            const shouldSnap = e.shiftKey || timeline.snapEnabled;

            if (shouldSnap) {
              const excludeIds = [track.id];
              if (track.linkedTrackId) excludeIds.push(track.linkedTrackId);
              timeline.selectedTrackIds.forEach((id: string) => {
                if (!excludeIds.includes(id)) excludeIds.push(id);
              });

              const allSnapPoints = findAllSnapPoints(
                allTracks,
                excludeIds,
                timeline.currentFrame,
              );

              const snapResult = checkSnapPosition(
                newStartFrame,
                allSnapPoints,
                8,
              );
              if (
                snapResult !== null &&
                snapResult >= 0 &&
                snapResult < dragStart.endFrame
              ) {
                newStartFrame = snapResult;
                useVideoEditorStore.getState().setMagneticSnapFrame(snapResult);
              } else {
                useVideoEditorStore.getState().setMagneticSnapFrame(null);
              }
            } else {
              useVideoEditorStore.getState().setMagneticSnapFrame(null);
            }

            onResize(newStartFrame, undefined);
          } else if (isResizing === 'right') {
            let newEndFrame = Math.max(
              dragStart.startFrame + 1,
              dragStart.endFrame + deltaFrames,
            );

            const { timeline, tracks: allTracks } =
              useVideoEditorStore.getState();
            const shouldSnap = e.shiftKey || timeline.snapEnabled;

            if (shouldSnap) {
              const excludeIds = [track.id];
              if (track.linkedTrackId) excludeIds.push(track.linkedTrackId);
              timeline.selectedTrackIds.forEach((id: string) => {
                if (!excludeIds.includes(id)) excludeIds.push(id);
              });

              const allSnapPoints = findAllSnapPoints(
                allTracks,
                excludeIds,
                timeline.currentFrame,
              );

              const snapResult = checkSnapPosition(
                newEndFrame,
                allSnapPoints,
                8,
              );
              if (snapResult !== null && snapResult > dragStart.startFrame) {
                newEndFrame = snapResult;
                useVideoEditorStore.getState().setMagneticSnapFrame(snapResult);
              } else {
                useVideoEditorStore.getState().setMagneticSnapFrame(null);
              }
            } else {
              useVideoEditorStore.getState().setMagneticSnapFrame(null);
            }

            onResize(undefined, newEndFrame);
          } else if (isDragging && dragThresholdMetRef.current) {
            if (!scrollContainerRect) {
              const newStartFrame = Math.max(
                0,
                dragStart.startFrame + deltaFrames,
              );
              onMove(newStartFrame);
              return;
            }

            const mouseRelativeX = e.clientX - scrollContainerRect.left;

            let newStartFrame = Math.max(
              0,
              Math.floor(
                (mouseRelativeX +
                  currentScrollX -
                  dragOffsetRef.current.offsetX) /
                  frameWidth,
              ),
            );

            const duration = dragStart.endFrame - dragStart.startFrame;
            const newEndFrame = newStartFrame + duration;

            const {
              timeline,
              tracks: allTracks,
              updateDragGhostPosition,
            } = useVideoEditorStore.getState();
            const shouldSnap = e.shiftKey || timeline.snapEnabled;

            if (shouldSnap) {
              const excludeIds = [track.id];
              if (track.linkedTrackId) excludeIds.push(track.linkedTrackId);
              timeline.selectedTrackIds.forEach((id: string) => {
                if (!excludeIds.includes(id)) excludeIds.push(id);
              });

              const allSnapPoints = findAllSnapPoints(
                allTracks,
                excludeIds,
                timeline.currentFrame,
              );

              const startSnap = checkSnapPosition(
                newStartFrame,
                allSnapPoints,
                8,
              );
              if (startSnap !== null && startSnap >= 0) {
                newStartFrame = startSnap;
                useVideoEditorStore.getState().setMagneticSnapFrame(startSnap);
              } else {
                const endSnap = checkSnapPosition(
                  newEndFrame,
                  allSnapPoints,
                  8,
                );
                if (endSnap !== null) {
                  newStartFrame = endSnap - duration;
                  if (newStartFrame >= 0) {
                    useVideoEditorStore
                      .getState()
                      .setMagneticSnapFrame(endSnap);
                  } else {
                    newStartFrame = 0;
                    useVideoEditorStore.getState().setMagneticSnapFrame(null);
                  }
                } else {
                  useVideoEditorStore.getState().setMagneticSnapFrame(null);
                }
              }
            } else {
              useVideoEditorStore.getState().setMagneticSnapFrame(null);
            }

            const currentTargetRow =
              useVideoEditorStore.getState().playback.dragGhost?.targetRow ||
              getTrackRowId(track);

            updateDragGhostPosition(
              e.clientX,
              e.clientY,
              currentTargetRow,
              newStartFrame,
            );

            onMove(newStartFrame);
          }
        });
      },
      [
        isResizing,
        isDragging,
        isSelected,
        dragStart,
        frameWidth,
        onResize,
        onMove,
        onSelect,
        track.id,
        track.type,
        track.linkedTrackId,
        track.isLinked,
        track.startFrame,
      ],
    );

    const handleMouseUp = useCallback(() => {
      const state = useVideoEditorStore.getState();
      const { playback, endDraggingTrack, clearDragGhost, moveTrackToRow } =
        state;

      if (
        isDragging &&
        dragThresholdMetRef.current &&
        playback.dragGhost?.isActive &&
        playback.dragGhost.targetRow
      ) {
        const targetRowId = playback.dragGhost.targetRow;
        const targetFrame = playback.dragGhost.targetFrame;
        const parsedRow = parseRowId(targetRowId);

        console.log(
          `🎬 DROP: track=${track.type}, currentRow=${track.trackRowIndex ?? 0}, targetRow=${parsedRow ? parsedRow.rowIndex : 'null'}`,
        );

        if (parsedRow) {
          const currentRowIndex = track.trackRowIndex ?? 0;

          if (parsedRow.type !== track.type) {
            console.log(
              `   ❌ INVALID: Cannot drop ${track.type} on ${parsedRow.type} row`,
            );
            endDraggingTrack();
            clearDragGhost();
            setIsResizing(false);
            setIsDragging(false);
            hasAutoSelectedRef.current = false;
            dragThresholdMetRef.current = false;
            return;
          }

          const normalizedTargetIndex = Math.round(parsedRow.rowIndex);
          if (normalizedTargetIndex !== currentRowIndex) {
            moveTrackToRow(
              track.id,
              parsedRow.rowIndex,
              targetFrame !== null && targetFrame !== undefined
                ? targetFrame
                : undefined,
            );
          } else {
            console.log(
              `   ⏸️ No row change (same row ${currentRowIndex}, target was ${parsedRow.rowIndex})`,
            );
          }
        }
      }

      endDraggingTrack();
      clearDragGhost();

      setIsResizing(false);
      setIsDragging(false);
      hasAutoSelectedRef.current = false;
      dragThresholdMetRef.current = false;

      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }, [isDragging, track.id, track.type, track.trackRowIndex]);

    useEffect(() => {
      if (isResizing || isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('blur', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          window.removeEventListener('blur', handleMouseUp);
        };
      }
    }, [isResizing, isDragging, handleMouseMove, handleMouseUp]);

    useEffect(() => {
      return () => {
        const { playback, endDraggingTrack } = useVideoEditorStore.getState();
        if (playback.isDraggingTrack) {
          endDraggingTrack();
        }
      };
    }, []);

    const trackContent = useMemo(() => {
      const contentHeight = getTrackItemHeight(track.type);

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

      if (track.type === 'image') {
        return (
          <ImageTrackStrip
            track={track}
            frameWidth={frameWidth}
            width={width}
            height={contentHeight}
            zoomLevel={zoomLevel}
          />
        );
      }

      return (
        <div className="text-white text-[11px] h-fit whitespace-nowrap overflow-hidden text-ellipsis px-2 py-1">
          {track.type === 'subtitle' && track.subtitleText
            ? track.subtitleText
            : track.type === 'text' && track.textContent
              ? track.textContent
              : track.name}
        </div>
      );
    }, [track, track.muted, frameWidth, width, zoomLevel]);

    return (
      <>
        <TrackItemWrapper
          track={track}
          frameWidth={frameWidth}
          isSelected={isSelected}
          isDragging={isDragging}
          isResizing={isResizing}
          isSplitModeActive={isSplitModeActive}
          isDuplicationFeedback={isDuplicationFeedback}
          onClick={handleClick}
          onMouseDown={handleMouseDown}
        >
          {trackContent}

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

        {!track.locked &&
          isSelected &&
          !isSplitModeActive &&
          !isDragging &&
          !isThisOrLinkedTrackBeingDragged && (
            <>
              <div
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 w-1.5 cursor-trim z-20 rounded-r flex items-center justify-center',
                  track.type === 'text' || track.type === 'subtitle'
                    ? 'sm:h-3 md:h-4 lg:h-5'
                    : 'sm:h-3 md:h-7 lg:h-8',
                  isResizing === 'left' ? 'bg-blue-500' : 'bg-secondary',
                )}
                style={{ left }}
                onMouseDown={(e) => handleResizeMouseDown('left', e)}
              >
                <div className="w-0.5 h-2/3 bg-primary-foreground rounded-full" />
              </div>

              <div
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 w-1.5 cursor-trim z-20 rounded-l flex items-center justify-center',
                  track.type === 'text' || track.type === 'subtitle'
                    ? 'sm:h-3 md:h-4 lg:h-5'
                    : 'sm:h-3 md:h-6 lg:h-8',
                  isResizing === 'right' ? 'bg-blue-500' : 'bg-secondary',
                )}
                style={{ left: left + width - 6 }}
                onMouseDown={(e) => handleResizeMouseDown('right', e)}
              >
                <div className="w-0.5 h-2/3 bg-primary-foreground rounded-full" />
              </div>
            </>
          )}
      </>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.track.id === nextProps.track.id &&
      prevProps.track.startFrame === nextProps.track.startFrame &&
      prevProps.track.endFrame === nextProps.track.endFrame &&
      prevProps.track.visible === nextProps.track.visible &&
      prevProps.track.locked === nextProps.track.locked &&
      prevProps.track.muted === nextProps.track.muted &&
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
  onSubtitleImportAttempt?: (params: {
    mediaId: string;
    mediaName: string;
    targetFrame: number;
    targetRowIndex: number;
  }) => boolean | Promise<boolean>;
  allTracksCount: number;
  onPlaceholderClick?: () => void;
  isSplitModeActive: boolean;
  isEmptyTimeline: boolean;
  isPlaceholder?: boolean;
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
    onSubtitleImportAttempt,
    onPlaceholderClick,
    isSplitModeActive,
    isEmptyTimeline,
    isPlaceholder = false,
  }) => {
    const [isDragOver, setIsDragOver] = useState(false);

    const currentTranscribingTrackId = useVideoEditorStore(
      (state) => state.currentTranscribingTrackId,
    );
    const addTrackFromMediaLibrary = useVideoEditorStore(
      (state) => state.addTrackFromMediaLibrary,
    );
    const isSubtitleRowTranscribing =
      rowDef.trackTypes.includes('subtitle') && !!currentTranscribingTrackId;

    const parsedRow = useMemo(() => {
      const parsed = parseRowId(rowDef.id);
      if (!parsed) return { type: rowDef.trackTypes[0], rowIndex: 0 };
      return parsed;
    }, [rowDef.id, rowDef.trackTypes]);

    const isEvenRow = parsedRow.rowIndex % 2 === 0;

    const visibleTracks = useMemo(() => {
      if (!window || tracks.length === 0) return tracks;

      const viewportWidth = window.innerWidth;
      const viewportStart = scrollX;
      const viewportEnd = scrollX + viewportWidth;
      const bufferSize = viewportWidth * 0.5;

      return tracks.filter((track) => {
        const trackStart = track.startFrame * frameWidth;
        const trackEnd = track.endFrame * frameWidth;

        return (
          trackEnd >= viewportStart - bufferSize &&
          trackStart <= viewportEnd + bufferSize
        );
      });
    }, [tracks, scrollX, frameWidth, zoomLevel]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);

        const payload = parseMediaDragPayload(e.dataTransfer);
        const parsedRow = parseRowId(rowDef.id);
        const expectedType = parsedRow?.type || rowDef.trackTypes[0];

        if (payload) {
          if (payload.type && expectedType && payload.type !== expectedType) {
            return;
          }

          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const cursorX = e.clientX - rect.left + scrollX;
          const targetFrame = Math.max(0, Math.floor(cursorX / frameWidth));
          const targetRowIndex = parsedRow?.rowIndex ?? 0;

          const mediaItem = useVideoEditorStore
            .getState()
            .mediaLibrary?.find(
              (item: { id: string; type?: string; name?: string }) =>
                item.id === payload.mediaId,
            );
          const isSubtitleDrop =
            payload.type === 'subtitle' ||
            mediaItem?.type === 'subtitle' ||
            (mediaItem?.name || '').toLowerCase().endsWith('.srt') ||
            (mediaItem?.name || '').toLowerCase().endsWith('.vtt');

          if (isSubtitleDrop && onSubtitleImportAttempt) {
            const handled = await onSubtitleImportAttempt({
              mediaId: payload.mediaId,
              mediaName: mediaItem?.name || 'Subtitles',
              targetFrame,
              targetRowIndex,
            });

            if (handled) {
              return;
            }
          }

          addTrackFromMediaLibrary(
            payload.mediaId,
            targetFrame,
            targetRowIndex,
          ).catch(console.error);
          return;
        }

        if (e.dataTransfer.files) {
          onDrop(rowDef.id, e.dataTransfer.files);
        }
      },
      [
        rowDef.id,
        rowDef.trackTypes,
        onDrop,
        scrollX,
        frameWidth,
        addTrackFromMediaLibrary,
        onSubtitleImportAttempt,
      ],
    );

    const isBaseVideoRow = rowDef.id === 'video-0';

    // Placeholder rows have reduced opacity grid
    const gridOpacity = isPlaceholder ? '0.03' : '0.05';

    return (
      <div
        className={cn(
          'relative border-l-[3px]',
          isPlaceholder ? 'h-12' : getRowHeightClasses(rowDef.id),
          isDragOver
            ? 'bg-secondary/10 border-l-secondary'
            : isEvenRow
              ? 'bg-transparent'
              : 'bg-muted/20',
          isPlaceholder && 'border-l-transparent',
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Grid lines - always rendered for all rows */}
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{
            left: 0,
            width: timelineWidth,
            background: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent ${frameWidth * 30 - 1}px,
              hsl(var(--foreground) / ${gridOpacity}) ${frameWidth * 30 - 1}px,
              hsl(var(--foreground) / ${gridOpacity}) ${frameWidth * 30}px
            )`,
          }}
        />

        <div className="h-full flex items-center">
          {isSubtitleRowTranscribing ? (
            <div className="h-full w-full flex items-center gap-2 px-2">
              <Skeleton className="sm:h-[22px] md:h-6 lg:h-7 w-[120px] rounded" />
              <Skeleton className="sm:h-[22px] md:h-6 lg:h-7 w-[80px] rounded" />
              <Skeleton className="sm:h-[22px] md:h-6 lg:h-7 w-[150px] rounded" />
              <Skeleton className="sm:h-[22px] md:h-6 lg:h-7 w-[100px] rounded" />
              <Skeleton className="sm:h-[22px] md:h-6 lg:h-7 w-[90px] rounded" />
              <Skeleton className="sm:h-[22px] md:h-6 lg:h-7 w-[110px] rounded" />
              <Skeleton className="sm:h-[22px] md:h-6 lg:h-7 w-[130px] rounded" />
            </div>
          ) : (
            visibleTracks.map((track) => (
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
            ))
          )}
        </div>

        {isEmptyTimeline && isBaseVideoRow && (
          <div
            className={`absolute inset-0 flex items-center justify-center px-8 cursor-pointer transition-all duration-200 rounded-lg border-2 border-dashed
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
          track.previewUrl === nextTrack.previewUrl &&
          track.trackRowIndex === nextTrack.trackRowIndex
        );
      }) &&
      prevProps.frameWidth === nextProps.frameWidth &&
      prevProps.timelineWidth === nextProps.timelineWidth &&
      prevProps.scrollX === nextProps.scrollX &&
      prevProps.zoomLevel === nextProps.zoomLevel &&
      JSON.stringify(prevProps.selectedTrackIds) ===
        JSON.stringify(nextProps.selectedTrackIds) &&
      prevProps.allTracksCount === nextProps.allTracksCount &&
      prevProps.isSplitModeActive === nextProps.isSplitModeActive &&
      prevProps.isEmptyTimeline === nextProps.isEmptyTimeline &&
      prevProps.isPlaceholder === nextProps.isPlaceholder
    );
  },
);

function getDefaultRows(): TrackRowDefinition[] {
  return [
    {
      id: 'video-0',
      name: 'Video',
      trackTypes: ['video'],
      color: BASE_ROW_DEFINITIONS.video.color,
      icon: BASE_ROW_DEFINITIONS.video.icon,
    },
    {
      id: 'audio-0',
      name: 'Audio',
      trackTypes: ['audio'],
      color: BASE_ROW_DEFINITIONS.audio.color,
      icon: BASE_ROW_DEFINITIONS.audio.icon,
    },
  ];
}

// Placeholder row definition for empty space
const PLACEHOLDER_ROW_HEIGHT = 48;

interface PlaceholderRowDef {
  id: string;
  type: 'placeholder';
  position: 'above' | 'below';
}

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
      moveSelectedTracks,
      resizeTrack,
      importMediaToTimeline,
      importMediaFromDrop,
      addTrackFromMediaLibrary,
      importMediaFromDialog,
      beginGroup,
      endGroup,
      removeTrack,
    } = useVideoEditorStore();

    const visibleTrackRows = useVideoEditorStore(
      (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
    );

    const isEmptyTimeline = tracks.length === 0;

    const migratedTracks = useMemo(
      () => migrateTracksWithRowIndex(tracks),
      [tracks],
    );

    const dynamicRows = useMemo(() => {
      if (isEmptyTimeline) {
        return getDefaultRows();
      }
      return generateDynamicRows(migratedTracks);
    }, [migratedTracks, isEmptyTimeline]);

    const [subtitleImportConfirmation, setSubtitleImportConfirmation] =
      useState<{
        show: boolean;
        mediaId: string | null;
        mediaName: string;
        targetFrame: number;
        generatedSubtitleIds: string[];
      }>({
        show: false,
        mediaId: null,
        mediaName: '',
        targetFrame: 0,
        generatedSubtitleIds: [],
      });

    // Calculate placeholder rows needed
    const MAX_PLACEHOLDER_ROWS = 3;

    const { placeholderRowsAbove, placeholderRowsBelow, totalHeight } =
      useMemo(() => {
        // Calculate total height of dynamic rows
        const dynamicRowsHeight = dynamicRows.reduce((sum, row) => {
          const mediaType = row.trackTypes[0];
          return sum + getRowHeight(mediaType);
        }, 0);

        // Calculate how many extra rows we have beyond base (video-0, audio-0)
        const baseRowCount = 2;
        const extraRowsCount = Math.max(0, dynamicRows.length - baseRowCount);
        const remainingPlaceholders = Math.max(
          0,
          MAX_PLACEHOLDER_ROWS - extraRowsCount,
        );

        // Distribute placeholders: 2 above, 1 below (or however many remain)
        const above = Math.min(2, remainingPlaceholders);
        const below = Math.max(0, remainingPlaceholders - 2);

        const placeholderHeight = (above + below) * PLACEHOLDER_ROW_HEIGHT;

        return {
          placeholderRowsAbove: above,
          placeholderRowsBelow: below,
          totalHeight: dynamicRowsHeight + placeholderHeight,
        };
      }, [dynamicRows]);

    const handleTrackSelect = useCallback(
      (trackId: string, multiSelect = false) => {
        const { tracks: allTracks, timeline } = useVideoEditorStore.getState();
        const currentSelectedTrackIds = timeline.selectedTrackIds;
        const selectedTrack = allTracks.find((t) => t.id === trackId);

        const tracksToSelect = [trackId];
        if (selectedTrack?.isLinked && selectedTrack.linkedTrackId) {
          tracksToSelect.push(selectedTrack.linkedTrackId);
          console.log(
            `🔗 Selecting linked track pair: ${trackId} and ${selectedTrack.linkedTrackId}`,
          );
        }

        if (multiSelect) {
          let newSelection = [...currentSelectedTrackIds];

          const isCurrentlySelected = tracksToSelect.some((id) =>
            currentSelectedTrackIds.includes(id),
          );
          if (isCurrentlySelected) {
            newSelection = newSelection.filter(
              (id) => !tracksToSelect.includes(id),
            );
          } else {
            tracksToSelect.forEach((id) => {
              if (!newSelection.includes(id)) {
                newSelection.push(id);
              }
            });
          }
          onTrackSelect(newSelection);
        } else {
          onTrackSelect(tracksToSelect);
        }
      },
      [onTrackSelect],
    );

    const handleSubtitleDialogOpenChange = useCallback((open: boolean) => {
      if (!open) {
        setSubtitleImportConfirmation({
          show: false,
          mediaId: null,
          mediaName: '',
          targetFrame: 0,
          generatedSubtitleIds: [],
        });
      }
    }, []);

    const handleConfirmSubtitleImport = useCallback(
      async (deleteExisting: boolean) => {
        if (!subtitleImportConfirmation.mediaId) {
          handleSubtitleDialogOpenChange(false);
          return;
        }

        const { mediaId, mediaName, targetFrame, generatedSubtitleIds } =
          subtitleImportConfirmation;

        if (deleteExisting) {
          beginGroup?.(`Import Subtitles for ${mediaName}`);
        }

        try {
          if (deleteExisting && generatedSubtitleIds.length > 0) {
            generatedSubtitleIds.forEach((id) => removeTrack(id));
          }

          const latestTracks = (
            useVideoEditorStore.getState() as { tracks: VideoTrack[] }
          ).tracks;
          const subtitleRowIndex = getNextAvailableRowIndex(
            latestTracks,
            'subtitle',
          );

          await addTrackFromMediaLibrary(
            mediaId,
            targetFrame,
            subtitleRowIndex,
          );
        } finally {
          if (deleteExisting) {
            endGroup?.();
          }
          handleSubtitleDialogOpenChange(false);
        }
      },
      [
        subtitleImportConfirmation,
        handleSubtitleDialogOpenChange,
        beginGroup,
        removeTrack,
        addTrackFromMediaLibrary,
        endGroup,
      ],
    );

    const handleSubtitleImportAttempt = useCallback(
      async ({
        mediaId,
        mediaName,
        targetFrame,
      }: {
        mediaId: string;
        mediaName: string;
        targetFrame: number;
        targetRowIndex: number;
      }) => {
        const state = useVideoEditorStore.getState() as {
          tracks: VideoTrack[];
          mediaLibrary?: Array<{ id: string; type?: string; name?: string }>;
        };
        const mediaItem = state.mediaLibrary?.find(
          (item) => item.id === mediaId,
        );

        const isSubtitle =
          mediaItem?.type === 'subtitle' ||
          (mediaItem?.name || '').toLowerCase().endsWith('.srt') ||
          (mediaItem?.name || '').toLowerCase().endsWith('.vtt');

        if (!isSubtitle) {
          return false;
        }

        const generatedSubtitles = (state.tracks as VideoTrack[]).filter(
          (track) =>
            track.type === 'subtitle' && track.subtitleType === 'karaoke',
        );

        if (generatedSubtitles.length === 0) {
          return false;
        }

        setSubtitleImportConfirmation({
          show: true,
          mediaId,
          mediaName,
          targetFrame,
          generatedSubtitleIds: generatedSubtitles.map((t) => t.id),
        });

        return true;
      },
      [],
    );

    const handleTrackMove = useCallback(
      (trackId: string, newStartFrame: number) => {
        const { timeline, playback } = useVideoEditorStore.getState();
        const selectedTrackIds = timeline.selectedTrackIds;
        const dragGhost = playback.dragGhost;

        const tracksBeingDragged =
          dragGhost?.selectedTrackIds || selectedTrackIds;

        if (
          tracksBeingDragged.length > 1 &&
          tracksBeingDragged.includes(trackId)
        ) {
          moveSelectedTracks(trackId, newStartFrame);
        } else {
          moveTrack(trackId, newStartFrame);
        }
      },
      [moveTrack, moveSelectedTracks],
    );

    const handleTrackResize = useCallback(
      (trackId: string, newStartFrame?: number, newEndFrame?: number) => {
        resizeTrack(trackId, newStartFrame, newEndFrame);
      },
      [resizeTrack],
    );

    const handleRowDrop = useCallback(
      async (rowId: string, files: FileList) => {
        const fileArray = Array.from(files);
        const rowDef = dynamicRows.find((row) => row.id === rowId);

        if (!rowDef) return;

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
          await importMediaUnified(
            validFiles,
            'timeline-drop',
            {
              importMediaFromDrop,
              importMediaToTimeline,
              addTrackFromMediaLibrary,
            },
            { addToTimeline: true, showToasts: true },
          );
        }
      },
      [
        importMediaFromDrop,
        importMediaToTimeline,
        addTrackFromMediaLibrary,
        dynamicRows,
      ],
    );

    const handlePlaceholderClick = useCallback(async () => {
      await importMediaFromDialogUnified(
        importMediaFromDialog,
        {
          importMediaFromDrop,
          importMediaToTimeline,
          addTrackFromMediaLibrary,
        },
        { addToTimeline: true, showToasts: true },
      );
    }, [
      importMediaFromDialog,
      importMediaFromDrop,
      importMediaToTimeline,
      addTrackFromMediaLibrary,
    ]);

    // Group tracks by their designated rows
    const tracksByRow = useMemo(() => {
      const grouped: Record<string, VideoTrack[]> = {};

      dynamicRows.forEach((row) => {
        grouped[row.id] = [];
      });

      migratedTracks.forEach((track) => {
        const rowId = getTrackRowId(track);
        if (!grouped[rowId]) {
          grouped[rowId] = [];
        }
        grouped[rowId].push(track);
      });

      dynamicRows.forEach((row) => {
        if (
          row.trackTypes.includes('subtitle') &&
          grouped[row.id] &&
          grouped[row.id].length > 0
        ) {
          grouped[row.id].sort((a, b) => a.startFrame - b.startFrame);
        }
      });

      return grouped;
    }, [migratedTracks, dynamicRows]);

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

    // Filter dynamic rows to only show visible ones
    const visibleRows = dynamicRows.filter((row) => {
      const mediaType = row.trackTypes[0];
      return visibleTrackRows.includes(mediaType);
    });

    const placeholderRowDefsBelow: PlaceholderRowDef[] = useMemo(() => {
      return Array.from({ length: placeholderRowsBelow }, (_, i) => ({
        id: `placeholder-below-${i}`,
        type: 'placeholder' as const,
        position: 'below' as const,
      }));
    }, [placeholderRowsBelow]);

    const [placeholderHoverId, setPlaceholderHoverId] = useState<string | null>(
      null,
    );

    // Global safety net to clear hover highlight if drag ends elsewhere
    useEffect(() => {
      const clearHover = () => setPlaceholderHoverId(null);
      document.addEventListener('drop', clearHover, true);
      document.addEventListener('dragend', clearHover, true);
      document.addEventListener('dragleave', clearHover, true);
      return () => {
        document.removeEventListener('drop', clearHover, true);
        document.removeEventListener('dragend', clearHover, true);
        document.removeEventListener('dragleave', clearHover, true);
      };
    }, []);

    const handlePlaceholderDrop = () => async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPlaceholderHoverId(null);

      const payload = parseMediaDragPayload(e.dataTransfer);
      if (!payload) return;

      const scrollContainer = (e.currentTarget as HTMLElement).closest(
        '.overflow-auto',
      ) as HTMLElement | null;
      const scrollLeft = scrollContainer?.scrollLeft || 0;
      const scrollTop = scrollContainer?.scrollTop || 0;
      const rect =
        scrollContainer?.getBoundingClientRect() ||
        (e.currentTarget as HTMLElement).getBoundingClientRect();

      const cursorX = e.clientX - rect.left + scrollLeft;
      const cursorY = e.clientY - rect.top + scrollTop;

      const targetFrame = Math.max(0, Math.floor(cursorX / frameWidth));

      const rowBounds = calculateRowBoundsWithPlaceholders(
        dynamicRows,
        visibleTrackRows,
        placeholderRowsAbove,
        placeholderRowsBelow,
        PLACEHOLDER_ROW_HEIGHT,
      );

      const insertion = detectInsertionPoint(
        cursorY,
        rowBounds,
        (payload.type as VideoTrack['type']) || 'video',
        tracks,
      );

      let targetRowIndex: number | null = null;
      if (insertion) {
        targetRowIndex =
          insertion.existingRowId &&
          parseRowId(insertion.existingRowId)?.rowIndex !== undefined
            ? parseRowId(insertion.existingRowId)?.rowIndex || null
            : insertion.targetRowIndex;
      }

      if (targetRowIndex === null) {
        const fallbackRow = rowBounds.find(
          (row) =>
            row.type === ((payload.type as VideoTrack['type']) || 'video'),
        );
        targetRowIndex = fallbackRow?.rowIndex ?? 0;
      }

      addTrackFromMediaLibrary(
        payload.mediaId,
        targetFrame,
        targetRowIndex ?? 0,
      ).catch(console.error);
    };

    return (
      <div
        className="relative overflow-visible"
        style={{
          width: timelineWidth,
          minWidth: timelineWidth,
          minHeight: `${totalHeight}px`,
        }}
      >
        <div
          className="relative flex flex-col justify-center"
          style={{
            width: '100%',
            minHeight: `${totalHeight}px`,
          }}
        >
          {/* Placeholder rows above */}
          {Array.from({ length: placeholderRowsAbove }, (_, i) => {
            const id = `placeholder-above-${i}`;
            const isHover = placeholderHoverId === id;
            return (
              <div
                key={id} // Distinct key prevents confusion
                className={cn(
                  'relative h-12 border-l-[3px] border-l-transparent',
                  isHover ? 'bg-secondary/10' : '',
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setPlaceholderHoverId(id);
                }}
                onDragLeave={() => {
                  setPlaceholderHoverId((prev) => (prev === id ? null : prev));
                }}
                onDrop={handlePlaceholderDrop}
              >
                {/* Grid lines - visual only, now a drop zone */}
                <div
                  className="absolute top-0 h-full pointer-events-none"
                  style={{
                    left: 0,
                    width: timelineWidth,
                    background: `repeating-linear-gradient(
                    90deg,
                    transparent,
                    transparent ${frameWidth * 30 - 1}px,
                    hsl(var(--foreground) / 0.03) ${frameWidth * 30 - 1}px,
                    hsl(var(--foreground) / 0.03) ${frameWidth * 30}px
                  )`,
                  }}
                />
              </div>
            );
          })}

          {/* Actual track rows */}
          {visibleRows.map((rowDef) => {
            const isVideoZero = rowDef.id === 'video-0';

            return (
              <div
                key={rowDef.id}
                className={cn(
                  isVideoZero &&
                    'sticky bottom-0 z-30 dark:bg-zinc-900 bg-zinc-100',
                )}
              >
                <TrackRow
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
                  onSubtitleImportAttempt={handleSubtitleImportAttempt}
                  allTracksCount={tracks.length}
                  onPlaceholderClick={memoizedHandlers.onPlaceholderClick}
                  isSplitModeActive={isSplitModeActive}
                  isEmptyTimeline={isEmptyTimeline}
                />
              </div>
            );
          })}

          {/* Placeholder rows below */}
          {placeholderRowDefsBelow.map((placeholder) => {
            const isHover = placeholderHoverId === placeholder.id;
            return (
              <div
                key={placeholder.id}
                className={cn(
                  'relative h-12 border-l-[3px] border-l-transparent',
                  isHover ? 'bg-secondary/10' : '',
                )}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'copy';
                  setPlaceholderHoverId(placeholder.id);
                }}
                onDragLeave={() => {
                  setPlaceholderHoverId((prev) =>
                    prev === placeholder.id ? null : prev,
                  );
                }}
                onDrop={handlePlaceholderDrop}
              >
                {/* Grid lines for placeholder */}
                <div
                  className="absolute top-0 h-full pointer-events-none"
                  style={{
                    left: 0,
                    width: timelineWidth,
                    background: `repeating-linear-gradient(
                    90deg,
                    transparent,
                    transparent ${frameWidth * 30 - 1}px,
                    hsl(var(--foreground) / 0.03) ${frameWidth * 30 - 1}px,
                    hsl(var(--foreground) / 0.03) ${frameWidth * 30}px
                  )`,
                  }}
                />
              </div>
            );
          })}

          <KaraokeConfirmationDialog
            open={subtitleImportConfirmation.show}
            onOpenChange={handleSubtitleDialogOpenChange}
            mediaName={subtitleImportConfirmation.mediaName}
            existingSubtitleCount={
              subtitleImportConfirmation.generatedSubtitleIds.length
            }
            onConfirm={handleConfirmSubtitleImport}
            mode="import"
          />
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
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
          track.previewUrl === nextTrack.previewUrl &&
          track.trackRowIndex === nextTrack.trackRowIndex
        );
      }) &&
      prevProps.frameWidth === nextProps.frameWidth &&
      prevProps.timelineWidth === nextProps.timelineWidth &&
      prevProps.scrollX === nextProps.scrollX &&
      prevProps.zoomLevel === nextProps.zoomLevel &&
      JSON.stringify(prevProps.selectedTrackIds) ===
        JSON.stringify(nextProps.selectedTrackIds) &&
      prevProps.isSplitModeActive === nextProps.isSplitModeActive
    );
  },
);
