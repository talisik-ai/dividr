/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { useVideoEditorStore } from '../../stores/videoEditor';
import { SubtitleTransformBoundary } from '../components/SubtitleTransformBoundary';
import {
  GLOW_BLUR_MULTIPLIER,
  GLOW_SPREAD_MULTIPLIER,
  SUBTITLE_PADDING_HORIZONTAL,
  SUBTITLE_PADDING_VERTICAL,
  Z_INDEX_SUBTITLE_CONTENT_BASE,
  Z_INDEX_SUBTITLE_OVERLAY,
} from '../core/constants';
import { OverlayRenderProps } from '../core/types';
import { scaleTextShadow } from '../utils/scalingUtils';
import { hasActualBackground } from '../utils/textStyleUtils';

/**
 * Subtitle overlay component - renders all active subtitle tracks with transform support
 */

export interface SubtitleOverlayProps extends OverlayRenderProps {
  activeSubtitles: VideoTrack[];
  allTracks: VideoTrack[];
  selectedTrackIds: string[];
  isTextEditMode?: boolean;
  getTextStyleForSubtitle: (style: any, segmentStyle?: any) => any;
  activeStyle: any;
  globalSubtitlePosition: { x: number; y: number };
  onTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
    },
  ) => void;
  onSelect: (trackId: string) => void;
  onTextUpdate?: (trackId: string, newText: string) => void;
  onDragStateChange?: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  activeSubtitles,
  // allTracks is required by interface but not used in this component
  selectedTrackIds,
  isTextEditMode = false,
  getTextStyleForSubtitle,
  activeStyle,
  globalSubtitlePosition,
  previewScale,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  coordinateSystem,
  onTransformUpdate,
  onSelect,
  onTextUpdate,
  onDragStateChange,
}) => {
  if (activeSubtitles.length === 0) return null;

  // Get the setPreviewInteractionMode function from the store
  const setPreviewInteractionMode = useVideoEditorStore(
    (state) => state.setPreviewInteractionMode,
  );

  // Handler for when edit mode changes - automatically activate Text Tool
  const handleEditModeChange = useCallback(
    (isEditing: boolean) => {
      if (isEditing) {
        setPreviewInteractionMode('text-edit');
      }
    },
    [setPreviewInteractionMode],
  );

  // Use the coordinate system's baseScale for consistent rendering
  const renderScale = coordinateSystem.baseScale;

  // Check if any subtitle is selected
  const hasSelectedSubtitle = activeSubtitles.some((track) =>
    selectedTrackIds.includes(track.id),
  );
  const selectedSubtitle = activeSubtitles.find((track) =>
    selectedTrackIds.includes(track.id),
  );

  // Note: We'll get per-segment styles inside the map loop below

  // Scale padding and effects using the render scale
  const scaledPaddingVertical = SUBTITLE_PADDING_VERTICAL * renderScale;
  const scaledPaddingHorizontal = SUBTITLE_PADDING_HORIZONTAL * renderScale;

  // Create a fake track for the transform boundary (uses global position)
  const globalTrack: VideoTrack = {
    ...activeSubtitles[0],
    id: 'global-subtitle-transform',
    subtitleTransform: globalSubtitlePosition,
  };

  // Render all subtitles wrapped in ONE transform boundary with proper z-index
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
      zIndexOverlay={Z_INDEX_SUBTITLE_OVERLAY}
      renderScale={renderScale}
      isTextEditMode={isTextEditMode}
      onTransformUpdate={(_, transform) => {
        // Pass the first selected subtitle's ID (or first subtitle if none selected)
        const trackId = selectedSubtitle?.id || activeSubtitles[0].id;
        onTransformUpdate(trackId, transform);
      }}
      onSelect={() => {
        // Select the first subtitle when clicking the boundary
        if (activeSubtitles[0]) {
          onSelect(activeSubtitles[0].id);
        }
      }}
      onTextUpdate={
        selectedSubtitle
          ? (_, newText) => onTextUpdate?.(selectedSubtitle.id, newText)
          : undefined
      }
      onDragStateChange={onDragStateChange}
      onEditModeChange={handleEditModeChange}
    >
      {activeSubtitles.map((track) => {
        // Get style for this specific segment (merges global + per-segment)
        const appliedStyle = getTextStyleForSubtitle(
          activeStyle,
          track.subtitleStyle,
        );

        // Extract the fontSize from appliedStyle and scale it for rendering
        const baseFontSize = parseFloat(appliedStyle.fontSize) || 24;
        const responsiveFontSize = baseFontSize * renderScale;

        return (
          <div
            key={`subtitle-content-${track.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(track.id);
            }}
          >
            {(() => {
              // Scale text shadow using the render scale
              const scaledTextShadow = scaleTextShadow(
                appliedStyle.textShadow,
                renderScale,
              );

              // Check if has actual background (not transparent)
              const hasBackground = hasActualBackground(
                appliedStyle.backgroundColor,
              );

              // Base text style shared across all layers
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
                maxWidth: `${baseVideoWidth * renderScale * 0.9}px`, // 90% of video width - prevents wrapping on viewport resize
              };

              // Multi-layer rendering for glow effect
              if ((appliedStyle as any).hasGlow) {
                const glowBlurAmount = GLOW_BLUR_MULTIPLIER * renderScale;
                const glowSpread = GLOW_SPREAD_MULTIPLIER * renderScale;

                if (hasBackground) {
                  // Triple-layer mode: glow + background box + text
                  return (
                    <div
                      key={track.id}
                      style={{
                        position: 'relative',
                        display: 'inline-block',
                      }}
                    >
                      {/* Layer 0: Blurred glow layer behind background box */}
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

                      {/* Layer 1: Background box (crisp, no blur) */}
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

                      {/* Layer 2: Text with outline on top (crisp, no blur) */}
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
                  );
                }

                // Double-layer mode: glow + text (no background)
                return (
                  <div
                    key={track.id}
                    style={{
                      position: 'relative',
                      display: 'inline-block',
                    }}
                  >
                    {/* Layer 0: Blurred glow layer (furthest back) */}
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

                    {/* Layer 1: Main text with outline */}
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
                );
              }

              // No glow - simple single layer rendering
              return (
                <div
                  key={track.id}
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
              );
            })()}
          </div>
        );
      })}
    </SubtitleTransformBoundary>
  );
};
