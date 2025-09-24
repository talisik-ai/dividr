import { Loader2 } from 'lucide-react';
import React, { useCallback, useMemo, useRef } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';

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

    const timeline = useVideoEditorStore((state) => state.timeline);
    const setCurrentFrame = useVideoEditorStore(
      (state) => state.setCurrentFrame,
    );
    const getWaveformBySource = useVideoEditorStore(
      (state) => state.getWaveformBySource,
    );
    const isGeneratingWaveform = useVideoEditorStore(
      (state) => state.isGeneratingWaveform,
    );

    // Get waveform data from the store
    const waveformData = useMemo(() => {
      if (track.type !== 'audio') return null;

      // First, try to get waveform from the track's media library item
      // For audio tracks created from videos, check if there's extracted audio
      const mediaLibrary = useVideoEditorStore.getState().mediaLibrary;

      // Find the media item that corresponds to this track
      let sourceToCheck = track.source;

      // If this is an audio track that uses extracted audio, find the original video source
      if (track.previewUrl && track.previewUrl.includes('extracted.wav')) {
        // This is an extracted audio track, find the original video
        const originalVideo = mediaLibrary.find(
          (item) =>
            item.type === 'video' &&
            item.extractedAudio?.previewUrl === track.previewUrl,
        );
        if (originalVideo) {
          sourceToCheck = originalVideo.source;
        }
      }

      const waveform = getWaveformBySource(sourceToCheck);

      if (waveform?.success && waveform.peaks.length > 0) {
        return waveform;
      }

      return null;
    }, [track.type, track.source, track.previewUrl, getWaveformBySource]);

    // Check if waveform is currently being generated
    const isLoading = useMemo(() => {
      if (track.type !== 'audio') return false;

      const mediaLibrary = useVideoEditorStore.getState().mediaLibrary;
      const mediaItem = mediaLibrary.find(
        (item) => item.source === track.source,
      );

      return mediaItem ? isGeneratingWaveform(mediaItem.id) : false;
    }, [track.type, track.source, isGeneratingWaveform]);

    // Draw waveform on canvas
    const drawWaveform = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !waveformData) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { peaks } = waveformData;

      // Early exit for invalid or empty data
      if (!peaks || peaks.length === 0) return;

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
      const trackDurationInFrames = track.endFrame - track.startFrame;
      const displayWidth = Math.min(width, trackDurationInFrames * frameWidth);

      // Safety check for valid display width
      if (displayWidth <= 0 || !isFinite(displayWidth)) return;

      // Bar spectrum colors - Gray base with purple stacking
      const baseBarColor = track.muted
        ? 'rgba(174, 169, 177, 0.4)' // Gray-500 with opacity for muted
        : 'rgba(174, 169, 177, 0.8)'; // Gray-500 for normal bars
      const stackedBarColor = track.muted
        ? 'rgba(161, 94, 253, 0.4)' // Purple-600 with opacity for muted
        : 'rgba(161, 94, 253, 0.8)'; // Purple-600 for stacked portion
      const progressBaseColor = 'rgba(174, 169, 177, 1)'; // Gray-600 for progress bars
      const progressStackedColor = 'rgba(161, 94, 253, 1)'; // Purple-700 for progress stacked portion
      const backgroundColor = 'rgba(156, 163, 175, 0.1)'; // Gray-400 very light background

      // Clear canvas with light background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Calculate current progress position to match TimelinePlayhead positioning
      const currentFrame = timeline.currentFrame;
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
    }, [waveformData, width, height, frameWidth, track, timeline.currentFrame]);

    // Redraw when dependencies change
    React.useEffect(() => {
      drawWaveform();
    }, [drawWaveform]);

    // Handle canvas click for seeking
    const handleCanvasClick = useCallback(
      (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!waveformData) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;

        // Use frame-based calculation that matches TimelinePlayhead positioning exactly
        // Convert click position to frame offset within the track
        const frameOffset = Math.floor(clickX / frameWidth);
        const targetFrame = track.startFrame + frameOffset;

        // Clamp to track bounds
        const clampedFrame = Math.max(
          track.startFrame,
          Math.min(targetFrame, track.endFrame - 1),
        );

        console.log(
          `[AudioWaveform] Seeking to frame ${clampedFrame} from waveform click`,
        );
        setCurrentFrame(clampedFrame);
      },
      [waveformData, width, frameWidth, track, setCurrentFrame],
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
          className="flex items-center justify-center bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200 text-xs"
          style={{ width, height }}
        >
          <span className="truncate">⏳ Generating waveform...</span>
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
          className="w-full h-full cursor-pointer"
          onClick={handleCanvasClick}
          style={{
            filter: track.muted ? 'opacity(0.5) grayscale(1)' : 'none',
          }}
        />

        {/* Muted overlay */}
        {track.muted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white text-xs font-bold pointer-events-none">
            🔇 MUTED
          </div>
        )}

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
  // Memoization comparison function
  (prevProps, nextProps) => {
    return (
      prevProps.track.id === nextProps.track.id &&
      prevProps.track.muted === nextProps.track.muted &&
      prevProps.track.startFrame === nextProps.track.startFrame &&
      prevProps.track.endFrame === nextProps.track.endFrame &&
      prevProps.frameWidth === nextProps.frameWidth &&
      prevProps.width === nextProps.width &&
      prevProps.height === nextProps.height &&
      prevProps.zoomLevel === nextProps.zoomLevel
    );
  },
);

AudioWaveform.displayName = 'AudioWaveform';
