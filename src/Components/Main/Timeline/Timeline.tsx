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
import { TimelineControls } from './TimelineControls';
import { TimelinePlayhead } from './TimelinePlayhead';
import { TimelineRuler } from './TimelineRuler';
import { TimelineTracks } from './TimelineTracks';

interface TimelineProps {
  className?: string;
}

export const Timeline: React.FC<TimelineProps> = React.memo(
  ({ className }) => {
    const timelineRef = useRef<HTMLDivElement>(null);
    const tracksRef = useRef<HTMLDivElement>(null);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [dropActive, setDropActive] = useState(false);

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
    const setInPoint = useVideoEditorStore((state) => state.setInPoint);
    const setOutPoint = useVideoEditorStore((state) => state.setOutPoint);
    const setSelectedTracks = useVideoEditorStore(
      (state) => state.setSelectedTracks,
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
          // Calculate drop position based on mouse position
          const timelineRect = timelineRef.current?.getBoundingClientRect();
          if (!timelineRect) return;

          const relativeX = e.clientX - timelineRect.left - timeline.scrollX;
          const frameWidth = 2 * timeline.zoom; // Same calculation as in TimelineRuler
          const dropFrame = Math.max(0, Math.round(relativeX / frameWidth));

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
      if (!playback.isPlaying) return;

      const targetFPS = Math.min(15, timeline.fps); // Cap at 15fps for smoother performance
      const interval = setInterval(() => {
        const currentFrame = timeline.currentFrame;
        // --- Snap to next segment if in blank during playback ---
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
            setCurrentFrame(nextSegment.startFrame);
            return; // Don't advance frame this tick
          }
        }
        // --- End snap logic ---
        const nextFrame =
          currentFrame + Math.max(1, Math.round(timeline.fps / targetFPS)); // Skip frames for better performance
        if (nextFrame >= effectiveEndFrame) {
          setCurrentFrame(playback.isLooping ? 0 : effectiveEndFrame - 1);
        } else {
          setCurrentFrame(nextFrame);
        }
      }, 1000 / targetFPS);

      return () => clearInterval(interval);
    }, [
      playback.isPlaying,
      playback.isLooping,
      timeline.fps,
      timeline.totalFrames,
      timeline.currentFrame,
      effectiveEndFrame,
      setCurrentFrame,
      tracks,
    ]);

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

    // Cleanup scroll timeout on unmount
    useEffect(() => {
      return () => {
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
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

    // Handle timeline click to set current frame
    const handleTimelineClick = useCallback(
      (e: React.MouseEvent) => {
        if (!tracksRef.current) return;

        const rect = tracksRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left + tracksRef.current.scrollLeft;
        const frame = Math.floor(x / frameWidth);
        const clampedFrame = Math.max(
          0,
          Math.min(frame, effectiveEndFrame - 1),
        );
        setCurrentFrame(clampedFrame);
      },
      [frameWidth, effectiveEndFrame, setCurrentFrame],
    );

    return (
      <div
        ref={timelineRef}
        className={cn(
          'timeline-container flex flex-col flex-1 overflow-hidden',
          className,
        )}
      >
        {/* Timeline Header with Controls */}
        {/* TimelineHeader component removed as per edit hint */}

        {/* Timeline Controls */}
        <TimelineControls />

        {/* Timeline Content Area */}
        <div className="flex flex-col flex-1 relative overflow-hidden">
          {/* Timeline Ruler - Fixed at top but scrolls horizontally */}
          <div className="relative overflow-hidden z-10">
            <TimelineRuler
              frameWidth={frameWidth}
              totalFrames={timeline.totalFrames}
              scrollX={timeline.scrollX}
              fps={timeline.fps}
              tracks={tracks}
              inPoint={timeline.inPoint}
              outPoint={timeline.outPoint}
              onClick={handleTimelineClick}
            />
          </div>

          {/* Timeline Tracks Area */}
          <div className="flex-1 relative overflow-visible">
            <div
              ref={tracksRef}
              className={cn(
                'relative overflow-auto transition-colors duration-200',
                // dropActive &&
                //   'bg-blue-500/10 border-2 border-dashed border-blue-500',
              )}
              onClick={handleTimelineClick}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onScroll={(e) => {
                // Throttled scroll handling for better performance with many tracks
                const scrollLeft = (e.target as HTMLElement).scrollLeft;

                // Clear previous timeout
                if (scrollTimeoutRef.current) {
                  clearTimeout(scrollTimeoutRef.current);
                }

                // Set immediate update for smooth playhead movement
                setScrollX(scrollLeft);

                // Throttle additional updates for performance
                scrollTimeoutRef.current = setTimeout(() => {
                  setScrollX(scrollLeft);
                }, 16); // ~60fps throttling
              }}
            >
              <TimelineTracks
                tracks={tracks}
                frameWidth={frameWidth}
                timelineWidth={timelineWidth}
                scrollX={timeline.scrollX}
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
    );
  },
  (prevProps, nextProps) => {
    // Custom equality check for Timeline component
    return prevProps.className === nextProps.className;
  },
);
