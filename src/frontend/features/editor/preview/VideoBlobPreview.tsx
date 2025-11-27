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
  useAudioPlayback,
  useDragDrop,
  useVideoPlayback,
  useZoomPan,
} from './hooks';
import {
  AudioOverlay,
  CanvasOverlay,
  UnifiedOverlayRenderer,
} from './overlays';
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Container state
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isPreviewFocused, setIsPreviewFocused] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [pendingEditTextId, setPendingEditTextId] = useState<string | null>(
    null,
  );
  // Track pending empty text tracks that should be auto-discarded
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
  const { activeVideoTrack, independentAudioTrack, activeAudioTrack } =
    useActiveMedia({
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

  // Get display FPS from source video tracks (dynamic but static once determined)
  const displayFps = getDisplayFps(tracks);

  // Video playback synchronization
  const { handleLoadedMetadata: handleVideoLoadedMetadata } = useVideoPlayback({
    videoRef,
    activeVideoTrack,
    independentAudioTrack,
    currentFrame: timeline.currentFrame,
    fps: displayFps, // Use display FPS from source video, not export FPS
    isPlaying: playback.isPlaying,
    isMuted: playback.muted,
    volume: playback.volume,
    playbackRate: playback.playbackRate,
    setCurrentFrame,
    allTracks: tracks,
  });

  // Audio playback synchronization
  const { handleAudioLoadedMetadata } = useAudioPlayback({
    audioRef,
    independentAudioTrack,
    currentFrame: timeline.currentFrame,
    fps: displayFps, // Use display FPS from source video, not export FPS
    isPlaying: playback.isPlaying,
    isMuted: playback.muted,
    volume: playback.volume,
    playbackRate: playback.playbackRate,
  });

  // Calculate base video dimensions
  // Always use canvas dimensions as the base - this allows aspect ratio changes to affect the preview
  // The video will be cropped/fitted to match the canvas aspect ratio
  const baseVideoWidth = preview.canvasWidth;
  const baseVideoHeight = preview.canvasHeight;

  // Alignment guides
  const { alignmentGuides, isDraggingText, handleDragStateChange } =
    useAlignmentGuides({
      baseVideoWidth,
      baseVideoHeight,
    });

  // Reset pan when video track changes or when there's no video
  // Use ref to prevent unnecessary pan resets during non-video track updates
  const prevVideoTrackIdRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevVideoTrackIdRef.current !== activeVideoTrack?.id) {
      prevVideoTrackIdRef.current = activeVideoTrack?.id;
      if (preview.panX !== 0 || preview.panY !== 0) {
        setPreviewPan(0, 0);
      }
    }
  }, [activeVideoTrack?.id, preview.panX, preview.panY, setPreviewPan]);

  // Add effect to pause playback at the end of ALL tracks
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
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [timeline.currentFrame, tracks, playback, videoRef, audioRef]);

  // Resize observer with debouncing to prevent excessive re-renders
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout | null = null;

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    const debouncedUpdateSize = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(updateSize, 100); // Debounce resize events
    };

    updateSize(); // Initial size

    const ro = new ResizeObserver(debouncedUpdateSize);
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, []);

  // Content scale calculation with fixed coordinate system
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
        // Keep only text tracks selected, or clear all if no text tracks selected
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

  // Auto-discard empty text tracks when switching away from Text Tool or on Escape
  useEffect(() => {
    if (preview.interactionMode !== 'text-edit' && pendingEmptyTextId) {
      const track = tracks.find((t) => t.id === pendingEmptyTextId);
      // Only delete if text is still empty/default
      if (track && (!track.textContent || track.textContent === 'New Text')) {
        removeTrack(pendingEmptyTextId);
      }
      setPendingEmptyTextId(null);
    }
  }, [preview.interactionMode, pendingEmptyTextId, tracks, removeTrack]);

  // Handle Escape key to discard empty text
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

  // Handle text transform updates
  const handleTextTransformUpdate = useCallback(
    (
      trackId: string,
      transform: {
        x?: number;
        y?: number;
        scale?: number;
        rotation?: number;
        width?: number;
        height?: number;
      },
    ) => {
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
        textTransform: {
          ...currentTransform,
          ...transform,
        },
      });
    },
    [tracks, updateTrack],
  );

  // Handle image transform updates
  const handleImageTransformUpdate = useCallback(
    (
      trackId: string,
      transform: {
        x?: number;
        y?: number;
        scale?: number;
        rotation?: number;
        width?: number;
        height?: number;
      },
    ) => {
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
        textTransform: {
          ...currentTransform,
          ...transform,
        },
      });
    },
    [tracks, updateTrack],
  );

  // Handle text selection - only allow in select mode or text-edit mode
  const handleTextSelect = useCallback(
    (trackId: string) => {
      // Only allow selection in select mode or text-edit mode
      if (preview.interactionMode === 'pan') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  // Handle image selection - only allow in select mode
  const handleImageSelect = useCallback(
    (trackId: string) => {
      // Only allow selection in select mode
      if (preview.interactionMode !== 'select') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  // Handle video transform updates
  const handleVideoTransformUpdate = useCallback(
    (
      trackId: string,
      transform: {
        x?: number;
        y?: number;
        scale?: number;
        rotation?: number;
        width?: number;
        height?: number;
      },
    ) => {
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
        textTransform: {
          ...currentTransform,
          ...transform,
        },
      });
    },
    [tracks, updateTrack, baseVideoWidth, baseVideoHeight],
  );

  // Handle video selection - only allow in select mode
  const handleVideoSelect = useCallback(
    (trackId: string) => {
      // Only allow selection in select mode
      if (preview.interactionMode !== 'select') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  // Auto-fit video tracks when canvas aspect ratio changes
  // This ensures video content automatically adapts to new canvas dimensions
  // Works in both directions: landscape ↔ portrait, and any aspect ratio change
  const prevCanvasDimensionsRef = useRef<{
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);

  useEffect(() => {
    // Skip if canvas dimensions are invalid or not initialized
    if (
      !preview.canvasWidth ||
      !preview.canvasHeight ||
      preview.canvasWidth <= 0 ||
      preview.canvasHeight <= 0
    ) {
      return;
    }

    const currentAspectRatio = preview.canvasWidth / preview.canvasHeight;

    // Check if canvas dimensions or aspect ratio actually changed
    const prevDimensions = prevCanvasDimensionsRef.current;
    const hasDimensionChange =
      !prevDimensions ||
      prevDimensions.width !== preview.canvasWidth ||
      prevDimensions.height !== preview.canvasHeight;

    const hasAspectRatioChange =
      !prevDimensions ||
      Math.abs(prevDimensions.aspectRatio - currentAspectRatio) > 0.001;

    // If neither dimensions nor aspect ratio changed, skip auto-fit
    if (!hasDimensionChange && !hasAspectRatioChange) {
      return;
    }

    // Store current dimensions and aspect ratio for next comparison
    prevCanvasDimensionsRef.current = {
      width: preview.canvasWidth,
      height: preview.canvasHeight,
      aspectRatio: currentAspectRatio,
    };

    // Skip auto-fit on initial mount (when prevDimensions is null)
    // This prevents auto-fitting when component first loads
    if (!prevDimensions) {
      return;
    }

    // Find all video tracks that need auto-fitting
    const videoTracks = tracks.filter(
      (track) => track.type === 'video' && track.visible,
    );

    if (videoTracks.length === 0) {
      return; // No video tracks to fit
    }

    // Auto-fit each video track
    videoTracks.forEach((track) => {
      // Get original video dimensions (always use source video dimensions, not current transform)
      // Priority: track.width/height > video element dimensions
      let originalWidth: number;
      let originalHeight: number;

      if (track.width && track.height) {
        // Use stored track dimensions (most reliable - these are the original video dimensions)
        originalWidth = track.width;
        originalHeight = track.height;
      } else if (videoRef.current && videoRef.current.videoWidth > 0) {
        // Fallback to video element dimensions (only for active video track)
        // Note: This only works for the currently active video track
        originalWidth = videoRef.current.videoWidth;
        originalHeight = videoRef.current.videoHeight;
      } else {
        // Skip if we can't determine original dimensions
        return;
      }

      // Calculate new dimensions that fit within canvas while preserving aspect ratio
      // This works for both landscape->portrait and portrait->landscape transitions
      const fittedDimensions = calculateFitDimensions(
        originalWidth,
        originalHeight,
        preview.canvasWidth,
        preview.canvasHeight,
      );

      // Get current transform (preserve position, scale, rotation)
      const currentTransform = track.textTransform || {
        x: 0,
        y: 0,
        scale: 1,
        rotation: 0,
        width: originalWidth,
        height: originalHeight,
      };

      // Always update when canvas changes to ensure video fits correctly
      // This handles both dimension changes and aspect ratio changes
      // The comparison ensures we don't update unnecessarily if dimensions are already correct
      const needsUpdate =
        Math.abs(currentTransform.width - fittedDimensions.width) > 0.5 ||
        Math.abs(currentTransform.height - fittedDimensions.height) > 0.5;

      if (needsUpdate) {
        // Update transform with new dimensions, preserving other properties
        handleVideoTransformUpdate(track.id, {
          width: fittedDimensions.width,
          height: fittedDimensions.height,
          // Preserve position, scale, and rotation
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

  // Handle text content updates
  const handleTextUpdate = useCallback(
    (trackId: string, newText: string) => {
      updateTrack(trackId, { textContent: newText });
    },
    [updateTrack],
  );

  // Handle subtitle transform updates (global - affects all subtitles)
  const handleSubtitleTransformUpdate = useCallback(
    (
      trackId: string,
      transform: {
        x?: number;
        y?: number;
      },
    ) => {
      // Update global subtitle position (affects ALL subtitles)
      const currentPosition = textStyle.globalSubtitlePosition;
      setGlobalSubtitlePosition({
        x: transform.x ?? currentPosition.x,
        y: transform.y ?? currentPosition.y,
      });
    },
    [textStyle.globalSubtitlePosition, setGlobalSubtitlePosition],
  );

  // Handle subtitle selection - only allow in select mode or text-edit mode
  const handleSubtitleSelect = useCallback(
    (trackId: string) => {
      // Only allow selection in select mode or text-edit mode
      if (preview.interactionMode === 'pan') return;
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks, preview.interactionMode],
  );

  // Handle subtitle text updates
  const handleSubtitleTextUpdate = useCallback(
    (trackId: string, newText: string) => {
      updateTrack(trackId, { subtitleText: newText });
    },
    [updateTrack],
  );

  // Handle edit mode change from transform boundary layer
  const handleEditModeChange = useCallback(
    (isEditing: boolean) => {
      if (isEditing) {
        setPreviewInteractionMode('text-edit');
      }
    },
    [setPreviewInteractionMode],
  );

  // Handle click outside to deselect or add text
  const handlePreviewClick = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      // Pan Tool: Do nothing except pan (handled by handlePanStart)
      if (preview.interactionMode === 'pan') {
        return;
      }

      // Text Tool: Check if clicking on a text element
      // If clicking on text element, let it handle the click (for editing)
      // If clicking anywhere else (including video/image overlays), create new text
      if (preview.interactionMode === 'text-edit') {
        // Check if clicking on a text element or text editor
        const isTextElement =
          target.closest('[data-text-element]') !== null ||
          target.closest('[contenteditable="true"]') !== null ||
          target.classList.contains('text-content') ||
          (target.tagName === 'DIV' && target.contentEditable === 'true');

        // If clicking on text element, don't create new text (let text element handle it)
        if (isTextElement) {
          return;
        }

        // Check if clicking on transform handles or UI controls
        const isUIControl =
          target.classList.contains('transform-handle') ||
          target.closest('.transform-handle') !== null ||
          target.classList.contains('selection-boundary') ||
          target.closest('.selection-boundary') !== null;

        if (isUIControl) {
          return;
        }

        // In Text Tool mode, create text on ANY click that isn't on a text element or UI control
        // This includes clicks on video/image overlays (which have pointer-events: none in Text Tool mode)
        // The click will pass through overlays to the container, allowing text creation anywhere
        if (activeVideoTrack || activeAudioTrack) {
          // Get click position relative to container
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;

          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          // Convert screen coordinates to normalized video coordinates
          // First, account for the pan offset
          const clickXRelativeToContent =
            clickX - rect.width / 2 - preview.panX;
          const clickYRelativeToContent =
            clickY - rect.height / 2 - preview.panY;

          // Then convert from screen space to video space using the coordinate system
          const normalizedX =
            clickXRelativeToContent / (actualWidth / 2) / preview.previewScale;
          const normalizedY =
            clickYRelativeToContent / (actualHeight / 2) / preview.previewScale;

          // Create new text track at clicked position
          const trackId = await addTextClip('body', timeline.currentFrame);

          if (trackId) {
            // Update the position to clicked location
            updateTrack(trackId, {
              textTransform: {
                x: normalizedX,
                y: normalizedY,
                scale: 1,
                rotation: 0,
                width: 800,
                height: 100,
              },
              textContent: 'New Text', // Default placeholder text that will be selected
            });

            // Select the new text track
            setSelectedTracks([trackId]);

            // Switch to text-edit mode to enable immediate editing
            setPreviewInteractionMode('text-edit');

            // Mark this text as pending edit (will trigger auto-edit after render)
            setPendingEditTextId(trackId);
            // Mark as pending empty text for auto-discard
            setPendingEmptyTextId(trackId);
          }
        }
        return;
      }

      // Select Tool: Handle deselection on empty canvas space
      if (preview.interactionMode === 'select') {
        // Check if clicking on empty canvas space
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

          // If something is selected, deselect it
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

  // Handle import from placeholder
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

  // Overlay render props with fixed coordinate system
  const overlayProps = {
    previewScale: preview.previewScale,
    panX: preview.panX,
    panY: preview.panY,
    actualWidth,
    actualHeight,
    baseVideoWidth,
    baseVideoHeight,
    coordinateSystem, // Pass the fixed coordinate system to all overlays
    interactionMode: preview.interactionMode, // Pass interaction mode to overlays
  };

  // Get rotation for rotation badge (works for text, image, and video)
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

          if (preview.interactionMode === 'text-edit') {
            return 'cursor-text';
          }

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
        // Pan Tool: Always handle panning (works regardless of what's under cursor)
        // Overlays have pointer-events: none in Pan Tool mode, so clicks reach container
        if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
          handlePanStart(e);
          return;
        }
        // Text Tool and Select Tool: Handle clicks
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
      {/* Black Canvas Overlay */}
      {/* Show canvas when any track exists, regardless of type */}
      {/* Canvas dimensions come from preview.canvasWidth/Height (defaults to 800x540 for non-video tracks) */}
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

      {/* Audio Overlay (non-visual, handles audio playback) */}
      <AudioOverlay
        audioRef={audioRef}
        independentAudioTrack={independentAudioTrack}
        onLoadedMetadata={handleAudioLoadedMetadata}
      />

      {/* 
        LAYER 1: Content Layer
        Unified Overlay Renderer - renders all visual tracks in dynamic z-order
        Selected tracks render content only (no boundary) - boundary is in TransformBoundaryLayer
      */}
      <UnifiedOverlayRenderer
        {...overlayProps}
        // Video props
        videoRef={videoRef}
        activeVideoTrack={activeVideoTrack}
        onVideoLoadedMetadata={handleVideoLoadedMetadata}
        onVideoTransformUpdate={handleVideoTransformUpdate}
        onVideoSelect={handleVideoSelect}
        // Common props
        allTracks={tracks}
        selectedTrackIds={timeline.selectedTrackIds}
        currentFrame={timeline.currentFrame}
        isTextEditMode={preview.interactionMode === 'text-edit'}
        // Subtitle props
        getTextStyleForSubtitle={getTextStyleForSubtitle}
        activeStyle={textStyle.activeStyle}
        globalSubtitlePosition={textStyle.globalSubtitlePosition}
        onSubtitleTransformUpdate={handleSubtitleTransformUpdate}
        onSubtitleSelect={handleSubtitleSelect}
        onSubtitleTextUpdate={handleSubtitleTextUpdate}
        // Image props
        onImageTransformUpdate={handleImageTransformUpdate}
        onImageSelect={handleImageSelect}
        // Text props
        onTextTransformUpdate={handleTextTransformUpdate}
        onTextSelect={handleTextSelect}
        onTextUpdate={handleTextUpdate}
        pendingEditTextId={pendingEditTextId}
        onEditStarted={() => {
          setPendingEditTextId(null);
          // Clear pending empty text when user starts editing
          if (pendingEmptyTextId) {
            setPendingEmptyTextId(null);
          }
        }}
        // State callbacks
        onRotationStateChange={setIsRotating}
        onDragStateChange={handleDragStateChange}
      />

      {/* 
        LAYER 2: Transform Boundary Layer
        Renders selection boxes, resize handles, and rotation controls for selected tracks.
        Always on top (z-index: 10000), regardless of track z-order.
        This ensures transform controls are always accessible, matching CapCut behavior.
      */}
      <TransformBoundaryLayer
        {...overlayProps}
        // Common props
        allTracks={tracks}
        selectedTrackIds={timeline.selectedTrackIds}
        currentFrame={timeline.currentFrame}
        isTextEditMode={preview.interactionMode === 'text-edit'}
        // Video props
        onVideoTransformUpdate={handleVideoTransformUpdate}
        onVideoSelect={handleVideoSelect}
        // Subtitle props
        getTextStyleForSubtitle={getTextStyleForSubtitle}
        activeStyle={textStyle.activeStyle}
        globalSubtitlePosition={textStyle.globalSubtitlePosition}
        onSubtitleTransformUpdate={handleSubtitleTransformUpdate}
        onSubtitleSelect={handleSubtitleSelect}
        onSubtitleTextUpdate={handleSubtitleTextUpdate}
        // Image props
        onImageTransformUpdate={handleImageTransformUpdate}
        onImageSelect={handleImageSelect}
        // Text props
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
        // State callbacks
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

      {/* Transcription Progress Overlay */}
      {currentTranscribingTrackId && transcriptionProgress && (
        <TranscriptionProgressOverlay
          progress={transcriptionProgress.progress}
        />
      )}

      {/* Rotation Info Badge */}
      {isRotating && selectedTextTrack && (
        <RotationInfoBadge
          rotation={selectedTextTrack.textTransform?.rotation || 0}
        />
      )}

      {/* Text Edit Mode Indicator */}
      {preview.interactionMode === 'text-edit' && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg shadow-lg pointer-events-none z-[2000] flex items-center gap-2 text-xs"
          style={{
            fontWeight: 500,
          }}
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
