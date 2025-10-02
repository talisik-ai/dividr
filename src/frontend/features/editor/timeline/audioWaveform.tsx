import AudioWaveformGenerator from '@/backend/ffmpeg/audioWaveformGenerator';
import { Loader2 } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useVideoEditorStore, VideoTrack } from '../stores/VideoEditorStore';

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
  zoomLevel: number;
}

// Multi-resolution waveform data structure
interface ResampledWaveform {
  peaks: number[];
  pixelsPerSample: number;
  zoomLevel: number;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = React.memo(
  ({ track, frameWidth, width, height, zoomLevel }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [lastRenderedFrame, setLastRenderedFrame] = useState<number>(-1);
    const [lastRenderedZoom, setLastRenderedZoom] = useState<number>(0);

    // Cache resampled waveforms per zoom level
    const resampledCache = useRef<Map<string, ResampledWaveform>>(new Map());

    const currentFrame = useVideoEditorStore(
      (state) => state.timeline.currentFrame,
    );
    const debouncedCurrentFrame = useDebounce(currentFrame, 16);

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

    const trackMetrics = useMemo(
      () => ({
        durationFrames: track.endFrame - track.startFrame,
        durationSeconds: (track.endFrame - track.startFrame) / fps,
        trackStartTime: track.sourceStartTime || 0,
      }),
      [track.startFrame, track.endFrame, track.sourceStartTime, fps],
    );

    // Get waveform data from the store
    const waveformData = useMemo(() => {
      if (track.type !== 'audio') return null;

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

      const segmentStartTime = track.sourceStartTime || 0;
      const segmentEndTime = segmentStartTime + trackMetrics.durationSeconds;
      const isSegment = segmentStartTime > 0 || segmentEndTime < fullDuration;

      if (isSegment) {
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
          return cachedSegment;
        }

        const fullWaveform = getWaveformBySource(sourceToCheck);
        if (fullWaveform?.success && fullWaveform.peaks.length > 0) {
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

      const waveform = getWaveformBySource(sourceToCheck);
      if (waveform?.success && waveform.peaks.length > 0) {
        return waveform;
      }

      const audioPath = track.previewUrl || track.source;
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

      if (!cachedWaveform?.success) {
        cachedWaveform = AudioWaveformGenerator.findCachedWaveformByDuration(
          fullDuration,
          8000,
          2.0,
        );
      }

      if (cachedWaveform?.success && cachedWaveform.peaks.length > 0) {
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

    useEffect(() => {
      if (track.type !== 'audio' || waveformData || isLoading) return;

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

      const segmentStartTime = track.sourceStartTime || 0;
      const segmentEndTime = segmentStartTime + trackMetrics.durationSeconds;
      const isSegment = segmentStartTime > 0 || segmentEndTime < fullDuration;

      const audioPath = track.previewUrl || track.source;
      let cachedWaveform = null;

      if (isSegment) {
        cachedWaveform = AudioWaveformGenerator.getCachedWaveformSegment(
          audioPath,
          fullDuration,
          segmentStartTime,
          segmentEndTime,
          8000,
          30,
        );
      } else {
        cachedWaveform = AudioWaveformGenerator.getCachedWaveform(
          audioPath,
          fullDuration,
          8000,
          30,
        );
      }

      if (cachedWaveform?.success) {
        return;
      }

      const mediaItem = mediaLibrary.find(
        (item) => item.source === sourceToCheck,
      );

      if (
        mediaItem &&
        !mediaItem.waveform?.success &&
        !isGeneratingWaveform(mediaItem.id)
      ) {
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

    // Adaptive resampling based on zoom level with proper interpolation
    const getResampledWaveform = useCallback(
      (peaks: number[], displayWidth: number): ResampledWaveform => {
        const cacheKey = `${track.id}_${zoomLevel.toFixed(2)}_${displayWidth}`;

        // Check cache first
        const cached = resampledCache.current.get(cacheKey);
        if (cached) {
          return cached;
        }

        // Calculate pixels per audio sample
        const pixelsPerSample = displayWidth / peaks.length;

        let resampledPeaks: number[];

        if (pixelsPerSample >= 1) {
          // HIGH ZOOM: Each sample gets >= 1 pixel
          // Use linear interpolation to fill gaps smoothly
          resampledPeaks = [];
          const targetSamples = Math.ceil(displayWidth);

          for (let i = 0; i < targetSamples; i++) {
            const samplePosition = (i / targetSamples) * peaks.length;
            const sampleIndex = Math.floor(samplePosition);
            const fraction = samplePosition - sampleIndex;

            const sample1 = peaks[sampleIndex] || 0;
            const sample2 =
              peaks[Math.min(sampleIndex + 1, peaks.length - 1)] || 0;

            // Linear interpolation for smooth visuals
            const interpolatedValue = sample1 + (sample2 - sample1) * fraction;
            resampledPeaks.push(interpolatedValue);
          }
        } else if (pixelsPerSample >= 0.5) {
          // MEDIUM ZOOM: 2-1 samples per pixel
          // Use simple averaging for clean downsampling
          // const samplesPerPixel = Math.ceil(1 / pixelsPerSample);
          const targetSamples = Math.floor(displayWidth);
          resampledPeaks = [];

          for (let i = 0; i < targetSamples; i++) {
            const startIdx = Math.floor((i / targetSamples) * peaks.length);
            const endIdx = Math.min(
              Math.floor(((i + 1) / targetSamples) * peaks.length),
              peaks.length,
            );

            // RMS averaging for better perceived loudness
            let sum = 0;
            let count = 0;
            for (let j = startIdx; j < endIdx; j++) {
              sum += (peaks[j] || 0) ** 2;
              count++;
            }
            const rms = count > 0 ? Math.sqrt(sum / count) : 0;
            resampledPeaks.push(rms);
          }
        } else {
          // LOW ZOOM: Many samples per pixel
          // Use max pooling to preserve peaks visibility
          const targetSamples = Math.floor(displayWidth);
          resampledPeaks = [];

          for (let i = 0; i < targetSamples; i++) {
            const startIdx = Math.floor((i / targetSamples) * peaks.length);
            const endIdx = Math.min(
              Math.floor(((i + 1) / targetSamples) * peaks.length),
              peaks.length,
            );

            // Max pooling to preserve peak visibility at low zoom
            let maxPeak = 0;
            for (let j = startIdx; j < endIdx; j++) {
              maxPeak = Math.max(maxPeak, peaks[j] || 0);
            }
            resampledPeaks.push(maxPeak);
          }
        }

        const result: ResampledWaveform = {
          peaks: resampledPeaks,
          pixelsPerSample,
          zoomLevel,
        };

        // Cache the result
        resampledCache.current.set(cacheKey, result);

        // Limit cache size (keep last 10 zoom levels)
        if (resampledCache.current.size > 10) {
          const firstKey = resampledCache.current.keys().next().value;
          resampledCache.current.delete(firstKey);
        }

        return result;
      },
      [track.id, zoomLevel],
    );

    // Draw waveform with multi-resolution rendering
    const drawWaveform = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !waveformData) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { peaks } = waveformData;
      if (!peaks || peaks.length === 0) return;

      const currentFrame = debouncedCurrentFrame;
      const zoomChanged = Math.abs(zoomLevel - lastRenderedZoom) > 0.01;
      const shouldRedraw =
        lastRenderedFrame !== currentFrame ||
        zoomChanged ||
        canvas.width === 0 ||
        canvas.height === 0;

      if (!shouldRedraw) return;

      const dpr = window.devicePixelRatio || 1;
      const maxCanvasSize = 32768;
      const safeWidth = Math.min(width * dpr, maxCanvasSize);
      const safeHeight = Math.min(height * dpr, maxCanvasSize);

      canvas.width = safeWidth;
      canvas.height = safeHeight;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const scaleX = safeWidth / width;
      const scaleY = safeHeight / height;
      ctx.scale(scaleX, scaleY);
      ctx.clearRect(0, 0, width, height);

      const trackDurationInFrames = trackMetrics.durationFrames;
      const displayWidth = Math.min(width, trackDurationInFrames * frameWidth);

      if (displayWidth <= 0 || !isFinite(displayWidth)) return;

      // Colors
      const baseBarColor = 'rgba(174, 169, 177, 0.8)';
      const stackedBarColor = 'rgba(161, 94, 253, 0.8)';
      const progressBaseColor = 'rgba(174, 169, 177, 1)';
      const progressStackedColor = 'rgba(161, 94, 253, 1)';
      const backgroundColor = 'rgba(156, 163, 175, 0.1)';

      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Calculate progress position
      let progressPosition = 0;
      if (currentFrame >= track.startFrame && currentFrame < track.endFrame) {
        const trackFrame = currentFrame - track.startFrame;
        progressPosition = trackFrame * frameWidth;
        progressPosition = Math.min(progressPosition, displayWidth);
      }

      const calculateStackedPercentage = (
        peak: number,
        index: number,
      ): number => {
        const baseThreshold = 0.3;
        const variation = Math.sin(index * 0.1) * 0.1;
        const normalizedPeak = Math.max(0, peak - baseThreshold);
        const percentage = Math.min(0.6, normalizedPeak + variation);
        return Math.max(0, percentage);
      };

      // Get adaptively resampled waveform
      const resampled = getResampledWaveform(peaks, displayWidth);
      const { peaks: resampledPeaks, pixelsPerSample } = resampled;

      const maxBarHeight = height - 4;

      // Determine bar width based on zoom level
      const barWidth = Math.max(1, Math.min(3, pixelsPerSample));
      const barSpacing = barWidth > 2 ? 0.5 : 0;

      // Render waveform bars
      for (let i = 0; i < resampledPeaks.length; i++) {
        const peak = Math.max(0, Math.min(1, resampledPeaks[i]));
        const barHeight = peak * maxBarHeight;

        const x = (i / resampledPeaks.length) * displayWidth;

        if (x < 0 || x >= displayWidth || barHeight <= 0) continue;

        const stackedPercentage = calculateStackedPercentage(peak, i);
        const stackedHeight = barHeight * stackedPercentage;
        const baseHeight = barHeight - stackedHeight;

        const isInProgress = x <= progressPosition;

        // Draw base gray bar
        if (baseHeight > 0) {
          ctx.fillStyle = isInProgress ? progressBaseColor : baseBarColor;
          ctx.fillRect(
            x,
            height - baseHeight,
            barWidth - barSpacing,
            baseHeight,
          );
        }

        // Draw purple stacked portion
        if (stackedHeight > 0) {
          ctx.fillStyle = isInProgress ? progressStackedColor : stackedBarColor;
          ctx.fillRect(
            x,
            height - baseHeight - stackedHeight,
            barWidth - barSpacing,
            stackedHeight,
          );
        }
      }

      setLastRenderedFrame(currentFrame);
      setLastRenderedZoom(zoomLevel);
    }, [
      waveformData,
      width,
      height,
      frameWidth,
      track,
      trackMetrics.durationFrames,
      debouncedCurrentFrame,
      lastRenderedFrame,
      zoomLevel,
      lastRenderedZoom,
      getResampledWaveform,
    ]);

    React.useEffect(() => {
      drawWaveform();
    }, [drawWaveform]);

    const handleCanvasClick = useCallback(
      (event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!waveformData) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const clickX = event.clientX - rect.left;

        const frameOffset = Math.floor(clickX / frameWidth);
        const targetFrame = track.startFrame + frameOffset;

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
  (prevProps, nextProps) => {
    if (
      prevProps.track.id !== nextProps.track.id ||
      prevProps.track.source !== nextProps.track.source
    ) {
      return false;
    }

    const trackTimingChanged =
      prevProps.track.startFrame !== nextProps.track.startFrame ||
      prevProps.track.endFrame !== nextProps.track.endFrame ||
      prevProps.track.sourceStartTime !== nextProps.track.sourceStartTime;

    if (trackTimingChanged) {
      return false;
    }

    const dimensionsChanged =
      prevProps.frameWidth !== nextProps.frameWidth ||
      prevProps.height !== nextProps.height;

    if (dimensionsChanged) {
      return false;
    }

    const significantWidthChange =
      Math.abs(prevProps.width - nextProps.width) > 50;

    if (significantWidthChange) {
      return false;
    }

    const significantZoomChange =
      Math.abs(prevProps.zoomLevel - nextProps.zoomLevel) > 0.01;

    if (significantZoomChange) {
      return false;
    }

    return true;
  },
);

AudioWaveform.displayName = 'AudioWaveform';
