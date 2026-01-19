import { VideoTrack } from '../../stores/videoEditor/index';

/**
 * Shared constants for the preview system
 */

// Z-index base values for track types
// Timeline row order defines visual stacking (from TRACK_ROWS definition)
// Index 0 (text) should be highest z-index, index 4 (audio) should be lowest
export const TRACK_ROW_ORDER: Record<VideoTrack['type'], number> = {
  text: 4, // Top row in timeline → Highest z-index
  subtitle: 3,
  image: 2,
  video: 1,
  audio: 0, // Bottom row in timeline → Lowest z-index
};

// Base z-index spacing between track types (500 units apart for fine-grained control)
export const Z_INDEX_SPACING = 500;

// Zoom constraints
export const MIN_ZOOM_SCALE = 0.1;
export const MAX_ZOOM_SCALE = 8;
export const ZOOM_FACTOR = 1.1;

// Alignment tolerances
export const CENTER_ALIGNMENT_TOLERANCE = 1; // Strict tolerance for center alignment (±1px)

// Glow effect parameters
export const GLOW_BLUR_MULTIPLIER = 8;
export const GLOW_SPREAD_MULTIPLIER = 8;

// Subtitle sizing
export const SUBTITLE_MIN_FONT_SIZE = 40;
export const SUBTITLE_BASE_SIZE_RATIO = 0.02; // 2% of video height
export const SUBTITLE_PADDING_VERTICAL = 7;
export const SUBTITLE_PADDING_HORIZONTAL = 9;
export const SUBTITLE_HORIZONTAL_PADDING_RATIO = 0.01; // 1% of video width
export const SUBTITLE_BOTTOM_PADDING = 20;

// Text clip sizing
export const TEXT_CLIP_MIN_FONT_SIZE = 40;
export const TEXT_CLIP_BASE_SIZE_RATIO = 0.02; // 2% of video height
export const TEXT_CLIP_PADDING_VERTICAL = 2;
export const TEXT_CLIP_PADDING_HORIZONTAL = 8;

// Stroke outline
export const STROKE_WIDTH = 2;
export const STROKE_DIRECTIONS = 8; // 8-direction outline for smooth stroke effect

// Dynamic font sizing - resolution-aware defaults
// Reference: 720p is the baseline, where 40px is the default font size
// This ensures text scales proportionally across 720p, 1080p, 1440p, 4K
export const FONT_SIZE_REFERENCE_HEIGHT = 720;
export const FONT_SIZE_REFERENCE_VALUE = 40; // Base font size at 720p

/**
 * Calculate a resolution-aware default font size based on canvas height.
 * This ensures text appears visually consistent relative to the canvas,
 * regardless of resolution (720p, 1080p, 4K, etc.)
 *
 * @param canvasHeight - The current canvas/video height in pixels
 * @returns The scaled font size appropriate for the resolution
 *
 * @example
 * calculateDefaultFontSize(720)  // Returns 40 (720p baseline)
 * calculateDefaultFontSize(1080) // Returns 60 (1080p - 1.5x scale)
 * calculateDefaultFontSize(1440) // Returns 80 (1440p - 2x scale)
 * calculateDefaultFontSize(2160) // Returns 120 (4K - 3x scale)
 */
export function calculateDefaultFontSize(canvasHeight: number): number {
  if (!canvasHeight || canvasHeight <= 0) {
    return FONT_SIZE_REFERENCE_VALUE;
  }
  const scaleFactor = canvasHeight / FONT_SIZE_REFERENCE_HEIGHT;
  return Math.round(FONT_SIZE_REFERENCE_VALUE * scaleFactor);
}

// Z-index hierarchy for overlay layers
// These ensure proper stacking order: Text > Subtitle > Image > Video > Audio
export const Z_INDEX_SUBTITLE_OVERLAY =
  TRACK_ROW_ORDER.subtitle * Z_INDEX_SPACING; // 1500
export const Z_INDEX_SUBTITLE_CONTAINER = 100; // Within subtitle overlay for transform boundary
export const Z_INDEX_SUBTITLE_SELECTION = 200; // Selection border on top
export const Z_INDEX_SUBTITLE_CONTENT_BASE = 0; // Base for multi-layer subtitle rendering (glow layers)
