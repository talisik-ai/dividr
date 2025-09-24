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
      const dpr = window.devicePixelRatio || 1;

      // Set canvas size accounting for device pixel ratio
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      // Scale context for device pixel ratio
      ctx.scale(dpr, dpr);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      if (peaks.length === 0) return;

      // Calculate display parameters
      const trackDurationInFrames = track.endFrame - track.startFrame;
      const displayWidth = Math.min(width, trackDurationInFrames * frameWidth);

      // Note: We simplified to use frame-based positioning for TimelinePlayhead sync

      // Waveform colors - Gray theme
      const waveColor = track.muted
        ? 'rgba(107, 114, 128, 0.4)' // Gray-500 with opacity
        : 'rgba(107, 114, 128, 0.8)'; // Gray-500
      const progressColor = 'rgba(75, 85, 99, 1)'; // Gray-600 for progress
      const backgroundColor = 'rgba(156, 163, 175, 0.1)'; // Gray-400 very light background

      // Clear canvas with light background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Calculate current progress position to match TimelinePlayhead positioning
      const currentFrame = timeline.currentFrame;
      let progressPosition = 0;

      if (currentFrame >= track.startFrame && currentFrame < track.endFrame) {
        // Use the EXACT same positioning logic as TimelinePlayhead for perfect sync
        // TimelinePlayhead position: currentFrame * frameWidth - scrollX
        // But for the waveform, we need the relative position within the track's visual bounds
        const trackFrame = currentFrame - track.startFrame;
        // Use frame-based positioning that matches exactly with TimelinePlayhead
        progressPosition = trackFrame * frameWidth;

        // Clamp to displayWidth to prevent overflow
        progressPosition = Math.min(progressPosition, displayWidth);
      }

      // Draw waveform as bars with proper spacing
      const barWidth = Math.max(1, Math.floor(displayWidth / peaks.length));
      const barSpacing = barWidth > 1 ? 1 : 0;
      const effectiveBarWidth = barWidth - barSpacing;

      ctx.fillStyle = waveColor;
      const centerY = height / 2;
      const maxBarHeight = (height - 6) / 2; // Leave padding top and bottom

      // Draw bars representing audio peaks
      for (let i = 0; i < peaks.length; i++) {
        const peak = peaks[i] || 0;
        const barHeight = peak * maxBarHeight;

        // Calculate x position for this bar
        const barX = (i / peaks.length) * displayWidth;

        // Only draw bars that are visible
        if (barX >= 0 && barX < displayWidth) {
          // Draw bar from center outward (both up and down)
          ctx.fillRect(
            Math.floor(barX),
            centerY - barHeight,
            effectiveBarWidth,
            barHeight * 2,
          );
        }
      }

      // Draw progress overlay with same bar pattern
      if (progressPosition > 0) {
        ctx.fillStyle = progressColor;

        for (let i = 0; i < peaks.length; i++) {
          const peak = peaks[i] || 0;
          const barHeight = peak * maxBarHeight;
          const barX = (i / peaks.length) * displayWidth;

          // Only draw progress bars up to the progress position
          if (barX >= 0 && barX <= progressPosition) {
            ctx.fillRect(
              Math.floor(barX),
              centerY - barHeight,
              effectiveBarWidth,
              barHeight * 2,
            );
          }
        }

        // Draw progress line to match TimelinePlayhead position exactly
        // Use the same primary color as TimelinePlayhead (typically blue in most themes)
        // ctx.fillStyle = 'rgb(59, 130, 246)'; // Primary blue matching TimelinePlayhead
        // const lineWidth = 2;
        // const lineX = Math.floor(progressPosition) - Math.floor(lineWidth / 2); // Center the line
        // ctx.fillRect(lineX, 0, lineWidth, height);
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
