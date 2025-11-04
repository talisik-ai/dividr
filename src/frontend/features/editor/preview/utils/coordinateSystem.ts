/**
 * Fixed Coordinate System for Video Preview
 *
 * This module implements a professional-grade coordinate system that ensures
 * assets (text, images, subtitles) maintain their exact positions regardless
 * of container size, zoom level, or fullscreen mode.
 *
 * Key Principles:
 * 1. Internal coordinates always map to a fixed video resolution (e.g., 1920×1080)
 * 2. Only the visual rendering scales - logical coordinates remain constant
 * 3. Same coordinate system applies in both normal and fullscreen preview modes
 * 4. Matches behavior of professional editors (CapCut, Premiere Pro, After Effects)
 */

export interface FixedCoordinateSystem {
  // Native video dimensions (logical coordinate space)
  videoWidth: number;
  videoHeight: number;

  // Container dimensions (physical rendering space)
  containerWidth: number;
  containerHeight: number;

  // Scale factor from video space to container space
  baseScale: number;

  // User zoom multiplier (1.0 = fit to container, >1 = zoomed in, <1 = zoomed out)
  zoomScale: number;

  // Final rendered dimensions (after base scale and zoom)
  renderedWidth: number;
  renderedHeight: number;

  // Offset to center the content in the container
  offsetX: number;
  offsetY: number;

  // Pan offset (for user panning when zoomed in)
  panX: number;
  panY: number;
}

/**
 * Calculate the fixed coordinate system for a video preview
 *
 * This function computes all the necessary transforms to maintain a consistent
 * coordinate system regardless of container size changes.
 */
export const calculateFixedCoordinateSystem = (params: {
  videoWidth: number;
  videoHeight: number;
  containerWidth: number;
  containerHeight: number;
  previewScale: number; // User zoom level
  panX?: number;
  panY?: number;
}): FixedCoordinateSystem => {
  const {
    videoWidth,
    videoHeight,
    containerWidth,
    containerHeight,
    previewScale,
    panX = 0,
    panY = 0,
  } = params;

  // Calculate aspect ratios
  const containerAspect = containerWidth / containerHeight;
  const videoAspect = videoWidth / videoHeight;

  // Calculate base scale to fit video in container (maintaining aspect ratio)
  let baseScale: number;
  let renderedWidth: number;
  let renderedHeight: number;

  if (containerAspect > videoAspect) {
    // Container is wider than video - fit to height
    baseScale = containerHeight / videoHeight;
    renderedHeight = containerHeight;
    renderedWidth = videoWidth * baseScale;
  } else {
    // Container is taller than video - fit to width
    baseScale = containerWidth / videoWidth;
    renderedWidth = containerWidth;
    renderedHeight = videoHeight * baseScale;
  }

  // Apply user zoom on top of base scale
  const finalScale = baseScale * previewScale;
  renderedWidth *= previewScale;
  renderedHeight *= previewScale;

  // Calculate centering offset (before pan)
  const offsetX = (containerWidth - renderedWidth) / 2;
  const offsetY = (containerHeight - renderedHeight) / 2;

  return {
    videoWidth,
    videoHeight,
    containerWidth,
    containerHeight,
    baseScale: finalScale, // Combined scale factor
    zoomScale: previewScale,
    renderedWidth,
    renderedHeight,
    offsetX,
    offsetY,
    panX,
    panY,
  };
};

/**
 * Convert normalized coordinates (-1 to 1, where 0 is center) to pixel coordinates
 * in the video's native resolution space
 */
export const normalizedToVideoPixels = (
  normalized: { x: number; y: number },
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number } => {
  return {
    x: normalized.x * (videoWidth / 2),
    y: normalized.y * (videoHeight / 2),
  };
};

/**
 * Convert pixel coordinates in video space to normalized coordinates (-1 to 1)
 */
export const videoPixelsToNormalized = (
  pixels: { x: number; y: number },
  videoWidth: number,
  videoHeight: number,
): { x: number; y: number } => {
  return {
    x: pixels.x / (videoWidth / 2),
    y: pixels.y / (videoHeight / 2),
  };
};

/**
 * Convert video space coordinates to screen space coordinates
 * This is used for rendering assets in the correct position on screen
 */
export const videoSpaceToScreenSpace = (
  videoCoords: { x: number; y: number },
  coordinateSystem: FixedCoordinateSystem,
): { x: number; y: number } => {
  const { baseScale, offsetX, offsetY, panX, panY, videoWidth, videoHeight } =
    coordinateSystem;

  // Video center in video space
  const videoCenterX = videoWidth / 2;
  const videoCenterY = videoHeight / 2;

  // Convert to screen space
  // 1. Add video center (convert from center-origin to top-left-origin)
  // 2. Scale to screen size
  // 3. Add container offset (centering)
  // 4. Add pan offset
  const screenX = (videoCoords.x + videoCenterX) * baseScale + offsetX + panX;
  const screenY = (videoCoords.y + videoCenterY) * baseScale + offsetY + panY;

  return { x: screenX, y: screenY };
};

/**
 * Convert screen space coordinates to video space coordinates
 * This is used for handling user interactions (dragging, clicking)
 */
export const screenSpaceToVideoSpace = (
  screenCoords: { x: number; y: number },
  coordinateSystem: FixedCoordinateSystem,
): { x: number; y: number } => {
  const { baseScale, offsetX, offsetY, panX, panY, videoWidth, videoHeight } =
    coordinateSystem;

  // Video center in video space
  const videoCenterX = videoWidth / 2;
  const videoCenterY = videoHeight / 2;

  // Reverse the transformation
  // 1. Subtract pan offset
  // 2. Subtract container offset
  // 3. Scale back to video space
  // 4. Subtract video center (convert from top-left-origin to center-origin)
  const videoX = (screenCoords.x - offsetX - panX) / baseScale - videoCenterX;
  const videoY = (screenCoords.y - offsetY - panY) / baseScale - videoCenterY;

  return { x: videoX, y: videoY };
};

/**
 * Get the container style for the fixed coordinate system
 * This creates a container that maintains the video aspect ratio
 */
export const getFixedContainerStyle = (
  coordinateSystem: FixedCoordinateSystem,
): React.CSSProperties => {
  const { renderedWidth, renderedHeight, offsetX, offsetY, panX, panY } =
    coordinateSystem;

  return {
    position: 'absolute',
    width: renderedWidth,
    height: renderedHeight,
    left: offsetX + panX,
    top: offsetY + panY,
    overflow: 'visible', // Allow transform handles to extend beyond
  };
};

/**
 * Get the centered container style (alternative approach using CSS transforms)
 * This is the current approach used in the codebase
 */
export const getCenteredContainerStyle = (
  coordinateSystem: FixedCoordinateSystem,
): React.CSSProperties => {
  const { renderedWidth, renderedHeight, panX, panY } = coordinateSystem;

  return {
    position: 'absolute',
    width: renderedWidth,
    height: renderedHeight,
    left: `calc(50% + ${panX}px)`,
    top: `calc(50% + ${panY}px)`,
    transform: 'translate(-50%, -50%)',
    overflow: 'visible',
  };
};

/**
 * Calculate responsive font size based on video height and zoom level
 * Font size is based on the video's native resolution, then scaled for rendering
 */
export const calculateFixedFontSize = (
  videoHeight: number,
  baseSizeRatio: number,
  minSize: number,
  renderScale: number, // The baseScale from coordinate system
): number => {
  // Calculate font size in video space
  const videoSpaceFontSize = Math.max(minSize, videoHeight * baseSizeRatio);

  // Scale to screen space
  return videoSpaceFontSize * renderScale;
};

/**
 * Scale a value from video space to screen space
 */
export const scaleVideoToScreen = (
  videoValue: number,
  coordinateSystem: FixedCoordinateSystem,
): number => {
  return videoValue * coordinateSystem.baseScale;
};

/**
 * Scale a value from screen space to video space
 */
export const scaleScreenToVideo = (
  screenValue: number,
  coordinateSystem: FixedCoordinateSystem,
): number => {
  return screenValue / coordinateSystem.baseScale;
};
