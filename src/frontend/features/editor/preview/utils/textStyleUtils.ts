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

  return {
    fontFamily: style.fontFamily || '"Arial", sans-serif',
    fontWeight,
    fontStyle,
    textTransform: style.textTransform || 'none',
    textAlign: style.textAlign || 'center',
    fontSize: `${style.fontSize || 18}px`,
    color: style.fillColor || '#FFFFFF',
    backgroundColor: style.backgroundColor || 'transparent',
    textDecoration: style.isUnderline ? 'underline' : 'none',
    textShadow: shadowEffects.join(', '),
    letterSpacing: `${style.letterSpacing || 0}px`,
    lineHeight: style.lineSpacing || 1.2,
    opacity: (style.opacity || 100) / 100,
    hasGlow: style.hasGlow || false,
  };
}

/**
 * Check if a background color is actually visible (not transparent)
 */
export function hasActualBackground(backgroundColor?: string): boolean {
  if (!backgroundColor) return false;

  return (
    backgroundColor !== 'transparent' &&
    backgroundColor !== 'rgba(0,0,0,0)' &&
    backgroundColor !== 'rgba(0, 0, 0, 0)'
  );
}
