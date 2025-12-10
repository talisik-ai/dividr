/* eslint-disable @typescript-eslint/no-explicit-any */
import { cn } from '@/frontend/utils/utils';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { KaraokeConfirmationDialog } from '../components/dialogs/karaokeConfirmationDialog';
import { useTrackDragRecording } from '../stores/videoEditor/hooks/useTrackDragRecording';
import { useUndoRedoShortcuts } from '../stores/videoEditor/hooks/useUndoRedoShortcuts';
import {
  useGlobalShortcuts,
  useTimelineShortcutsV2,
  useTrackShortcuts,
  useVideoEditorStore,
  VideoTrack,
} from '../stores/videoEditor/index';
import { getDisplayFps } from '../stores/videoEditor/types/timeline.types';
import { DragGhost } from './dragGhost';
import { DropZoneIndicator } from './dropZoneIndicator';
import { useAutoScroll } from './hooks/useAutoScroll';
import { InsertionLineIndicator } from './insertionLineIndicator';
import { TimelineControls } from './timelineControls';
import { TimelinePlayhead } from './timelinePlayhead';
import { TimelineRuler } from './timelineRuler';
import { TimelineTrackControllers } from './timelineTrackControllers';
import { TimelineTracks } from './timelineTracks';
import {
  findNearestAvailablePositionInRowWithPlayhead,
  hasCollision,
} from './utils/collisionDetection';
import {
  calculatePlaceholderRows,
  calculateRowBoundsWithPlaceholders,
  detectInsertionPoint,
  generateDynamicRows,
  getNextAvailableRowIndex,
  getTrackRowId,
  migrateTracksWithRowIndex,
  parseRowId,
  TrackRowDefinition,
} from './utils/dynamicTrackRows';
import { buildInteractionRowBounds } from './utils/rowFiltering';
import {
  calculateFrameFromPosition,
  handleTimelineMouseDown as centralizedHandleMouseDown,
  ClickInfo,
  findTrackAtPosition,
  isContextMenuClick,
  TimelineInteractionHandlers,
} from './utils/timelineInteractionHandlers';
import { getTrackRowHeight, getTrackRowTop } from './utils/trackRowPositions';

interface TimelineProps {
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = React.memo(
  ({ className }) => {
    const timelineRef = useRef<HTMLDivElement>(null);
    const controllersScrollRef = useRef<HTMLDivElement>(null);
    const tracksRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const autoFollowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const playbackIntervalRef = useRef<number | null>(null);
    const lastFrameUpdateRef = useRef<number>(0);
    const isManualScrollingRef = useRef<boolean>(false);
    const marqueeStartRef = useRef<{
      x: number;
      y: number;
      hasMoved: boolean;
    } | null>(null);
    const lastClickTimeRef = useRef<number>(0);
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const lastValidTargetRef = useRef<{
      rowId: string;
      rowIndex: number;
      frame: number;
    } | null>(null);

    const [, setDropActive] = useState(false);
    const [scrollbarHeight, setScrollbarHeight] = useState(0);
    const [autoFollowEnabled, setAutoFollowEnabled] = useState(true);
    const [autoScrollMousePos, setAutoScrollMousePos] = useState<{
      x: number;
      y: number;
    } | null>(null);
    const [marqueeAutoScrollMousePos, setMarqueeAutoScrollMousePos] = useState<{
      x: number;
      y: number;
    } | null>(null);
    const [splitIndicatorPosition, setSplitIndicatorPosition] = useState<
      number | null
    >(null);
    const [hoveredTrack, setHoveredTrack] = useState<VideoTrack | null>(null);
    const [hoveredTrackRow, setHoveredTrackRow] = useState<string | null>(null);
    const [, setVerticalScrollY] = useState(0);
    const [linkedTrackIndicators, setLinkedTrackIndicators] = useState<
      Array<{ trackType: string; position: number }>
    >([]);
    const [marqueeSelection, setMarqueeSelection] = useState<{
      isActive: boolean;
      startX: number;
      startY: number;
      currentX: number;
      currentY: number;
    } | null>(null);
    const [insertionPoint, setInsertionPoint] = useState<{
      yPosition: number;
      isValid: boolean;
      targetRowIndex: number;
      trackType: VideoTrack['type'];
    } | null>(null);

    // Selectively subscribe to store to prevent unnecessary re-renders
    const timeline = useVideoEditorStore((state) => state.timeline);
    const tracks = useVideoEditorStore((state) => state.tracks);
    const playback = useVideoEditorStore((state) => state.playback);
    const visibleTrackRows = useVideoEditorStore(
      (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
    );
    const dragGhost = useVideoEditorStore((state) => state.playback.dragGhost);

    // Generate dynamic rows for vertical drag detection
    const migratedTracks = useMemo(
      () => migrateTracksWithRowIndex(tracks),
      [tracks],
    );
    const dynamicRows = useMemo(
      () => generateDynamicRows(migratedTracks),
      [migratedTracks],
    );
    const setCurrentFrame = useVideoEditorStore(
      (state) => state.setCurrentFrame,
    );
    const setScrollX = useVideoEditorStore((state) => state.setScrollX);
    const setZoom = useVideoEditorStore((state) => state.setZoom);
    const pause = useVideoEditorStore((state) => state.pause);
    const setSelectedTracks = useVideoEditorStore(
      (state) => state.setSelectedTracks,
    );
    const removeSelectedTracks = useVideoEditorStore(
      (state) => state.removeSelectedTracks,
    );
    const isSplitModeActive = useVideoEditorStore(
      (state) => state.timeline.isSplitModeActive,
    );
    const splitAtPosition = useVideoEditorStore(
      (state) => state.splitAtPosition,
    );
    const addTrackFromMediaLibrary = useVideoEditorStore(
      (state) => state.addTrackFromMediaLibrary,
    );
    const beginGroup = useVideoEditorStore((state) => state.beginGroup);
    const endGroup = useVideoEditorStore((state) => state.endGroup);
    const removeTrack = useVideoEditorStore((state) => state.removeTrack);
    const mediaLibrary = useVideoEditorStore((state) => state.mediaLibrary);
    const startDraggingPlayhead = useVideoEditorStore(
      (state) => state.startDraggingPlayhead,
    );
    const endDraggingPlayhead = useVideoEditorStore(
      (state) => state.endDraggingPlayhead,
    );
    const isDraggingPlayhead = useVideoEditorStore(
      (state) => state.playback.isDraggingPlayhead,
    );
    const updateDragGhostPosition = useVideoEditorStore(
      (state) => state.updateDragGhostPosition,
    );
    const magneticSnapFrame = useVideoEditorStore(
      (state) => state.playback.magneticSnapFrame,
    );
    // Calculate effective timeline duration based on actual track content - memoized
    const effectiveEndFrame = useMemo(() => {
      // When tracks exist, use the maximum track end frame
      // Only use totalFrames as fallback when no tracks exist
      return tracks.length > 0
        ? Math.max(...tracks.map((track) => track.endFrame))
        : timeline.totalFrames;
    }, [tracks, timeline.totalFrames]);

    const parseMediaDropPayload = useCallback((dataTransfer: DataTransfer) => {
      const jsonPayload = dataTransfer.getData('application/json');
      if (jsonPayload) {
        try {
          const parsed = JSON.parse(jsonPayload);
          if (parsed?.mediaId) {
            return parsed as {
              mediaId: string;
              type?: VideoTrack['type'];
              duration?: number;
              mimeType?: string;
              thumbnail?: string;
              waveform?: string;
            };
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
    }, []);

    // Drop handlers for media from library
    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropActive(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      // Only set dropActive to false if we're actually leaving the timeline area
      if (!timelineRef.current?.contains(e.relatedTarget as Node)) {
        setDropActive(false);
      }
    }, []);

    const dynamicRowsWithPlaceholders = useMemo(() => {
      const MAX_PLACEHOLDER_ROWS = 3;

      // Calculate placeholder counts (same logic as timelineTracks.tsx)
      const baseRowCount = 2;
      const extraRowsCount = Math.max(0, dynamicRows.length - baseRowCount);
      const remainingPlaceholders = Math.max(
        0,
        MAX_PLACEHOLDER_ROWS - extraRowsCount,
      );

      const placeholderRowsAbove = Math.min(2, remainingPlaceholders);
      const placeholderRowsBelow = Math.max(0, remainingPlaceholders - 2);

      const completeRows: TrackRowDefinition[] = [];

      // Add placeholder rows above
      for (let i = 0; i < placeholderRowsAbove; i++) {
        completeRows.push({
          id: `placeholder-above-${i}`,
          name: '',
          trackTypes: [],
          color: '',
          icon: '',
        });
      }

      // Add real dynamic rows
      completeRows.push(...dynamicRows);

      // Add placeholder rows below
      for (let i = 0; i < placeholderRowsBelow; i++) {
        completeRows.push({
          id: `placeholder-below-${i}`,
          name: '',
          trackTypes: [],
          color: '',
          icon: '',
        });
      }

      return completeRows;
    }, [dynamicRows]);

    // Animation loop for playback
    useEffect(() => {
      if (!playback.isPlaying) {
        if (playbackIntervalRef.current) {
          cancelAnimationFrame(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        return;
      }

      const startTime = performance.now();
      const startFrame = lastFrameUpdateRef.current;

      // Use RAF for smooth playback that matches video timing
      const animate = () => {
        if (!playback.isPlaying) return;

        const displayFps = getDisplayFps(tracks);
        const elapsed = (performance.now() - startTime) / 1000; // elapsed seconds
        const frameAdvance = elapsed * displayFps * playback.playbackRate;
        const targetFrame = Math.floor(startFrame + frameAdvance);

        // Linear playback - respect gaps like Premiere Pro
        // No gap skipping - playhead moves continuously through the entire timeline

        if (targetFrame >= effectiveEndFrame) {
          const finalFrame = playback.isLooping
            ? 0
            : Math.max(0, effectiveEndFrame - 1);
          lastFrameUpdateRef.current = finalFrame;
          setCurrentFrame(finalFrame);

          if (playback.isLooping) {
            // Restart the animation from frame 0
            playbackIntervalRef.current = requestAnimationFrame(() => {
              const newStartTime = performance.now();
              const newAnimate = () => {
                if (!playback.isPlaying) return;

                const displayFps = getDisplayFps(tracks);
                const newElapsed = (performance.now() - newStartTime) / 1000;
                const newFrameAdvance =
                  newElapsed * displayFps * playback.playbackRate;
                const newTargetFrame = Math.floor(newFrameAdvance);

                if (newTargetFrame < effectiveEndFrame) {
                  const clampedFrame = Math.max(
                    0,
                    Math.min(newTargetFrame, effectiveEndFrame - 1),
                  );
                  lastFrameUpdateRef.current = clampedFrame;
                  setCurrentFrame(clampedFrame);
                  playbackIntervalRef.current =
                    requestAnimationFrame(newAnimate);
                }
              };
              newAnimate();
            });
          } else {
            // Not looping - stop playback when reaching end
            pause();
          }
        } else {
          const clampedFrame = Math.max(
            0,
            Math.min(targetFrame, effectiveEndFrame - 1),
          );
          lastFrameUpdateRef.current = clampedFrame;
          setCurrentFrame(clampedFrame);
          playbackIntervalRef.current = requestAnimationFrame(animate);
        }
      };

      playbackIntervalRef.current = requestAnimationFrame(animate);

      return () => {
        if (playbackIntervalRef.current) {
          cancelAnimationFrame(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      };
    }, [
      playback.isPlaying,
      playback.isLooping,
      playback.playbackRate,
      effectiveEndFrame,
      setCurrentFrame,
      tracks,
    ]);

    // Sync lastFrameUpdateRef with actual currentFrame changes
    useEffect(() => {
      lastFrameUpdateRef.current = timeline.currentFrame;
    }, [timeline.currentFrame]);

    // Centralized keyboard shortcuts
    const { ConfirmationDialog } = useGlobalShortcuts();
    useTimelineShortcutsV2();
    useTrackShortcuts();
    useUndoRedoShortcuts();

    // Record state when track drag operations complete
    useTrackDragRecording();

    // Auto-scroll for track drag operations
    useAutoScroll({
      enabled: !!dragGhost?.isActive,
      mouseX: autoScrollMousePos?.x || 0,
      mouseY: autoScrollMousePos?.y || 0,
      scrollElement: tracksRef.current,
      threshold: 80,
      verticalThreshold: 100,
      speed: 1.2,
      enableHorizontal: true,
      enableVertical: true,
      onScroll: (newScrollX, newScrollY) => {
        setScrollX(newScrollX);
        setVerticalScrollY(newScrollY);
      },
    });

    // Auto-scroll for marquee selection
    useAutoScroll({
      enabled: !!marqueeSelection?.isActive,
      mouseX: marqueeAutoScrollMousePos?.x || 0,
      mouseY: marqueeAutoScrollMousePos?.y || 0,
      scrollElement: tracksRef.current,
      threshold: 20, // Smaller threshold for marquee (more responsive)
      verticalThreshold: 20,
      speed: 1.0,
      enableHorizontal: true,
      enableVertical: true,
      onScroll: (newScrollX, newScrollY) => {
        setScrollX(newScrollX);
        setVerticalScrollY(newScrollY);
      },
    });

    // Global keyboard event listener as fallback for Delete/Backspace
    // This ensures delete works even when react-hotkeys-hook might not catch it
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Check if user is editing text in an input, textarea, or contenteditable element
        const target = e.target as HTMLElement;
        const isEditingText =
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"]');

        // Only trigger delete if not editing text
        if (!isEditingText && (e.key === 'Delete' || e.key === 'Backspace')) {
          e.preventDefault();
          removeSelectedTracks();
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [timeline.selectedTrackIds, removeSelectedTracks]);

    // Cleanup timeouts and intervals on unmount
    useEffect(() => {
      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        if (autoFollowTimeoutRef.current) {
          clearTimeout(autoFollowTimeoutRef.current);
        }
        if (clickTimeoutRef.current) {
          clearTimeout(clickTimeoutRef.current);
        }
        if (playbackIntervalRef.current) {
          cancelAnimationFrame(playbackIntervalRef.current);
        }
      };
    }, []);

    // Global safety net: Reset drag state if user releases mouse anywhere
    // Use bubble phase (NOT capture) to ensure this runs AFTER child handlers
    useEffect(() => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const handleGlobalMouseUp = (e: MouseEvent) => {
        setTimeout(() => {
          const {
            playback,
            endDraggingTrack,
            clearDragGhost,
            tracks,
            moveTrackToRow,
          } = useVideoEditorStore.getState();

          if (playback.isDraggingTrack || playback.dragGhost?.isActive) {
            const dragGhost = playback.dragGhost;

            // If we have a valid drop target, apply the move with collision detection
            if (
              dragGhost &&
              dragGhost.targetRow &&
              dragGhost.targetFrame !== null
            ) {
              const targetRowParsed = parseRowId(dragGhost.targetRow);
              const primaryTrack = tracks.find(
                (t: VideoTrack) => t.id === dragGhost.trackId,
              );

              if (primaryTrack && targetRowParsed) {
                const duration =
                  primaryTrack.endFrame - primaryTrack.startFrame;
                const excludeIds = dragGhost.selectedTrackIds || [
                  dragGhost.trackId,
                ];

                // Check for collision at drop position
                const wouldCollide = hasCollision(
                  dragGhost.targetFrame,
                  dragGhost.targetFrame + duration,
                  primaryTrack.type,
                  targetRowParsed.rowIndex,
                  tracks,
                  { excludeTrackIds: excludeIds },
                );

                let finalStartFrame = dragGhost.targetFrame;

                if (wouldCollide) {
                  // Find nearest available position
                  finalStartFrame =
                    findNearestAvailablePositionInRowWithPlayhead(
                      dragGhost.targetFrame,
                      duration,
                      primaryTrack.type,
                      targetRowParsed.rowIndex,
                      tracks,
                      excludeIds,
                    );
                }

                // Apply the move
                moveTrackToRow(
                  dragGhost.trackId,
                  targetRowParsed.rowIndex,
                  finalStartFrame,
                );
              }
            }

            endDraggingTrack(true);
            clearDragGhost();
            setAutoScrollMousePos(null);
            setInsertionPoint(null);
            lastValidTargetRef.current = null;
          }
        }, 0);
      };

      const handleGlobalMouseLeave = (e: MouseEvent) => {
        // Only trigger if we're actually leaving the window
        if (
          e.clientY <= 0 ||
          e.clientX <= 0 ||
          e.clientX >= window.innerWidth ||
          e.clientY >= window.innerHeight
        ) {
          handleGlobalMouseUp(e);
        }
      };

      // Listen on document AND window for maximum coverage
      // Use bubble phase (false) to run AFTER child handlers
      document.addEventListener('mouseup', handleGlobalMouseUp, false);
      window.addEventListener('mouseup', handleGlobalMouseUp, false);
      document.addEventListener('mouseleave', handleGlobalMouseLeave);

      return () => {
        document.removeEventListener('mouseup', handleGlobalMouseUp, false);
        window.removeEventListener('mouseup', handleGlobalMouseUp, false);
        document.removeEventListener('mouseleave', handleGlobalMouseLeave);
      };
    }, []);

    // Handle wheel zoom
    const handleWheel = useCallback(
      (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
          // Allow zoom from 0.01 (very zoomed out) to 10 (very zoomed in)
          setZoom(Math.max(0.01, Math.min(timeline.zoom * zoomFactor, 10)));
        } else {
          // Horizontal scroll - let the native scroll handle this
          // The onScroll event will update the store
          e.stopPropagation();
        }
      },
      [timeline.zoom, setZoom],
    );

    useEffect(() => {
      const timelineElement = timelineRef.current;
      if (timelineElement) {
        timelineElement.addEventListener('wheel', handleWheel, {
          passive: false,
        });
        return () => timelineElement.removeEventListener('wheel', handleWheel);
      }
    }, [handleWheel]);

    // Sync scrollX state with actual scroll position
    useEffect(() => {
      const tracksElement = tracksRef.current;
      if (
        tracksElement &&
        Math.abs(tracksElement.scrollLeft - timeline.scrollX) > 1 &&
        !isManualScrollingRef.current
      ) {
        tracksElement.scrollLeft = timeline.scrollX;
      }
    }, [timeline.scrollX]);

    useEffect(() => {
      const tracksElement = tracksRef.current;
      const controllersElement = controllersScrollRef.current;

      if (!tracksElement || !controllersElement) return;

      const handleTracksScroll = () => {
        controllersElement.scrollTop = tracksElement.scrollTop;
      };

      tracksElement.addEventListener('scroll', handleTracksScroll, {
        passive: true,
      });

      return () => {
        tracksElement.removeEventListener('scroll', handleTracksScroll);
      };
    }, []);

    // Calculate frame width based on zoom - memoized
    const frameWidth = useMemo(() => 2 * timeline.zoom, [timeline.zoom]);

    const [subtitleImportConfirmation, setSubtitleImportConfirmation] =
      useState<{
        show: boolean;
        mediaId: string | null;
        mediaName: string;
        targetFrame: number;
        targetRowIndex: number;
        generatedSubtitleIds: string[];
      }>({
        show: false,
        mediaId: null,
        mediaName: '',
        targetFrame: 0,
        targetRowIndex: 0,
        generatedSubtitleIds: [],
      });

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropActive(false);

        const payload = parseMediaDropPayload(e.dataTransfer);
        if (!payload || !tracksRef.current) {
          return;
        }

        const tracksElement = tracksRef.current;
        const rect = tracksElement.getBoundingClientRect();
        const cursorX = e.clientX - rect.left + (tracksElement.scrollLeft || 0);
        const cursorY = e.clientY - rect.top + (tracksElement.scrollTop || 0);

        const targetFrame = Math.max(0, Math.floor(cursorX / frameWidth));

        const rowBounds = buildInteractionRowBounds(
          dynamicRowsWithPlaceholders,
          visibleTrackRows,
          48,
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

        const mediaItem = mediaLibrary?.find(
          (item) => item.id === payload.mediaId,
        );
        const isSubtitleDrop =
          payload.type === 'subtitle' ||
          mediaItem?.type === 'subtitle' ||
          (mediaItem?.name || '').toLowerCase().endsWith('.srt') ||
          (mediaItem?.name || '').toLowerCase().endsWith('.vtt');

        const existingGeneratedSubtitles = tracks.filter(
          (track) =>
            track.type === 'subtitle' && track.subtitleType === 'karaoke',
        );

        if (isSubtitleDrop && existingGeneratedSubtitles.length > 0) {
          setSubtitleImportConfirmation({
            show: true,
            mediaId: payload.mediaId,
            mediaName: mediaItem?.name || 'Subtitles',
            targetFrame,
            targetRowIndex: targetRowIndex ?? 0,
            generatedSubtitleIds: existingGeneratedSubtitles.map((t) => t.id),
          });
          return;
        }

        addTrackFromMediaLibrary(
          payload.mediaId,
          targetFrame,
          targetRowIndex ?? 0,
        ).catch(console.error);
      },
      [
        addTrackFromMediaLibrary,
        parseMediaDropPayload,
        dynamicRowsWithPlaceholders,
        visibleTrackRows,
        frameWidth,
        tracks,
        mediaLibrary,
      ],
    );

    const handleSubtitleDialogOpenChange = useCallback((open: boolean) => {
      if (!open) {
        setSubtitleImportConfirmation({
          show: false,
          mediaId: null,
          mediaName: '',
          targetFrame: 0,
          targetRowIndex: 0,
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

          const latestTracks = (useVideoEditorStore.getState() as any)
            .tracks as VideoTrack[];
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

    // track mouse position during drag for auto-scroll
    // track mouse position during drag for auto-scroll
    useEffect(() => {
      if (!dragGhost?.isActive) {
        setAutoScrollMousePos(null);
        return;
      }

      // Shared function to calculate and update drag ghost position
      const updateDragGhostWithCurrentScroll = (
        clientX: number,
        clientY: number,
      ) => {
        if (!tracksRef.current) return;

        const rect = tracksRef.current.getBoundingClientRect();
        const currentScrollX = tracksRef.current.scrollLeft;
        const currentScrollY = tracksRef.current.scrollTop;
        const mouseRelativeX = clientX - rect.left;

        // Calculate target frame
        const targetFrame = Math.max(
          0,
          Math.floor(
            (mouseRelativeX + currentScrollX - (dragGhost.offsetX || 0)) /
              frameWidth,
          ),
        );

        // Mouse Y relative to tracks container - MUST account for vertical scroll
        const mouseRelativeY = clientY - rect.top + currentScrollY;

        // Get the track being dragged
        const draggedTrack = tracks.find((t) => t.id === dragGhost.trackId);
        if (!draggedTrack) return;

        // BUILD ROW BOUNDS WITH PLACEHOLDER SPACING
        // ========================================

        // REPLACE this entire section with:

        // BUILD INTERACTION ROW BOUNDS (real tracks only, placeholders excluded)
        const rowBounds = buildInteractionRowBounds(
          dynamicRowsWithPlaceholders,
          visibleTrackRows,
          48, // PLACEHOLDER_ROW_HEIGHT
        );

        // DETECT INSERTION POINT
        // mouseRelativeY includes scroll offset, matching content coordinates
        const insertion = detectInsertionPoint(
          mouseRelativeY,
          rowBounds,
          draggedTrack.type,
          tracks,
        );

        // ========================================
        // UPDATE STATE
        // Convert insertion yPosition back to viewport coordinates for rendering
        // ========================================

        if (insertion) {
          if (insertion.type === 'inside') {
            setInsertionPoint(null);

            const targetRowId =
              insertion.existingRowId ||
              `${insertion.trackType}-${Math.round(insertion.targetRowIndex)}`;

            // Store last valid target
            lastValidTargetRef.current = {
              rowId: targetRowId,
              rowIndex: insertion.targetRowIndex,
              frame: targetFrame,
            };

            updateDragGhostPosition(clientX, clientY, targetRowId, targetFrame);
          } else {
            // Convert yPosition from content coordinates to viewport coordinates
            // by subtracting the current scroll offset
            setInsertionPoint({
              yPosition: insertion.yPosition - currentScrollY,
              isValid: insertion.isValid,
              targetRowIndex: insertion.targetRowIndex,
              trackType: insertion.trackType,
            });

            const targetRowId = `${insertion.trackType}-${insertion.targetRowIndex}`;

            // Store last valid target
            lastValidTargetRef.current = {
              rowId: targetRowId,
              rowIndex: insertion.targetRowIndex,
              frame: targetFrame,
            };

            updateDragGhostPosition(clientX, clientY, targetRowId, targetFrame);
          }
        } else {
          // NO valid insertion - keep track in its current row
          setInsertionPoint(null);

          // CRITICAL: Update drag ghost to current track's row to prevent stale target
          const currentRowId = getTrackRowId(draggedTrack);
          updateDragGhostPosition(clientX, clientY, currentRowId, targetFrame);
        }
      };

      const handleMouseMove = (e: MouseEvent) => {
        setAutoScrollMousePos({ x: e.clientX, y: e.clientY });
        updateDragGhostWithCurrentScroll(e.clientX, e.clientY);
      };

      // Also update on scroll changes (for auto-scroll scenarios)
      const handleScroll = () => {
        if (autoScrollMousePos) {
          updateDragGhostWithCurrentScroll(
            autoScrollMousePos.x,
            autoScrollMousePos.y,
          );
        }
      };

      document.addEventListener('mousemove', handleMouseMove, {
        passive: true,
      });

      // Listen for scroll events on the tracks container to update insertion point
      tracksRef.current?.addEventListener('scroll', handleScroll, {
        passive: true,
      });

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        tracksRef.current?.removeEventListener('scroll', handleScroll);
      };
    }, [
      dragGhost?.isActive,
      dragGhost?.offsetX,
      dragGhost?.trackId,
      frameWidth,
      visibleTrackRows,
      dynamicRowsWithPlaceholders,
      tracks,
      updateDragGhostPosition,
      autoScrollMousePos,
    ]);

    // Recalculate target frame and insertion point when scroll changes (even if mouse doesn't move)
    useEffect(() => {
      if (!dragGhost?.isActive || !autoScrollMousePos || !tracksRef.current) {
        return;
      }

      const rect = tracksRef.current.getBoundingClientRect();
      const currentScrollX = tracksRef.current.scrollLeft;
      const currentScrollY = tracksRef.current.scrollTop;
      const mouseRelativeX = autoScrollMousePos.x - rect.left;

      // Recalculate target frame based on current scroll
      const targetFrame = Math.max(
        0,
        Math.floor(
          (mouseRelativeX + currentScrollX - (dragGhost.offsetX || 0)) /
            frameWidth,
        ),
      );

      // Also recalculate insertion point for vertical scroll
      const mouseRelativeY = autoScrollMousePos.y - rect.top + currentScrollY;

      // Get the track being dragged
      const draggedTrack = tracks.find((t) => t.id === dragGhost.trackId);
      if (!draggedTrack) return;

      // Rebuild row bounds with placeholder spacing
      const { placeholderRowsAbove, placeholderRowsBelow } =
        calculatePlaceholderRows(dynamicRows);
      const PLACEHOLDER_ROW_HEIGHT = 48;

      const rowBounds = calculateRowBoundsWithPlaceholders(
        dynamicRows,
        visibleTrackRows,
        placeholderRowsAbove,
        placeholderRowsBelow,
        PLACEHOLDER_ROW_HEIGHT,
      );

      const insertion = detectInsertionPoint(
        mouseRelativeY,
        rowBounds,
        draggedTrack.type,
        tracks,
      );

      if (insertion) {
        if (insertion.type === 'inside') {
          setInsertionPoint(null);
        } else {
          setInsertionPoint({
            yPosition: insertion.yPosition - currentScrollY,
            isValid: insertion.isValid,
            targetRowIndex: insertion.targetRowIndex,
            trackType: insertion.trackType,
          });
        }
      } else {
        setInsertionPoint(null);
      }

      // Only update drag ghost if frame actually changed
      if (dragGhost.targetFrame !== targetFrame) {
        updateDragGhostPosition(
          autoScrollMousePos.x,
          autoScrollMousePos.y,
          dragGhost.targetRow,
          targetFrame,
        );
      }
    }, [
      timeline.scrollX, // Triggers when horizontal auto-scroll updates
      dragGhost?.isActive,
      dragGhost?.targetFrame,
      dragGhost?.targetRow,
      dragGhost?.offsetX,
      dragGhost?.trackId,
      autoScrollMousePos,
      frameWidth,
      updateDragGhostPosition,
      tracks,
      dynamicRows,
      visibleTrackRows,
    ]);

    // Track viewport width for responsive timeline grid
    const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
    // Track row height changes for responsive alignment
    // This state triggers re-renders when breakpoints change, ensuring all child components
    // recalculate their heights using getCurrentTrackRowHeight()
    const [layoutKey, setLayoutKey] = useState(0);

    useEffect(() => {
      if (tracksRef.current) {
        const element = tracksRef.current;
        const height = element.offsetHeight - element.clientHeight;
        setScrollbarHeight(height);
      }
    }, [tracks.length, layoutKey]);

    // Update viewport width and track row height on resize for responsive full-width grid and alignment
    useEffect(() => {
      const handleResize = () => {
        const newWidth = window.innerWidth;
        const oldBreakpoint =
          viewportWidth < 640 ? 'sm' : viewportWidth < 1024 ? 'md' : 'lg';
        const newBreakpoint =
          newWidth < 640 ? 'sm' : newWidth < 1024 ? 'md' : 'lg';

        setViewportWidth(newWidth);

        // Force re-render when breakpoint changes to ensure all heights recalculate
        if (oldBreakpoint !== newBreakpoint) {
          setLayoutKey((prev) => prev + 1);
        }
      };

      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [viewportWidth]);

    // Calculate timeline width - always span at least the full viewport width
    // This ensures a professional full-width grid like Premiere Pro/DaVinci Resolve
    const timelineWidth = useMemo(() => {
      const contentWidth = effectiveEndFrame * frameWidth;
      // Use the larger of content width or viewport width to ensure full grid coverage
      // Account for sidebar width (~200px track controllers + ~200px left padding)
      const effectiveViewportWidth = viewportWidth;
      return Math.max(contentWidth, effectiveViewportWidth);
    }, [effectiveEndFrame, frameWidth, viewportWidth]);

    // Auto-follow playhead during playback
    const autoFollowPlayhead = useCallback(() => {
      if (
        !playback.isPlaying ||
        !tracksRef.current ||
        !autoFollowEnabled ||
        isManualScrollingRef.current
      ) {
        return;
      }

      const tracksElement = tracksRef.current;
      const playheadPosition = timeline.currentFrame * frameWidth;
      const viewportWidth = tracksElement.clientWidth;
      const currentScrollX = tracksElement.scrollLeft;

      // Calculate visible range
      const leftBound = currentScrollX;
      const rightBound = currentScrollX + viewportWidth;

      const optimalPosition = viewportWidth * 0.3;
      const scrollBuffer = viewportWidth * 0.1;

      let targetScrollX = currentScrollX;

      if (playheadPosition > rightBound - scrollBuffer) {
        targetScrollX = playheadPosition - optimalPosition;
      } else if (playheadPosition < leftBound + scrollBuffer) {
        targetScrollX = Math.max(0, playheadPosition - optimalPosition);
      }

      const scrollDifference = Math.abs(targetScrollX - currentScrollX);
      if (scrollDifference > 5) {
        const finalScrollX = Math.max(0, targetScrollX);

        // Update both DOM and store immediately for sync
        tracksElement.scrollLeft = finalScrollX;
        setScrollX(finalScrollX);
      }
    }, [
      timeline.currentFrame,
      frameWidth,
      playback.isPlaying,
      autoFollowEnabled,
      setScrollX,
    ]);

    // Auto-follow effect
    useEffect(() => {
      if (!playback.isPlaying || !autoFollowEnabled) {
        return;
      }

      const throttleTimeout = setTimeout(autoFollowPlayhead, 16);

      return () => clearTimeout(throttleTimeout);
    }, [
      timeline.currentFrame,
      autoFollowPlayhead,
      playback.isPlaying,
      autoFollowEnabled,
    ]);

    // Re-enable auto-follow when playback starts, but only if not manually scrolling or dragging
    useEffect(() => {
      if (playback.isPlaying && !isManualScrollingRef.current) {
        setAutoFollowEnabled(true);
      }
    }, [playback.isPlaying]);

    const findTracksInMarquee = useCallback(
      (rect: { left: number; top: number; right: number; bottom: number }) => {
        if (!tracksRef.current) return [];

        const selectedIds: string[] = [];

        // BUILD INTERACTION ROW BOUNDS (real tracks only, placeholders excluded)
        const rowBounds = buildInteractionRowBounds(
          dynamicRowsWithPlaceholders,
          visibleTrackRows,
          48, // PLACEHOLDER_ROW_HEIGHT
        );

        // Check each track against marquee bounds
        tracks.forEach((track) => {
          const trackLeft = track.startFrame * frameWidth;
          const trackRight = track.endFrame * frameWidth;

          // Find the row bounds for this track
          const trackRowId = getTrackRowId(track);
          const trackRowBounds = rowBounds.find(
            (rb) => rb.rowId === trackRowId,
          );

          if (!trackRowBounds) return;

          // Track bounds in content coordinates
          const trackTop = trackRowBounds.top;
          const trackBottom = trackRowBounds.bottom;

          // Check if track intersects with marquee
          const intersects =
            trackLeft < rect.right &&
            trackRight > rect.left &&
            trackTop < rect.bottom &&
            trackBottom > rect.top;

          if (intersects) {
            selectedIds.push(track.id);
            if (track.isLinked && track.linkedTrackId) {
              selectedIds.push(track.linkedTrackId);
            }
          }
        });

        return [...new Set(selectedIds)];
      },
      [tracks, frameWidth, visibleTrackRows, dynamicRowsWithPlaceholders],
    );

    // Split mode handlers
    const handleSplitMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!isSplitModeActive || !tracksRef.current) {
          setSplitIndicatorPosition(null);
          setHoveredTrack(null);
          setHoveredTrackRow(null);
          setLinkedTrackIndicators([]);
          return;
        }

        const hoveredTrackAtPosition = findTrackAtPosition(
          e.clientX,
          e.clientY,
          tracksRef.current,
          frameWidth,
          tracks,
          visibleTrackRows,
          dynamicRows,
        );

        if (hoveredTrackAtPosition) {
          const rect = tracksRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
          const frame = Math.floor(x / frameWidth);
          const indicatorPosition =
            frame * frameWidth - tracksRef.current.scrollLeft;

          setHoveredTrack(hoveredTrackAtPosition);
          setHoveredTrackRow(hoveredTrackAtPosition.type);
          setSplitIndicatorPosition(indicatorPosition);

          // Handle linked track indicators
          const indicators: Array<{ trackType: string; position: number }> = [];

          if (
            hoveredTrackAtPosition.isLinked &&
            hoveredTrackAtPosition.linkedTrackId
          ) {
            const linkedTrack = tracks.find(
              (t) => t.id === hoveredTrackAtPosition.linkedTrackId,
            );
            if (
              linkedTrack &&
              frame > linkedTrack.startFrame &&
              frame < linkedTrack.endFrame
            ) {
              // Add indicator for the linked track
              indicators.push({
                trackType: linkedTrack.type,
                position: indicatorPosition,
              });
            }
          }

          setLinkedTrackIndicators(indicators);
        } else {
          setHoveredTrack(null);
          setHoveredTrackRow(null);
          setSplitIndicatorPosition(null);
          setLinkedTrackIndicators([]);
        }
      },
      [isSplitModeActive, frameWidth, tracks],
    );

    const handleSplitMouseLeave = useCallback(() => {
      setSplitIndicatorPosition(null);
      setHoveredTrack(null);
      setHoveredTrackRow(null);
      setLinkedTrackIndicators([]);
    }, []);

    // Marquee selection handlers
    // MIGRATED: Now accounts for vertical scroll offset and includes auto-scroll
    const handleMarqueeMouseMove = useCallback(
      (e: MouseEvent) => {
        if (
          !marqueeSelection ||
          !marqueeSelection.isActive ||
          !tracksRef.current
        )
          return;

        const rect = tracksRef.current.getBoundingClientRect();
        const currentScrollX = tracksRef.current.scrollLeft;
        const currentScrollY = tracksRef.current.scrollTop;

        // Update mouse position for auto-scroll
        setMarqueeAutoScrollMousePos({ x: e.clientX, y: e.clientY });

        // CRITICAL: Include scroll offset for accurate positioning
        // X: content coordinates (includes horizontal scroll)
        const currentX = e.clientX - rect.left + currentScrollX;
        // Y: content coordinates (includes vertical scroll)
        const currentY = e.clientY - rect.top + currentScrollY;

        setMarqueeSelection({
          ...marqueeSelection,
          currentX,
          currentY,
        });

        // Real-time selection: Update selected tracks as marquee moves
        // All coordinates are in content space (include scroll offset)
        const left = Math.min(marqueeSelection.startX, currentX);
        const right = Math.max(marqueeSelection.startX, currentX);
        const top = Math.min(marqueeSelection.startY, currentY);
        const bottom = Math.max(marqueeSelection.startY, currentY);

        // Find tracks within current marquee bounds
        const tracksInMarquee = findTracksInMarquee({
          left,
          top,
          right,
          bottom,
        });

        // Update selection in real-time
        const isModifierPressed = e.shiftKey || e.ctrlKey || e.metaKey;

        if (isModifierPressed) {
          // Add to existing selection (don't toggle during drag)
          // Get fresh state to avoid stale closure
          const currentSelectedTrackIds =
            useVideoEditorStore.getState().timeline.selectedTrackIds;
          const newSelection = [...currentSelectedTrackIds];
          tracksInMarquee.forEach((id) => {
            if (!newSelection.includes(id)) {
              newSelection.push(id);
            }
          });
          setSelectedTracks(newSelection);
        } else {
          // Replace selection with tracks in marquee
          setSelectedTracks(tracksInMarquee);
        }
      },
      [marqueeSelection, findTracksInMarquee, setSelectedTracks],
    );

    const handleMarqueeMouseUp = useCallback(() => {
      if (!marqueeSelection || !marqueeSelection.isActive || !tracksRef.current)
        return;

      // Selection is already updated in real-time during mousemove
      // Just clear the marquee visual and auto-scroll
      setMarqueeSelection(null);
      setMarqueeAutoScrollMousePos(null);
    }, [marqueeSelection]);

    // Marquee selection mouse event listeners
    // Always listen for mouse events to ensure marquee can activate
    useEffect(() => {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        // Block marquee during track drag/resize, playhead drag, or split mode
        if (
          playback.isDraggingTrack ||
          isDraggingPlayhead ||
          isSplitModeActive
        ) {
          return;
        }

        // Handle active marquee movement first
        if (marqueeSelection?.isActive) {
          handleMarqueeMouseMove(e);
          return;
        }

        // Check if we have a potential marquee start (not yet active)
        if (
          marqueeStartRef.current &&
          !marqueeStartRef.current.hasMoved &&
          tracksRef.current
        ) {
          const rect = tracksRef.current.getBoundingClientRect();
          const currentScrollX = tracksRef.current.scrollLeft;
          const currentScrollY = tracksRef.current.scrollTop;

          // CRITICAL: Include scroll offset for accurate positioning
          const currentX = e.clientX - rect.left + currentScrollX;
          const currentY = e.clientY - rect.top + currentScrollY;

          // Check if mouse moved more than 3px (reduced threshold for better responsiveness)
          const deltaX = Math.abs(currentX - marqueeStartRef.current.x);
          const deltaY = Math.abs(currentY - marqueeStartRef.current.y);

          if (deltaX > 3 || deltaY > 3) {
            // User is dragging, activate marquee immediately
            marqueeStartRef.current.hasMoved = true;

            // Clear any pending seek to prevent conflict
            if (clickTimeoutRef.current) {
              clearTimeout(clickTimeoutRef.current);
              clickTimeoutRef.current = null;
            }

            setMarqueeSelection({
              isActive: true,
              startX: marqueeStartRef.current.x,
              startY: marqueeStartRef.current.y,
              currentX,
              currentY,
            });
          }
        }
      };

      const handleGlobalMouseUp = () => {
        // Handle marquee end if active
        if (marqueeSelection?.isActive) {
          handleMarqueeMouseUp();
        }

        // Clear marquee start tracking and auto-scroll
        marqueeStartRef.current = null;
        setMarqueeAutoScrollMousePos(null);
      };

      // Always attach listeners when component is mounted
      // This ensures marquee can always activate when needed
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove);
        document.removeEventListener('mouseup', handleGlobalMouseUp);
      };
    }, [
      marqueeSelection,
      handleMarqueeMouseMove,
      handleMarqueeMouseUp,
      playback.isDraggingTrack,
      isDraggingPlayhead,
      isSplitModeActive,
    ]);

    // Helper functions to get track row positions (using dynamic utilities)
    const getTrackRowTopPosition = useCallback(
      (trackType: string) => {
        // Use includeCenteringOffset=true to get absolute position including centering
        return getTrackRowTop(trackType, visibleTrackRows, true);
      },
      [visibleTrackRows],
    );

    const getTrackRowHeightValue = useCallback((trackType?: string) => {
      return getTrackRowHeight(trackType);
    }, []);

    // Playhead drag handler
    const handlePlayheadDragStart = useCallback(() => {
      if (!tracksRef.current) return;

      // Start playhead drag mode
      startDraggingPlayhead();

      const handleMouseMove = (moveEvent: MouseEvent) => {
        if (!tracksRef.current) return;

        const rect = tracksRef.current.getBoundingClientRect();
        const x = moveEvent.clientX - rect.left + tracksRef.current.scrollLeft;
        const frame = Math.floor(x / frameWidth);
        const clampedFrame = Math.max(
          0,
          Math.min(frame, effectiveEndFrame - 1),
        );

        // Update frame in real-time during drag
        lastFrameUpdateRef.current = clampedFrame;
        setCurrentFrame(clampedFrame);
      };

      const handleMouseUp = () => {
        // End playhead drag mode
        endDraggingPlayhead();

        // Clean up listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      // Attach global listeners for smooth dragging
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }, [
      frameWidth,
      effectiveEndFrame,
      setCurrentFrame,
      startDraggingPlayhead,
      endDraggingPlayhead,
    ]);

    // Centralized interaction handlers
    const interactionHandlers: TimelineInteractionHandlers = useMemo(
      () => ({
        onSeek: (frame: number) => {
          const currentTime = Date.now();
          const timeSinceLastClick = currentTime - lastClickTimeRef.current;
          const DOUBLE_CLICK_THRESHOLD = 400; // ms - increased for easier double-clicking

          // Clear any pending seek
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
          }

          // Check if this is a double-click
          if (
            timeSinceLastClick < DOUBLE_CLICK_THRESHOLD &&
            timeSinceLastClick > 0
          ) {
            // Double-click detected - don't seek, just prepare for marquee
            lastClickTimeRef.current = 0; // Reset to prevent triple-click issues
            return;
          }

          // Update last click time
          lastClickTimeRef.current = currentTime;

          // Delay the seek to allow double-click detection and marquee activation
          clickTimeoutRef.current = setTimeout(() => {
            // Double-check that marquee wasn't activated in the meantime
            // Use fresh state check instead of closure
            if (marqueeStartRef.current?.hasMoved) {
              return; // Don't seek if marquee was activated
            }

            const clampedFrame = Math.max(
              0,
              Math.min(frame, effectiveEndFrame - 1),
            );
            pause();
            isManualScrollingRef.current = true;
            setAutoFollowEnabled(false);
            lastFrameUpdateRef.current = clampedFrame;
            setCurrentFrame(clampedFrame);

            setTimeout(() => {
              setAutoFollowEnabled(true);
              isManualScrollingRef.current = false;
            }, 200);
          }, 200); // Reduced delay for better responsiveness (was 250ms)
        },
        onStartMarquee: (
          startX: number,
          startY: number,
          clearSelection: boolean,
        ) => {
          const currentTime = Date.now();
          const timeSinceLastClick = currentTime - lastClickTimeRef.current;
          const DOUBLE_CLICK_THRESHOLD = 400; // ms - matches seek threshold

          // On double-click, activate marquee immediately
          if (
            timeSinceLastClick < DOUBLE_CLICK_THRESHOLD &&
            timeSinceLastClick > 0
          ) {
            // This is the second click of a double-click
            // Activate marquee immediately for double-click
            // startX and startY are already in content coordinates (include scroll offset)
            setMarqueeSelection({
              isActive: true,
              startX,
              startY,
              currentX: startX,
              currentY: startY,
            });
            marqueeStartRef.current = { x: startX, y: startY, hasMoved: true };

            if (clearSelection) {
              setSelectedTracks([]);
            }
            return;
          }

          // Store the start position but don't activate marquee yet
          // Marquee will activate only if user drags (mousemove)
          // startX and startY are already in content coordinates (include scroll offset)
          marqueeStartRef.current = { x: startX, y: startY, hasMoved: false };

          if (clearSelection) {
            setSelectedTracks([]);
          }
        },
        onSelectTrack: () => {
          // This is handled by the track component itself
          // We just need to ensure it doesn't conflict with other interactions
        },
        onStartDrag: () => {
          // Drag is handled by the track component
        },
        onStartResize: () => {
          // Resize is handled by the track component
        },
        onSplit: (frame: number, trackId: string) => {
          splitAtPosition(frame, trackId);
        },
        onStartPlayheadDrag: () => {
          startDraggingPlayhead();
        },
      }),
      [
        effectiveEndFrame,
        pause,
        setCurrentFrame,
        setSelectedTracks,
        splitAtPosition,
        marqueeSelection,
        startDraggingPlayhead,
      ],
    );

    // Centralized mouse down handler
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (!tracksRef.current) return;

        // Block all timeline interactions during track drag/resize or playhead drag operations
        if (playback.isDraggingTrack || isDraggingPlayhead) {
          return;
        }

        // Check for context menu clicks
        if (isContextMenuClick(e.target)) {
          e.stopPropagation();
          return;
        }

        const rect = tracksRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const scrollLeft = tracksRef.current.scrollLeft;

        // Determine what was clicked
        const clickedTrack = findTrackAtPosition(
          e.clientX,
          e.clientY,
          tracksRef.current,
          frameWidth,
          tracks,
          visibleTrackRows,
          dynamicRowsWithPlaceholders,
        );

        const frame = calculateFrameFromPosition(
          e.clientX,
          tracksRef.current,
          frameWidth,
          effectiveEndFrame - 1,
        );

        const clickInfo: ClickInfo = {
          target: clickedTrack ? 'track' : 'empty-space',
          button: e.button,
          clientX: e.clientX,
          clientY: e.clientY,
          frame,
          trackId: clickedTrack?.id,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        };

        // Add position info for marquee
        // CRITICAL: Include scroll offset for accurate positioning
        const scrollTop = tracksRef.current.scrollTop;
        (clickInfo as any).startX = clickX + scrollLeft;
        (clickInfo as any).startY = clickY + scrollTop;

        const timelineState = {
          isSplitModeActive,
          tracks,
        };

        const result = centralizedHandleMouseDown(
          clickInfo,
          timelineState,
          interactionHandlers,
        );

        if (result.shouldStopPropagation) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      [
        playback.isDraggingTrack,
        isDraggingPlayhead,
        tracksRef,
        frameWidth,
        tracks,
        effectiveEndFrame,
        isSplitModeActive,
        interactionHandlers,
        visibleTrackRows,
        dynamicRowsWithPlaceholders,
      ],
    );

    return (
      <div
        ref={timelineRef}
        className={cn(
          'timeline-container flex flex-col flex-1 overflow-hidden outline-none focus:outline-none focus:ring-0 h-80',
          isSplitModeActive && hoveredTrack ? 'cursor-split' : '',
          isSplitModeActive && !hoveredTrack ? 'cursor-split-not-allowed' : '',
          className,
        )}
        tabIndex={0}
        onMouseMove={handleSplitMouseMove}
        onMouseLeave={handleSplitMouseLeave}
      >
        {/* Timeline Header with Controls */}
        {/* TimelineHeader component removed as per edit hint */}

        {/* Timeline Controls */}
        <TimelineControls />

        <div className="flex flex-1 min-h-0">
          {/* Synchronized vertical scroll container */}
          <div className="flex flex-1 overflow-hidden">
            {/* Timeline Track Controllers - synchronized scroll */}
            {tracks.length > 0 && (
              <div
                ref={controllersScrollRef}
                className="w-fit flex-shrink-0 overflow-y-auto overflow-x-hidden scrollbar-hidden"
                style={{ paddingBottom: `${scrollbarHeight}px` }}
                onScroll={(e) => {
                  // Sync scroll with tracks
                  if (tracksRef.current) {
                    tracksRef.current.scrollTop = e.currentTarget.scrollTop;
                  }
                }}
              >
                <TimelineTrackControllers
                  key={`controllers-${layoutKey}`}
                  tracks={tracks}
                  scrollbarHeight={scrollbarHeight}
                  className="w-fit flex-shrink-0"
                />
              </div>
            )}

            {/* Timeline Content Area */}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {/* Timeline Ruler - Fixed at top */}
              <div
                className={cn(
                  'relative overflow-hidden z-10 flex-shrink-0',
                  !playback.isDraggingTrack && 'cursor-pointer',
                )}
                onMouseDown={handleMouseDown}
                title={playback.isDraggingTrack ? '' : 'Click to seek'}
              >
                <TimelineRuler
                  frameWidth={frameWidth}
                  totalFrames={timeline.totalFrames}
                  scrollX={timeline.scrollX}
                  fps={timeline.fps}
                  tracks={tracks}
                  inPoint={timeline.inPoint}
                  outPoint={timeline.outPoint}
                  onClick={undefined}
                  timelineScrollElement={tracksRef.current}
                />
              </div>

              {/* Timeline Tracks Area - Scrollable vertically */}
              <div className="flex-1 relative min-h-0">
                <div
                  ref={tracksRef}
                  className={cn(
                    'relative h-full overflow-auto scrollbar-thin z-10',
                    // Don't apply cursor styles when dragging/resizing tracks
                    playback.isDraggingTrack
                      ? ''
                      : isSplitModeActive && hoveredTrack
                        ? 'cursor-split'
                        : isSplitModeActive && !hoveredTrack
                          ? 'cursor-split-not-allowed'
                          : !isSplitModeActive
                            ? 'cursor-pointer'
                            : '',
                  )}
                  title={playback.isDraggingTrack ? '' : 'Click to seek'}
                  style={{
                    scrollBehavior:
                      autoFollowEnabled && playback.isPlaying
                        ? 'smooth'
                        : 'auto',
                  }}
                  onMouseDown={handleMouseDown}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onScroll={(e) => {
                    // Scroll handling
                    const scrollLeft = (e.target as HTMLElement).scrollLeft;
                    const scrollTop = (e.target as HTMLElement).scrollTop;
                    const scrollDifference = Math.abs(
                      scrollLeft - timeline.scrollX,
                    );

                    // Immediately update store to keep ruler in sync
                    setScrollX(scrollLeft);
                    setVerticalScrollY(scrollTop);

                    // Only handle auto-follow disabling during playback
                    if (
                      playback.isPlaying &&
                      autoFollowEnabled &&
                      scrollDifference > 10
                    ) {
                      if (
                        !isManualScrollingRef.current &&
                        scrollDifference > 30
                      ) {
                        isManualScrollingRef.current = true;
                        setAutoFollowEnabled(false);

                        if (autoFollowTimeoutRef.current) {
                          clearTimeout(autoFollowTimeoutRef.current);
                        }
                        autoFollowTimeoutRef.current = setTimeout(() => {
                          if (playback.isPlaying) {
                            setAutoFollowEnabled(true);
                          }
                          isManualScrollingRef.current = false;
                        }, 1500);
                      }
                    }

                    // Debounced scroll finalization for performance
                    if (scrollTimeoutRef.current) {
                      clearTimeout(scrollTimeoutRef.current);
                    }

                    scrollTimeoutRef.current = setTimeout(() => {
                      const currentScrollLeft = (e.target as HTMLElement)
                        .scrollLeft;
                      if (Math.abs(currentScrollLeft - scrollLeft) < 2) {
                        setScrollX(currentScrollLeft);
                      }
                    }, 16);
                  }}
                >
                  <TimelineTracks
                    key={`tracks-${layoutKey}`}
                    tracks={tracks}
                    frameWidth={frameWidth}
                    timelineWidth={timelineWidth}
                    scrollX={timeline.scrollX}
                    zoomLevel={timeline.zoom}
                    selectedTrackIds={timeline.selectedTrackIds}
                    onTrackSelect={setSelectedTracks}
                    isSplitModeActive={isSplitModeActive}
                  />
                </div>

                {/* Global Playhead - spans across ruler and tracks */}
                <TimelinePlayhead
                  currentFrame={timeline.currentFrame}
                  frameWidth={frameWidth}
                  scrollX={timeline.scrollX}
                  visible={timeline.playheadVisible}
                  timelineScrollElement={tracksRef.current}
                  onStartDrag={handlePlayheadDragStart}
                  magneticSnapFrame={magneticSnapFrame}
                />

                {/* Split Indicator Line - confined to hovered track row */}
                {isSplitModeActive &&
                  splitIndicatorPosition !== null &&
                  hoveredTrackRow && (
                    <div
                      className="split-indicator"
                      style={{
                        left: `${splitIndicatorPosition}px`,
                        top: `${getTrackRowTopPosition(hoveredTrackRow) - (tracksRef.current?.scrollTop || 0)}px`,
                        height: `${getTrackRowHeightValue(hoveredTrackRow)}px`,
                      }}
                    />
                  )}

                {/* Split Indicator Line - confined to hovered track row */}
                {isSplitModeActive &&
                  splitIndicatorPosition !== null &&
                  hoveredTrackRow &&
                  tracksRef.current &&
                  (() => {
                    const currentScrollY = tracksRef.current.scrollTop;
                    const viewportHeight = tracksRef.current.clientHeight;
                    const indicatorTop =
                      getTrackRowTopPosition(hoveredTrackRow) - currentScrollY;
                    const indicatorHeight =
                      getTrackRowHeightValue(hoveredTrackRow);

                    // Viewport clipping
                    if (
                      indicatorTop + indicatorHeight < 0 ||
                      indicatorTop > viewportHeight
                    ) {
                      return null;
                    }

                    return (
                      <div
                        className="split-indicator"
                        style={{
                          left: `${splitIndicatorPosition}px`,
                          top: `${Math.max(0, indicatorTop)}px`,
                          height: `${indicatorHeight}px`,
                        }}
                      />
                    );
                  })()}

                {/* Linked Track Indicators */}
                {isSplitModeActive &&
                  tracksRef.current &&
                  linkedTrackIndicators.map((indicator, index) => {
                    if (!tracksRef.current) return null;
                    const currentScrollY = tracksRef.current.scrollTop;
                    const viewportHeight = tracksRef.current.clientHeight;
                    const indicatorTop =
                      getTrackRowTopPosition(indicator.trackType) -
                      currentScrollY;
                    const indicatorHeight = getTrackRowHeightValue(
                      indicator.trackType,
                    );

                    // Viewport clipping
                    if (
                      indicatorTop + indicatorHeight < 0 ||
                      indicatorTop > viewportHeight
                    ) {
                      return null;
                    }

                    return (
                      <div
                        key={`linked-indicator-${index}`}
                        className="split-indicator"
                        style={{
                          left: `${indicator.position}px`,
                          top: `${Math.max(0, indicatorTop)}px`,
                          height: `${indicatorHeight}px`,
                        }}
                      />
                    );
                  })}

                {/* Marquee Selection Box */}
                {/* MIGRATED: Now accounts for scroll offset - convert content coordinates to viewport */}
                {marqueeSelection?.isActive && tracksRef.current && (
                  <div
                    className="absolute border-2 border-zinc-500 bg-zinc-500/20 dark:border-zinc-300 dark:bg-zinc-300/20 pointer-events-none z-[1000]"
                    style={{
                      left: `${Math.min(marqueeSelection.startX, marqueeSelection.currentX) - timeline.scrollX}px`,
                      top: `${Math.min(marqueeSelection.startY, marqueeSelection.currentY) - (tracksRef.current.scrollTop || 0)}px`,
                      width: `${Math.abs(marqueeSelection.currentX - marqueeSelection.startX)}px`,
                      height: `${Math.abs(marqueeSelection.currentY - marqueeSelection.startY)}px`,
                    }}
                  />
                )}

                {/* Drop Zone Indicator - shows where all clips will land */}
                {/* ONLY shown when NOT in insertion mode (mutually exclusive with insertion line) */}
                {dragGhost?.isActive &&
                  dragGhost.targetRow &&
                  dragGhost.targetFrame !== null &&
                  dragGhost.selectedTrackIds &&
                  tracksRef.current &&
                  !insertionPoint && // CRITICAL: Hide dropzone when insertion line is active
                  (() => {
                    // Get all tracks being dragged
                    const draggedTracks = tracks.filter((t) =>
                      dragGhost.selectedTrackIds.includes(t.id),
                    );
                    if (draggedTracks.length === 0) return null;

                    // Find the primary track
                    const primaryTrack = draggedTracks.find(
                      (t) => t.id === dragGhost.trackId,
                    );
                    if (!primaryTrack) return null;

                    // Calculate the offset for each track from the primary track
                    const primaryTrackStartFrame = primaryTrack.startFrame;

                    // Parse target row to validate drop
                    const targetRowParsed = parseRowId(dragGhost.targetRow);
                    let isValidDrop =
                      targetRowParsed &&
                      targetRowParsed.type === primaryTrack.type;

                    // Additionally check for collisions at the drop position
                    if (isValidDrop && targetRowParsed) {
                      const duration =
                        primaryTrack.endFrame - primaryTrack.startFrame;
                      const proposedStart = dragGhost.targetFrame;
                      const proposedEnd = proposedStart + duration;

                      // Check if dropping here would cause a collision
                      const wouldCollide = hasCollision(
                        proposedStart,
                        proposedEnd,
                        primaryTrack.type,
                        targetRowParsed.rowIndex,
                        tracks,
                        { excludeTrackIds: dragGhost.selectedTrackIds },
                      );

                      if (wouldCollide) {
                        isValidDrop = false;
                      }
                    }
                    // Get current scroll position for viewport clipping
                    const currentScrollY = tracksRef.current?.scrollTop || 0;
                    const viewportHeight = tracksRef.current?.clientHeight || 0;

                    return (
                      <>
                        {draggedTracks.map((track) => {
                          // Calculate where this track will land relative to primary
                          const frameOffset =
                            track.startFrame - primaryTrackStartFrame;
                          const targetStartFrame =
                            dragGhost.targetFrame + frameOffset;
                          const targetEndFrame =
                            targetStartFrame +
                            (track.endFrame - track.startFrame);

                          // Each track shows in its own row (maintaining relative positions)
                          // But we use the target row from drag ghost for the primary track
                          const trackTargetRow =
                            track.id === primaryTrack.id
                              ? dragGhost.targetRow
                              : getTrackRowId(track);

                          return (
                            <DropZoneIndicator
                              key={`drop-zone-${track.id}`}
                              targetRow={trackTargetRow}
                              startFrame={targetStartFrame}
                              endFrame={targetEndFrame}
                              frameWidth={frameWidth}
                              scrollX={timeline.scrollX}
                              scrollY={currentScrollY}
                              viewportHeight={viewportHeight}
                              visibleTrackRows={visibleTrackRows}
                              dynamicRows={dynamicRows}
                              isValidDrop={isValidDrop || false}
                            />
                          );
                        })}
                      </>
                    );
                  })()}

                {/* Magnetic Snap Indicator Line */}
                {magneticSnapFrame !== null && tracksRef.current && (
                  <div
                    className="absolute w-px bg-secondary pointer-events-none"
                    style={{
                      left: `${magneticSnapFrame * frameWidth - timeline.scrollX}px`,
                      top: 0,
                      bottom: 0,
                      height: '100%',
                      zIndex: 100,
                    }}
                  />
                )}

                {/* Insertion Line Indicator - shows where new row will be created */}
                {/* ONLY shown when in insertion mode (mutually exclusive with dropzone) */}
                {insertionPoint &&
                  dragGhost?.isActive &&
                  tracksRef.current &&
                  (() => {
                    const viewportHeight = tracksRef.current.clientHeight;
                    const lineY = insertionPoint.yPosition;

                    // Only show if the line is within the viewport
                    if (lineY < -10 || lineY > viewportHeight + 10) {
                      return null;
                    }

                    return (
                      <InsertionLineIndicator
                        top={lineY}
                        width={tracksRef.current.scrollWidth}
                        scrollX={timeline.scrollX}
                        isValid={insertionPoint.isValid}
                      />
                    );
                  })()}
              </div>
            </div>
          </div>
        </div>

        {/* Drag Ghost - floating preview that follows cursor */}
        {dragGhost?.isActive && dragGhost.selectedTrackIds && (
          <>
            {(() => {
              // Get all tracks being dragged
              const draggedTracks = tracks.filter((t) =>
                dragGhost.selectedTrackIds.includes(t.id),
              );
              if (draggedTracks.length === 0) return null;

              // Find the primary track (the one being clicked/dragged)
              const primaryTrack = draggedTracks.find(
                (t) => t.id === dragGhost.trackId,
              );
              if (!primaryTrack) return null;

              // Calculate relative offsets for all tracks from the primary track
              const primaryTrackStartFrame = primaryTrack.startFrame;
              const primaryTrackRowTop = getTrackRowTop(
                primaryTrack.type,
                visibleTrackRows,
              );

              return (
                <>
                  {draggedTracks.map((track) => {
                    // Calculate frame offset from primary track (preserve spacing)
                    const frameOffset =
                      track.startFrame - primaryTrackStartFrame;
                    const horizontalOffset = frameOffset * frameWidth;

                    // Calculate vertical offset from primary track row
                    const trackRowTop = getTrackRowTop(
                      track.type,
                      visibleTrackRows,
                    );
                    const verticalOffset = trackRowTop - primaryTrackRowTop;

                    // For non-primary tracks, adjust mouse position but keep offset the same
                    // This preserves the spacing between clips
                    return (
                      <DragGhost
                        key={`drag-ghost-${track.id}`}
                        track={track}
                        frameWidth={frameWidth}
                        zoomLevel={timeline.zoom}
                        mouseX={dragGhost.mouseX + horizontalOffset}
                        mouseY={dragGhost.mouseY + verticalOffset}
                        offsetX={dragGhost.offsetX}
                        offsetY={dragGhost.offsetY}
                        visibleTrackRows={visibleTrackRows}
                      />
                    );
                  })}
                </>
              );
            })()}
          </>
        )}

        {/* Subtitle Import Safety Dialog */}
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

        {/* Project Shortcut Confirmation Dialog */}
        <ConfirmationDialog />
      </div>
    );
  },
  // Use default shallow comparison - Timeline relies on Zustand subscriptions
  // Custom comparison was preventing re-renders when store state changed
);
