/* eslint-disable @typescript-eslint/no-explicit-any */
import { cn } from '@/frontend/utils/utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePreviewShortcuts } from '../stores/videoEditor/hooks/usePreviewShortcuts';
import { useVideoEditorStore } from '../stores/videoEditor/index';
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
  ImageOverlay,
  SubtitleOverlay,
  TextOverlay,
  VideoOverlay,
} from './overlays';
import { calculateContentScale } from './utils/scalingUtils';
import { getActiveTracksAtFrame } from './utils/trackUtils';

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

  // Video playback synchronization
  const { handleLoadedMetadata: handleVideoLoadedMetadata } = useVideoPlayback({
    videoRef,
    activeVideoTrack,
    independentAudioTrack,
    currentFrame: timeline.currentFrame,
    fps: timeline.fps,
    isPlaying: playback.isPlaying,
    isMuted: playback.muted,
    volume: playback.volume,
    playbackRate: playback.playbackRate,
    setCurrentFrame,
  });

  // Audio playback synchronization
  const { handleAudioLoadedMetadata } = useAudioPlayback({
    audioRef,
    independentAudioTrack,
    currentFrame: timeline.currentFrame,
    fps: timeline.fps,
    isPlaying: playback.isPlaying,
    isMuted: playback.muted,
    volume: playback.volume,
    playbackRate: playback.playbackRate,
  });

  // Calculate base video dimensions
  const baseVideoWidth = activeVideoTrack?.width || preview.canvasWidth;
  const baseVideoHeight = activeVideoTrack?.height || preview.canvasHeight;

  // Alignment guides
  const { alignmentGuides, isDraggingText, handleDragStateChange } =
    useAlignmentGuides({
      baseVideoWidth,
      baseVideoHeight,
    });

  // Reset pan when video track changes or when there's no video
  useEffect(() => {
    if (preview.panX !== 0 || preview.panY !== 0) {
      setPreviewPan(0, 0);
    }
  }, [activeVideoTrack?.id]);

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

  // Resize observer
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
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

  // Get active tracks
  const activeSubtitles = getActiveTracksAtFrame(
    tracks,
    timeline.currentFrame,
    'subtitle',
  ).filter((track) => track.subtitleText);

  const activeTexts = getActiveTracksAtFrame(
    tracks,
    timeline.currentFrame,
    'text',
  ).filter((track) => track.textContent);

  const activeImages = getActiveTracksAtFrame(
    tracks,
    timeline.currentFrame,
    'image',
  ).filter((track) => track.previewUrl || track.source);

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

  // Handle text selection
  const handleTextSelect = useCallback(
    (trackId: string) => {
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks],
  );

  // Handle image selection
  const handleImageSelect = useCallback(
    (trackId: string) => {
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks],
  );

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

  // Handle subtitle selection
  const handleSubtitleSelect = useCallback(
    (trackId: string) => {
      setSelectedTracks([trackId]);
    },
    [setSelectedTracks],
  );

  // Handle subtitle text updates
  const handleSubtitleTextUpdate = useCallback(
    (trackId: string, newText: string) => {
      updateTrack(trackId, { subtitleText: newText });
    },
    [updateTrack],
  );

  // Handle click outside to deselect
  const handlePreviewClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

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
    },
    [setSelectedTracks, timeline.selectedTrackIds, tracks],
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
  };

  // Get rotation for rotation badge (works for both text and image)
  const selectedTextTrack = tracks.find(
    (t) =>
      (t.type === 'text' || t.type === 'image') &&
      timeline.selectedTrackIds.includes(t.id),
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-lg preview-background',
        className,
        'bg-zinc-100 dark:bg-zinc-900',
        (() => {
          if (!activeVideoTrack && !activeAudioTrack) return 'cursor-default';

          if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
            return isPanning ? 'cursor-grabbing' : 'cursor-grab';
          }

          return 'cursor-default';
        })(),
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onMouseDown={(e) => {
        if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
          handlePanStart(e);
        } else {
          handlePreviewClick(e);
        }
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
      {/* Video Overlay */}
      <VideoOverlay
        {...overlayProps}
        videoRef={videoRef}
        activeVideoTrack={activeVideoTrack}
        allTracks={tracks}
        onLoadedMetadata={handleVideoLoadedMetadata}
      />

      {/* Audio Overlay */}
      <AudioOverlay
        audioRef={audioRef}
        independentAudioTrack={independentAudioTrack}
        onLoadedMetadata={handleAudioLoadedMetadata}
      />

      {/* Subtitle Overlay */}
      <SubtitleOverlay
        {...overlayProps}
        activeSubtitles={activeSubtitles}
        allTracks={tracks}
        selectedTrackIds={timeline.selectedTrackIds}
        getTextStyleForSubtitle={getTextStyleForSubtitle}
        activeStyle={textStyle.activeStyle}
        globalSubtitlePosition={textStyle.globalSubtitlePosition}
        onTransformUpdate={handleSubtitleTransformUpdate}
        onSelect={handleSubtitleSelect}
        onTextUpdate={handleSubtitleTextUpdate}
        onDragStateChange={handleDragStateChange}
      />

      {/* Image Overlay */}
      <ImageOverlay
        {...overlayProps}
        activeImages={activeImages}
        allTracks={tracks}
        selectedTrackIds={timeline.selectedTrackIds}
        onTransformUpdate={handleImageTransformUpdate}
        onSelect={handleImageSelect}
        onRotationStateChange={setIsRotating}
        onDragStateChange={handleDragStateChange}
      />

      {/* Text Overlay */}
      <TextOverlay
        {...overlayProps}
        activeTexts={activeTexts}
        allTracks={tracks}
        selectedTrackIds={timeline.selectedTrackIds}
        onTransformUpdate={handleTextTransformUpdate}
        onSelect={handleTextSelect}
        onTextUpdate={handleTextUpdate}
        onRotationStateChange={setIsRotating}
        onDragStateChange={handleDragStateChange}
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
            zIndex: 500,
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
