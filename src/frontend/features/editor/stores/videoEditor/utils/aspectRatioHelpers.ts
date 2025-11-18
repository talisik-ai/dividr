// Aspect ratio presets with their dimensions and labels
export const ASPECT_RATIO_PRESETS = [
  { label: '1:1', width: 1080, height: 1080, ratio: 1 },
  { label: '9:16', width: 1080, height: 1920, ratio: 9 / 16 },
  { label: '16:9', width: 1920, height: 1080, ratio: 16 / 9 },
  { label: '4:5', width: 1080, height: 1350, ratio: 4 / 5 },
  { label: '5:4', width: 1350, height: 1080, ratio: 5 / 4 },
  { label: '3:4', width: 1080, height: 1440, ratio: 3 / 4 },
  { label: '4:3', width: 1440, height: 1080, ratio: 4 / 3 },
  { label: '2:3', width: 1080, height: 1620, ratio: 2 / 3 },
] as const;

/**
 * Detect aspect ratio from width and height
 * Returns the calculated ratio and the nearest preset label if within tolerance
 */
export const detectAspectRatio = (
  width?: number,
  height?: number,
): { ratio: number; label: string | null } | null => {
  if (!width || !height || width <= 0 || height <= 0) {
    return null;
  }

  const ratio = width / height;
  const tolerance = 0.02; // 2% tolerance for matching presets

  // Find the nearest preset within tolerance
  const nearestPreset = ASPECT_RATIO_PRESETS.find((preset) => {
    return Math.abs(preset.ratio - ratio) / preset.ratio < tolerance;
  });

  return {
    ratio,
    label: nearestPreset?.label || null,
  };
};

/**
 * Get preset by label
 */
export const getPresetByLabel = (label: string) => {
  return ASPECT_RATIO_PRESETS.find((preset) => preset.label === label);
};

/**
 * Get preset by dimensions
 */
export const getPresetByDimensions = (width: number, height: number) => {
  return ASPECT_RATIO_PRESETS.find(
    (preset) => preset.width === width && preset.height === height,
  );
};

/**
 * Calculate dimensions for a given aspect ratio label while maintaining area
 * If no label matches, returns original dimensions
 */
export const calculateDimensionsForRatio = (
  targetLabel: string,
  currentWidth: number,
  currentHeight: number,
): { width: number; height: number } => {
  const preset = getPresetByLabel(targetLabel);
  if (!preset) {
    return { width: currentWidth, height: currentHeight };
  }

  return { width: preset.width, height: preset.height };
};

/**
 * Format aspect ratio as a readable string
 * Examples:
 *   1.777... -> "16:9"
 *   1.481... -> "1.48:1"
 *   0.5625  -> "9:16"
 */
export const formatAspectRatio = (ratio: number): string => {
  // Check if it matches a known preset (with tolerance)
  const tolerance = 0.02;
  const matchingPreset = ASPECT_RATIO_PRESETS.find((preset) => {
    return Math.abs(preset.ratio - ratio) / preset.ratio < tolerance;
  });

  if (matchingPreset) {
    return matchingPreset.label;
  }

  // For non-standard ratios, format as decimal:1
  // Round to 2 decimal places for readability
  const roundedRatio = Math.round(ratio * 100) / 100;
  return `${roundedRatio}:1`;
};

/**
 * Get a display label for aspect ratio detection
 * Returns either the preset label or a computed ratio string
 */
export const getAspectRatioDisplayLabel = (
  width?: number,
  height?: number,
): string => {
  if (!width || !height || width <= 0 || height <= 0) {
    return '16:9 (default)';
  }

  const detected = detectAspectRatio(width, height);
  if (!detected) {
    return '16:9 (default)';
  }

  // If we found a preset match, use it
  if (detected.label) {
    return detected.label;
  }

  // Otherwise, format the exact ratio
  return formatAspectRatio(detected.ratio);
};
