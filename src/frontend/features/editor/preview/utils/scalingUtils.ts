import { PreviewDimensions } from '../core/types';
import {
  calculateFixedCoordinateSystem,
  FixedCoordinateSystem,
} from './coordinateSystem';

/**
 * Utility functions for scaling and dimension calculations
 */

export interface ScalingParams {
  containerWidth: number;
  containerHeight: number;
  videoWidth: number;
  videoHeight: number;
  previewScale: number;
}

/**
 * Calculate content scale - the preview size to fill the container while maintaining aspect ratio
 *
 * IMPORTANT: This function now uses the fixed coordinate system to ensure consistent
 * positioning across different container sizes (normal vs fullscreen preview).
 */
export function calculateContentScale(
  params: ScalingParams,
): PreviewDimensions & { coordinateSystem: FixedCoordinateSystem } {
  const {
    containerWidth,
    containerHeight,
    videoWidth,
    videoHeight,
    previewScale,
  } = params;

  // Use the new fixed coordinate system
  const coordinateSystem = calculateFixedCoordinateSystem({
    videoWidth,
    videoHeight,
    containerWidth,
    containerHeight,
    previewScale,
  });

  return {
    width: containerWidth,
    height: containerHeight,
    actualWidth: coordinateSystem.renderedWidth,
    actualHeight: coordinateSystem.renderedHeight,
    coordinateSystem,
  };
}

/**
 * Calculate responsive font size based on video height and zoom level
 *
 * This function calculates font size in the video's native resolution space,
 * then scales it for rendering. This ensures text maintains consistent size
 * relative to the video regardless of container size.
 */
export function calculateResponsiveFontSize(
  baseVideoHeight: number,
  minSize: number,
  sizeRatio: number,
  renderScale: number, // This should be coordinateSystem.baseScale
): number {
  // Calculate font size in video space
  const videoSpaceFontSize = Math.max(minSize, baseVideoHeight * sizeRatio);

  // Scale to screen space for rendering
  return videoSpaceFontSize * renderScale;
}

/**
 * Scale text shadow values based on render scale
 *
 * This scales text shadow from video space to screen space
 */
export function scaleTextShadow(
  textShadow: string,
  renderScale: number, // This should be coordinateSystem.baseScale
): string {
  if (!textShadow || renderScale === 1) return textShadow;

  return textShadow.replace(
    /(\\d+\\.?\\d*)px/g,
    (match: string, value: string) => {
      return `${parseFloat(value) * renderScale}px`;
    },
  );
}

/**
 * Convert normalized coordinates (-1 to 1) to pixel coordinates
 */
export function normalizedToPixels(
  normalized: number,
  dimension: number,
): number {
  return normalized * (dimension / 2);
}

/**
 * Convert pixel coordinates to normalized coordinates (-1 to 1)
 */
export function pixelsToNormalized(pixels: number, dimension: number): number {
  return pixels / (dimension / 2);
}

/**
 * Calculate dimensions that fit within a container while preserving aspect ratio
 * Uses "contain" strategy - video fits entirely within canvas without cropping
 *
 * @param originalWidth - Original video/image width
 * @param originalHeight - Original video/image height
 * @param containerWidth - Canvas/container width
 * @param containerHeight - Canvas/container height
 * @returns Fitted dimensions that preserve aspect ratio
 */
export function calculateFitDimensions(
  originalWidth: number,
  originalHeight: number,
  containerWidth: number,
  containerHeight: number,
): { width: number; height: number } {
  if (
    !originalWidth ||
    !originalHeight ||
    !containerWidth ||
    !containerHeight
  ) {
    return {
      width: containerWidth || originalWidth,
      height: containerHeight || originalHeight,
    };
  }

  const originalAspect = originalWidth / originalHeight;
  const containerAspect = containerWidth / containerHeight;

  let fittedWidth: number;
  let fittedHeight: number;

  // If video is wider than container (or same aspect), fit to width
  if (originalAspect >= containerAspect) {
    fittedWidth = containerWidth;
    fittedHeight = containerWidth / originalAspect;
  } else {
    // If video is taller than container, fit to height
    fittedHeight = containerHeight;
    fittedWidth = containerHeight * originalAspect;
  }

  return {
    width: Math.round(fittedWidth),
    height: Math.round(fittedHeight),
  };
}

/**
 * Calculate video transform to fit video within canvas based on original resolution
 * Uses "contain" strategy - ensures video always fits within canvas without cropping
 * This matches professional editor behavior (CapCut, Premiere Pro)
 *
 * @param originalWidth - Original video width (from track.width or video metadata)
 * @param originalHeight - Original video height (from track.height or video metadata)
 * @param canvasWidth - Canvas width
 * @param canvasHeight - Canvas height
 * @param currentTransform - Current transform (if any) to preserve position/rotation
 * @returns Transform with scale and dimensions that fit the video within canvas
 */
export function calculateVideoFitTransform(
  originalWidth: number,
  originalHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  currentTransform?: {
    x?: number;
    y?: number;
    scale?: number;
    rotation?: number;
    width?: number;
    height?: number;
  },
): {
  width: number;
  height: number;
  scale: number;
  x: number;
  y: number;
  rotation: number;
} {
  if (!originalWidth || !originalHeight || !canvasWidth || !canvasHeight) {
    return {
      width: canvasWidth || originalWidth,
      height: canvasHeight || originalHeight,
      scale: currentTransform?.scale || 1,
      x: currentTransform?.x || 0,
      y: currentTransform?.y || 0,
      rotation: currentTransform?.rotation || 0,
    };
  }

  // Calculate fitted dimensions using contain strategy
  const fittedDimensions = calculateFitDimensions(
    originalWidth,
    originalHeight,
    canvasWidth,
    canvasHeight,
  );

  // Calculate scale factor based on original resolution
  // Scale = fitted dimension / original dimension
  const scaleX = fittedDimensions.width / originalWidth;
  const scaleY = fittedDimensions.height / originalHeight;
  // Use the smaller scale to ensure video fits (contain behavior)
  const scale = Math.min(scaleX, scaleY);

  // Preserve existing position and rotation, or default to center
  return {
    width: fittedDimensions.width,
    height: fittedDimensions.height,
    scale:
      currentTransform?.scale !== undefined ? currentTransform.scale : scale,
    x: currentTransform?.x !== undefined ? currentTransform.x : 0,
    y: currentTransform?.y !== undefined ? currentTransform.y : 0,
    rotation:
      currentTransform?.rotation !== undefined ? currentTransform.rotation : 0,
  };
}
