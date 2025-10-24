import { cn } from '@/frontend/utils/utils';
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
import { ImageTrackStrip } from './imageTrackStrip';
import {
  getRowHeightClasses,
  getTrackItemHeight,
  getTrackItemHeightClasses,
} from './utils/timelineConstants';
import { VideoSpriteSheetStrip } from './videoSpriteSheetStrip';

// Define track row types - easy to extend in the future

// Drag activation threshold in pixels - prevents accidental drags during clicks
const DRAG_ACTIVATION_THRESHOLD = 5;

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
    id: 'text',
    name: 'Text',
    trackTypes: ['text'],
    color: '#3498db',
    icon: '🔤',
  },
  {
    id: 'subtitle',
    name: 'Subtitles',
    trackTypes: ['subtitle'],
    color: '#9b59b6',
    icon: '💬',
  },
  {
    id: 'image',
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

    // Check if this track is being dragged (has active drag ghost)
    const dragGhost = useVideoEditorStore((state) => state.playback.dragGhost);

    // Check if this track is in the current drag selection
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

    // Determine cursor based on state priority
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
          // Hide the original track completely when drag ghost is active
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
    const dragThresholdMetRef = useRef(false); // Track if drag threshold has been exceeded
    const dragOffsetRef = useRef({ offsetX: 0, offsetY: 0 }); // Store offset at mouseDown

    // Subscribe to duplication feedback state
    const isDuplicationFeedback = useVideoEditorStore((state) =>
      state.duplicationFeedbackTrackIds.has(track.id),
    );

    // Check if this track is in the current drag selection (for hiding resize handles)
    const dragGhostForHandles = useVideoEditorStore(
      (state) => state.playback.dragGhost,
    );
    const isThisOrLinkedTrackBeingDragged =
      dragGhostForHandles?.isActive &&
      dragGhostForHandles.selectedTrackIds &&
      dragGhostForHandles.selectedTrackIds.includes(track.id);

    // Apply global cursor override during resize/drag to prevent flickering
    useEffect(() => {
      if (isResizing) {
        // Apply the custom trim cursor using the same SVG from global.css
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
        // Use Shift for multi-select (toggle), without modifier = replace selection
        onSelect(e.shiftKey);
      },
      [isSplitModeActive, onSelect],
    );

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (track.locked || isSplitModeActive || e.button === 2) return;
        e.stopPropagation();

        // Don't call onSelect here - let handleClick handle selection
        // We'll auto-select during actual drag movement if needed

        const { startDraggingTrack } = useVideoEditorStore.getState();
        startDraggingTrack(track.startFrame); // Pass initial frame for force drag tracking

        // Calculate and store offset from track's left edge to cursor
        const trackElement = e.currentTarget as HTMLElement;
        const trackRect = trackElement.getBoundingClientRect();
        dragOffsetRef.current = {
          offsetX: e.clientX - trackRect.left,
          offsetY: e.clientY - trackRect.top,
        };

        // Store initial drag state but DON'T activate drag ghost yet
        // Wait for movement threshold to be exceeded
        setIsDragging(true);
        setDragStart({
          x: e.clientX,
          y: e.clientY,
          startFrame: track.startFrame,
          endFrame: track.endFrame,
        });

        // Reset threshold tracking
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

        // If the track is not selected, select it first before resizing
        // Resizing doesn't conflict with click events, so it's safe to auto-select here
        if (!isSelected) {
          // If Shift is held, add to selection; otherwise replace selection
          onSelect(e.shiftKey);
        }

        const { startDraggingTrack } = useVideoEditorStore.getState();
        startDraggingTrack(track.startFrame); // Pass initial frame for tracking

        // DON'T initialize drag ghost for resize operations
        // Resizing should not show drop zones

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

    // Helper to find magnetic snap points when Shift is held
    // Searches across ALL tracks for nearest edge and considers BOTH edges of moving clip
    const findMagneticSnapPoint = useCallback(
      (
        newStartFrame: number,
        newEndFrame: number,
        currentSnapFrame: number | null,
      ): { snapFrame: number; delta: number } | null => {
        const { tracks: allTracks, timeline } = useVideoEditorStore.getState();
        const SNAP_THRESHOLD = 8; // Tighter threshold for more precise snapping
        const MIN_DISTANCE = 1; // Minimum distance to trigger snap (prevents false positives at 0)
        const HYSTERESIS = 2; // Extra buffer to prevent flickering when already snapped

        // Get all selected track IDs (to exclude from snap candidates)
        const selectedTrackIds = timeline.selectedTrackIds;

        // Collect all edges from ALL tracks (multi-track aware)
        // Exclude: self, linked track, and any selected tracks (for multi-select)
        const candidateEdges: Array<{
          frame: number;
          trackId: string;
          isStart: boolean;
        }> = [];

        allTracks.forEach((t) => {
          // Skip the current track being dragged
          if (t.id === track.id) return;
          // Skip linked track to current track
          if (t.id === track.linkedTrackId) return;
          // Skip any other selected tracks (for multi-select drag)
          if (selectedTrackIds.includes(t.id)) return;

          // Validate that this is a real track with valid frame range
          if (
            typeof t.startFrame !== 'number' ||
            typeof t.endFrame !== 'number' ||
            t.startFrame < 0 ||
            t.endFrame <= t.startFrame
          ) {
            return; // Skip invalid tracks
          }

          // Add both start and end edges as snap candidates with metadata
          candidateEdges.push(
            { frame: t.startFrame, trackId: t.id, isStart: true },
            { frame: t.endFrame, trackId: t.id, isStart: false },
          );
        });

        // No candidates means no valid snap targets (empty timeline area)
        if (candidateEdges.length === 0) {
          return null;
        }

        // Apply hysteresis: if we're already snapped, give extra buffer before releasing
        const effectiveThreshold =
          currentSnapFrame !== null
            ? SNAP_THRESHOLD + HYSTERESIS
            : SNAP_THRESHOLD;

        // Check both start and end edges of the moving clip
        let bestSnap: {
          snapFrame: number;
          delta: number;
          distance: number;
        } | null = null;

        // Check start edge of moving clip against all candidates
        candidateEdges.forEach(({ frame }) => {
          const distance = Math.abs(frame - newStartFrame);
          // Only snap if within threshold AND not too close (prevents jitter)
          if (distance >= MIN_DISTANCE && distance <= effectiveThreshold) {
            const delta = frame - newStartFrame;
            if (!bestSnap || distance < bestSnap.distance) {
              bestSnap = { snapFrame: frame, delta, distance };
            }
          }
        });

        // Check end edge of moving clip against all candidates
        candidateEdges.forEach(({ frame }) => {
          const distance = Math.abs(frame - newEndFrame);
          // Only snap if within threshold AND not too close (prevents jitter)
          if (distance >= MIN_DISTANCE && distance <= effectiveThreshold) {
            const delta = frame - newEndFrame;
            if (!bestSnap || distance < bestSnap.distance) {
              bestSnap = { snapFrame: frame, delta, distance };
            }
          }
        });

        // Additional validation: Ensure snap target is not at timeline boundaries
        // unless we're actually near a real clip
        if (bestSnap) {
          const isSnapToZero = bestSnap.snapFrame === 0;
          const hasClipAtZero = candidateEdges.some(
            (edge) => edge.frame === 0 && edge.isStart,
          );

          // If snapping to 0, make sure there's actually a clip starting at 0
          if (isSnapToZero && !hasClipAtZero) {
            return null;
          }

          return { snapFrame: bestSnap.snapFrame, delta: bestSnap.delta };
        }

        return null;
      },
      [track.id, track.linkedTrackId],
    );

    // Throttled mouse move handler using RAF
    const handleMouseMove = useCallback(
      (e: MouseEvent) => {
        if (!isResizing && !isDragging) return;

        // Check if drag threshold has been met (only for dragging, not resizing)
        if (isDragging && !dragThresholdMetRef.current) {
          const deltaX = Math.abs(e.clientX - dragStart.x);
          const deltaY = Math.abs(e.clientY - dragStart.y);
          const totalMovement = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

          if (totalMovement >= DRAG_ACTIVATION_THRESHOLD) {
            // Threshold exceeded - activate drag ghost now
            dragThresholdMetRef.current = true;

            const { setDragGhost, timeline } = useVideoEditorStore.getState();

            // Check if this is a multi-selection drag
            const selectedTrackIds = timeline.selectedTrackIds;
            const isMultiSelectionDrag =
              selectedTrackIds.length > 1 &&
              selectedTrackIds.includes(track.id);

            // Get all selected tracks (including linked tracks)
            const allSelectedTrackIds = isMultiSelectionDrag
              ? [...selectedTrackIds]
              : [track.id];

            // Add linked track if not already in selection
            if (track.isLinked && track.linkedTrackId) {
              if (!allSelectedTrackIds.includes(track.linkedTrackId)) {
                allSelectedTrackIds.push(track.linkedTrackId);
              }
            }

            // Multi-selection detection (for UI/UX purposes)
            const isMultiSelection = allSelectedTrackIds.length > 1;

            // Calculate target frame based on current mouse position
            const deltaX = e.clientX - dragStart.x;
            const deltaFrames = Math.round(deltaX / frameWidth);
            const targetFrame = Math.max(0, dragStart.startFrame + deltaFrames);

            // Initialize drag ghost with stored offset from mouseDown
            setDragGhost({
              isActive: true,
              trackId: track.id,
              selectedTrackIds: allSelectedTrackIds,
              mouseX: e.clientX,
              mouseY: e.clientY,
              offsetX: dragOffsetRef.current.offsetX,
              offsetY: dragOffsetRef.current.offsetY,
              targetRow: track.type,
              targetFrame, // Use calculated target frame, not original position
              isMultiSelection,
            });
          } else {
            // Threshold not met yet - don't process drag movement
            return;
          }
        }

        // Auto-select unselected track on first actual drag movement
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

            // Check if snapping should be active (either Shift held OR snapEnabled toggle)
            const { timeline } = useVideoEditorStore.getState();
            const shouldSnap = e.shiftKey || timeline.snapEnabled;

            if (shouldSnap) {
              // Use unified magnetic snap logic
              const currentSnap =
                useVideoEditorStore.getState().playback.magneticSnapFrame;
              const duration = dragStart.endFrame - dragStart.startFrame;
              const newEndFrame = newStartFrame + duration;
              const snapResult = findMagneticSnapPoint(
                newStartFrame,
                newEndFrame,
                currentSnap,
              );

              if (snapResult !== null) {
                // Apply snap only if it keeps the clip valid
                const snappedStart = newStartFrame + snapResult.delta;
                if (snappedStart >= 0 && snappedStart < dragStart.endFrame) {
                  newStartFrame = snappedStart;
                  useVideoEditorStore
                    .getState()
                    .setMagneticSnapFrame(snapResult.snapFrame);
                } else {
                  useVideoEditorStore.getState().setMagneticSnapFrame(null);
                }
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

            // Check if snapping should be active (either Shift held OR snapEnabled toggle)
            const { timeline } = useVideoEditorStore.getState();
            const shouldSnap = e.shiftKey || timeline.snapEnabled;

            if (shouldSnap) {
              // Use unified magnetic snap logic
              const currentSnap =
                useVideoEditorStore.getState().playback.magneticSnapFrame;
              const duration = dragStart.endFrame - dragStart.startFrame;
              const newStartFrame = newEndFrame - duration;
              const snapResult = findMagneticSnapPoint(
                newStartFrame,
                newEndFrame,
                currentSnap,
              );

              if (snapResult !== null) {
                // Apply snap only if it keeps the clip valid
                const snappedEnd = newEndFrame + snapResult.delta;
                if (snappedEnd > dragStart.startFrame) {
                  newEndFrame = snappedEnd;
                  useVideoEditorStore
                    .getState()
                    .setMagneticSnapFrame(snapResult.snapFrame);
                } else {
                  useVideoEditorStore.getState().setMagneticSnapFrame(null);
                }
              } else {
                useVideoEditorStore.getState().setMagneticSnapFrame(null);
              }
            } else {
              useVideoEditorStore.getState().setMagneticSnapFrame(null);
            }

            onResize(undefined, newEndFrame);
          } else if (isDragging && dragThresholdMetRef.current) {
            // Only process drag movement after threshold is met
            let newStartFrame = Math.max(0, dragStart.startFrame + deltaFrames);
            const duration = dragStart.endFrame - dragStart.startFrame;
            const newEndFrame = newStartFrame + duration;

            // Check if snapping should be active (either Shift held OR snapEnabled toggle)
            const { timeline, updateDragGhostPosition } =
              useVideoEditorStore.getState();
            const shouldSnap = e.shiftKey || timeline.snapEnabled;

            if (shouldSnap) {
              // Use unified magnetic snap logic for both modes
              const currentSnap =
                useVideoEditorStore.getState().playback.magneticSnapFrame;
              const snapResult = findMagneticSnapPoint(
                newStartFrame,
                newEndFrame,
                currentSnap,
              );

              if (snapResult !== null) {
                // Apply the delta to move the entire clip
                newStartFrame = newStartFrame + snapResult.delta;
                // Ensure we don't go below 0
                if (newStartFrame >= 0) {
                  useVideoEditorStore
                    .getState()
                    .setMagneticSnapFrame(snapResult.snapFrame);
                } else {
                  newStartFrame = 0;
                  useVideoEditorStore.getState().setMagneticSnapFrame(null);
                }
              } else {
                useVideoEditorStore.getState().setMagneticSnapFrame(null);
              }
            } else {
              // Clear snap indicator when snapping is disabled
              useVideoEditorStore.getState().setMagneticSnapFrame(null);
            }

            // Update drag ghost position with target row detection
            // For now, keep it in the same row (cross-row will be added in Timeline component)
            updateDragGhostPosition(
              e.clientX,
              e.clientY,
              track.type,
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
        findMagneticSnapPoint,
        track.id,
        track.type,
        track.linkedTrackId,
        track.isLinked,
        track.startFrame,
      ],
    );

    const handleMouseUp = useCallback(() => {
      const { endDraggingTrack, clearDragGhost } =
        useVideoEditorStore.getState();
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
    }, []);

    useEffect(() => {
      if (isResizing || isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        // Also listen for mouseleave on window to handle edge cases
        window.addEventListener('blur', handleMouseUp);
        return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          window.removeEventListener('blur', handleMouseUp);
        };
      }
    }, [isResizing, isDragging, handleMouseMove, handleMouseUp]);

    // Cleanup on unmount to ensure state is reset
    useEffect(() => {
      return () => {
        // Always try to cleanup on unmount, check store state directly
        const { playback, endDraggingTrack } = useVideoEditorStore.getState();
        if (playback.isDraggingTrack) {
          endDraggingTrack();
        }
      };
    }, []);

    // Render appropriate content based on track type
    const trackContent = useMemo(() => {
      // Get the dynamic content height based on track type
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

      // Text content for other track types (text, subtitle)
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

        {/* Resize handles - smaller and dynamically sized based on track type */}
        {!track.locked &&
          isSelected &&
          !isSplitModeActive &&
          !isDragging &&
          !isThisOrLinkedTrackBeingDragged && (
            <>
              <div
                className={cn(
                  'absolute top-1/2 -translate-y-1/2 w-1.5 cursor-trim z-20 rounded-r flex items-center justify-center',
                  // Smaller resize handles based on track type
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
                  // Smaller resize handles based on track type
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
    // Optimized comparison - only check what matters for visual changes
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
        className={cn(
          'relative border-l-[3px]',
          getRowHeightClasses(rowDef.id),
          isDragOver
            ? 'bg-secondary/10 border-l-secondary'
            : 'bg-transparent border-l-transparent',
        )}
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

        {/* Tracks in this row - centered vertically */}
        <div className="h-full flex items-center">
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
        {allTracksCount === 0 && rowDef.id === 'video' && (
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
      prevProps.allTracksCount === nextProps.allTracksCount &&
      prevProps.isSplitModeActive === nextProps.isSplitModeActive
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
      moveSelectedTracks,
      resizeTrack,
      importMediaFromFiles,
      importMediaFromDialog,
    } = useVideoEditorStore();

    // Subscribe to visible track rows from timeline state with fallback
    const visibleTrackRows = useVideoEditorStore(
      (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
    );

    const handleTrackSelect = useCallback(
      (trackId: string, multiSelect = false) => {
        // Always get current state fresh from the store to avoid stale closures
        const { tracks: allTracks, timeline } = useVideoEditorStore.getState();
        const currentSelectedTrackIds = timeline.selectedTrackIds;
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
          // Handle multi-select with linked tracks - use fresh state
          let newSelection = [...currentSelectedTrackIds];

          const isCurrentlySelected = tracksToSelect.some((id) =>
            currentSelectedTrackIds.includes(id),
          );
          if (isCurrentlySelected) {
            // Remove both tracks from selection (toggle off)
            newSelection = newSelection.filter(
              (id) => !tracksToSelect.includes(id),
            );
          } else {
            // Add both tracks to selection (toggle on)
            tracksToSelect.forEach((id) => {
              if (!newSelection.includes(id)) {
                newSelection.push(id);
              }
            });
          }
          onTrackSelect(newSelection);
        } else {
          // Single select - select only these tracks, deselect all others
          onTrackSelect(tracksToSelect);
        }
      },
      [onTrackSelect],
    );

    const handleTrackMove = useCallback(
      (trackId: string, newStartFrame: number) => {
        // Check if multiple tracks are selected OR if we're dragging multiple tracks
        const { timeline, playback } = useVideoEditorStore.getState();
        const selectedTrackIds = timeline.selectedTrackIds;
        const dragGhost = playback.dragGhost;

        // Use drag ghost's selectedTrackIds if available (includes linked tracks)
        const tracksBeingDragged =
          dragGhost?.selectedTrackIds || selectedTrackIds;

        // If multiple tracks are being dragged, use multi-track move logic
        if (
          tracksBeingDragged.length > 1 &&
          tracksBeingDragged.includes(trackId)
        ) {
          moveSelectedTracks(trackId, newStartFrame);
        } else {
          // Single track movement
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

    // Filter track rows to only show visible ones
    const visibleRows = TRACK_ROWS.filter((row) =>
      visibleTrackRows.includes(row.id),
    );

    return (
      <div
        className="relative min-h-full overflow-visible"
        style={{
          width: timelineWidth,
          minWidth: timelineWidth,
        }}
      >
        {/* Render only visible track rows */}
        {visibleRows.map((rowDef) => (
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
