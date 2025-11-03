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
export const SUBTITLE_MIN_FONT_SIZE = 24;
export const SUBTITLE_BASE_SIZE_RATIO = 0.02; // 2% of video height
export const SUBTITLE_PADDING_VERTICAL = 7;
export const SUBTITLE_PADDING_HORIZONTAL = 9;
export const SUBTITLE_HORIZONTAL_PADDING_RATIO = 0.01; // 1% of video width
export const SUBTITLE_BOTTOM_PADDING = 20;

// Text clip sizing
export const TEXT_CLIP_MIN_FONT_SIZE = 24;
export const TEXT_CLIP_BASE_SIZE_RATIO = 0.02; // 2% of video height
export const TEXT_CLIP_PADDING_VERTICAL = 2;
export const TEXT_CLIP_PADDING_HORIZONTAL = 8;

// Stroke outline
export const STROKE_WIDTH = 2;
export const STROKE_DIRECTIONS = 8; // 8-direction outline for smooth stroke effect
