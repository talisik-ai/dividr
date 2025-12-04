/* eslint-disable @typescript-eslint/no-explicit-any */

import { cn } from '@/frontend/utils/utils';
import { Type } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePreviewShortcuts } from '../stores/videoEditor/hooks/usePreviewShortcuts';
import { useVideoEditorStore } from '../stores/videoEditor/index';
import { getDisplayFps } from '../stores/videoEditor/types/timeline.types';
import { DragGuides } from './components/DragGuides';
import { PreviewPlaceholder } from './components/PreviewPlaceholder';
import { RotationInfoBadge } from './components/RotationInfoBadge';
import { TranscriptionProgressOverlay } from './components/TranscriptionProgressOverlay';
import {
  useActiveMedia,
  useAlignmentGuides,
  useDragDrop,
  useZoomPan,
} from './hooks';
import { CanvasOverlay, UnifiedOverlayRenderer } from './overlays';
import { TransformBoundaryLayer } from './overlays/TransformBoundaryLayer';
import {
  calculateContentScale,
  calculateFitDimensions,
} from './utils/scalingUtils';

interface VideoBlobPreviewProps {
  className?: string;
}

export const VideoBlobPreview: React.FC<VideoBlobPreviewProps> = ({
  className,
}) => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Container state
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isPreviewFocused, setIsPreviewFocused] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [pendingEditTextId, setPendingEditTextId] = useState<string | null>(
    null,
  );
  const [pendingEmptyTextId, setPendingEmptyTextId] = useState<string | null>(
    null,
  );

  // Initialize preview shortcuts
  usePreviewShortcuts(isPreviewFocused);

  // Store state
  const {
    tracks,
    timeline,
    playback,
    preview,
    textStyle,
    getTextStyleForSubtitle,
    setGlobalSubtitlePosition,
    importMediaFromDialog,
    importMediaToTimeline,
    setCurrentFrame,
    setPreviewPan,
    setPreviewScale,
    setPreviewInteractionMode,
    updateTrack,
    setSelectedTracks,
    currentTranscribingTrackId,
    transcriptionProgress,
    addTextClip,
    removeTrack,
  } = useVideoEditorStore();

  // Active media determination
  const {
    activeVideoTrack,
    activeVideoTracks,
    independentAudioTrack,
    activeIndependentAudioTracks,
    activeAudioTrack,
  } = useActiveMedia({
    tracks,
    currentFrame: timeline.currentFrame,
  });

  // Zoom and pan functionality
  const {
    isPanning,
    handlePanStart,
    handlePanMove,
    handlePanEnd,
    handleWheel,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  } = useZoomPan({
    containerRef,
    previewScale: preview.previewScale,
    panX: preview.panX,
    panY: preview.panY,
    interactionMode: preview.interactionMode,
    setPreviewScale,
    setPreviewPan,
    setPreviewInteractionMode,
    hasContent: !!(activeVideoTrack || activeAudioTrack),
  });

  // Drag and drop functionality
  const { dragActive, handleDrag, handleDrop } = useDragDrop({
    importMediaToTimeline,
  });

  // Get display FPS from source video tracks
  const displayFps = getDisplayFps(tracks);

  /**
   * AUDIO FIX: We NO LONGER use useVideoPlayback for video control.
   * DualBufferVideo now handles:
   * - Video playback (play/pause)
   * - Audio control (mute/volume)
   * - Timeline sync (onFrameUpdate callback)
   *
   * useVideoPlayback was causing double audio because it was also
   * controlling videoRef's volume/muted state.
   */

  // Simple metadata handler - no playback control needed
  const handleVideoLoadedMetadata = useCallback(() => {
    console.log('[VideoBlobPreview] Video metadata loaded');
    // Metadata is now handled by DualBufferVideo
  }, []);

  // Calculate base video dimensions
  const baseVideoWidth = preview.canvasWidth;
  const baseVideoHeight = preview.canvasHeight;

  // Alignment guides
  const { alignmentGuides, isDraggingText, handleDragStateChange } =
    useAlignmentGuides({
      baseVideoWidth,
      baseVideoHeight,
    });

  // Reset pan when video track changes
  const prevVideoTrackIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevVideoTrackIdRef.current !== activeVideoTrack?.id) {
      prevVideoTrackIdRef.current = activeVideoTrack?.id;
      if (preview.panX !== 0 || preview.panY !== 0) {
        setPreviewPan(0, 0);
      }
    }
  }, [activeVideoTrack?.id, preview.panX, preview.panY, setPreviewPan]);

  // Pause playback at end of all tracks
  useEffect(() => {
    if (!playback.isPlaying) return;

    const allTracks = tracks
      .filter((track) => track.visible)
      .sort((a, b) => a.endFrame - b.endFrame);
    const lastTrack = allTracks[allTracks.length - 1];

    if (lastTrack && timeline.currentFrame >= lastTrack.endFrame) {
      playback.isPlaying = false;
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [timeline.currentFrame, tracks, playback, videoRef]);

  // Resize observer
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    const debouncedUpdateSize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateSize, 100);
    };

    updateSize();

    const ro = new ResizeObserver(debouncedUpdateSize);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (resizeTimeout) clearTimeout(resizeTimeout);
    };
  }, []);

  // Content scale calculation
  const { actualWidth, actualHeight, coordinateSystem } = calculateContentScale(
    {
      containerWidth: containerSize.width,
      containerHeight: containerSize.height,
      videoWidth: baseVideoWidth,
      videoHeight: baseVideoHeight,
      previewScale: preview.previewScale,
    },
  );

  // Clear non-text selections when switching to Text Tool
  useEffect(() => {
    if (preview.interactionMode === 'text-edit') {
      const nonTextSelectedTracks = timeline.selectedTrackIds.filter((id) => {
        const track = tracks.find((t) => t.id === id);
        return track && track.type !== 'text';
      });

      if (nonTextSelectedTracks.length > 0) {
        const textSelectedTracks = timeline.selectedTrackIds.filter((id) => {
          const track = tracks.find((t) => t.id === id);
          return track && track.type === 'text';
        });
        setSelectedTracks(textSelectedTracks);
      }
    }
  }, [
    preview.interactionMode,
    timeline.selectedTrackIds,
    tracks,
    setSelectedTracks,
  ]);

  // Auto-discard empty text tracks
  useEffect(() => {
    if (preview.interactionMode !== 'text-edit' && pendingEmptyTextId) {
      const track = tracks.find((t) => t.id === pendingEmptyTextId);
      if (track && (!track.textContent || track.textContent === 'New Text')) {
        removeTrack(pendingEmptyTextId);
      }
      setPendingEmptyTextId(null);
    }
  }, [preview.interactionMode, pendingEmptyTextId, tracks, removeTrack]);

  // Handle Escape key
  useEffect(() => {
    if (!isPreviewFocused || !pendingEmptyTextId) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && preview.interactionMode === 'text-edit') {
        const track = tracks.find((t) => t.id === pendingEmptyTextId);
        if (track && (!track.textContent || track.textContent === 'New Text')) {
          removeTrack(pendingEmptyTextId);
          setPendingEmptyTextId(null);
          setPendingEditTextId(null);
        }
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [
    isPreviewFocused,
    pendingEmptyTextId,
    preview.interactionMode,
    tracks,
    removeTrack,
  ]);

  // Transform update handlers
  const handleTextTransformUpdate = useCallback(
    (trackId: string, transform: any) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.type !== 'text') return;

      const currentTransform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: 0,
        height: 0,
      };

      updateTrack(trackId, {
        textTransform: { ...currentTransform, ...transform },
      });
    },
    [tracks, updateTrack],
  );

  const handleImageTransformUpdate = useCallback(
    (trackId: string, transform: any) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.type !== 'image') return;

      const currentTransform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: 0,
        height: 0,
      };

      updateTrack(trackId, {
        textTransform: { ...currentTransform, ...transform },
      });
    },
    [tracks, updateTrack],
  );

  const handleTextSelect = useCallback(
    (trackId: string) => {
      if (preview.interactionMode === 'pan') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  const handleImageSelect = useCallback(
    (trackId: string) => {
      if (preview.interactionMode !== 'select') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  const handleVideoTransformUpdate = useCallback(
    (trackId: string, transform: any) => {
      const track = tracks.find((t) => t.id === trackId);
      if (!track || track.type !== 'video') return;

      const currentTransform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: track.width || baseVideoWidth,
        height: track.height || baseVideoHeight,
      };

      updateTrack(trackId, {
        textTransform: { ...currentTransform, ...transform },
      });
    },
    [tracks, updateTrack, baseVideoWidth, baseVideoHeight],
  );

  const handleVideoSelect = useCallback(
    (trackId: string) => {
      if (preview.interactionMode !== 'select') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  // Auto-fit video tracks when canvas aspect ratio changes
  const prevCanvasDimensionsRef = useRef<{
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);

  useEffect(() => {
    if (
      !preview.canvasWidth ||
      !preview.canvasHeight ||
      preview.canvasWidth <= 0 ||
      preview.canvasHeight <= 0
    ) {
      return;
    }

    const currentAspectRatio = preview.canvasWidth / preview.canvasHeight;
    const prevDimensions = prevCanvasDimensionsRef.current;

    const hasDimensionChange =
      !prevDimensions ||
      prevDimensions.width !== preview.canvasWidth ||
      prevDimensions.height !== preview.canvasHeight;

    const hasAspectRatioChange =
      !prevDimensions ||
      Math.abs(prevDimensions.aspectRatio - currentAspectRatio) > 0.001;

    if (!hasDimensionChange && !hasAspectRatioChange) return;

    prevCanvasDimensionsRef.current = {
      width: preview.canvasWidth,
      height: preview.canvasHeight,
      aspectRatio: currentAspectRatio,
    };

    if (!prevDimensions) return;

    const videoTracks = tracks.filter(
      (track) => track.type === 'video' && track.visible,
    );
    if (videoTracks.length === 0) return;

    videoTracks.forEach((track) => {
      let originalWidth: number;
      let originalHeight: number;

      if (track.width && track.height) {
        originalWidth = track.width;
        originalHeight = track.height;
      } else if (videoRef.current && videoRef.current.videoWidth > 0) {
        originalWidth = videoRef.current.videoWidth;
        originalHeight = videoRef.current.videoHeight;
      } else {
        return;
      }

      const fittedDimensions = calculateFitDimensions(
        originalWidth,
        originalHeight,
        preview.canvasWidth,
        preview.canvasHeight,
      );

      const currentTransform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: originalWidth,
        height: originalHeight,
      };

      const needsUpdate =
        Math.abs(currentTransform.width - fittedDimensions.width) > 0.5 ||
        Math.abs(currentTransform.height - fittedDimensions.height) > 0.5;

      if (needsUpdate) {
        handleVideoTransformUpdate(track.id, {
          width: fittedDimensions.width,
          height: fittedDimensions.height,
          x: currentTransform.x,
          y: currentTransform.y,
          scale: currentTransform.scale,
          rotation: currentTransform.rotation,
        });
      }
    });
  }, [
    preview.canvasWidth,
    preview.canvasHeight,
    tracks,
    videoRef,
    handleVideoTransformUpdate,
  ]);

  const handleTextUpdate = useCallback(
    (trackId: string, newText: string) => {
      updateTrack(trackId, { textContent: newText });
    },
    [updateTrack],
  );

  const handleSubtitleTransformUpdate = useCallback(
    (trackId: string, transform: { x?: number; y?: number }) => {
      const currentPosition = textStyle.globalSubtitlePosition;
      setGlobalSubtitlePosition({
        x: transform.x ?? currentPosition.x,
        y: transform.y ?? currentPosition.y,
      });
    },
    [textStyle.globalSubtitlePosition, setGlobalSubtitlePosition],
  );

  const handleSubtitleSelect = useCallback(
    (trackId: string) => {
      if (preview.interactionMode === 'pan') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  const handleSubtitleTextUpdate = useCallback(
    (trackId: string, newText: string) => {
      updateTrack(trackId, { subtitleText: newText });
    },
    [updateTrack],
  );

  const handleEditModeChange = useCallback(
    (isEditing: boolean) => {
      if (isEditing) {
        setPreviewInteractionMode('text-edit');
      }
    },
    [setPreviewInteractionMode],
  );

  const handlePreviewClick = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      if (preview.interactionMode === 'pan') return;

      if (preview.interactionMode === 'text-edit') {
        const isTextElement =
          target.closest('[data-text-element]') !== null ||
          target.closest('[contenteditable="true"]') !== null ||
          target.classList.contains('text-content') ||
          (target.tagName === 'DIV' && target.contentEditable === 'true');

        if (isTextElement) return;

        const isUIControl =
          target.classList.contains('transform-handle') ||
          target.closest('.transform-handle') !== null ||
          target.classList.contains('selection-boundary') ||
          target.closest('.selection-boundary') !== null;

        if (isUIControl) return;

        if (activeVideoTrack || activeAudioTrack) {
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;

          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const clickXRelativeToContent =
            clickX - rect.width / 2 - preview.panX;
          const clickYRelativeToContent =
            clickY - rect.height / 2 - preview.panY;

          const normalizedX =
            clickXRelativeToContent / (actualWidth / 2) / preview.previewScale;
          const normalizedY =
            clickYRelativeToContent / (actualHeight / 2) / preview.previewScale;

          const trackId = await addTextClip('body', timeline.currentFrame);

          if (trackId) {
            updateTrack(trackId, {
              textTransform: {
                x: normalizedX,
                y: normalizedY,
                scale: 1,
                rotation: 0,
                width: 800,
                height: 100,
              },
              textContent: 'New Text',
            });

            setSelectedTracks([trackId]);
            setPreviewInteractionMode('text-edit');
            setPendingEditTextId(trackId);
            setPendingEmptyTextId(trackId);
          }
        }
        return;
      }

      if (preview.interactionMode === 'select') {
        if (
          target === containerRef.current ||
          target.classList.contains('preview-background') ||
          target.tagName === 'VIDEO'
        ) {
          const hasInteractiveLayerSelected = timeline.selectedTrackIds.some(
            (id) => {
              const track = tracks.find((t) => t.id === id);
              return (
                track?.type === 'text' ||
                track?.type === 'image' ||
                track?.type === 'subtitle'
              );
            },
          );

          if (hasInteractiveLayerSelected) {
            setSelectedTracks([]);
          }
        }
      }
    },
    [
      setSelectedTracks,
      timeline.selectedTrackIds,
      timeline.currentFrame,
      tracks,
      activeVideoTrack,
      activeAudioTrack,
      preview.panX,
      preview.panY,
      preview.previewScale,
      preview.interactionMode,
      actualWidth,
      actualHeight,
      addTextClip,
      updateTrack,
      setPreviewInteractionMode,
    ],
  );

  const handleImportFromPlaceholder = useCallback(async () => {
    const result = await importMediaFromDialog();
    if (!result || (!result.success && !result.error)) return;

    if (result.success && result.importedFiles.length > 0) {
      console.log(
        `✅ Successfully imported ${result.importedFiles.length} files via upload button`,
      );
    } else {
      const errorMessage =
        result.error ||
        'All files were rejected due to corruption or invalid format';
      toast.error(errorMessage);
    }
  }, [importMediaFromDialog]);

  // Overlay render props
  const overlayProps = {
    previewScale: preview.previewScale,
    panX: preview.panX,
    panY: preview.panY,
    actualWidth,
    actualHeight,
    baseVideoWidth,
    baseVideoHeight,
    coordinateSystem,
    interactionMode: preview.interactionMode,
  };

  // Get rotation for rotation badge
  const selectedTextTrack = tracks.find(
    (t) =>
      (t.type === 'text' || t.type === 'image' || t.type === 'video') &&
      timeline.selectedTrackIds.includes(t.id),
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        className,
        'relative overflow-hidden rounded-lg preview-background',
        'bg-zinc-100 dark:bg-zinc-900',
        (() => {
          if (!activeVideoTrack && !activeAudioTrack) return 'cursor-default';
          if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
            return isPanning ? 'cursor-grabbing' : 'cursor-grab';
          }
          if (preview.interactionMode === 'text-edit') return 'cursor-text';
          return 'cursor-default';
        })(),
      )}
      style={
        !tracks.length
          ? {
              height: '374px',
              maxWidth: '66.67%',
              aspectRatio: '16 / 9',
              margin: '0 auto',
            }
          : undefined
      }
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onMouseDown={(e) => {
        if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
          handlePanStart(e);
          return;
        }
        handlePreviewClick(e);
      }}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={() => {
        handlePanEnd();
        setIsPreviewFocused(false);
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onFocus={() => setIsPreviewFocused(true)}
      onBlur={() => setIsPreviewFocused(false)}
      onMouseEnter={() => setIsPreviewFocused(true)}
      tabIndex={0}
    >
      {/* Canvas Overlay */}
      {tracks.length > 0 &&
        preview.canvasWidth > 0 &&
        preview.canvasHeight > 0 && (
          <CanvasOverlay
            actualWidth={actualWidth}
            actualHeight={actualHeight}
            panX={preview.panX}
            panY={preview.panY}
          />
        )}

      {/* 
        UNIFIED OVERLAY RENDERER - AUDIO FIX
        
        Key changes:
        1. Pass setCurrentFrame - DualBufferVideo will update timeline
        2. Pass independentAudioTrack - determines audio routing
        3. DualBufferVideo now handles ALL playback including audio
      */}
      <UnifiedOverlayRenderer
        {...overlayProps}
        videoRef={videoRef}
        activeVideoTrack={activeVideoTrack}
        activeVideoTracks={activeVideoTracks}
        activeIndependentAudioTracks={activeIndependentAudioTracks}
        onVideoLoadedMetadata={handleVideoLoadedMetadata}
        onVideoTransformUpdate={handleVideoTransformUpdate}
        onVideoSelect={handleVideoSelect}
        // DualBufferVideo playback props
        isPlaying={playback.isPlaying}
        isMuted={playback.muted}
        volume={playback.volume}
        playbackRate={playback.playbackRate}
        fps={displayFps}
        // AUDIO FIX: Pass these for proper audio routing
        setCurrentFrame={setCurrentFrame}
        independentAudioTrack={independentAudioTrack}
        // Rest of props
        allTracks={tracks}
        selectedTrackIds={timeline.selectedTrackIds}
        currentFrame={timeline.currentFrame}
        isTextEditMode={preview.interactionMode === 'text-edit'}
        getTextStyleForSubtitle={getTextStyleForSubtitle}
        activeStyle={textStyle.activeStyle}
        globalSubtitlePosition={textStyle.globalSubtitlePosition}
        onSubtitleTransformUpdate={handleSubtitleTransformUpdate}
        onSubtitleSelect={handleSubtitleSelect}
        onSubtitleTextUpdate={handleSubtitleTextUpdate}
        onImageTransformUpdate={handleImageTransformUpdate}
        onImageSelect={handleImageSelect}
        onTextTransformUpdate={handleTextTransformUpdate}
        onTextSelect={handleTextSelect}
        onTextUpdate={handleTextUpdate}
        pendingEditTextId={pendingEditTextId}
        onEditStarted={() => {
          setPendingEditTextId(null);
          if (pendingEmptyTextId) {
            setPendingEmptyTextId(null);
          }
        }}
        onRotationStateChange={setIsRotating}
        onDragStateChange={handleDragStateChange}
      />

      {/* Transform Boundary Layer */}
      <TransformBoundaryLayer
        {...overlayProps}
        allTracks={tracks}
        selectedTrackIds={timeline.selectedTrackIds}
        currentFrame={timeline.currentFrame}
        isTextEditMode={preview.interactionMode === 'text-edit'}
        onVideoTransformUpdate={handleVideoTransformUpdate}
        onVideoSelect={handleVideoSelect}
        getTextStyleForSubtitle={getTextStyleForSubtitle}
        activeStyle={textStyle.activeStyle}
        globalSubtitlePosition={textStyle.globalSubtitlePosition}
        onSubtitleTransformUpdate={handleSubtitleTransformUpdate}
        onSubtitleSelect={handleSubtitleSelect}
        onSubtitleTextUpdate={handleSubtitleTextUpdate}
        onImageTransformUpdate={handleImageTransformUpdate}
        onImageSelect={handleImageSelect}
        onTextTransformUpdate={handleTextTransformUpdate}
        onTextSelect={handleTextSelect}
        onTextUpdate={handleTextUpdate}
        pendingEditTextId={pendingEditTextId}
        onEditStarted={() => {
          setPendingEditTextId(null);
          if (pendingEmptyTextId) {
            setPendingEmptyTextId(null);
          }
        }}
        onRotationStateChange={setIsRotating}
        onDragStateChange={handleDragStateChange}
        onEditModeChange={handleEditModeChange}
      />

      {/* Alignment Guides */}
      {isDraggingText && alignmentGuides.length > 0 && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${preview.panX}px)`,
            top: `calc(50% + ${preview.panY}px)`,
            transform: 'translate(-50%, -50%)',
            overflow: 'hidden',
            zIndex: 1500,
          }}
        >
          <DragGuides
            guides={alignmentGuides}
            videoWidth={baseVideoWidth}
            videoHeight={baseVideoHeight}
            previewScale={preview.previewScale}
            panX={preview.panX}
            panY={preview.panY}
            isBoundaryWarning={false}
          />
        </div>
      )}

      {/* Transcription Progress */}
      {currentTranscribingTrackId && transcriptionProgress && (
        <TranscriptionProgressOverlay
          progress={transcriptionProgress.progress}
        />
      )}

      {/* Rotation Badge */}
      {isRotating && selectedTextTrack && (
        <RotationInfoBadge
          rotation={selectedTextTrack.textTransform?.rotation || 0}
        />
      )}

      {/* Text Edit Mode Indicator */}
      {preview.interactionMode === 'text-edit' && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg shadow-lg pointer-events-none z-[2000] flex items-center gap-2 text-xs"
          style={{ fontWeight: 500 }}
        >
          <Type className="size-3" />
          Text Tool — Click to edit or add new text
        </div>
      )}

      {/* Placeholder */}
      {!activeAudioTrack && tracks.length === 0 && (
        <PreviewPlaceholder
          dragActive={dragActive}
          onImport={handleImportFromPlaceholder}
        />
      )}
    </div>
  );
};
