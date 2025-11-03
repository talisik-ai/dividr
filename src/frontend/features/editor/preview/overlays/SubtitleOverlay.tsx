/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import {
  GLOW_BLUR_MULTIPLIER,
  GLOW_SPREAD_MULTIPLIER,
  SUBTITLE_BASE_SIZE_RATIO,
  SUBTITLE_BOTTOM_PADDING,
  SUBTITLE_HORIZONTAL_PADDING_RATIO,
  SUBTITLE_MIN_FONT_SIZE,
  SUBTITLE_PADDING_HORIZONTAL,
  SUBTITLE_PADDING_VERTICAL,
} from '../core/constants';
import { OverlayRenderProps } from '../core/types';
import {
  calculateResponsiveFontSize,
  scaleTextShadow,
} from '../utils/scalingUtils';
import { hasActualBackground } from '../utils/textStyleUtils';
import { getTrackZIndex } from '../utils/trackUtils';

/**
 * Subtitle overlay component - renders all active subtitle tracks
 */

export interface SubtitleOverlayProps extends OverlayRenderProps {
  activeSubtitles: VideoTrack[];
  allTracks: VideoTrack[];
  getTextStyleForSubtitle: (style: any) => any;
  activeStyle: any;
}

export const SubtitleOverlay: React.FC<SubtitleOverlayProps> = ({
  activeSubtitles,
  allTracks,
  getTextStyleForSubtitle,
  activeStyle,
  previewScale,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
}) => {
  if (activeSubtitles.length === 0) return null;

  // Get applied style for container alignment
  const appliedStyle = getTextStyleForSubtitle(activeStyle);

  // Calculate responsive font size based on zoom level
  const responsiveFontSize = calculateResponsiveFontSize(
    baseVideoHeight,
    SUBTITLE_MIN_FONT_SIZE,
    SUBTITLE_BASE_SIZE_RATIO,
    previewScale,
  );

  // Scale padding and effects with zoom level
  const scaledPaddingVertical = SUBTITLE_PADDING_VERTICAL * previewScale;
  const scaledPaddingHorizontal = SUBTITLE_PADDING_HORIZONTAL * previewScale;

  // Calculate responsive horizontal padding based on actual width (5% of actual width)
  const scaledHorizontalPadding =
    baseVideoWidth * SUBTITLE_HORIZONTAL_PADDING_RATIO * previewScale;

  // Render each subtitle track independently with proper z-indexing
  return (
    <>
      {activeSubtitles.map((track) => {
        return (
          <div
            key={`subtitle-container-${track.id}`}
            className="absolute inset-0 pointer-events-none"
            style={{
              width: actualWidth,
              height: actualHeight,
              left: `calc(50% + ${panX}px)`,
              top: `calc(50% + ${panY}px)`,
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              alignItems:
                appliedStyle.textAlign === 'left'
                  ? 'flex-start'
                  : appliedStyle.textAlign === 'right'
                    ? 'flex-end'
                    : 'center',
              justifyContent: 'flex-end',
              paddingBottom: `${SUBTITLE_BOTTOM_PADDING * previewScale}px`,
              paddingLeft: `${scaledHorizontalPadding}px`,
              paddingRight: `${scaledHorizontalPadding}px`,
              zIndex: getTrackZIndex(track, allTracks),
            }}
          >
            {(() => {
              // Scale text shadow with zoom level if present
              const scaledTextShadow = scaleTextShadow(
                appliedStyle.textShadow,
                previewScale,
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
                  ? `${parseFloat(String(appliedStyle.letterSpacing)) * previewScale}px`
                  : appliedStyle.letterSpacing,
                whiteSpace: 'pre-line',
                wordBreak: 'keep-all',
                overflowWrap: 'normal',
                padding: `${scaledPaddingVertical}px ${scaledPaddingHorizontal}px`,
              };

              // Multi-layer rendering for glow effect
              if ((appliedStyle as any).hasGlow) {
                const glowBlurAmount = GLOW_BLUR_MULTIPLIER * previewScale;
                const glowSpread = GLOW_SPREAD_MULTIPLIER * previewScale;

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
                          zIndex: 0,
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
                          zIndex: 1,
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
                          zIndex: 2,
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
                        zIndex: 0,
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
                        zIndex: 1,
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
    </>
  );
};
