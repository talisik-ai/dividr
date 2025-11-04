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
