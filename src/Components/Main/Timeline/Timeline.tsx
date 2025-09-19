import { cn } from '@/Lib/utils';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../../../Store/VideoEditorStore';
import { ProjectThumbnailSetter } from './ProjectThumbnailSetter';
import { TimelineControls } from './TimelineControls';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTrackControllers } from './TimelineTrackControllers';
import { TimelineTracks } from './TimelineTracks';

interface TimelineProps {
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = React.memo(
  ({ className }) => {
    const timelineRef = useRef<HTMLDivElement>(null);
    const tracksRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const autoFollowTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastFrameUpdateRef = useRef<number>(0);
    const isManualScrollingRef = useRef<boolean>(false);
    const isDraggingRef = useRef<boolean>(false);
    const dragStartXRef = useRef<number>(0);
    const dragStartScrollXRef = useRef<number>(0);
    const lastClickTimeRef = useRef<number>(0);
    const hasDraggedRef = useRef<boolean>(false);
    const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [, setDropActive] = useState(false);
    const [autoFollowEnabled, setAutoFollowEnabled] = useState(true);
    const [isDragging, setIsDragging] = useState(false);

    // Selectively subscribe to store to prevent unnecessary re-renders
    const timeline = useVideoEditorStore((state) => state.timeline);
    const tracks = useVideoEditorStore((state) => state.tracks);
    const playback = useVideoEditorStore((state) => state.playback);
    const setCurrentFrame = useVideoEditorStore(
      (state) => state.setCurrentFrame,
    );
    const setScrollX = useVideoEditorStore((state) => state.setScrollX);
    const setZoom = useVideoEditorStore((state) => state.setZoom);
    const togglePlayback = useVideoEditorStore((state) => state.togglePlayback);
    const pause = useVideoEditorStore((state) => state.pause);
    const setInPoint = useVideoEditorStore((state) => state.setInPoint);
    const setOutPoint = useVideoEditorStore((state) => state.setOutPoint);
    const setSelectedTracks = useVideoEditorStore(
      (state) => state.setSelectedTracks,
    );
    const removeSelectedTracks = useVideoEditorStore(
      (state) => state.removeSelectedTracks,
    );
    const addTrackFromMediaLibrary = useVideoEditorStore(
      (state) => state.addTrackFromMediaLibrary,
    );
    const importMediaToTimeline = useVideoEditorStore(
      (state) => state.importMediaToTimeline,
    );

    // Calculate effective timeline duration based on actual track content - memoized
    const effectiveEndFrame = useMemo(() => {
      return tracks.length > 0
        ? Math.max(
            ...tracks.map((track) => track.endFrame),
            timeline.totalFrames,
          )
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

          try {
            const result = await importMediaToTimeline(files);
            if (result.success) {
              console.log(
                `✅ Successfully imported ${result.importedFiles.length} files to timeline`,
              );
            } else {
              console.error('❌ Failed to import files to timeline');
            }
          } catch (error) {
            console.error('❌ Error importing files to timeline:', error);
          }
        }
      },
      [
        timeline.scrollX,
        timeline.zoom,
        addTrackFromMediaLibrary,
        importMediaToTimeline,
      ],
    );

    // Animation loop for playback
    useEffect(() => {
      if (!playback.isPlaying) {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
        return;
      }

      const targetFPS = Math.min(20, timeline.fps);
      const intervalMs = 1000 / targetFPS;

      playbackIntervalRef.current = setInterval(() => {
        // Use ref to prevent race conditions
        const currentFrame = lastFrameUpdateRef.current;

        // Snap to next segment if in blank during playback
        const isInBlank = !tracks.some(
          (track) =>
            track.type === 'video' &&
            track.visible &&
            track.previewUrl &&
            currentFrame >= track.startFrame &&
            currentFrame < track.endFrame,
        );

        if (isInBlank) {
          const nextSegment = tracks
            .filter(
              (track) =>
                track.type === 'video' &&
                track.visible &&
                track.previewUrl &&
                track.startFrame > currentFrame,
            )
            .sort((a, b) => a.startFrame - b.startFrame)[0];
          if (nextSegment) {
            const clampedFrame = Math.max(
              0,
              Math.min(nextSegment.startFrame, effectiveEndFrame - 1),
            );
            lastFrameUpdateRef.current = clampedFrame;
            setCurrentFrame(clampedFrame);
            return;
          }
        }

        const nextFrame = currentFrame + 1;

        if (nextFrame >= effectiveEndFrame) {
          const finalFrame = playback.isLooping
            ? 0
            : Math.max(0, effectiveEndFrame - 1);
          lastFrameUpdateRef.current = finalFrame;
          setCurrentFrame(finalFrame);
        } else {
          const clampedFrame = Math.max(
            0,
            Math.min(nextFrame, effectiveEndFrame - 1),
          );
          lastFrameUpdateRef.current = clampedFrame;
          setCurrentFrame(clampedFrame);
        }
      }, intervalMs);

      return () => {
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
          playbackIntervalRef.current = null;
        }
      };
    }, [
      playback.isPlaying,
      playback.isLooping,
      timeline.fps,
      effectiveEndFrame,
      setCurrentFrame,
      tracks,
    ]);

    // Sync lastFrameUpdateRef with actual currentFrame changes
    useEffect(() => {
      lastFrameUpdateRef.current = timeline.currentFrame;
    }, [timeline.currentFrame]);

    // Keyboard shortcuts
    useHotkeys('space', (e) => {
      e.preventDefault();
      togglePlayback();
    });

    useHotkeys('home', () => setCurrentFrame(0));
    useHotkeys('end', () => setCurrentFrame(effectiveEndFrame - 1));
    useHotkeys('left', () =>
      setCurrentFrame(Math.max(0, timeline.currentFrame - 1)),
    );
    useHotkeys('right', () =>
      setCurrentFrame(
        Math.min(effectiveEndFrame - 1, timeline.currentFrame + 1),
      ),
    );
    useHotkeys('i', () => setInPoint(timeline.currentFrame));
    useHotkeys('o', () => setOutPoint(timeline.currentFrame));
    useHotkeys(
      'del',
      (e) => {
        e.preventDefault();
        removeSelectedTracks();
      },
      { enableOnFormTags: false },
    );
    useHotkeys(
      'backspace',
      (e) => {
        e.preventDefault();
        removeSelectedTracks();
      },
      { enableOnFormTags: false },
    );

    // Global keyboard event listener as fallback
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Delete' || e.key === 'Backspace') {
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
        if (playbackIntervalRef.current) {
          clearInterval(playbackIntervalRef.current);
        }
        if (seekTimeoutRef.current) {
          clearTimeout(seekTimeoutRef.current);
        }
      };
    }, []);

    // Zoom controls
    useHotkeys('equal', () => setZoom(Math.min(timeline.zoom * 1.2, 10)));
    useHotkeys('minus', () => setZoom(Math.max(timeline.zoom / 1.2, 0.1)));
    useHotkeys('0', () => setZoom(1));

    // Handle wheel zoom
    const handleWheel = useCallback(
      (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
          setZoom(Math.max(0.1, Math.min(timeline.zoom * zoomFactor, 10)));
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
        Math.abs(tracksElement.scrollLeft - timeline.scrollX) > 1
      ) {
        tracksElement.scrollLeft = timeline.scrollX;
      }
    }, [timeline.scrollX]);

    // Calculate frame width based on zoom - memoized
    const frameWidth = useMemo(() => 2 * timeline.zoom, [timeline.zoom]);
    const timelineWidth = useMemo(
      () => effectiveEndFrame * frameWidth,
      [effectiveEndFrame, frameWidth],
    );

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
        isManualScrollingRef.current = false;
        tracksElement.scrollTo({
          left: Math.max(0, targetScrollX),
          behavior: 'smooth',
        });
        setTimeout(() => {
          setScrollX(Math.max(0, targetScrollX));
        }, 16);
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

    // Re-enable auto-follow when playback starts, but only if not manually scrolling
    useEffect(() => {
      if (playback.isPlaying && !isManualScrollingRef.current) {
        setAutoFollowEnabled(true);
      }
    }, [playback.isPlaying]);

    // Handle double-click event (works better with touchpads)
    const handleDoubleClick = useCallback(
      (e: React.MouseEvent) => {
        if (!tracksRef.current) return;

        // Cancel any pending seek operation
        if (seekTimeoutRef.current) {
          clearTimeout(seekTimeoutRef.current);
          seekTimeoutRef.current = null;
        }

        // Pause playback when entering drag mode
        if (playback.isPlaying) {
          pause();
        }

        // Double-click detected: start drag-to-scroll mode
        isDraggingRef.current = true;
        setIsDragging(true);
        hasDraggedRef.current = false; // Reset drag flag
        dragStartXRef.current = e.clientX;
        dragStartScrollXRef.current = tracksRef.current.scrollLeft;
        lastClickTimeRef.current = 0; // Reset to prevent conflicts

        // Disable auto-follow during drag
        isManualScrollingRef.current = true;
        setAutoFollowEnabled(false);

        e.preventDefault();
        e.stopPropagation();
      },
      [pause, playback.isPlaying],
    );

    // Handle mouse down for both single click and double-click detection
    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        if (!tracksRef.current) return;

        const currentTime = Date.now();
        const isDoubleClick = currentTime - lastClickTimeRef.current < 400;

        if (isDoubleClick) {
          // Cancel any pending seek
          if (seekTimeoutRef.current) {
            clearTimeout(seekTimeoutRef.current);
            seekTimeoutRef.current = null;
          }

          // Pause playback when entering drag mode
          if (playback.isPlaying) {
            pause();
          }

          // Double-click: start drag-to-scroll mode
          lastClickTimeRef.current = 0; // Reset to prevent triple-click issues
          isDraggingRef.current = true;
          setIsDragging(true);
          hasDraggedRef.current = false; // Reset drag flag
          dragStartXRef.current = e.clientX;
          dragStartScrollXRef.current = tracksRef.current.scrollLeft;

          // Disable auto-follow during drag
          isManualScrollingRef.current = true;
          setAutoFollowEnabled(false);

          e.preventDefault();
          e.stopPropagation();
        } else {
          // First click: record time and position for potential seek
          lastClickTimeRef.current = currentTime;
          dragStartXRef.current = e.clientX;

          // Store click position for potential seek
          const rect = tracksRef.current.getBoundingClientRect();
          const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
          const frame = Math.floor(x / frameWidth);
          const clampedFrame = Math.max(
            0,
            Math.min(frame, effectiveEndFrame - 1),
          );

          // Delay seek to allow for double-click detection
          seekTimeoutRef.current = setTimeout(() => {
            if (
              !isDraggingRef.current &&
              Date.now() - lastClickTimeRef.current > 350
            ) {
              // Single click confirmed: seek to frame
              pause();
              isManualScrollingRef.current = true;
              setAutoFollowEnabled(false);

              lastFrameUpdateRef.current = clampedFrame;
              setCurrentFrame(clampedFrame);

              setTimeout(() => {
                setAutoFollowEnabled(true);
                isManualScrollingRef.current = false;
              }, 200);
            }
            seekTimeoutRef.current = null;
          }, 350);
        }
      },
      [
        frameWidth,
        effectiveEndFrame,
        setCurrentFrame,
        pause,
        playback.isPlaying,
      ],
    );

    // Handle mouse move for dragging
    const handleMouseMove = useCallback(
      (e: React.MouseEvent) => {
        if (!isDraggingRef.current || !tracksRef.current) return;

        const deltaX = e.clientX - dragStartXRef.current;

        // Mark as actually dragged if moved more than a few pixels
        if (Math.abs(deltaX) > 3) {
          hasDraggedRef.current = true;
        }

        const newScrollX = Math.max(0, dragStartScrollXRef.current - deltaX);

        // Immediately update both the DOM and store to sync ruler and timeline
        tracksRef.current.scrollLeft = newScrollX;
        setScrollX(newScrollX);

        e.preventDefault();
      },
      [setScrollX],
    );

    // Handle mouse up to end dragging
    const handleMouseUp = useCallback(() => {
      if (isDraggingRef.current) {
        const hadActualDrag = hasDraggedRef.current;

        isDraggingRef.current = false;
        setIsDragging(false);
        hasDraggedRef.current = false;

        // If we actually dragged, cancel any pending seek
        if (hadActualDrag && seekTimeoutRef.current) {
          clearTimeout(seekTimeoutRef.current);
          seekTimeoutRef.current = null;
        }

        // Re-enable auto-follow after drag
        setTimeout(() => {
          setAutoFollowEnabled(true);
          isManualScrollingRef.current = false;
        }, 200);
      }
    }, []);

    // Add global mouse event listeners for dragging
    useEffect(() => {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        if (!isDraggingRef.current || !tracksRef.current) return;

        const deltaX = e.clientX - dragStartXRef.current;

        // Mark as actually dragged if moved more than a few pixels
        if (Math.abs(deltaX) > 3) {
          hasDraggedRef.current = true;
        }

        const newScrollX = Math.max(0, dragStartScrollXRef.current - deltaX);

        // Immediately update both the DOM and store to sync ruler and timeline
        tracksRef.current.scrollLeft = newScrollX;
        setScrollX(newScrollX);

        e.preventDefault();
      };

      const handleGlobalMouseUp = () => {
        if (isDraggingRef.current) {
          const hadActualDrag = hasDraggedRef.current;

          isDraggingRef.current = false;
          setIsDragging(false);
          hasDraggedRef.current = false;

          // If we actually dragged, cancel any pending seek
          if (hadActualDrag && seekTimeoutRef.current) {
            clearTimeout(seekTimeoutRef.current);
            seekTimeoutRef.current = null;
          }

          setTimeout(() => {
            setAutoFollowEnabled(true);
            isManualScrollingRef.current = false;
          }, 200);
        }
      };

      if (isDragging) {
        document.addEventListener('mousemove', handleGlobalMouseMove);
        document.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
          document.removeEventListener('mousemove', handleGlobalMouseMove);
          document.removeEventListener('mouseup', handleGlobalMouseUp);
        };
      }
    }, [isDragging, setScrollX]);

    return (
      <div
        ref={timelineRef}
        className={cn(
          'timeline-container flex flex-col flex-1 overflow-hidden',
          className,
        )}
        tabIndex={0}
      >
        {/* Timeline Header with Controls */}
        {/* TimelineHeader component removed as per edit hint */}

        {/* Timeline Controls */}
        <TimelineControls />

        <div className="flex flex-1">
          {/* Timeline Track Controllers */}
          <TimelineTrackControllers
            tracks={tracks}
            className="w-fit flex-shrink-0"
          />

          {/* Project Thumbnail Setter - Only show if there are video tracks */}
          {tracks.some((track) => track.type === 'video') && (
            <ProjectThumbnailSetter />
          )}
          {/* Timeline Content Area */}
          <div className="flex flex-col flex-1 relative overflow-hidden">
            {/* Timeline Ruler - Fixed at top but scrolls horizontally */}
            <div
              className={cn(
                'relative overflow-hidden z-10',
                isDragging ? 'cursor-grabbing select-none' : 'cursor-pointer',
              )}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onDoubleClick={handleDoubleClick}
              title="Click to seek • Double-click and drag to scroll"
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
              />
            </div>

            {/* Timeline Tracks Area */}
            <div className="flex-1 relative overflow-visible">
              <div
                ref={tracksRef}
                className={cn(
                  'relative overflow-auto transition-colors duration-200',
                  isDragging ? 'cursor-grabbing select-none' : 'cursor-pointer',
                  // dropActive &&
                  //   'bg-blue-500/10 border-2 border-dashed border-blue-500',
                )}
                title="Click to seek • Double-click and drag to scroll"
                style={{
                  scrollBehavior:
                    autoFollowEnabled && playback.isPlaying ? 'smooth' : 'auto',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onDoubleClick={handleDoubleClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onScroll={(e) => {
                  // Scroll handling
                  const scrollLeft = (e.target as HTMLElement).scrollLeft;
                  const scrollDifference = Math.abs(
                    scrollLeft - timeline.scrollX,
                  );

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

                  if (scrollTimeoutRef.current) {
                    clearTimeout(scrollTimeoutRef.current);
                  }

                  setScrollX(scrollLeft);

                  scrollTimeoutRef.current = setTimeout(() => {
                    if (
                      Math.abs(
                        (e.target as HTMLElement).scrollLeft - scrollLeft,
                      ) < 2
                    ) {
                      setScrollX((e.target as HTMLElement).scrollLeft);
                    }
                  }, 16);
                }}
              >
                <TimelineTracks
                  tracks={tracks}
                  frameWidth={frameWidth}
                  timelineWidth={timelineWidth}
                  scrollX={timeline.scrollX}
                  zoomLevel={timeline.zoom}
                  selectedTrackIds={timeline.selectedTrackIds}
                  onTrackSelect={setSelectedTracks}
                />
              </div>

              {/* Global Playhead - spans across ruler and tracks */}
              <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none z-[999]">
                <TimelinePlayhead
                  currentFrame={timeline.currentFrame}
                  frameWidth={frameWidth}
                  scrollX={timeline.scrollX}
                  visible={timeline.playheadVisible}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check for Timeline component
    return prevProps.className === nextProps.className;
  },
);
