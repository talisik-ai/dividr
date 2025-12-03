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
 * Unified Overlay Renderer
 *
 * This component renders all visual tracks (video, image, text, subtitle) in a single
 * unified rendering pass, respecting the dynamic track row ordering from the timeline.
 *
 * Key features:
 * - Renders tracks in exact z-order based on trackRowIndex
 * - Supports cross-type layering (e.g., text behind image, image above video)
 * - Updates immediately when tracks are reordered in the timeline
 * - Maintains proper z-index stacking for each individual track
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
 * Helper to get stable key for video elements
 * Uses source URL instead of track ID to prevent unnecessary remounts
 */
const getVideoElementKey = (track: VideoTrack): string => {
  const sourceUrl = track.previewUrl || track.source || track.id;
  // Hash or truncate the URL to make a reasonable key
  return `video-source-${hashString(sourceUrl)}`;
};

// Simple string hash function for creating stable keys
const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
};

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

  // Ref for DualBufferVideo component
  const dualBufferVideoRef = useRef<DualBufferVideoRef>(null);

  // Sync DualBufferVideo's active video to videoRef for backward compatibility
  useEffect(() => {
    if (dualBufferVideoRef.current && videoRef) {
      const activeVideo = dualBufferVideoRef.current.getActiveVideo();
      if (activeVideo && videoRef.current !== activeVideo) {
        // Update the ref to point to the active video
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

  // Render a single track based on its type
  const renderTrack = useCallback(
    (track: VideoTrack) => {
      const zIndex = getTrackZIndex(track, allTracks);
      const isSelected = selectedTrackIds.includes(track.id);

      switch (track.type) {
        case 'video':
          // Only render video if this is the active video track
          // AND the source URL matches (prevents flicker on segment changes)
          if (activeVideoTrack && track.id === activeVideoTrack.id) {
            // Check if we should skip rendering due to source change in progress
            const currentSource = track.previewUrl || track.source;
            const activeSource =
              activeVideoTrack.previewUrl || activeVideoTrack.source;

            if (currentSource !== activeSource) {
              // Source mismatch during transition - this is a race condition
              // Return null to prevent flicker
              console.log(
                '[UnifiedOverlayRenderer] Source mismatch, skipping render',
              );
              return null;
            }

            return renderVideoTrack(
              track,
              zIndex,
              isSelected,
              dualBufferVideoRef,
              renderScale,
              baseVideoWidth,
              baseVideoHeight,
              actualWidth,
              actualHeight,
              panX,
              panY,
              coordinateSystem,
              interactionMode,
              onVideoTransformUpdate,
              onVideoSelect,
              onRotationStateChange,
              onDragStateChange,
              onVideoLoadedMetadata,
              // DualBufferVideo props
              activeVideoTrack,
              allTracks,
              currentFrame,
              fps,
              isPlaying,
              isMuted,
              volume,
              playbackRate,
            );
          }
          return null;

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

        case 'subtitle':
          // Subtitles are handled separately due to global positioning
          return null;

        default:
          return null;
      }
    },
    [
      allTracks,
      selectedTrackIds,
      activeVideoTrack,
      videoRef,
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
      onVideoTransformUpdate,
      onVideoSelect,
      onVideoLoadedMetadata,
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

  // Calculate subtitle z-index (max of all subtitle tracks)
  const subtitleZIndex = useMemo(() => {
    if (activeSubtitles.length === 0) return 0;
    return Math.max(
      ...activeSubtitles.map((t) => getTrackZIndex(t, allTracks)),
    );
  }, [activeSubtitles, allTracks]);

  // Render subtitles with global positioning
  const renderSubtitles = useCallback(() => {
    if (activeSubtitles.length === 0) return null;

    const hasSelectedSubtitle = activeSubtitles.some((track) =>
      selectedTrackIds.includes(track.id),
    );
    const selectedSubtitle = activeSubtitles.find((track) =>
      selectedTrackIds.includes(track.id),
    );

    // Create a fake track for the transform boundary (uses global position)
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
        {activeSubtitles.map((track) => {
          const appliedStyle = getTextStyleForSubtitle(
            activeStyle,
            track.subtitleStyle,
          );

          const baseFontSize = parseFloat(appliedStyle.fontSize) || 40;
          const responsiveFontSize = baseFontSize * renderScale;
          const scaledPaddingVertical = SUBTITLE_PADDING_VERTICAL * renderScale;
          const scaledPaddingHorizontal =
            SUBTITLE_PADDING_HORIZONTAL * renderScale;
          const scaledTextShadow = scaleTextShadow(
            appliedStyle.textShadow,
            renderScale,
          );
          const hasBackground = hasActualBackground(
            appliedStyle.backgroundColor,
          );

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

          // Multi-layer rendering for glow effect
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
                  <div
                    style={{ position: 'relative', display: 'inline-block' }}
                  >
                    {/* Glow layer */}
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
                    {/* Background layer */}
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
                    {/* Text layer */}
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

            // Glow without background
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

          // No glow - simple rendering
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
        })}
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

  // Render all tracks in z-order
  return (
    <>
      {/* Render non-subtitle tracks in z-order */}
      {sortedVisualTracks
        .filter((t) => t.type !== 'subtitle')
        .map((track) => renderTrack(track))}

      {/* Render subtitles with global positioning */}
      {renderSubtitles()}
    </>
  );
};

// ============================================================================
// TRACK RENDER HELPERS
// ============================================================================

/**
 * Interaction mode type
 */
type InteractionMode = 'select' | 'pan' | 'text-edit';

/**
 * Render a video track using DualBufferVideo for seamless transitions
 */
function renderVideoTrack(
  track: VideoTrack,
  zIndex: number,
  isSelected: boolean,
  dualBufferVideoRef: React.RefObject<DualBufferVideoRef>,
  renderScale: number,
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
  onLoadedMetadata?: () => void,
  // DualBufferVideo props
  activeVideoTrack?: VideoTrack,
  allTracks?: VideoTrack[],
  currentFrame?: number,
  fps?: number,
  isPlaying?: boolean,
  isMuted?: boolean,
  volume?: number,
  playbackRate?: number,
) {
  const isVisuallyHidden = !track.visible;
  const videoTransform = track.textTransform || {
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    width: track.width || baseVideoWidth,
    height: track.height || baseVideoHeight,
  };

  // CRITICAL FIX: Use source-based key instead of track ID
  // This prevents React from remounting the video element when
  // crossing segment boundaries of the same source file
  const stableKey = getVideoElementKey(track);

  // Calculate video dimensions for DualBufferVideo
  const videoWidth =
    (videoTransform.width || track.width || baseVideoWidth) * renderScale;
  const videoHeight =
    (videoTransform.height || track.height || baseVideoHeight) * renderScale;

  return (
    <div
      key={stableKey}
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
      <VideoTransformBoundary
        track={track}
        isSelected={isSelected}
        previewScale={coordinateSystem.baseScale}
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
            width: `${videoWidth}px`,
            height: `${videoHeight}px`,
            visibility: isVisuallyHidden ? 'hidden' : 'visible',
            pointerEvents:
              isVisuallyHidden ||
              interactionMode === 'pan' ||
              interactionMode === 'text-edit'
                ? 'none'
                : 'auto',
          }}
        >
          <DualBufferVideo
            ref={dualBufferVideoRef}
            activeTrack={activeVideoTrack}
            allTracks={allTracks || []}
            currentFrame={currentFrame || 0}
            fps={fps || 30}
            isPlaying={isPlaying || false}
            isMuted={isMuted || false}
            volume={volume || 1}
            playbackRate={playbackRate || 1}
            onLoadedMetadata={onLoadedMetadata}
            width={videoWidth}
            height={videoHeight}
            objectFit="contain"
          />
        </div>
      </VideoTransformBoundary>
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

  // Handle glow effect
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
                {/* Glow layer */}
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
                {/* Background layer */}
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
                {/* Text layer */}
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
                {/* Glow layer (no background) */}
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
                {/* Text layer */}
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

  // No glow - simple rendering
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
