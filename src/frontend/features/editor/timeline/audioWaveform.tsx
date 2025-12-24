import AudioWaveformGenerator from '@/backend/frontend_use/audioWaveformGenerator';
import { Loader2 } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';
import { getDisplayFps } from '../stores/videoEditor/types/timeline.types';

interface AudioWaveformProps {
  track: VideoTrack;
  frameWidth: number;
  width: number;
  height: number;
  zoomLevel: number;
}

// CapCut-style bar waveform configuration - PIXEL LOCKED
// These constants define the visual appearance of the waveform bars
// CRITICAL: These values are in RAW PIXELS (not scaled by DPR)
const BAR_WIDTH = 2; // Fixed bar width in pixels - NEVER changes with zoom
const BAR_GAP = 1; // Fixed gap between bars in pixels
const BAR_STEP = BAR_WIDTH + BAR_GAP; // Total step per bar (width + gap)

// TILED RENDERING CONFIGURATION
// Instead of one giant canvas, we use multiple fixed-size tile canvases
// This eliminates canvas size limits and prevents any CSS stretching
const TILE_WIDTH = 3000; // Each tile is exactly 3000px wide (1000 bars)
const BARS_PER_TILE = Math.floor(TILE_WIDTH / BAR_STEP); // ~1000 bars per tile

export const AudioWaveform: React.FC<AudioWaveformProps> = React.memo(
  ({ track, frameWidth, width, height, zoomLevel }) => {
    // Container ref for the tile container
    const tileContainerRef = useRef<HTMLDivElement>(null);
    const progressOverlayRef = useRef<HTMLDivElement>(null);
    const lastRenderedKeyRef = useRef<string | null>(null);

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
    const allTracks = useVideoEditorStore((state) => state.tracks);
    // Get display FPS from source video tracks (dynamic but static once determined)
    const displayFps = useMemo(() => getDisplayFps(allTracks), [allTracks]);

    const trackMetrics = useMemo(
      () => ({
        durationFrames: track.endFrame - track.startFrame,
        durationSeconds: (track.endFrame - track.startFrame) / displayFps,
        trackStartTime: track.sourceStartTime || 0,
      }),
      [track.startFrame, track.endFrame, track.sourceStartTime, displayFps],
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
            ? track.sourceDuration / displayFps
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
            // CRITICAL: Use Math.round for accurate boundary alignment
            // Math.floor causes off-by-one errors at cut boundaries, leading to visual smearing
            const startPeakIndex = Math.round(
              (segmentStartTime / fullDuration) * totalPeaks,
            );
            const endPeakIndex = Math.round(
              (segmentEndTime / fullDuration) * totalPeaks,
            );

            // Clamp indices to valid range
            const clampedStart = Math.max(
              0,
              Math.min(startPeakIndex, totalPeaks - 1),
            );
            const clampedEnd = Math.max(
              clampedStart + 1,
              Math.min(endPeakIndex, totalPeaks),
            );

            const segmentPeaks = mediaIdWaveform.peaks.slice(
              clampedStart,
              clampedEnd,
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
        ? track.sourceDuration / displayFps
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
          // CRITICAL: Use Math.round for accurate boundary alignment
          const startPeakIndex = Math.round(
            (segmentStartTime / fullDuration) * totalPeaks,
          );
          const endPeakIndex = Math.round(
            (segmentEndTime / fullDuration) * totalPeaks,
          );

          // Clamp indices to valid range
          const clampedStart = Math.max(
            0,
            Math.min(startPeakIndex, totalPeaks - 1),
          );
          const clampedEnd = Math.max(
            clampedStart + 1,
            Math.min(endPeakIndex, totalPeaks),
          );

          const segmentPeaks = fullWaveform.peaks.slice(
            clampedStart,
            clampedEnd,
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
          // CRITICAL: Use Math.round for accurate boundary alignment
          const startPeakIndex = Math.round(
            (segmentStartTime / fullDuration) * totalPeaks,
          );
          const endPeakIndex = Math.round(
            (segmentEndTime / fullDuration) * totalPeaks,
          );

          // Clamp indices to valid range
          const clampedStart = Math.max(
            0,
            Math.min(startPeakIndex, totalPeaks - 1),
          );
          const clampedEnd = Math.max(
            clampedStart + 1,
            Math.min(endPeakIndex, totalPeaks),
          );

          const segmentPeaks = cachedWaveform.peaks.slice(
            clampedStart,
            clampedEnd,
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

    // Check if waveform generation is in progress
    const isLoading = useMemo(() => {
      if (track.type !== 'audio') return false;

      // First check by mediaId
      if (track.mediaId) {
        return isGeneratingWaveform(track.mediaId);
      }

      // Fallback to source-based lookup
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
      track.mediaId,
      track.source,
      track.previewUrl,
      isGeneratingWaveform,
      mediaLibrary,
    ]);

    // CRITICAL: Check if waveform already exists in media library
    // This prevents showing "Generating waveform..." when the waveform is already cached
    const hasExistingWaveform = useMemo(() => {
      if (track.type !== 'audio') return false;

      // Check by mediaId first (most reliable)
      if (track.mediaId) {
        const mediaItem = mediaLibrary.find(
          (item) => item.id === track.mediaId,
        );
        if (
          mediaItem?.waveform?.success &&
          mediaItem.waveform.peaks?.length > 0
        ) {
          return true;
        }
      }

      // Fallback to source-based lookup
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

      return (
        mediaItem?.waveform?.success && mediaItem.waveform.peaks?.length > 0
      );
    }, [
      track.type,
      track.mediaId,
      track.source,
      track.previewUrl,
      mediaLibrary,
    ]);

    useEffect(() => {
      // Skip if not audio, already have waveform data, loading, or waveform exists in media library
      if (
        track.type !== 'audio' ||
        waveformData ||
        isLoading ||
        hasExistingWaveform
      )
        return;

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
      track.name,
      waveformData,
      isLoading,
      hasExistingWaveform,
      generateWaveformForMedia,
      isGeneratingWaveform,
      mediaLibrary,
    ]);

    // Get peaks for a specific range of bars using LOD-aware sampling
    // CRITICAL: No interpolation, no smoothing - discrete bar sampling only
    const getPeaksForBarRange = useCallback(
      (
        peaks: number[],
        lodTiers:
          | { level: number; peaksPerSecond: number; peaks: number[] }[]
          | undefined,
        startBar: number,
        endBar: number,
        totalBars: number,
        durationSeconds: number,
      ): number[] => {
        const numBars = endBar - startBar;
        if (numBars <= 0 || peaks.length === 0) return [];

        // Calculate required peaks per second for this display
        const barsPerSecond = totalBars / durationSeconds;

        // Select the best LOD tier for this requirement
        let sourcePeaks = peaks;
        if (lodTiers && lodTiers.length > 0) {
          const sortedTiers = [...lodTiers].sort(
            (a, b) => b.peaksPerSecond - a.peaksPerSecond,
          );
          let selectedTier = sortedTiers[0];
          for (const tier of sortedTiers) {
            if (tier.peaksPerSecond >= barsPerSecond) {
              selectedTier = tier;
            } else {
              break;
            }
          }
          sourcePeaks = selectedTier.peaks;
        }

        // Map bar positions to peaks
        const barPeaks: number[] = new Array(numBars);
        const peaksPerBar = sourcePeaks.length / totalBars;

        if (peaksPerBar >= 1) {
          // ZOOM-OUT: More peaks than bars -> max-pooling
          for (let i = 0; i < numBars; i++) {
            const globalBarIndex = startBar + i;
            const startPeakIdx = Math.floor(globalBarIndex * peaksPerBar);
            const endPeakIdx = Math.min(
              Math.floor((globalBarIndex + 1) * peaksPerBar),
              sourcePeaks.length,
            );
            let maxPeak = 0;
            for (let j = startPeakIdx; j < endPeakIdx; j++) {
              maxPeak = Math.max(maxPeak, sourcePeaks[j] || 0);
            }
            barPeaks[i] = maxPeak;
          }
        } else {
          // ZOOM-IN: More bars than peaks -> peak-repeating
          const barsPerPeak = totalBars / sourcePeaks.length;
          for (let i = 0; i < numBars; i++) {
            const globalBarIndex = startBar + i;
            const peakIndex = Math.min(
              Math.floor(globalBarIndex / barsPerPeak),
              sourcePeaks.length - 1,
            );
            barPeaks[i] = sourcePeaks[peakIndex] || 0;
          }
        }

        return barPeaks;
      },
      [],
    );

    // Calculate tile configuration based on current display width
    // This is the core of the tiled rendering system
    const tileConfig = useMemo(() => {
      const trackDurationInFrames = trackMetrics.durationFrames;
      const displayWidth = Math.min(width, trackDurationInFrames * frameWidth);

      if (displayWidth <= 0 || !isFinite(displayWidth)) {
        return { tiles: [], totalBars: 0, displayWidth: 0 };
      }

      // Calculate total bars needed for the entire display
      const totalBars = Math.floor(displayWidth / BAR_STEP);
      if (totalBars <= 0) {
        return { tiles: [], totalBars: 0, displayWidth };
      }

      // Calculate number of tiles needed
      const numTiles = Math.ceil(totalBars / BARS_PER_TILE);

      // Generate tile definitions
      const tiles: Array<{
        index: number;
        startBar: number;
        endBar: number;
        x: number;
        width: number;
      }> = [];

      for (let i = 0; i < numTiles; i++) {
        const startBar = i * BARS_PER_TILE;
        const endBar = Math.min(startBar + BARS_PER_TILE, totalBars);
        const barsInTile = endBar - startBar;

        tiles.push({
          index: i,
          startBar,
          endBar,
          x: startBar * BAR_STEP,
          width: barsInTile * BAR_STEP,
        });
      }

      return { tiles, totalBars, displayWidth };
    }, [width, frameWidth, trackMetrics.durationFrames]);

    // Render a single tile to its canvas
    const renderTile = useCallback(
      (
        canvas: HTMLCanvasElement,
        tile: { startBar: number; endBar: number; width: number },
        peaks: number[],
        lodTiers:
          | { level: number; peaksPerSecond: number; peaks: number[] }[]
          | undefined,
        totalBars: number,
        canvasHeight: number,
        isProgress: boolean,
      ) => {
        const ctx = canvas.getContext('2d', { alpha: true });
        if (!ctx) return;

        // CRITICAL: Canvas bitmap = CSS size = tile width (NO STRETCHING)
        canvas.width = tile.width;
        canvas.height = canvasHeight;
        canvas.style.width = `${tile.width}px`;
        canvas.style.height = `${canvasHeight}px`;

        // Disable smoothing
        ctx.imageSmoothingEnabled = false;

        // Clear canvas
        ctx.clearRect(0, 0, tile.width, canvasHeight);

        // Get peaks for this tile's bar range
        const barPeaks = getPeaksForBarRange(
          peaks,
          lodTiers,
          tile.startBar,
          tile.endBar,
          totalBars,
          trackMetrics.durationSeconds,
        );

        // Colors
        const baseBarColor = isProgress
          ? 'rgba(174, 169, 177, 1)'
          : 'rgba(174, 169, 177, 0.85)';
        const stackedBarColor = isProgress
          ? 'rgba(161, 94, 253, 1)'
          : 'rgba(161, 94, 253, 0.85)';

        if (!isProgress) {
          ctx.fillStyle = 'rgba(156, 163, 175, 0.1)';
          ctx.fillRect(0, 0, tile.width, canvasHeight);
        }

        const maxBarHeight = canvasHeight - 4;

        // Render bars with CONSTANT pixel width
        for (let i = 0; i < barPeaks.length; i++) {
          const peak = Math.max(0, Math.min(1, barPeaks[i]));
          const barHeight = Math.round(peak * maxBarHeight);

          // Local x position within this tile
          const x = i * BAR_STEP;

          if (barHeight <= 0) continue;

          // Calculate stacked percentage
          const globalBarIndex = tile.startBar + i;
          const baseThreshold = 0.3;
          const variation = Math.sin(globalBarIndex * 0.1) * 0.1;
          const normalizedPeak = Math.max(0, peak - baseThreshold);
          const stackedPercentage = Math.max(
            0,
            Math.min(0.6, normalizedPeak + variation),
          );

          const stackedHeight = Math.round(barHeight * stackedPercentage);
          const baseHeight = barHeight - stackedHeight;
          const baseY = Math.round(canvasHeight - baseHeight);
          const stackedY = Math.round(canvasHeight - barHeight);

          if (baseHeight > 0) {
            ctx.fillStyle = baseBarColor;
            ctx.fillRect(x, baseY, BAR_WIDTH, baseHeight);
          }

          if (stackedHeight > 0) {
            ctx.fillStyle = stackedBarColor;
            ctx.fillRect(x, stackedY, BAR_WIDTH, stackedHeight);
          }
        }
      },
      [getPeaksForBarRange, trackMetrics.durationSeconds],
    );

    // Effect to render all tiles when waveform data or config changes
    useEffect(() => {
      if (!waveformData || !tileContainerRef.current) return;

      const { peaks } = waveformData;
      if (!peaks || peaks.length === 0) return;

      const lodTiers =
        'lodTiers' in waveformData ? waveformData.lodTiers : undefined;

      // Create a unique key for the current state
      const startTime =
        'startTime' in waveformData ? waveformData.startTime : 0;
      const endTime = 'endTime' in waveformData ? waveformData.endTime : 0;
      const renderKey = `${track.id}_${waveformData.cacheKey}_${peaks.length}_${startTime}_${endTime}_${width}_${zoomLevel}`;

      if (lastRenderedKeyRef.current === renderKey) return;

      const container = tileContainerRef.current;
      const progressOverlay = progressOverlayRef.current;
      const canvasHeight = Math.round(height);

      // Clear existing canvases
      container.innerHTML = '';
      if (progressOverlay) {
        const progressContainer = progressOverlay.querySelector(
          '[data-progress-tiles]',
        );
        if (progressContainer) {
          progressContainer.innerHTML = '';
        }
      }

      // Render each tile
      tileConfig.tiles.forEach((tile) => {
        // Base canvas (unprogressed)
        const baseCanvas = document.createElement('canvas');
        baseCanvas.style.position = 'absolute';
        baseCanvas.style.left = `${tile.x}px`;
        baseCanvas.style.top = '0';
        container.appendChild(baseCanvas);

        renderTile(
          baseCanvas,
          tile,
          peaks,
          lodTiers as
            | { level: number; peaksPerSecond: number; peaks: number[] }[]
            | undefined,
          tileConfig.totalBars,
          canvasHeight,
          false,
        );

        // Progress canvas (brighter, for playback progress)
        if (progressOverlay) {
          const progressContainer = progressOverlay.querySelector(
            '[data-progress-tiles]',
          );
          if (progressContainer) {
            const progressCanvas = document.createElement('canvas');
            progressCanvas.style.position = 'absolute';
            progressCanvas.style.left = `${tile.x}px`;
            progressCanvas.style.top = '0';
            progressContainer.appendChild(progressCanvas);

            renderTile(
              progressCanvas,
              tile,
              peaks,
              lodTiers as
                | { level: number; peaksPerSecond: number; peaks: number[] }[]
                | undefined,
              tileConfig.totalBars,
              canvasHeight,
              true,
            );
          }
        }
      });

      lastRenderedKeyRef.current = renderKey;
    }, [
      waveformData,
      tileConfig,
      width,
      height,
      zoomLevel,
      track.id,
      renderTile,
    ]);

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
      (event: React.MouseEvent<HTMLDivElement>) => {
        if (!waveformData) return;

        const container = event.currentTarget;
        const rect = container.getBoundingClientRect();
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
      // If waveform exists in media library but waveformData is null,
      // show a brief loading state instead of "Generating waveform..."
      // This handles the race condition on initial mount
      if (hasExistingWaveform) {
        return (
          <div
            className="flex text-xs gap-2 px-2 items-center"
            style={{ width, height }}
          >
            <Loader2 className="size-3 animate-spin" />
            <span className="truncate">Loading waveform...</span>
          </div>
        );
      }

      return (
        <div
          className="flex text-xs gap-2 px-2 items-center"
          style={{ width, height }}
        >
          <Loader2 className="size-3 animate-spin" />
          <span className="truncate">Generating waveform...</span>
        </div>
      );
    }

    return (
      <div
        className="relative bg-gray-100/10 border border-gray-300/20 rounded overflow-hidden"
        style={{ width, height }}
        onClick={handleCanvasClick}
      >
        {/* Tile container - holds multiple fixed-size canvas tiles */}
        {/* Each tile is exactly TILE_WIDTH pixels, no CSS stretching */}
        <div
          ref={tileContainerRef}
          className="absolute top-0 left-0 h-full"
          style={{ width: tileConfig.displayWidth }}
        />

        {/* Progress overlay - clips tiles based on playback position */}
        <div
          ref={progressOverlayRef}
          className="absolute top-0 left-0 h-full pointer-events-none overflow-hidden"
          style={{
            width: '0px',
            willChange: 'width',
          }}
        >
          {/* Progress tile container - same structure as base tiles */}
          <div
            data-progress-tiles
            className="absolute top-0 left-0 h-full"
            style={{ width: tileConfig.displayWidth }}
          />
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
