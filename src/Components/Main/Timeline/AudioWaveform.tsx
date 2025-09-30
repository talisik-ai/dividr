import { Loader2 } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';
import AudioWaveformGenerator from '../../../Utility/AudioWaveformGenerator';

// Debounce utility for performance optimization
const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

interface AudioWaveformProps {
  track: VideoTrack;
  frameWidth: number;
  width: number;
  height: number;
  zoomLevel: number; // For future optimization features
}

export const AudioWaveform: React.FC<AudioWaveformProps> = React.memo(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ({ track, frameWidth, width, height, zoomLevel: _zoomLevel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [lastRenderedFrame, setLastRenderedFrame] = useState<number>(-1);
    const [lastRenderedZoom, setLastRenderedZoom] = useState<number>(0);

    // Get current frame with debouncing for performance
    const currentFrame = useVideoEditorStore(
      (state) => state.timeline.currentFrame,
    );
    const debouncedCurrentFrame = useDebounce(currentFrame, 16); // ~60fps max updates

    const setCurrentFrame = useVideoEditorStore(
      (state) => state.setCurrentFrame,
    );
    const getWaveformBySource = useVideoEditorStore(
      (state) => state.getWaveformBySource,
    );
    const isGeneratingWaveform = useVideoEditorStore(
      (state) => state.isGeneratingWaveform,
    );
    const generateWaveformForMedia = useVideoEditorStore(
      (state) => state.generateWaveformForMedia,
    );
    const mediaLibrary = useVideoEditorStore((state) => state.mediaLibrary);
    const fps = useVideoEditorStore((state) => state.timeline.fps);

    // Memoize track metrics for stability
    const trackMetrics = useMemo(
      () => ({
        durationFrames: track.endFrame - track.startFrame,
        durationSeconds: (track.endFrame - track.startFrame) / fps,
        trackStartTime: track.sourceStartTime || 0,
      }),
      [track.startFrame, track.endFrame, track.sourceStartTime, fps],
    );

    // Get waveform data from the store - optimized for stability with segmenting support
    const waveformData = useMemo(() => {
      if (track.type !== 'audio') return null;

      // Find the media item that corresponds to this track
      let sourceToCheck = track.source;
      let fullDuration = trackMetrics.durationSeconds;

      // If this is an audio track that uses extracted audio, find the original video source
      if (track.previewUrl && track.previewUrl.includes('extracted.wav')) {
        const originalVideo = mediaLibrary.find(
          (item) =>
            item.type === 'video' &&
            item.extractedAudio?.previewUrl === track.previewUrl,
        );
        if (originalVideo) {
          sourceToCheck = originalVideo.source;
          fullDuration = originalVideo.duration; // Use full video duration for segmenting
        }
      }

      // Calculate segment parameters based on track timing
      const segmentStartTime = track.sourceStartTime || 0;
      const segmentEndTime = segmentStartTime + trackMetrics.durationSeconds;

      // Check if this is a segment (not the full audio)
      const isSegment = segmentStartTime > 0 || segmentEndTime < fullDuration;

      if (isSegment) {
        console.log(
          `🎵 Loading waveform segment for track "${track.name}": ${segmentStartTime}s - ${segmentEndTime}s`,
        );

        // Try to get cached segment first
        const audioPath = track.previewUrl || track.source;
        const cachedSegment = AudioWaveformGenerator.getCachedWaveformSegment(
          audioPath,
          fullDuration,
          segmentStartTime,
          segmentEndTime,
          8000,
          30,
        );

        if (cachedSegment?.success && cachedSegment.peaks.length > 0) {
          console.log(
            `✅ Using cached waveform segment for track "${track.name}"`,
          );
          return cachedSegment;
        }

        // If no cached segment, try to get the full waveform and slice it
        const fullWaveform = getWaveformBySource(sourceToCheck);
        if (fullWaveform?.success && fullWaveform.peaks.length > 0) {
          console.log(`✂️ Slicing full waveform for track "${track.name}"`);

          // Calculate peak indices for the segment
          const totalPeaks = fullWaveform.peaks.length;
          const startPeakIndex = Math.floor(
            (segmentStartTime / fullDuration) * totalPeaks,
          );
          const endPeakIndex = Math.floor(
            (segmentEndTime / fullDuration) * totalPeaks,
          );

          const segmentPeaks = fullWaveform.peaks.slice(
            startPeakIndex,
            endPeakIndex,
          );

          return {
            success: true,
            peaks: segmentPeaks,
            duration: segmentEndTime - segmentStartTime,
            sampleRate: fullWaveform.sampleRate,
            cacheKey: `segment_${fullWaveform.cacheKey}_${segmentStartTime}_${segmentEndTime}`,
            startTime: segmentStartTime,
            endTime: segmentEndTime,
            isSegment: true,
          };
        }
      }

      // Fallback to full waveform (for non-segmented tracks)
      const waveform = getWaveformBySource(sourceToCheck);

      if (waveform?.success && waveform.peaks.length > 0) {
        return waveform;
      }

      // Fallback: Check AudioWaveformGenerator cache directly
      const audioPath = track.previewUrl || track.source;

      // Try multiple audio path variations for better cache hit rate
      const pathsToTry = [audioPath];

      if (audioPath.includes('extracted.wav')) {
        const basePattern = audioPath.replace(
          /_\d+_extracted\.wav/,
          '_extracted.wav',
        );
        pathsToTry.push(basePattern);
        const videoName = track.name.replace(' (Extracted Audio)', '');
        pathsToTry.push(videoName);
      }

      let cachedWaveform = null;

      // Try each path until we find a cached waveform
      for (const pathToTry of pathsToTry) {
        cachedWaveform = AudioWaveformGenerator.getCachedWaveform(
          pathToTry,
          fullDuration,
          8000,
          30,
        );

        if (cachedWaveform?.success) {
          break;
        }
      }

      // If no exact path match, try finding by duration
      if (!cachedWaveform?.success) {
        cachedWaveform = AudioWaveformGenerator.findCachedWaveformByDuration(
          fullDuration,
          8000,
          2.0,
        );
      }

      if (cachedWaveform?.success && cachedWaveform.peaks.length > 0) {
        // If this is a segment, slice the full waveform
        if (isSegment) {
          const totalPeaks = cachedWaveform.peaks.length;
          const startPeakIndex = Math.floor(
            (segmentStartTime / fullDuration) * totalPeaks,
          );
          const endPeakIndex = Math.floor(
            (segmentEndTime / fullDuration) * totalPeaks,
          );

          const segmentPeaks = cachedWaveform.peaks.slice(
            startPeakIndex,
            endPeakIndex,
          );

          return {
            success: true,
            peaks: segmentPeaks,
            duration: segmentEndTime - segmentStartTime,
            sampleRate: cachedWaveform.sampleRate,
            cacheKey: `segment_${cachedWaveform.cacheKey}_${segmentStartTime}_${segmentEndTime}`,
            startTime: segmentStartTime,
            endTime: segmentEndTime,
            isSegment: true,
          };
        }

        return {
          success: cachedWaveform.success,
          peaks: cachedWaveform.peaks,
          duration: cachedWaveform.duration,
          sampleRate: cachedWaveform.sampleRate,
          cacheKey: cachedWaveform.cacheKey,
        };
      }

      return null;
    }, [
      track.type,
      track.source,
      track.previewUrl,
      track.name,
      track.sourceStartTime,
      trackMetrics.durationSeconds,
      getWaveformBySource,
      mediaLibrary,
    ]);

    // Check if waveform is currently being generated - optimized
    const isLoading = useMemo(() => {
      if (track.type !== 'audio') return false;

      let sourceToCheck = track.source;
      if (track.previewUrl && track.previewUrl.includes('extracted.wav')) {
        const originalVideo = mediaLibrary.find(
          (item) =>
            item.type === 'video' &&
            item.extractedAudio?.previewUrl === track.previewUrl,
        );
        if (originalVideo) {
          sourceToCheck = originalVideo.source;
        }
      }

      const mediaItem = mediaLibrary.find(
        (item) => item.source === sourceToCheck,
      );

      return mediaItem ? isGeneratingWaveform(mediaItem.id) : false;
    }, [
      track.type,
      track.source,
      track.previewUrl,
      isGeneratingWaveform,
      mediaLibrary,
    ]);

    // Trigger waveform generation if not available and not currently generating
    useEffect(() => {
      if (track.type !== 'audio' || waveformData || isLoading) return;

      // Find the media item that corresponds to this track
      let sourceToCheck = track.source;
      let fullDuration = trackMetrics.durationSeconds;

      if (track.previewUrl && track.previewUrl.includes('extracted.wav')) {
        const originalVideo = mediaLibrary.find(
          (item) =>
            item.type === 'video' &&
            item.extractedAudio?.previewUrl === track.previewUrl,
        );
        if (originalVideo) {
          sourceToCheck = originalVideo.source;
          fullDuration = originalVideo.duration;
        }
      }

      // Calculate segment parameters
      const segmentStartTime = track.sourceStartTime || 0;
      const segmentEndTime = segmentStartTime + trackMetrics.durationSeconds;
      const isSegment = segmentStartTime > 0 || segmentEndTime < fullDuration;

      // Check cache first
      const audioPath = track.previewUrl || track.source;
      let cachedWaveform = null;

      if (isSegment) {
        // Check for cached segment
        cachedWaveform = AudioWaveformGenerator.getCachedWaveformSegment(
          audioPath,
          fullDuration,
          segmentStartTime,
          segmentEndTime,
          8000,
          30,
        );
      } else {
        // Check for full waveform
        cachedWaveform = AudioWaveformGenerator.getCachedWaveform(
          audioPath,
          fullDuration,
          8000,
          30,
        );
      }

      if (cachedWaveform?.success) {
        return; // Cache exists, waveformData will update on next render
      }

      const mediaItem = mediaLibrary.find(
        (item) => item.source === sourceToCheck,
      );

      if (
        mediaItem &&
        !mediaItem.waveform?.success &&
        !isGeneratingWaveform(mediaItem.id)
      ) {
        // Generate full waveform first, then segment will be created from it
        generateWaveformForMedia(mediaItem.id).catch((error) => {
          console.warn(
            `⚠️ Fallback waveform generation failed for ${track.name}:`,
            error,
          );
        });
      }
    }, [
      track.type,
      track.source,
      track.previewUrl,
      track.sourceStartTime,
      trackMetrics.durationSeconds,
      waveformData,
      isLoading,
      generateWaveformForMedia,
      isGeneratingWaveform,
      mediaLibrary,
    ]);

    // Draw waveform on canvas - optimized to prevent unnecessary redraws
    const drawWaveform = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !waveformData) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { peaks } = waveformData;

      // Early exit for invalid or empty data
      if (!peaks || peaks.length === 0) return;

      // Check if we need to redraw based on frame changes or zoom changes
      const currentFrame = debouncedCurrentFrame;
      const zoomChanged = Math.abs(_zoomLevel - lastRenderedZoom) > 0.1;
      const shouldRedraw =
        lastRenderedFrame !== currentFrame ||
        zoomChanged ||
        canvas.width === 0 ||
        canvas.height === 0;

      if (!shouldRedraw) {
        return; // Skip redraw if nothing significant changed
      }

      const dpr = window.devicePixelRatio || 1;

      // Prevent excessive canvas sizes at extreme zoom levels
      const maxCanvasSize = 32768; // Browser limit for canvas dimensions
      const safeWidth = Math.min(width * dpr, maxCanvasSize);
      const safeHeight = Math.min(height * dpr, maxCanvasSize);

      // Set canvas size accounting for device pixel ratio and limits
      canvas.width = safeWidth;
      canvas.height = safeHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Scale context for device pixel ratio
      const scaleX = safeWidth / width;
      const scaleY = safeHeight / height;
      ctx.scale(scaleX, scaleY);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Calculate display parameters
      const trackDurationInFrames = trackMetrics.durationFrames;
      const displayWidth = Math.min(width, trackDurationInFrames * frameWidth);

      // Safety check for valid display width
      if (displayWidth <= 0 || !isFinite(displayWidth)) return;

      // Bar spectrum colors - Gray base with purple stacking
      const baseBarColor = 'rgba(174, 169, 177, 0.8)'; // Gray-500 for normal bars
      const stackedBarColor = 'rgba(161, 94, 253, 0.8)'; // Purple-600 for stacked portion
      const progressBaseColor = 'rgba(174, 169, 177, 1)'; // Gray-600 for progress bars
      const progressStackedColor = 'rgba(161, 94, 253, 1)'; // Purple-700 for progress stacked portion
      const backgroundColor = 'rgba(156, 163, 175, 0.1)'; // Gray-400 very light background

      // Clear canvas with light background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Calculate current progress position to match TimelinePlayhead positioning
      let progressPosition = 0;

      if (currentFrame >= track.startFrame && currentFrame < track.endFrame) {
        // Use the EXACT same positioning logic as TimelinePlayhead for perfect sync
        const trackFrame = currentFrame - track.startFrame;
        progressPosition = trackFrame * frameWidth;
        progressPosition = Math.min(progressPosition, displayWidth);
      }

      // Calculate purple stacking percentage for each peak
      // Purple represents decibel spikes - the loudest parts of the audio
      const calculateStackedPercentage = (
        peak: number,
        index: number,
      ): number => {
        // Algorithm to show purple on decibel spikes/peak intensity
        // Higher decibel levels get more purple, quieter parts stay gray
        const baseThreshold = 0.3; // Minimum decibel level for purple to appear
        const variation = Math.sin(index * 0.1) * 0.1; // Subtle variation for natural look
        const normalizedPeak = Math.max(0, peak - baseThreshold);
        const percentage = Math.min(0.6, normalizedPeak + variation); // Max 60% purple on loudest spikes
        return Math.max(0, percentage);
      };

      // Calculate bar parameters with safety checks
      const peaksLength = peaks.length;
      const barWidth = Math.max(0.1, displayWidth / peaksLength); // Prevent division by zero

      // At extreme zoom levels, optimize rendering
      const isExtremeZoom = barWidth < 0.5;

      if (isExtremeZoom) {
        // For extreme zoom, use simplified stacked bar spectrum rendering
        const maxBarHeight = height - 4; // Full height minus small padding

        // Draw simplified vertical stacked bars for extreme zoom
        for (let i = 0; i < peaksLength; i++) {
          const peak = Math.max(0, Math.min(1, peaks[i] || 0)); // Clamp to valid range
          const barHeight = peak * maxBarHeight;
          const x = (i / peaksLength) * displayWidth;
          const barWidthUsed = Math.max(0.5, barWidth);

          if (barHeight > 0) {
            const stackedPercentage = calculateStackedPercentage(peak, i);
            const stackedHeight = barHeight * stackedPercentage;
            const baseHeight = barHeight - stackedHeight;

            // Draw base gray bar from bottom up
            if (baseHeight > 0) {
              ctx.fillStyle = baseBarColor;
              ctx.fillRect(
                Math.floor(x),
                height - baseHeight,
                barWidthUsed,
                baseHeight,
              );
            }

            // Draw purple stacked portion on top of gray
            if (stackedHeight > 0) {
              ctx.fillStyle = stackedBarColor;
              ctx.fillRect(
                Math.floor(x),
                height - baseHeight - stackedHeight,
                barWidthUsed,
                stackedHeight,
              );
            }
          }
        }

        // Draw progress overlay for stacked bar spectrum
        if (progressPosition > 0) {
          for (let i = 0; i < peaksLength; i++) {
            const peak = Math.max(0, Math.min(1, peaks[i] || 0));
            const barHeight = peak * maxBarHeight;
            const x = (i / peaksLength) * displayWidth;
            const barWidthUsed = Math.max(0.5, barWidth);

            // Only draw progress bars up to the progress position
            if (x <= progressPosition && barHeight > 0) {
              const stackedPercentage = calculateStackedPercentage(peak, i);
              const stackedHeight = barHeight * stackedPercentage;
              const baseHeight = barHeight - stackedHeight;

              // Draw progress base gray bar
              if (baseHeight > 0) {
                ctx.fillStyle = progressBaseColor;
                ctx.fillRect(
                  Math.floor(x),
                  height - baseHeight,
                  barWidthUsed,
                  baseHeight,
                );
              }

              // Draw progress purple stacked portion
              if (stackedHeight > 0) {
                ctx.fillStyle = progressStackedColor;
                ctx.fillRect(
                  Math.floor(x),
                  height - baseHeight - stackedHeight,
                  barWidthUsed,
                  stackedHeight,
                );
              }
            }
          }
        }
      } else {
        // Normal stacked bar spectrum rendering for reasonable zoom levels
        const barSpacing = barWidth > 1 ? 1 : 0;
        const effectiveBarWidth = Math.max(0.1, barWidth - barSpacing);
        const maxBarHeight = height - 4; // Full height minus small padding

        // Calculate visible range to optimize rendering
        const startIndex = Math.max(0, Math.floor(-10 / barWidth)); // Start slightly before visible area
        const endIndex = Math.min(
          peaksLength,
          Math.ceil((displayWidth + 10) / barWidth),
        ); // End slightly after visible area

        // Draw vertical stacked bars representing audio spectrum
        for (let i = startIndex; i < endIndex; i++) {
          const peak = Math.max(0, Math.min(1, peaks[i] || 0)); // Clamp to valid range
          const barHeight = peak * maxBarHeight;

          // Calculate x position for this bar
          const barX = (i / peaksLength) * displayWidth;

          // Only draw bars that are actually visible and have valid dimensions
          if (
            barX >= -effectiveBarWidth &&
            barX < displayWidth + effectiveBarWidth &&
            barHeight > 0
          ) {
            const stackedPercentage = calculateStackedPercentage(peak, i);
            const stackedHeight = barHeight * stackedPercentage;
            const baseHeight = barHeight - stackedHeight;

            // Draw base gray bar from bottom up
            if (baseHeight > 0) {
              ctx.fillStyle = baseBarColor;
              ctx.fillRect(
                Math.floor(barX),
                height - baseHeight,
                Math.ceil(effectiveBarWidth),
                baseHeight,
              );
            }

            // Draw purple stacked portion on top of gray
            if (stackedHeight > 0) {
              ctx.fillStyle = stackedBarColor;
              ctx.fillRect(
                Math.floor(barX),
                height - baseHeight - stackedHeight,
                Math.ceil(effectiveBarWidth),
                stackedHeight,
              );
            }
          }
        }

        // Draw progress overlay with same stacked bar spectrum pattern
        if (progressPosition > 0) {
          for (let i = startIndex; i < endIndex; i++) {
            const peak = Math.max(0, Math.min(1, peaks[i] || 0));
            const barHeight = peak * maxBarHeight;
            const barX = (i / peaksLength) * displayWidth;

            // Only draw progress bars up to the progress position
            if (
              barX >= -effectiveBarWidth &&
              barX <= progressPosition + effectiveBarWidth &&
              barHeight > 0
            ) {
              const stackedPercentage = calculateStackedPercentage(peak, i);
              const stackedHeight = barHeight * stackedPercentage;
              const baseHeight = barHeight - stackedHeight;

              // Draw progress base gray bar
              if (baseHeight > 0) {
                ctx.fillStyle = progressBaseColor;
                ctx.fillRect(
                  Math.floor(barX),
                  height - baseHeight,
                  Math.ceil(effectiveBarWidth),
                  baseHeight,
                );
              }

              // Draw progress purple stacked portion
              if (stackedHeight > 0) {
                ctx.fillStyle = progressStackedColor;
                ctx.fillRect(
                  Math.floor(barX),
                  height - baseHeight - stackedHeight,
                  Math.ceil(effectiveBarWidth),
                  stackedHeight,
                );
              }
            }
          }
        }
      }

      // Update the last rendered frame and zoom to prevent unnecessary redraws
      setLastRenderedFrame(currentFrame);
      setLastRenderedZoom(_zoomLevel);
    }, [
      waveformData,
      width,
      height,
      frameWidth,
      track,
      trackMetrics.durationFrames,
      debouncedCurrentFrame,
      lastRenderedFrame,
      _zoomLevel,
      lastRenderedZoom,
    ]);

    // Redraw when dependencies change
    React.useEffect(() => {
      drawWaveform();
    }, [drawWaveform]);

    // Handle canvas click for seeking - optimized
    const handleCanvasClick = useCallback(
      (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!waveformData) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;

        // Use frame-based calculation that matches TimelinePlayhead positioning exactly
        const frameOffset = Math.floor(clickX / frameWidth);
        const targetFrame = track.startFrame + frameOffset;

        // Clamp to track bounds
        const clampedFrame = Math.max(
          track.startFrame,
          Math.min(targetFrame, track.endFrame - 1),
        );

        setCurrentFrame(clampedFrame);
      },
      [
        waveformData,
        frameWidth,
        track.startFrame,
        track.endFrame,
        setCurrentFrame,
      ],
    );

    // Handle errors and loading states
    if (track.type !== 'audio') {
      return null;
    }

    if (isLoading) {
      return (
        <div
          className="flex items-center justify-center bg-secondary/10 border border-secondary/20 rounded"
          style={{ width, height }}
        >
          <Loader2 className="w-4 h-4 animate-spin text-green-400" />
          <span className="ml-1 text-xs text-green-400">
            Loading waveform...
          </span>
        </div>
      );
    }

    if (!waveformData) {
      return (
        <div
          className="flex text-xs gap-2 px-2 items-center"
          style={{ width, height }}
        >
          <Loader2 className="size-3 animate-spin" />
          <span className="truncate"> Generating waveform...</span>
        </div>
      );
    }

    return (
      <div
        className="relative bg-gray-100/10 border border-gray-300/20 rounded overflow-hidden"
        style={{ width, height }}
      >
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onClick={handleCanvasClick}
        />

        {/* Track name overlay for very small waveforms */}
        {height <= 26 && (
          <div
            className="absolute bottom-0 left-1 text-[8px] text-white font-bold pointer-events-none"
            style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}
          >
            {track.name.replace(/\.[^/.]+$/, '').substring(0, 12)}
          </div>
        )}
      </div>
    );
  },
  // Optimized memoization comparison function - similar to VideoSpriteSheetStrip
  (prevProps, nextProps) => {
    // Track identity and source changes always trigger re-render
    if (
      prevProps.track.id !== nextProps.track.id ||
      prevProps.track.source !== nextProps.track.source
    ) {
      return false;
    }

    // Critical track timing changes
    const trackTimingChanged =
      prevProps.track.startFrame !== nextProps.track.startFrame ||
      prevProps.track.endFrame !== nextProps.track.endFrame ||
      prevProps.track.sourceStartTime !== nextProps.track.sourceStartTime;

    if (trackTimingChanged) {
      return false;
    }

    // Dimensions that affect layout
    const dimensionsChanged =
      prevProps.frameWidth !== nextProps.frameWidth ||
      prevProps.height !== nextProps.height;

    if (dimensionsChanged) {
      return false;
    }

    // Width changes for viewport culling (less sensitive)
    const significantWidthChange =
      Math.abs(prevProps.width - nextProps.width) > 50;

    if (significantWidthChange) {
      return false;
    }

    // Zoom changes with tolerance for smooth experience
    const significantZoomChange =
      Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) > 0.1;

    if (significantZoomChange) {
      return false;
    }

    // If none of the above triggered, the component can skip re-rendering
    return true;
  },
);

AudioWaveform.displayName = 'AudioWaveform';
