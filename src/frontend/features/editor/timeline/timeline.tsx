/* eslint-disable @typescript-eslint/no-explicit-any */
import { cn } from '@/frontend/utils/utils';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';
import { useTrackDragRecording } from '../stores/videoEditor/hooks/useTrackDragRecording';
import { useUndoRedoShortcuts } from '../stores/videoEditor/hooks/useUndoRedoShortcuts';
import {
  useGlobalShortcuts,
  useTimelineShortcutsV2,
  useTrackShortcuts,
  useVideoEditorStore,
  VideoTrack,
} from '../stores/videoEditor/index';
import { DragGhost } from './dragGhost';
import { DropZoneIndicator } from './dropZoneIndicator';
import { ProjectThumbnailSetter } from './projectThumbnailSetter';
import { TimelineControls } from './timelineControls';
import { TimelinePlayhead } from './timelinePlayhead';
import { TimelineRuler } from './timelineRuler';
import { TimelineTrackControllers } from './timelineTrackControllers';
import { TimelineTracks } from './timelineTracks';
import { getRowHeight } from './utils/timelineConstants';
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
    const [, setDropActive] = useState(false);
    const [autoFollowEnabled, setAutoFollowEnabled] = useState(true);
    const [splitIndicatorPosition, setSplitIndicatorPosition] = useState<
      number | null
    >(null);
    const [hoveredTrack, setHoveredTrack] = useState<VideoTrack | null>(null);
    const [hoveredTrackRow, setHoveredTrackRow] = useState<string | null>(null);
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

    // Selectively subscribe to store to prevent unnecessary re-renders
    const timeline = useVideoEditorStore((state) => state.timeline);
    const tracks = useVideoEditorStore((state) => state.tracks);
    const playback = useVideoEditorStore((state) => state.playback);
    const visibleTrackRows = useVideoEditorStore(
      (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
    );
    const dragGhost = useVideoEditorStore((state) => state.playback.dragGhost);
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
    const importMediaToTimeline = useVideoEditorStore(
      (state) => state.importMediaToTimeline,
    );
    const startDraggingPlayhead = useVideoEditorStore(
      (state) => state.startDraggingPlayhead,
    );
    const endDraggingPlayhead = useVideoEditorStore(
      (state) => state.endDraggingPlayhead,
    );
    const isDraggingPlayhead = useVideoEditorStore(
      (state) => state.playback.isDraggingPlayhead,
    );

    // Calculate effective timeline duration based on actual track content - memoized
    const effectiveEndFrame = useMemo(() => {
      // When tracks exist, use the maximum track end frame
      // Only use totalFrames as fallback when no tracks exist
      return tracks.length > 0
        ? Math.max(...tracks.map((track) => track.endFrame))
        : timeline.totalFrames;
    }, [tracks, timeline.totalFrames]);

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

    const handleDrop = useCallback(
      async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropActive(false);

        // Check if this is a media library item (internal drag)
        const mediaId = e.dataTransfer.getData('text/plain');
        if (mediaId) {
          // Always start at frame 0 when dragging from MediaImportPanel
          const dropFrame = 0;

          console.log(`🎯 Dropping media library item at frame ${dropFrame}`);
          addTrackFromMediaLibrary(mediaId, dropFrame).catch(console.error);
          return;
        }

        // Check if this is a file drop (external)
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const files = Array.from(e.dataTransfer.files);
          console.log(`🎯 Dropping ${files.length} files onto timeline`);

          // Show immediate loading toast with promise
          const importPromise = importMediaToTimeline(files);

          toast.promise(importPromise, {
            loading: `Adding ${files.length} ${files.length === 1 ? 'file' : 'files'} to timeline...`,
            success: (result) => {
              const importedCount = result.importedFiles.length;
              const rejectedCount = result.rejectedFiles?.length || 0;

              // Show detailed rejection info if any files were rejected
              if (rejectedCount > 0 && result.rejectedFiles) {
                // Group rejections by reason
                const reasonGroups = result.rejectedFiles.reduce(
                  (acc, file) => {
                    const reason = file.reason || 'Unknown error';
                    if (!acc[reason]) {
                      acc[reason] = [];
                    }
                    acc[reason].push(file.name);
                    return acc;
                  },
                  {} as Record<string, string[]>,
                );

                // Show detailed warnings for each rejection reason
                Object.entries(reasonGroups).forEach(([reason, fileNames]) => {
                  const fileList =
                    fileNames.length > 3
                      ? `${fileNames.slice(0, 3).join(', ')} and ${fileNames.length - 3} more`
                      : fileNames.join(', ');

                  toast.warning(`${fileList}: ${reason}`, {
                    duration: 6000,
                  });
                });
              }

              // Return success message
              if (importedCount > 0) {
                return `Added ${importedCount} ${importedCount === 1 ? 'file' : 'files'} to timeline`;
              } else {
                throw new Error('No files could be added to timeline');
              }
            },
            error: (error) => {
              // Show detailed error message
              if (error?.error) {
                return `Import failed: ${error.error}`;
              }
              return 'Failed to add files to timeline. Please try again.';
            },
          });

          try {
            await importPromise;
          } catch (error) {
            console.error('❌ Error importing files to timeline:', error);
          }
        }
      },
      [addTrackFromMediaLibrary, importMediaToTimeline],
    );

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

        const elapsed = (performance.now() - startTime) / 1000; // elapsed seconds
        const frameAdvance = elapsed * timeline.fps * playback.playbackRate;
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

                const newElapsed = (performance.now() - newStartTime) / 1000;
                const newFrameAdvance =
                  newElapsed * timeline.fps * playback.playbackRate;
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
      timeline.fps,
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
    // Use capture phase to ensure this runs AFTER child handlers
    useEffect(() => {
      const handleGlobalMouseUp = () => {
        // Use setTimeout to ensure this runs after all other mouseup handlers
        setTimeout(() => {
          const { playback, endDraggingTrack } = useVideoEditorStore.getState();
          if (playback.isDraggingTrack) {
            endDraggingTrack();
          }
        }, 0);
      };

      document.addEventListener('mouseup', handleGlobalMouseUp);
      return () => {
        document.removeEventListener('mouseup', handleGlobalMouseUp);
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

    // Calculate frame width based on zoom - memoized
    const frameWidth = useMemo(() => 2 * timeline.zoom, [timeline.zoom]);

    // Track viewport width for responsive timeline grid
    const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
    // Track row height changes for responsive alignment
    // This state triggers re-renders when breakpoints change, ensuring all child components
    // recalculate their heights using getCurrentTrackRowHeight()
    const [layoutKey, setLayoutKey] = useState(0);

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
      const effectiveViewportWidth = viewportWidth - 200;
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

    // Helper function to find tracks within marquee selection
    const findTracksInMarquee = useCallback(
      (rect: { left: number; top: number; right: number; bottom: number }) => {
        const selectedIds: string[] = [];

        tracks.forEach((track) => {
          const trackLeft = track.startFrame * frameWidth;
          const trackRight = track.endFrame * frameWidth;

          // Use dynamic row positioning based on individual row heights
          const trackTop = getTrackRowTop(track.type, visibleTrackRows);

          // Skip if track type is not visible
          if (trackTop === 0 && !visibleTrackRows.includes(track.type)) return;

          const trackBottom = trackTop + getRowHeight(track.type);

          // Check if track intersects with marquee
          const intersects =
            trackLeft < rect.right &&
            trackRight > rect.left &&
            trackTop < rect.bottom &&
            trackBottom > rect.top;

          if (intersects) {
            selectedIds.push(track.id);
            // If track is linked, also select its partner
            if (track.isLinked && track.linkedTrackId) {
              selectedIds.push(track.linkedTrackId);
            }
          }
        });

        return [...new Set(selectedIds)]; // Remove duplicates
      },
      [tracks, frameWidth, visibleTrackRows],
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
    const handleMarqueeMouseMove = useCallback(
      (e: MouseEvent) => {
        if (
          !marqueeSelection ||
          !marqueeSelection.isActive ||
          !tracksRef.current
        )
          return;

        const rect = tracksRef.current.getBoundingClientRect();
        const currentX = e.clientX - rect.left + tracksRef.current.scrollLeft;
        const currentY = e.clientY - rect.top;

        setMarqueeSelection({
          ...marqueeSelection,
          currentX,
          currentY,
        });

        // Real-time selection: Update selected tracks as marquee moves
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
      // Just clear the marquee visual
      setMarqueeSelection(null);
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
          const currentX = e.clientX - rect.left + tracksRef.current.scrollLeft;
          const currentY = e.clientY - rect.top;

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

        // Clear marquee start tracking
        marqueeStartRef.current = null;
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
        return getTrackRowTop(trackType, visibleTrackRows);
      },
      [visibleTrackRows],
    );

    const getTrackRowHeightValue = useCallback(() => {
      return getTrackRowHeight();
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
        (clickInfo as any).startX = clickX + scrollLeft;
        (clickInfo as any).startY = clickY;

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
      ],
    );

    return (
      <div
        ref={timelineRef}
        className={cn(
          'timeline-container flex flex-col flex-1 overflow-hidden outline-none focus:outline-none focus:ring-0',
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

        <div className="flex flex-1">
          {/* Timeline Track Controllers */}
          <TimelineTrackControllers
            key={`controllers-${layoutKey}`}
            tracks={tracks}
            className="w-fit flex-shrink-0"
          />

          {/* Project Thumbnail Setter - Only show if there are video tracks */}
          {tracks.some((track) => track.type === 'video') && (
            <ProjectThumbnailSetter key={`thumbnail-${layoutKey}`} />
          )}
          {/* Timeline Content Area */}
          <div className="flex flex-col flex-1 relative overflow-hidden">
            {/* Timeline Ruler - Fixed at top but scrolls horizontally */}
            <div
              className={cn(
                'relative overflow-hidden z-10',
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
                onClick={undefined} // Handle clicks at parent level
                timelineScrollElement={tracksRef.current}
              />
            </div>

            {/* Timeline Tracks Area */}
            <div className="flex-1 relative overflow-visible">
              <div
                ref={tracksRef}
                className={cn(
                  'relative overflow-auto transition-colors duration-200',
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
                    autoFollowEnabled && playback.isPlaying ? 'smooth' : 'auto',
                }}
                onMouseDown={handleMouseDown}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onScroll={(e) => {
                  // Scroll handling
                  const scrollLeft = (e.target as HTMLElement).scrollLeft;
                  const scrollDifference = Math.abs(
                    scrollLeft - timeline.scrollX,
                  );

                  // Immediately update store to keep ruler in sync
                  setScrollX(scrollLeft);

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
              <div className="absolute top-0 left-0 right-0 bottom-0 z-[999] pointer-events-none">
                <TimelinePlayhead
                  currentFrame={timeline.currentFrame}
                  frameWidth={frameWidth}
                  scrollX={timeline.scrollX}
                  visible={timeline.playheadVisible}
                  timelineScrollElement={tracksRef.current}
                  onStartDrag={handlePlayheadDragStart}
                />
              </div>

              {/* Split Indicator Line - confined to hovered track row */}
              {isSplitModeActive &&
                splitIndicatorPosition !== null &&
                hoveredTrackRow && (
                  <div
                    className="split-indicator"
                    style={{
                      left: `${splitIndicatorPosition}px`,
                      top: `${getTrackRowTopPosition(hoveredTrackRow)}px`,
                      height: `${getTrackRowHeightValue()}px`,
                    }}
                  />
                )}

              {/* Linked Track Indicators */}
              {isSplitModeActive &&
                linkedTrackIndicators.map((indicator, index) => (
                  <div
                    key={`linked-indicator-${index}`}
                    className="split-indicator"
                    style={{
                      left: `${indicator.position}px`,
                      top: `${getTrackRowTopPosition(indicator.trackType)}px`,
                      height: `${getTrackRowHeightValue()}px`,
                    }}
                  />
                ))}

              {/* Magnetic Snap Indicator - shows when Shift + dragging/resizing */}
              {playback.magneticSnapFrame !== null && tracksRef.current && (
                <>
                  {/* Magnetic snap line - solid center */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${playback.magneticSnapFrame * frameWidth - timeline.scrollX}px`,
                      top: 0,
                      bottom: 0,
                      width: '1px',
                      background:
                        'color-mix(in srgb, currentColor 50%, transparent)',
                      pointerEvents: 'none',
                      zIndex: 10,
                    }}
                  />
                  {/* Magnetic snap region - glowing area */}
                  <div
                    style={{
                      position: 'absolute',
                      left: `${playback.magneticSnapFrame * frameWidth - timeline.scrollX}px`,
                      top: 0,
                      bottom: 0,
                      width: '8px',
                      transform: 'translateX(-50%)',
                      background:
                        'linear-gradient(90deg, transparent, color-mix(in srgb, currentColor 15%, transparent) 50%, transparent)',
                      pointerEvents: 'none',
                      zIndex: 9,
                      opacity: 0.8,
                    }}
                  />
                </>
              )}
              {/* Marquee Selection Box */}
              {marqueeSelection?.isActive && tracksRef.current && (
                <div
                  className="absolute border-2 border-zinc-500 bg-zinc-500/20 dark:border-zinc-300 dark:bg-zinc-300/20 pointer-events-none z-[1000]"
                  style={{
                    left: `${Math.min(marqueeSelection.startX, marqueeSelection.currentX) - timeline.scrollX}px`,
                    top: `${Math.min(marqueeSelection.startY, marqueeSelection.currentY)}px`,
                    width: `${Math.abs(marqueeSelection.currentX - marqueeSelection.startX)}px`,
                    height: `${Math.abs(marqueeSelection.currentY - marqueeSelection.startY)}px`,
                  }}
                />
              )}

              {/* Drop Zone Indicator - shows where all clips will land */}
              {dragGhost?.isActive &&
                dragGhost.targetRow &&
                dragGhost.targetFrame !== null &&
                dragGhost.selectedTrackIds &&
                tracksRef.current &&
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

                        return (
                          <DropZoneIndicator
                            key={`drop-zone-${track.id}`}
                            targetRow={track.type}
                            startFrame={targetStartFrame}
                            endFrame={targetEndFrame}
                            frameWidth={frameWidth}
                            scrollX={timeline.scrollX}
                            visibleTrackRows={visibleTrackRows}
                            isValidDrop={true}
                          />
                        );
                      })}
                    </>
                  );
                })()}
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
                      />
                    );
                  })}
                </>
              );
            })()}
          </>
        )}

        {/* Project Shortcut Confirmation Dialog */}
        <ConfirmationDialog />
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check for Timeline component
    return prevProps.className === nextProps.className;
  },
);
