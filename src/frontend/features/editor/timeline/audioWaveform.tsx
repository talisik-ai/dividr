import AudioWaveformGenerator from '@/backend/frontend_use/audioWaveformGenerator';
import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';

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
    const progressOverlayRef = useRef<HTMLDivElement>(null);
    const lastRenderedZoomRef = useRef<number>(0);
    const lastRenderedWaveformRef = useRef<string | null>(null);

    // Cache resampled waveforms per zoom level
    const resampledCache = useRef<Map<string, ResampledWaveform>>(new Map());

    // CRITICAL: Do NOT subscribe to currentFrame here to prevent re-renders
    // Progress updates are handled via direct DOM manipulation below

    const setCurrentFrame = useVideoEditorStore(
      (state) => state.setCurrentFrame,
    );
    const getWaveformBySource = useVideoEditorStore(
      (state) => state.getWaveformBySource,
    );
    const getWaveformByMediaId = useVideoEditorStore(
      (state) => state.getWaveformByMediaId,
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

      // CRITICAL: Use mediaId for accurate waveform lookup if available
      // This ensures each clip gets its own waveform, not a stale one from a previous clip
      if (track.mediaId) {
        const mediaIdWaveform = getWaveformByMediaId(track.mediaId);
        if (mediaIdWaveform?.success && mediaIdWaveform.peaks.length > 0) {
          // Found waveform by mediaId - use it directly
          let fullDuration = track.sourceDuration
            ? track.sourceDuration / fps
            : trackMetrics.durationSeconds;

          if (track.previewUrl && track.previewUrl.includes('extracted.wav')) {
            const originalVideo = mediaLibrary.find(
              (item) => item.id === track.mediaId,
            );
            if (originalVideo) {
              fullDuration = originalVideo.duration;
            }
          }

          const segmentStartTime = track.sourceStartTime || 0;
          const segmentEndTime =
            segmentStartTime + trackMetrics.durationSeconds;
          const isSegment =
            segmentStartTime > 0 || segmentEndTime < fullDuration;

          if (isSegment && mediaIdWaveform.peaks.length > 0) {
            const totalPeaks = mediaIdWaveform.peaks.length;
            const startPeakIndex = Math.floor(
              (segmentStartTime / fullDuration) * totalPeaks,
            );
            const endPeakIndex = Math.floor(
              (segmentEndTime / fullDuration) * totalPeaks,
            );

            const segmentPeaks = mediaIdWaveform.peaks.slice(
              startPeakIndex,
              endPeakIndex,
            );

            return {
              success: true,
              peaks: segmentPeaks,
              duration: segmentEndTime - segmentStartTime,
              sampleRate: mediaIdWaveform.sampleRate,
              cacheKey: `segment_${mediaIdWaveform.cacheKey}_${segmentStartTime}_${segmentEndTime}`,
              startTime: segmentStartTime,
              endTime: segmentEndTime,
              isSegment: true,
            };
          }

          return mediaIdWaveform;
        }
      }

      // Fallback to source-based lookup for backward compatibility
      // CRITICAL: If we have a mediaId but no waveform found, don't use duration-based fallback
      // as it can match the wrong waveform when videos have the same duration
      let sourceToCheck = track.source;
      // CRITICAL: Use sourceDuration (original media duration) not current trimmed duration
      let fullDuration = track.sourceDuration
        ? track.sourceDuration / fps
        : trackMetrics.durationSeconds;

      if (track.previewUrl && track.previewUrl.includes('extracted.wav')) {
        const originalVideo = mediaLibrary.find(
          (item) =>
            (track.mediaId && item.id === track.mediaId) ||
            (item.type === 'video' &&
              item.extractedAudio?.previewUrl === track.previewUrl),
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

      // CRITICAL: Only use duration-based fallback if we DON'T have a mediaId
      // Duration-based lookup can match the wrong waveform when videos have the same duration
      // If we have a mediaId, we should generate a new waveform instead of using a potentially wrong one
      if (!cachedWaveform?.success && !track.mediaId) {
        // Only use duration fallback for tracks without mediaId (backward compatibility)
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
      track.sourceDuration,
      trackMetrics.durationSeconds,
      getWaveformBySource,
      getWaveformByMediaId,
      mediaLibrary,
      track.mediaId,
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

      // CRITICAL: Use mediaId for accurate waveform generation if available
      let mediaItem = null;
      if (track.mediaId) {
        mediaItem = mediaLibrary.find((item) => item.id === track.mediaId);
      }

      // Fallback to source-based lookup
      if (!mediaItem) {
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
        mediaItem = mediaLibrary.find((item) => item.source === sourceToCheck);
      }

      if (
        mediaItem &&
        !mediaItem.waveform?.success &&
        !isGeneratingWaveform(mediaItem.id)
      ) {
        console.log(
          `🎵 Triggering waveform generation for track ${track.id} (mediaId: ${track.mediaId || 'none'})`,
        );
        generateWaveformForMedia(mediaItem.id).catch((error) => {
          console.warn(
            `⚠️ Waveform generation failed for ${track.name}:`,
            error,
          );
        });
      }
    }, [
      track.type,
      track.id,
      track.mediaId,
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

    // Draw static waveform (renders both base and progress layers once)
    const drawWaveform = useCallback(() => {
      const baseCanvas = canvasRef.current;
      const progressCanvas =
        progressOverlayRef.current?.querySelector('canvas');
      if (!baseCanvas || !progressCanvas || !waveformData) return;

      const baseCtx = baseCanvas.getContext('2d');
      const progressCtx = progressCanvas.getContext('2d');
      if (!baseCtx || !progressCtx) return;

      const { peaks } = waveformData;
      if (!peaks || peaks.length === 0) return;

      // Create a unique key for the current waveform state (includes track ID, trim info)
      // CRITICAL: Include track.id to ensure cache invalidation when track changes
      const startTime =
        'startTime' in waveformData ? waveformData.startTime : 0;
      const endTime = 'endTime' in waveformData ? waveformData.endTime : 0;
      const waveformKey = `${track.id}_${waveformData.cacheKey}_${peaks.length}_${startTime}_${endTime}`;
      const waveformChanged = lastRenderedWaveformRef.current !== waveformKey;

      // Clear resampled cache when waveform data changes (trim operation or track change)
      if (waveformChanged) {
        resampledCache.current.clear();
      }

      const zoomChanged = zoomLevel !== lastRenderedZoomRef.current;
      const shouldRedraw =
        zoomChanged ||
        waveformChanged ||
        baseCanvas.width === 0 ||
        baseCanvas.height === 0;

      if (!shouldRedraw) return;

      const dpr = window.devicePixelRatio || 1;
      const maxCanvasSize = 32768;
      const safeWidth = Math.min(width * dpr, maxCanvasSize);
      const safeHeight = Math.min(height * dpr, maxCanvasSize);

      // Setup both canvases
      [baseCanvas, progressCanvas].forEach((canvas) => {
        canvas.width = safeWidth;
        canvas.height = safeHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      });

      const scaleX = safeWidth / width;
      const scaleY = safeHeight / height;

      baseCtx.scale(scaleX, scaleY);
      progressCtx.scale(scaleX, scaleY);

      baseCtx.clearRect(0, 0, width, height);
      progressCtx.clearRect(0, 0, width, height);

      const trackDurationInFrames = trackMetrics.durationFrames;
      const displayWidth = Math.min(width, trackDurationInFrames * frameWidth);

      if (displayWidth <= 0 || !isFinite(displayWidth)) return;

      // Colors
      const baseBarColor = 'rgba(174, 169, 177, 0.8)';
      const stackedBarColor = 'rgba(161, 94, 253, 0.8)';
      const progressBaseColor = 'rgba(174, 169, 177, 1)';
      const progressStackedColor = 'rgba(161, 94, 253, 1)';
      const backgroundColor = 'rgba(156, 163, 175, 0.1)';

      baseCtx.fillStyle = backgroundColor;
      baseCtx.fillRect(0, 0, width, height);

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

      // Render waveform on both canvases (base and progress versions)
      for (let i = 0; i < resampledPeaks.length; i++) {
        const peak = Math.max(0, Math.min(1, resampledPeaks[i]));
        const barHeight = peak * maxBarHeight;

        const x = (i / resampledPeaks.length) * displayWidth;

        if (x < 0 || x >= displayWidth || barHeight <= 0) continue;

        const stackedPercentage = calculateStackedPercentage(peak, i);
        const stackedHeight = barHeight * stackedPercentage;
        const baseHeight = barHeight - stackedHeight;

        // Draw base (unprogressed) waveform
        if (baseHeight > 0) {
          baseCtx.fillStyle = baseBarColor;
          baseCtx.fillRect(
            x,
            height - baseHeight,
            barWidth - barSpacing,
            baseHeight,
          );
        }

        if (stackedHeight > 0) {
          baseCtx.fillStyle = stackedBarColor;
          baseCtx.fillRect(
            x,
            height - baseHeight - stackedHeight,
            barWidth - barSpacing,
            stackedHeight,
          );
        }

        // Draw progress (brighter) waveform on overlay canvas
        if (baseHeight > 0) {
          progressCtx.fillStyle = progressBaseColor;
          progressCtx.fillRect(
            x,
            height - baseHeight,
            barWidth - barSpacing,
            baseHeight,
          );
        }

        if (stackedHeight > 0) {
          progressCtx.fillStyle = progressStackedColor;
          progressCtx.fillRect(
            x,
            height - baseHeight - stackedHeight,
            barWidth - barSpacing,
            stackedHeight,
          );
        }
      }

      lastRenderedZoomRef.current = zoomLevel;
      lastRenderedWaveformRef.current = waveformKey;
    }, [
      waveformData,
      width,
      height,
      frameWidth,
      track,
      trackMetrics.durationFrames,
      zoomLevel,
      getResampledWaveform,
    ]);

    React.useEffect(() => {
      drawWaveform();
    }, [drawWaveform]);

    // CRITICAL: Subscribe to playback updates outside React render cycle
    // This updates the progress overlay via direct DOM manipulation
    React.useEffect(() => {
      const unsubscribe = useVideoEditorStore.subscribe(
        (state) => state.timeline.currentFrame,
        (currentFrame) => {
          const overlay = progressOverlayRef.current;
          if (!overlay) return;

          // Calculate progress position
          let progressPosition = 0;
          if (
            currentFrame >= track.startFrame &&
            currentFrame < track.endFrame
          ) {
            const trackFrame = currentFrame - track.startFrame;
            progressPosition = trackFrame * frameWidth;
            const trackDurationInFrames = track.endFrame - track.startFrame;
            const displayWidth = Math.min(
              width,
              trackDurationInFrames * frameWidth,
            );
            progressPosition = Math.min(progressPosition, displayWidth);
          }

          // Update overlay width via direct DOM manipulation (no React re-render)
          overlay.style.width = `${progressPosition}px`;
        },
      );

      return () => unsubscribe();
    }, [track.startFrame, track.endFrame, frameWidth, width]);

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
        {/* Static waveform canvas - never re-renders during playback */}
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onClick={handleCanvasClick}
        />

        {/* Progress overlay - updated via direct DOM manipulation (no React re-render) */}
        <div
          ref={progressOverlayRef}
          className="absolute top-0 left-0 h-full pointer-events-none overflow-hidden"
          style={{
            width: '0px',
            willChange: 'width',
          }}
        >
          <canvas className="w-full h-full" />
        </div>

        {height <= 26 && (
          <div
            className="absolute bottom-0 left-1 text-[8px] text-white font-bold pointer-events-none z-10"
            style={{ textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}
          >
            {track.name.replace(/\.[^/.]+$/, '').substring(0, 12)}
          </div>
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // CRITICAL: Re-render if track ID, mediaId, or source changes
    // This ensures waveforms update when new clips are imported
    if (
      prevProps.track.id !== nextProps.track.id ||
      prevProps.track.mediaId !== nextProps.track.mediaId ||
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

    const mutedChanged = prevProps.track.muted !== nextProps.track.muted;

    if (mutedChanged) {
      return false;
    }

    const dimensionsChanged =
      prevProps.frameWidth !== nextProps.frameWidth ||
      prevProps.height !== nextProps.height ||
      prevProps.width !== nextProps.width ||
      prevProps.zoomLevel !== nextProps.zoomLevel;

    if (dimensionsChanged) {
      return false;
    }

    return true;
  },
);

AudioWaveform.displayName = 'AudioWaveform';
