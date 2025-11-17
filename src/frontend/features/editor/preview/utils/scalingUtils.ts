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
