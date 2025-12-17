/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from 'react';
import { VideoTrack } from '../../stores/videoEditor';
import { ImageTransformBoundary } from '../components/ImageTransformBoundary';
import { SubtitleTransformBoundary } from '../components/SubtitleTransformBoundary';
import { VideoTransformBoundary } from '../components/VideoTransformBoundary';
import {
  GLOW_BLUR_MULTIPLIER,
  GLOW_SPREAD_MULTIPLIER,
  SUBTITLE_PADDING_HORIZONTAL,
  SUBTITLE_PADDING_VERTICAL,
  Z_INDEX_SUBTITLE_CONTENT_BASE,
} from '../core/constants';
import { OverlayRenderProps } from '../core/types';
import { scaleTextShadow } from '../utils/scalingUtils';
import { hasActualBackground } from '../utils/textStyleUtils';

/**
 * Z-index for the transform boundary layer
 * This should be higher than any track z-index to ensure boundaries always appear on top
 */
export const TRANSFORM_BOUNDARY_LAYER_Z_INDEX = 10000;

export interface TransformBoundaryLayerProps extends OverlayRenderProps {
  // Video-specific props
  videoRef?: React.RefObject<HTMLVideoElement>;

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

  // Video transform callbacks
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
  onEditModeChange?: (isEditing: boolean) => void;

  /**
   * Callback to check if another element should receive this interaction.
   * Used for proper spatial hit-testing when elements overlap.
   * Returns the trackId that should receive the click, or null if this element should handle it.
   */
  getTopElementAtPoint?: (screenX: number, screenY: number) => string | null;
}

/**
 * TransformBoundaryLayer
 *
 * A dedicated top-level layer for rendering transform boundaries (selection boxes,
 * resize handles, rotation controls) independent of content z-index ordering.
 *
 * Key features:
 * - Renders above all overlay content regardless of track z-index
 * - Only renders boundaries for selected tracks
 * - Supports multi-selection (all selected boundaries render in this layer)
 * - Does not affect content rendering or z-index ordering
 * - Maintains pointer-events: none except for active handles
 *
 * This replicates CapCut's behavior where transform controls are always accessible
 * even when the selected element is behind other elements in the layer stack.
 */
export const TransformBoundaryLayer: React.FC<TransformBoundaryLayerProps> = ({
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

  // Video props
  onVideoTransformUpdate,
  onVideoSelect,

  // Image props
  onImageTransformUpdate,
  onImageSelect,

  // Text props - unused since text boundaries are rendered in UnifiedOverlayRenderer
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTextTransformUpdate: _onTextTransformUpdate,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTextSelect: _onTextSelect,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onTextUpdate: _onTextUpdate,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  pendingEditTextId: _pendingEditTextId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onEditStarted: _onEditStarted,

  // State callbacks
  onRotationStateChange,
  onDragStateChange,
  onEditModeChange,

  // Spatial hit-testing callback
  getTopElementAtPoint,
}) => {
  const renderScale = coordinateSystem.baseScale;

  // Get selected tracks that are currently active (visible at current frame)
  const selectedActiveTracks = useMemo(() => {
    return allTracks.filter(
      (track) =>
        selectedTrackIds.includes(track.id) &&
        track.visible &&
        currentFrame >= track.startFrame &&
        currentFrame < track.endFrame,
    );
  }, [allTracks, selectedTrackIds, currentFrame]);

  // Separate selected subtitles (they share global positioning)
  const selectedSubtitles = useMemo(
    () =>
      selectedActiveTracks.filter(
        (t) => t.type === 'subtitle' && t.subtitleText,
      ),
    [selectedActiveTracks],
  );

  // Non-subtitle selected tracks
  const selectedNonSubtitleTracks = useMemo(
    () => selectedActiveTracks.filter((t) => t.type !== 'subtitle'),
    [selectedActiveTracks],
  );

  // Render subtitle boundary if any subtitle is selected
  const renderSubtitleBoundary = () => {
    // Subtitle boundary now rendered in UnifiedOverlayRenderer to avoid duplicates
    return null;

    if (selectedSubtitles.length === 0) return null;

    // Get all active subtitles for content rendering
    const activeSubtitles = allTracks.filter(
      (track) =>
        track.type === 'subtitle' &&
        track.subtitleText &&
        track.visible &&
        currentFrame >= track.startFrame &&
        currentFrame < track.endFrame,
    );

    if (activeSubtitles.length === 0) return null;

    const selectedSubtitle = selectedSubtitles[0];

    // Create a fake track for the transform boundary (uses global position)
    const globalTrack: VideoTrack = {
      ...activeSubtitles[0],
      id: 'global-subtitle-transform',
      subtitleTransform: globalSubtitlePosition,
    };

    return (
      <SubtitleTransformBoundary
        key="global-subtitle-transform-boundary"
        track={globalTrack}
        isSelected={true}
        isActive={true}
        previewScale={previewScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        actualWidth={actualWidth}
        actualHeight={actualHeight}
        panX={panX}
        panY={panY}
        zIndexOverlay={0} // z-index is handled by the layer itself
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
        onEditModeChange={onEditModeChange}
        boundaryOnly={true} // Only render the boundary, not content
      >
        {/* Render subtitle content for boundary sizing */}
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
            // Make content invisible in boundary layer
            visibility: 'hidden',
          };

          // Multi-layer rendering for glow effect
          if ((appliedStyle as any).hasGlow) {
            const glowBlurAmount = GLOW_BLUR_MULTIPLIER * renderScale;
            const glowSpread = GLOW_SPREAD_MULTIPLIER * renderScale;

            if (hasBackground) {
              return (
                <div key={`subtitle-boundary-content-${track.id}`}>
                  <div
                    style={{ position: 'relative', display: 'inline-block' }}
                  >
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
              <div key={`subtitle-boundary-content-${track.id}`}>
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
            <div key={`subtitle-boundary-content-${track.id}`}>
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
  };

  // Render boundary for a single non-subtitle track
  const renderTrackBoundary = (track: VideoTrack) => {
    switch (track.type) {
      case 'video':
        return renderVideoBoundary(track);
      case 'image':
        return renderImageBoundary(track);
      case 'text':
        // Skip text boundaries in TransformBoundaryLayer - they are handled by
        // UnifiedOverlayRenderer's TextTransformBoundary which supports inline editing.
        // Rendering here would block double-click events from reaching the content layer.
        return null;
      default:
        return null;
    }
  };

  // Render video track boundary
  const renderVideoBoundary = (track: VideoTrack) => {
    const videoTransform = track.textTransform || {
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      width: track.width || baseVideoWidth,
      height: track.height || baseVideoHeight,
    };

    return (
      <div
        key={`video-boundary-${track.id}`}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: actualWidth,
          height: actualHeight,
          left: `calc(50% + ${panX}px)`,
          top: `calc(50% + ${panY}px)`,
          transform: 'translate(-50%, -50%)',
          overflow: 'visible',
        }}
      >
        <VideoTransformBoundary
          track={track}
          isSelected={true}
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
          boundaryOnly={true} // Only render boundary, not content
          disableAutoSizeUpdates={true}
          getTopElementAtPoint={getTopElementAtPoint}
        >
          {/* Invisible content for boundary sizing */}
          <div
            style={{
              width: `${(videoTransform.width || track.width || baseVideoWidth) * renderScale}px`,
              height: `${(videoTransform.height || track.height || baseVideoHeight) * renderScale}px`,
              visibility: 'hidden',
            }}
          />
        </VideoTransformBoundary>
      </div>
    );
  };

  // Render image track boundary
  const renderImageBoundary = (track: VideoTrack) => {
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
        key={`image-boundary-${track.id}`}
        className="absolute inset-0 pointer-events-none"
        style={{
          width: actualWidth,
          height: actualHeight,
          left: `calc(50% + ${panX}px)`,
          top: `calc(50% + ${panY}px)`,
          transform: 'translate(-50%, -50%)',
          overflow: 'visible',
        }}
      >
        <ImageTransformBoundary
          track={track}
          isSelected={true}
          previewScale={previewScale}
          videoWidth={baseVideoWidth}
          videoHeight={baseVideoHeight}
          renderScale={renderScale}
          interactionMode={interactionMode}
          onTransformUpdate={onImageTransformUpdate}
          onSelect={onImageSelect}
          onRotationStateChange={onRotationStateChange}
          onDragStateChange={onDragStateChange}
          clipContent={true}
          clipWidth={actualWidth}
          clipHeight={actualHeight}
          boundaryOnly={true} // Only render boundary, not content
          disableAutoSizeUpdates={true}
          getTopElementAtPoint={getTopElementAtPoint}
        >
          {/* Invisible content for boundary sizing */}
          <div
            style={{
              width: `${(imageTransform.width || defaultWidth) * renderScale}px`,
              height: `${(imageTransform.height || defaultHeight) * renderScale}px`,
              visibility: 'hidden',
            }}
          />
        </ImageTransformBoundary>
      </div>
    );
  };

  // If no tracks are selected, render nothing but keep the layer present
  // with pointer-events: none so it doesn't block interactions
  const hasSelectedTracks =
    selectedNonSubtitleTracks.length > 0 || selectedSubtitles.length > 0;

  return (
    <div
      className="absolute inset-0"
      style={{
        zIndex: TRANSFORM_BOUNDARY_LAYER_Z_INDEX,
        // Only enable pointer events when there are selected tracks
        // and their handles need to be interactive
        pointerEvents: hasSelectedTracks ? 'none' : 'none',
      }}
      data-testid="transform-boundary-layer"
    >
      {/* Render boundaries for selected non-subtitle tracks */}
      {selectedNonSubtitleTracks.map((track) => renderTrackBoundary(track))}

      {/* Render subtitle boundary if any subtitle is selected */}
      {renderSubtitleBoundary()}
    </div>
  );
};
