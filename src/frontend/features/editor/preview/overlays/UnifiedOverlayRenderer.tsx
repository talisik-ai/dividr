/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useVideoEditorStore, VideoTrack } from '../../stores/videoEditor';
import { ImageTransformBoundary } from '../components/ImageTransformBoundary';
import { SubtitleTransformBoundary } from '../components/SubtitleTransformBoundary';
import { TextTransformBoundary } from '../components/TextTransformBoundary';
import { VideoTransformBoundary } from '../components/VideoTransformBoundary';
import {
  GLOW_BLUR_MULTIPLIER,
  GLOW_SPREAD_MULTIPLIER,
  SUBTITLE_PADDING_HORIZONTAL,
  SUBTITLE_PADDING_VERTICAL,
  TEXT_CLIP_PADDING_HORIZONTAL,
  TEXT_CLIP_PADDING_VERTICAL,
  Z_INDEX_SUBTITLE_CONTENT_BASE,
} from '../core/constants';
import { OverlayRenderProps } from '../core/types';
import { scaleTextShadow } from '../utils/scalingUtils';
import {
  getTextStyleForTextClip,
  hasActualBackground,
} from '../utils/textStyleUtils';
import {
  getActiveVisualTracksAtFrame,
  getTrackZIndex,
} from '../utils/trackUtils';
import { DualBufferVideo, DualBufferVideoRef } from './DualBufferVideoOverlay';

/**
 * Unified Overlay Renderer - FIXED VERSION
 *
 * KEY FIX: The DualBufferVideo component is now rendered as a SIBLING to the track
 * rendering loop, not inside it. This prevents React from remounting the video
 * elements every time the track list or frame changes.
 *
 * The video is rendered ONCE at a stable position in the component tree, and
 * the VideoTransformBoundary just wraps a placeholder div for positioning.
 */

export interface UnifiedOverlayRendererProps extends OverlayRenderProps {
  // Video-specific props
  videoRef: React.RefObject<HTMLVideoElement>;
  activeVideoTrack?: VideoTrack;
  onVideoLoadedMetadata: () => void;
  // DualBufferVideo props
  isPlaying?: boolean;
  isMuted?: boolean;
  volume?: number;
  playbackRate?: number;
  fps?: number;
  onVideoTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      width?: number;
      height?: number;
    },
  ) => void;
  onVideoSelect: (trackId: string) => void;

  // Common props
  allTracks: VideoTrack[];
  selectedTrackIds: string[];
  currentFrame: number;
  isTextEditMode?: boolean;

  // Subtitle-specific props
  getTextStyleForSubtitle: (style: any, segmentStyle?: any) => any;
  activeStyle: any;
  globalSubtitlePosition: { x: number; y: number };
  onSubtitleTransformUpdate: (
    trackId: string,
    transform: { x?: number; y?: number },
  ) => void;
  onSubtitleSelect: (trackId: string) => void;
  onSubtitleTextUpdate?: (trackId: string, newText: string) => void;

  // Image-specific props
  onImageTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      width?: number;
      height?: number;
    },
  ) => void;
  onImageSelect: (trackId: string) => void;

  // Text-specific props
  onTextTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      width?: number;
      height?: number;
    },
  ) => void;
  onTextSelect: (trackId: string) => void;
  onTextUpdate: (trackId: string, newText: string) => void;
  pendingEditTextId?: string | null;
  onEditStarted?: () => void;

  // Rotation state callback
  onRotationStateChange: (isRotating: boolean) => void;
  onDragStateChange: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
}

/**
 * Interaction mode type
 */
type InteractionMode = 'select' | 'pan' | 'text-edit';

export const UnifiedOverlayRenderer: React.FC<UnifiedOverlayRendererProps> = ({
  // Video props
  videoRef,
  activeVideoTrack,
  onVideoLoadedMetadata,
  onVideoTransformUpdate,
  onVideoSelect,

  // DualBufferVideo props
  isPlaying = false,
  isMuted = false,
  volume = 1,
  playbackRate = 1,
  fps = 30,

  // Common props
  allTracks,
  selectedTrackIds,
  currentFrame,
  isTextEditMode = false,
  previewScale,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  coordinateSystem,
  interactionMode,

  // Subtitle props
  getTextStyleForSubtitle,
  activeStyle,
  globalSubtitlePosition,
  onSubtitleTransformUpdate,
  onSubtitleSelect,
  onSubtitleTextUpdate,

  // Image props
  onImageTransformUpdate,
  onImageSelect,

  // Text props
  onTextTransformUpdate,
  onTextSelect,
  onTextUpdate,
  pendingEditTextId,
  onEditStarted,

  // State callbacks
  onRotationStateChange,
  onDragStateChange,
}) => {
  const renderScale = coordinateSystem.baseScale;

  // ============================================================================
  // CRITICAL FIX: DualBufferVideo ref is stable and never changes
  // ============================================================================
  const dualBufferVideoRef = useRef<DualBufferVideoRef>(null);

  // Sync DualBufferVideo's active video to videoRef for backward compatibility
  useEffect(() => {
    if (dualBufferVideoRef.current && videoRef) {
      const activeVideo = dualBufferVideoRef.current.getActiveVideo();
      if (activeVideo && videoRef.current !== activeVideo) {
        (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
          activeVideo;
      }
    }
  }, [videoRef, activeVideoTrack, isPlaying, currentFrame]);

  // Get setPreviewInteractionMode from store
  const setPreviewInteractionMode = useVideoEditorStore(
    (state) => state.setPreviewInteractionMode,
  );

  // Handler for when edit mode changes
  const handleEditModeChange = useCallback(
    (isEditing: boolean) => {
      if (isEditing) {
        setPreviewInteractionMode('text-edit');
      }
    },
    [setPreviewInteractionMode],
  );

  // Get all active visual tracks sorted by z-index (back to front)
  // OPTIMIZATION: Memoize more aggressively to prevent unnecessary re-renders
  const sortedVisualTracks = useMemo(
    () => getActiveVisualTracksAtFrame(allTracks, currentFrame),
    [allTracks, currentFrame],
  );

  // Group subtitles for special handling (they share a global position)
  const activeSubtitles = useMemo(
    () =>
      sortedVisualTracks.filter((t) => t.type === 'subtitle' && t.subtitleText),
    [sortedVisualTracks],
  );

  // ============================================================================
  // CRITICAL FIX: Calculate video dimensions ONCE, not in render loop
  // ============================================================================
  const videoRenderInfo = useMemo(() => {
    if (!activeVideoTrack) return null;

    const videoTransform = activeVideoTrack.textTransform || {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      width: activeVideoTrack.width || baseVideoWidth,
      height: activeVideoTrack.height || baseVideoHeight,
    };

    const videoWidth =
      (videoTransform.width || activeVideoTrack.width || baseVideoWidth) *
      renderScale;
    const videoHeight =
      (videoTransform.height || activeVideoTrack.height || baseVideoHeight) *
      renderScale;

    const zIndex = getTrackZIndex(activeVideoTrack, allTracks);
    const isSelected = selectedTrackIds.includes(activeVideoTrack.id);
    const isVisuallyHidden = !activeVideoTrack.visible;

    return {
      track: activeVideoTrack,
      videoWidth,
      videoHeight,
      zIndex,
      isSelected,
      isVisuallyHidden,
      videoTransform,
    };
  }, [
    activeVideoTrack,
    baseVideoWidth,
    baseVideoHeight,
    renderScale,
    allTracks,
    selectedTrackIds,
  ]);

  // Calculate subtitle z-index (max of all subtitle tracks)
  const subtitleZIndex = useMemo(() => {
    if (activeSubtitles.length === 0) return 0;
    return Math.max(
      ...activeSubtitles.map((t) => getTrackZIndex(t, allTracks)),
    );
  }, [activeSubtitles, allTracks]);

  // ============================================================================
  // RENDER NON-VIDEO TRACKS (images, text)
  // ============================================================================
  const renderNonVideoTrack = useCallback(
    (track: VideoTrack) => {
      const zIndex = getTrackZIndex(track, allTracks);
      const isSelected = selectedTrackIds.includes(track.id);

      switch (track.type) {
        case 'image':
          return renderImageTrack(
            track,
            zIndex,
            isSelected,
            renderScale,
            previewScale,
            baseVideoWidth,
            baseVideoHeight,
            actualWidth,
            actualHeight,
            panX,
            panY,
            coordinateSystem,
            interactionMode,
            onImageTransformUpdate,
            onImageSelect,
            onRotationStateChange,
            onDragStateChange,
          );

        case 'text':
          return renderTextTrack(
            track,
            zIndex,
            isSelected,
            renderScale,
            previewScale,
            baseVideoWidth,
            baseVideoHeight,
            actualWidth,
            actualHeight,
            panX,
            panY,
            coordinateSystem,
            interactionMode,
            isTextEditMode,
            onTextTransformUpdate,
            onTextSelect,
            onTextUpdate,
            onRotationStateChange,
            onDragStateChange,
            handleEditModeChange,
            pendingEditTextId,
            onEditStarted,
          );

        default:
          return null;
      }
    },
    [
      allTracks,
      selectedTrackIds,
      renderScale,
      previewScale,
      baseVideoWidth,
      baseVideoHeight,
      actualWidth,
      actualHeight,
      panX,
      panY,
      coordinateSystem,
      interactionMode,
      isTextEditMode,
      onImageTransformUpdate,
      onImageSelect,
      onTextTransformUpdate,
      onTextSelect,
      onTextUpdate,
      onRotationStateChange,
      onDragStateChange,
      handleEditModeChange,
      pendingEditTextId,
      onEditStarted,
    ],
  );

  // ============================================================================
  // RENDER SUBTITLES
  // ============================================================================
  const renderSubtitles = useCallback(() => {
    if (activeSubtitles.length === 0) return null;

    const hasSelectedSubtitle = activeSubtitles.some((track) =>
      selectedTrackIds.includes(track.id),
    );
    const selectedSubtitle = activeSubtitles.find((track) =>
      selectedTrackIds.includes(track.id),
    );

    const globalTrack: VideoTrack = {
      ...activeSubtitles[0],
      id: 'global-subtitle-transform',
      subtitleTransform: globalSubtitlePosition,
    };

    return (
      <SubtitleTransformBoundary
        key="global-subtitle-transform"
        track={globalTrack}
        isSelected={hasSelectedSubtitle}
        isActive={true}
        previewScale={previewScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        actualWidth={actualWidth}
        actualHeight={actualHeight}
        panX={panX}
        panY={panY}
        zIndexOverlay={subtitleZIndex}
        renderScale={renderScale}
        isTextEditMode={isTextEditMode}
        interactionMode={interactionMode}
        onTransformUpdate={(_, transform) => {
          const trackId = selectedSubtitle?.id || activeSubtitles[0].id;
          onSubtitleTransformUpdate(trackId, transform);
        }}
        onSelect={() => {
          if (activeSubtitles[0]) {
            onSubtitleSelect(activeSubtitles[0].id);
          }
        }}
        onTextUpdate={
          selectedSubtitle
            ? (_, newText) =>
                onSubtitleTextUpdate?.(selectedSubtitle.id, newText)
            : undefined
        }
        onDragStateChange={onDragStateChange}
        onEditModeChange={handleEditModeChange}
      >
        {activeSubtitles.map((track) =>
          renderSubtitleContent(
            track,
            getTextStyleForSubtitle,
            activeStyle,
            renderScale,
            baseVideoWidth,
            onSubtitleSelect,
          ),
        )}
      </SubtitleTransformBoundary>
    );
  }, [
    activeSubtitles,
    selectedTrackIds,
    globalSubtitlePosition,
    previewScale,
    baseVideoWidth,
    baseVideoHeight,
    actualWidth,
    actualHeight,
    panX,
    panY,
    subtitleZIndex,
    renderScale,
    isTextEditMode,
    interactionMode,
    onSubtitleTransformUpdate,
    onSubtitleSelect,
    onSubtitleTextUpdate,
    onDragStateChange,
    handleEditModeChange,
    getTextStyleForSubtitle,
    activeStyle,
  ]);

  // ============================================================================
  // MAIN RENDER
  // ============================================================================
  return (
    <>
      {/* 
        ============================================================================
        CRITICAL FIX: Render DualBufferVideo as a STABLE SIBLING
        ============================================================================
        
        The DualBufferVideo is rendered here, OUTSIDE of any loop or callback.
        This ensures React never remounts it due to key changes or callback
        recreation. The video elements stay mounted for the entire lifetime
        of the overlay renderer.
        
        The VideoTransformBoundary below just handles positioning/transforms
        and wraps the video visually without affecting the video element's
        position in the React tree.
      */}
      {videoRenderInfo && (
        <div
          key="stable-video-container"
          className="absolute inset-0 pointer-events-none"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${panX}px)`,
            top: `calc(50% + ${panY}px)`,
            transform: 'translate(-50%, -50%)',
            overflow: 'visible',
            zIndex: videoRenderInfo.zIndex,
          }}
        >
          <VideoTransformBoundary
            track={videoRenderInfo.track}
            isSelected={videoRenderInfo.isSelected}
            previewScale={coordinateSystem.baseScale}
            videoWidth={baseVideoWidth}
            videoHeight={baseVideoHeight}
            renderScale={renderScale}
            interactionMode={interactionMode}
            onTransformUpdate={onVideoTransformUpdate}
            onSelect={onVideoSelect}
            onRotationStateChange={onRotationStateChange}
            onDragStateChange={onDragStateChange}
            clipContent={true}
            clipWidth={actualWidth}
            clipHeight={actualHeight}
          >
            <div
              className="relative"
              style={{
                width: `${videoRenderInfo.videoWidth}px`,
                height: `${videoRenderInfo.videoHeight}px`,
                visibility: videoRenderInfo.isVisuallyHidden
                  ? 'hidden'
                  : 'visible',
                pointerEvents:
                  videoRenderInfo.isVisuallyHidden ||
                  interactionMode === 'pan' ||
                  interactionMode === 'text-edit'
                    ? 'none'
                    : 'auto',
              }}
            >
              {/* 
                CRITICAL: DualBufferVideo has a STABLE key that never changes.
                It's rendered directly here, not through a callback or map function.
              */}
              <DualBufferVideo
                ref={dualBufferVideoRef}
                activeTrack={activeVideoTrack}
                allTracks={allTracks}
                currentFrame={currentFrame}
                fps={fps}
                isPlaying={isPlaying}
                isMuted={isMuted}
                volume={volume}
                playbackRate={playbackRate}
                onLoadedMetadata={onVideoLoadedMetadata}
                width={videoRenderInfo.videoWidth}
                height={videoRenderInfo.videoHeight}
                objectFit="contain"
              />
            </div>
          </VideoTransformBoundary>
        </div>
      )}

      {/* Render non-video tracks (images, text) in z-order */}
      {sortedVisualTracks
        .filter((t) => t.type !== 'subtitle' && t.type !== 'video')
        .map((track) => renderNonVideoTrack(track))}

      {/* Render subtitles with global positioning */}
      {renderSubtitles()}
    </>
  );
};

// ============================================================================
// HELPER RENDER FUNCTIONS (unchanged from original)
// ============================================================================

/**
 * Render subtitle content
 */
function renderSubtitleContent(
  track: VideoTrack,
  getTextStyleForSubtitle: (style: any, segmentStyle?: any) => any,
  activeStyle: any,
  renderScale: number,
  baseVideoWidth: number,
  onSubtitleSelect: (trackId: string) => void,
) {
  const appliedStyle = getTextStyleForSubtitle(
    activeStyle,
    track.subtitleStyle,
  );

  const baseFontSize = parseFloat(appliedStyle.fontSize) || 40;
  const responsiveFontSize = baseFontSize * renderScale;
  const scaledPaddingVertical = SUBTITLE_PADDING_VERTICAL * renderScale;
  const scaledPaddingHorizontal = SUBTITLE_PADDING_HORIZONTAL * renderScale;
  const scaledTextShadow = scaleTextShadow(
    appliedStyle.textShadow,
    renderScale,
  );
  const hasBackground = hasActualBackground(appliedStyle.backgroundColor);

  const baseTextStyle: React.CSSProperties = {
    fontSize: `${responsiveFontSize}px`,
    fontFamily: appliedStyle.fontFamily,
    fontWeight: appliedStyle.fontWeight,
    fontStyle: appliedStyle.fontStyle,
    textTransform: appliedStyle.textTransform as any,
    textDecoration: appliedStyle.textDecoration,
    textAlign: appliedStyle.textAlign as any,
    lineHeight: appliedStyle.lineHeight,
    letterSpacing: appliedStyle.letterSpacing
      ? `${parseFloat(String(appliedStyle.letterSpacing)) * renderScale}px`
      : appliedStyle.letterSpacing,
    whiteSpace: 'pre-line',
    wordBreak: 'keep-all',
    overflowWrap: 'normal',
    padding: `${scaledPaddingVertical}px ${scaledPaddingHorizontal}px`,
    maxWidth: `${baseVideoWidth * renderScale * 0.9}px`,
  };

  if ((appliedStyle as any).hasGlow) {
    const glowBlurAmount = GLOW_BLUR_MULTIPLIER * renderScale;
    const glowSpread = GLOW_SPREAD_MULTIPLIER * renderScale;

    if (hasBackground) {
      return (
        <div
          key={`subtitle-content-${track.id}`}
          onClick={(e) => {
            e.stopPropagation();
            onSubtitleSelect(track.id);
          }}
        >
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <div
              style={{
                ...baseTextStyle,
                position: 'absolute',
                top: 0,
                left: 0,
                color: appliedStyle.color,
                backgroundColor: appliedStyle.backgroundColor,
                opacity: 0.75,
                filter: `blur(${glowBlurAmount}px)`,
                boxShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
                zIndex: Z_INDEX_SUBTITLE_CONTENT_BASE,
              }}
              aria-hidden="true"
            >
              {track.subtitleText}
            </div>
            <div
              style={{
                ...baseTextStyle,
                position: 'absolute',
                top: 0,
                left: 0,
                color: 'transparent',
                backgroundColor: appliedStyle.backgroundColor,
                opacity: appliedStyle.opacity,
                zIndex: Z_INDEX_SUBTITLE_CONTENT_BASE + 1,
              }}
              aria-hidden="true"
            >
              {track.subtitleText}
            </div>
            <div
              style={{
                ...baseTextStyle,
                position: 'relative',
                color: appliedStyle.color,
                backgroundColor: 'transparent',
                opacity: appliedStyle.opacity,
                textShadow: scaledTextShadow,
                zIndex: Z_INDEX_SUBTITLE_CONTENT_BASE + 2,
              }}
            >
              {track.subtitleText}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`subtitle-content-${track.id}`}
        onClick={(e) => {
          e.stopPropagation();
          onSubtitleSelect(track.id);
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <div
            style={{
              ...baseTextStyle,
              position: 'absolute',
              top: 0,
              left: 0,
              color: appliedStyle.color,
              backgroundColor: 'transparent',
              opacity: 0.75,
              filter: `blur(${glowBlurAmount}px)`,
              textShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
              WebkitTextStroke: `${glowSpread * 0.75}px ${appliedStyle.color}`,
              zIndex: Z_INDEX_SUBTITLE_CONTENT_BASE,
            }}
            aria-hidden="true"
          >
            {track.subtitleText}
          </div>
          <div
            style={{
              ...baseTextStyle,
              position: 'relative',
              color: appliedStyle.color,
              backgroundColor: 'transparent',
              opacity: appliedStyle.opacity,
              textShadow: scaledTextShadow,
              zIndex: Z_INDEX_SUBTITLE_CONTENT_BASE + 1,
            }}
          >
            {track.subtitleText}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key={`subtitle-content-${track.id}`}
      onClick={(e) => {
        e.stopPropagation();
        onSubtitleSelect(track.id);
      }}
    >
      <div
        style={{
          ...baseTextStyle,
          textShadow: scaledTextShadow,
          color: appliedStyle.color,
          backgroundColor: appliedStyle.backgroundColor,
          opacity: appliedStyle.opacity,
        }}
      >
        {track.subtitleText}
      </div>
    </div>
  );
}

/**
 * Render an image track
 */
function renderImageTrack(
  track: VideoTrack,
  zIndex: number,
  isSelected: boolean,
  renderScale: number,
  previewScale: number,
  baseVideoWidth: number,
  baseVideoHeight: number,
  actualWidth: number,
  actualHeight: number,
  panX: number,
  panY: number,
  coordinateSystem: any,
  interactionMode: InteractionMode | undefined,
  onTransformUpdate: (trackId: string, transform: any) => void,
  onSelect: (trackId: string) => void,
  onRotationStateChange: (isRotating: boolean) => void,
  onDragStateChange: (isDragging: boolean, position?: any) => void,
) {
  const imageUrl = track.previewUrl || track.source;
  const defaultWidth = track.width || baseVideoWidth;
  const defaultHeight = track.height || baseVideoHeight;
  const imageTransform = track.textTransform || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    width: defaultWidth,
    height: defaultHeight,
  };

  return (
    <div
      key={`image-${track.id}`}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible',
        zIndex,
      }}
    >
      <ImageTransformBoundary
        track={track}
        isSelected={isSelected}
        previewScale={previewScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        renderScale={renderScale}
        interactionMode={interactionMode}
        onTransformUpdate={onTransformUpdate}
        onSelect={onSelect}
        onRotationStateChange={onRotationStateChange}
        onDragStateChange={onDragStateChange}
        clipContent={true}
        clipWidth={actualWidth}
        clipHeight={actualHeight}
      >
        <div
          className="relative"
          style={{
            width: `${(imageTransform.width || defaultWidth) * renderScale}px`,
            height: `${(imageTransform.height || defaultHeight) * renderScale}px`,
            opacity:
              track.textStyle?.opacity !== undefined
                ? track.textStyle.opacity / 100
                : 1,
            pointerEvents:
              interactionMode === 'pan' || interactionMode === 'text-edit'
                ? 'none'
                : 'auto',
          }}
        >
          <img
            src={imageUrl}
            alt={track.name}
            className="w-full h-full object-contain"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
            draggable={false}
          />
        </div>
      </ImageTransformBoundary>
    </div>
  );
}

/**
 * Render a text track
 */
function renderTextTrack(
  track: VideoTrack,
  zIndex: number,
  isSelected: boolean,
  renderScale: number,
  previewScale: number,
  baseVideoWidth: number,
  baseVideoHeight: number,
  actualWidth: number,
  actualHeight: number,
  panX: number,
  panY: number,
  coordinateSystem: any,
  interactionMode: InteractionMode | undefined,
  isTextEditMode: boolean,
  onTransformUpdate: (trackId: string, transform: any) => void,
  onSelect: (trackId: string) => void,
  onTextUpdate: (trackId: string, newText: string) => void,
  onRotationStateChange: (isRotating: boolean) => void,
  onDragStateChange: (isDragging: boolean, position?: any) => void,
  onEditModeChange: (isEditing: boolean) => void,
  pendingEditTextId?: string | null,
  onEditStarted?: () => void,
) {
  const appliedStyle = getTextStyleForTextClip(track);
  const baseFontSize = parseFloat(appliedStyle.fontSize) || 40;
  const actualFontSize =
    baseFontSize * renderScale * (track.textTransform?.scale || 1);
  const effectiveScale = renderScale * (track.textTransform?.scale || 1);
  const scaledPaddingVertical = TEXT_CLIP_PADDING_VERTICAL * effectiveScale;
  const scaledPaddingHorizontal = TEXT_CLIP_PADDING_HORIZONTAL * effectiveScale;
  const scaledTextShadow = scaleTextShadow(
    appliedStyle.textShadow,
    effectiveScale,
  );
  const hasBackground = hasActualBackground(appliedStyle.backgroundColor);

  const baseTextStyle: React.CSSProperties = {
    fontSize: `${actualFontSize}px`,
    fontFamily: appliedStyle.fontFamily,
    fontWeight: appliedStyle.fontWeight,
    fontStyle: appliedStyle.fontStyle,
    textTransform: appliedStyle.textTransform as any,
    textDecoration: appliedStyle.textDecoration,
    textAlign: appliedStyle.textAlign as any,
    lineHeight: appliedStyle.lineHeight,
    letterSpacing: appliedStyle.letterSpacing
      ? `${parseFloat(String(appliedStyle.letterSpacing)) * previewScale}px`
      : appliedStyle.letterSpacing,
    whiteSpace: 'pre-line',
    wordBreak: 'keep-all',
    overflowWrap: 'normal',
    padding: `${scaledPaddingVertical}px ${scaledPaddingHorizontal}px`,
  };

  const completeStyle: React.CSSProperties = {
    ...baseTextStyle,
    textShadow: scaledTextShadow,
    color: appliedStyle.color,
    backgroundColor: appliedStyle.backgroundColor,
    opacity: appliedStyle.opacity,
  };

  if (appliedStyle.hasGlow) {
    const glowBlurAmount = GLOW_BLUR_MULTIPLIER * effectiveScale;
    const glowSpread = GLOW_SPREAD_MULTIPLIER * effectiveScale;

    return (
      <div
        key={`text-${track.id}`}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: actualWidth,
          height: actualHeight,
          left: `calc(50% + ${panX}px)`,
          top: `calc(50% + ${panY}px)`,
          transform: 'translate(-50%, -50%)',
          overflow: 'visible',
          zIndex,
        }}
      >
        <TextTransformBoundary
          track={track}
          isSelected={isSelected}
          previewScale={previewScale}
          videoWidth={baseVideoWidth}
          videoHeight={baseVideoHeight}
          renderScale={renderScale}
          isTextEditMode={isTextEditMode}
          interactionMode={interactionMode}
          onTransformUpdate={onTransformUpdate}
          onSelect={onSelect}
          onTextUpdate={onTextUpdate}
          onRotationStateChange={onRotationStateChange}
          onDragStateChange={onDragStateChange}
          onEditModeChange={onEditModeChange}
          appliedStyle={completeStyle}
          clipContent={true}
          clipWidth={actualWidth}
          clipHeight={actualHeight}
          disableScaleTransform={true}
          autoEnterEditMode={pendingEditTextId === track.id}
          onEditStarted={onEditStarted}
        >
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {hasBackground ? (
              <>
                <div
                  style={{
                    ...baseTextStyle,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    color: appliedStyle.color,
                    backgroundColor: appliedStyle.backgroundColor,
                    opacity: 0.75,
                    filter: `blur(${glowBlurAmount}px)`,
                    boxShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
                    zIndex: 0,
                  }}
                  aria-hidden="true"
                >
                  {track.textContent}
                </div>
                <div
                  style={{
                    ...baseTextStyle,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    color: 'transparent',
                    backgroundColor: appliedStyle.backgroundColor,
                    opacity: appliedStyle.opacity,
                    zIndex: 1,
                  }}
                  aria-hidden="true"
                >
                  {track.textContent}
                </div>
                <div
                  style={{
                    ...baseTextStyle,
                    position: 'relative',
                    color: appliedStyle.color,
                    backgroundColor: 'transparent',
                    opacity: appliedStyle.opacity,
                    textShadow: scaledTextShadow,
                    zIndex: 2,
                  }}
                >
                  {track.textContent}
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    ...baseTextStyle,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    color: appliedStyle.color,
                    backgroundColor: 'transparent',
                    opacity: 0.75,
                    filter: `blur(${glowBlurAmount}px)`,
                    textShadow: `0 0 ${glowSpread}px ${appliedStyle.color}, 0 0 ${glowSpread * 1.5}px ${appliedStyle.color}`,
                    WebkitTextStroke: `${glowSpread * 0.75}px ${appliedStyle.color}`,
                    zIndex: 0,
                  }}
                  aria-hidden="true"
                >
                  {track.textContent}
                </div>
                <div
                  style={{
                    ...baseTextStyle,
                    position: 'relative',
                    color: appliedStyle.color,
                    backgroundColor: 'transparent',
                    opacity: appliedStyle.opacity,
                    textShadow: scaledTextShadow,
                    zIndex: 1,
                  }}
                >
                  {track.textContent}
                </div>
              </>
            )}
          </div>
        </TextTransformBoundary>
      </div>
    );
  }

  return (
    <div
      key={`text-${track.id}`}
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible',
        zIndex,
      }}
    >
      <TextTransformBoundary
        track={track}
        isSelected={isSelected}
        previewScale={previewScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        renderScale={renderScale}
        isTextEditMode={isTextEditMode}
        interactionMode={interactionMode}
        onTransformUpdate={onTransformUpdate}
        onSelect={onSelect}
        onTextUpdate={onTextUpdate}
        onRotationStateChange={onRotationStateChange}
        onDragStateChange={onDragStateChange}
        onEditModeChange={onEditModeChange}
        appliedStyle={completeStyle}
        clipContent={true}
        clipWidth={actualWidth}
        clipHeight={actualHeight}
        disableScaleTransform={true}
        autoEnterEditMode={pendingEditTextId === track.id}
        onEditStarted={onEditStarted}
      >
        <div style={completeStyle}>{track.textContent}</div>
      </TextTransformBoundary>
    </div>
  );
}
