/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { TextTransformBoundary } from '../components/TextTransformBoundary';
import {
  GLOW_BLUR_MULTIPLIER,
  GLOW_SPREAD_MULTIPLIER,
  TEXT_CLIP_BASE_SIZE_RATIO,
  TEXT_CLIP_MIN_FONT_SIZE,
  TEXT_CLIP_PADDING_HORIZONTAL,
  TEXT_CLIP_PADDING_VERTICAL,
} from '../core/constants';
import { OverlayRenderProps } from '../core/types';
import {
  calculateResponsiveFontSize,
  scaleTextShadow,
} from '../utils/scalingUtils';
import {
  getTextStyleForTextClip,
  hasActualBackground,
} from '../utils/textStyleUtils';
import { getTrackZIndex } from '../utils/trackUtils';

/**
 * Text overlay component - renders all active text tracks with transform controls
 */

export interface TextOverlayProps extends OverlayRenderProps {
  activeTexts: VideoTrack[];
  allTracks: VideoTrack[];
  selectedTrackIds: string[];
  onTransformUpdate: (
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
  onSelect: (trackId: string) => void;
  onTextUpdate: (trackId: string, newText: string) => void;
  onRotationStateChange: (isRotating: boolean) => void;
  onDragStateChange: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
}

export const TextOverlay: React.FC<TextOverlayProps> = ({
  activeTexts,
  allTracks,
  selectedTrackIds,
  previewScale,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  onTransformUpdate,
  onSelect,
  onTextUpdate,
  onRotationStateChange,
  onDragStateChange,
}) => {
  if (activeTexts.length === 0) return null;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'hidden', // Clip text elements that go outside video canvas
        zIndex:
          activeTexts.length > 0
            ? Math.max(...activeTexts.map((t) => getTrackZIndex(t, allTracks)))
            : 400,
      }}
    >
      {activeTexts.map((track) => {
        const appliedStyle = getTextStyleForTextClip(track);
        const isSelected = selectedTrackIds.includes(track.id);

        // Calculate responsive font size based on zoom level
        const responsiveFontSize = calculateResponsiveFontSize(
          baseVideoHeight,
          TEXT_CLIP_MIN_FONT_SIZE,
          TEXT_CLIP_BASE_SIZE_RATIO,
          previewScale,
        );

        // Scale padding and effects with zoom level
        const scaledPaddingVertical = TEXT_CLIP_PADDING_VERTICAL * previewScale;
        const scaledPaddingHorizontal =
          TEXT_CLIP_PADDING_HORIZONTAL * previewScale;

        // Scale text shadow with zoom level
        const scaledTextShadow = scaleTextShadow(
          appliedStyle.textShadow,
          previewScale,
        );

        // Check if has actual background (not transparent)
        const hasBackground = hasActualBackground(appliedStyle.backgroundColor);

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
            ? `${parseFloat(String(appliedStyle.letterSpacing)) * previewScale}px`
            : appliedStyle.letterSpacing,
          whiteSpace: 'pre-line',
          wordBreak: 'keep-all',
          overflowWrap: 'normal',
          padding: `${scaledPaddingVertical}px ${scaledPaddingHorizontal}px`,
        };

        // Multi-layer rendering for glow effect
        if (appliedStyle.hasGlow) {
          const glowBlurAmount = GLOW_BLUR_MULTIPLIER * previewScale;
          const glowSpread = GLOW_SPREAD_MULTIPLIER * previewScale;

          // Create the complete style for the boundary wrapper
          const completeStyle: React.CSSProperties = {
            ...baseTextStyle,
            color: appliedStyle.color,
            backgroundColor: hasBackground
              ? appliedStyle.backgroundColor
              : 'transparent',
            opacity: appliedStyle.opacity,
            textShadow: scaledTextShadow,
          };

          if (hasBackground) {
            // Triple-layer mode: glow + background box + text
            return (
              <TextTransformBoundary
                key={track.id}
                track={track}
                isSelected={isSelected}
                previewScale={previewScale}
                videoWidth={baseVideoWidth}
                videoHeight={baseVideoHeight}
                onTransformUpdate={onTransformUpdate}
                onSelect={onSelect}
                onTextUpdate={onTextUpdate}
                onRotationStateChange={onRotationStateChange}
                onDragStateChange={onDragStateChange}
                appliedStyle={completeStyle}
              >
                <div
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
                      zIndex: 0,
                    }}
                    aria-hidden="true"
                  >
                    {track.textContent}
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
                      zIndex: 1,
                    }}
                    aria-hidden="true"
                  >
                    {track.textContent}
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
                      zIndex: 2,
                    }}
                  >
                    {track.textContent}
                  </div>
                </div>
              </TextTransformBoundary>
            );
          }

          // Double-layer mode: glow + text (no background)
          return (
            <TextTransformBoundary
              key={track.id}
              track={track}
              isSelected={isSelected}
              previewScale={previewScale}
              videoWidth={baseVideoWidth}
              videoHeight={baseVideoHeight}
              onTransformUpdate={onTransformUpdate}
              onSelect={onSelect}
              onTextUpdate={onTextUpdate}
              onRotationStateChange={onRotationStateChange}
              onDragStateChange={onDragStateChange}
              appliedStyle={completeStyle}
            >
              <div
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
                    zIndex: 0,
                  }}
                  aria-hidden="true"
                >
                  {track.textContent}
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
                    zIndex: 1,
                  }}
                >
                  {track.textContent}
                </div>
              </div>
            </TextTransformBoundary>
          );
        }

        // No glow - simple single layer rendering
        const completeStyle: React.CSSProperties = {
          ...baseTextStyle,
          textShadow: scaledTextShadow,
          color: appliedStyle.color,
          backgroundColor: appliedStyle.backgroundColor,
          opacity: appliedStyle.opacity,
        };

        return (
          <TextTransformBoundary
            key={track.id}
            track={track}
            isSelected={isSelected}
            previewScale={previewScale}
            videoWidth={baseVideoWidth}
            videoHeight={baseVideoHeight}
            onTransformUpdate={onTransformUpdate}
            onSelect={onSelect}
            onTextUpdate={onTextUpdate}
            onRotationStateChange={onRotationStateChange}
            onDragStateChange={onDragStateChange}
            appliedStyle={completeStyle}
          >
            <div style={completeStyle}>{track.textContent}</div>
          </TextTransformBoundary>
        );
      })}
    </div>
  );
};
