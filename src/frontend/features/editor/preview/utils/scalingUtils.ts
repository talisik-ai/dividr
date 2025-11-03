import { PreviewDimensions } from '../core/types';

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
 */
export function calculateContentScale(
  params: ScalingParams,
): PreviewDimensions {
  const {
    containerWidth,
    containerHeight,
    videoWidth,
    videoHeight,
    previewScale,
  } = params;

  const containerAspect = containerWidth / containerHeight;
  const videoAspect = videoWidth / videoHeight;

  let actualWidth = videoWidth;
  let actualHeight = videoHeight;

  if (containerWidth > 0 && containerHeight > 0) {
    // Calculate the maximum size that fits the container while maintaining aspect ratio
    if (containerAspect > videoAspect) {
      // Container is wider than video - fit to height
      const scale = containerHeight / videoHeight;
      actualWidth = videoWidth * scale;
      actualHeight = containerHeight;
    } else {
      // Container is taller than video - fit to width
      const scale = containerWidth / videoWidth;
      actualWidth = containerWidth;
      actualHeight = videoHeight * scale;
    }

    // Apply previewScale as a zoom multiplier on the fitted size
    // previewScale = 1 means fill the container (default behavior)
    // previewScale > 1 means zoom in
    // previewScale < 1 means zoom out
    actualWidth *= previewScale;
    actualHeight *= previewScale;
  }

  return {
    width: containerWidth,
    height: containerHeight,
    actualWidth,
    actualHeight,
  };
}

/**
 * Calculate responsive font size based on video height and zoom level
 */
export function calculateResponsiveFontSize(
  baseVideoHeight: number,
  minSize: number,
  sizeRatio: number,
  previewScale: number,
): number {
  const baseFontSize = Math.max(minSize, baseVideoHeight * sizeRatio);
  return baseFontSize * previewScale;
}

/**
 * Scale text shadow values based on preview scale
 */
export function scaleTextShadow(
  textShadow: string,
  previewScale: number,
): string {
  if (!textShadow || previewScale === 1) return textShadow;

  return textShadow.replace(
    /(\\d+\\.?\\d*)px/g,
    (match: string, value: string) => {
      return `${parseFloat(value) * previewScale}px`;
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
