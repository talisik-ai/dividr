import { VideoTrack } from '../../stores/videoEditor/index';
import { STROKE_DIRECTIONS, STROKE_WIDTH } from '../core/constants';

/**
 * Utility functions for text styling
 */

export interface TextStyleResult {
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  textTransform: string;
  textAlign: string;
  fontSize: string;
  color: string;
  backgroundColor: string;
  textDecoration: string;
  textShadow: string;
  letterSpacing: string;
  lineHeight: number;
  opacity: number;
  hasGlow: boolean;
  /** The color to use for glow effect (uses text color by default) */
  glowColor: string;
  /** The stroke color for outline effects */
  strokeColor: string;
}

/**
 * Convert text track style to CSS
 */
export function getTextStyleForTextClip(track: VideoTrack): TextStyleResult {
  const style = track.textStyle || {};

  // Build text shadow for stroke outline
  const strokeShadows: string[] = [];
  const strokeColor = style.strokeColor || '#000000';

  // Create 8-direction outline for smooth stroke effect
  for (let angle = 0; angle < 360; angle += 360 / STROKE_DIRECTIONS) {
    const radian = (angle * Math.PI) / 180;
    const x = Math.cos(radian) * STROKE_WIDTH;
    const y = Math.sin(radian) * STROKE_WIDTH;
    strokeShadows.push(`${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${strokeColor}`);
  }

  // Add shadow if enabled
  const shadowEffects: string[] = [...strokeShadows];
  if (style.hasShadow) {
    shadowEffects.push(`2px 2px 4px rgba(0, 0, 0, 0.8)`);
  }

  // Apply bold/italic overrides
  let fontWeight = style.fontWeight || '400';
  let fontStyle = style.fontStyle || 'normal';

  if (style.isBold) {
    fontWeight = '700';
  }
  if (style.isItalic) {
    fontStyle = 'italic';
  }

  const textColor = style.fillColor || '#FFFFFF';
  const strokeColorValue = style.strokeColor || '#000000';

  return {
    fontFamily: style.fontFamily || '"Arial", sans-serif',
    fontWeight,
    fontStyle,
    textTransform: style.textTransform || 'none',
    textAlign: style.textAlign || 'center',
    fontSize: `${style.fontSize || 40}px`,
    color: textColor,
    backgroundColor: style.backgroundColor || 'transparent',
    textDecoration: style.isUnderline ? 'underline' : 'none',
    textShadow: shadowEffects.join(', '),
    letterSpacing: `${style.letterSpacing || 0}px`,
    lineHeight: style.lineHeight || 1.2,
    opacity: (style.opacity || 100) / 100,
    hasGlow: style.hasGlow || false,
    // Glow uses text color for the glow effect (matching FFmpeg behavior)
    glowColor: textColor,
    strokeColor: strokeColorValue,
  };
}

/**
 * Check if a background color is actually visible (not transparent)
 */
export function hasActualBackground(backgroundColor?: string): boolean {
  if (!backgroundColor) return false;
  if (backgroundColor === 'transparent') return false;

  // Check for rgba with zero alpha (handles 0, 0.0, 0.00, etc.)
  const rgbaMatch = backgroundColor.match(
    /rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/,
  );
  if (rgbaMatch) {
    const alpha = parseFloat(rgbaMatch[1]);
    if (alpha === 0) return false;
  }

  return true;
}
