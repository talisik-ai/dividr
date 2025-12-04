/**
 * Shared constants for timeline layout to ensure perfect alignment
 * across all timeline components (ruler, controllers, tracks, thumbnail setter)
 */

/**
 * Timeline header height (ruler + add track button area)
 * This must match across TimelineRuler, TimelineTrackControllers, and AddTrackButton
 */
export const TIMELINE_HEADER_HEIGHT = 32; // px

/**
 * Track row heights - responsive based on screen size
 * These values MUST match the Tailwind classes used in track rows
 */
export const TRACK_ROW_HEIGHTS = {
  sm: 24, // sm:h-6 = 24px
  md: 32, // md:h-8 = 32px
  lg: 48, // lg:h-12 = 48px
} as const;

/**
 * Individual row height configurations per track type
 * Allows customization of specific rows (e.g., smaller text/subtitle rows)
 * Using standard Tailwind height values for better compatibility
 */
export const INDIVIDUAL_ROW_HEIGHTS: Record<
  string,
  { sm: number; md: number; lg: number }
> = {
  text: { sm: 24, md: 28, lg: 32 }, // Much smaller for text tracks (h-6, h-7, h-8)
  subtitle: { sm: 24, md: 28, lg: 32 }, // Much smaller for subtitle tracks (h-6, h-7, h-8)
  image: { sm: 24, md: 32, lg: 48 }, // Standard for image tracks (h-6, h-8, h-12)
  video: { sm: 24, md: 32, lg: 48 }, // Standard for video tracks (h-6, h-8, h-12)
  audio: { sm: 24, md: 32, lg: 48 }, // Standard for audio tracks (h-6, h-8, h-12)
};

/**
 * Track item heights (slightly smaller than row heights to fit within rows with padding)
 * These are the actual heights of the track items themselves
 */
export const TRACK_ITEM_HEIGHTS: Record<
  string,
  { sm: number; md: number; lg: number }
> = {
  text: { sm: 22, md: 24, lg: 28 }, // Track item height for text (fits in h-6, h-7, h-8) - much smaller
  subtitle: { sm: 22, md: 24, lg: 28 }, // Track item height for subtitle (fits in h-6, h-7, h-8) - much smaller
  image: { sm: 22, md: 30, lg: 44 }, // Track item height for image (fits in h-6, h-8, h-12) - standard size
  video: { sm: 22, md: 30, lg: 44 }, // Track item height for video (fits in h-6, h-8, h-12) - standard size
  audio: { sm: 22, md: 30, lg: 44 }, // Track item height for audio (fits in h-6, h-8, h-12) - standard size
};

/**
 * Get the current track row height based on window width
 * This ensures calculations match the actual rendered heights
 */
export const getCurrentTrackRowHeight = (): number => {
  if (typeof window === 'undefined') return TRACK_ROW_HEIGHTS.lg;

  const width = window.innerWidth;
  if (width < 640) return TRACK_ROW_HEIGHTS.sm; // Tailwind sm breakpoint
  if (width < 1024) return TRACK_ROW_HEIGHTS.md; // Tailwind lg breakpoint
  return TRACK_ROW_HEIGHTS.lg;
};

/**
 * Get the height for a specific row type based on current viewport
 *
 * @param rowTypeOrId - Either a track type (e.g., "text") or a row ID (e.g., "text-0")
 */
export const getRowHeight = (rowTypeOrId: string): number => {
  // Extract track type from row ID if needed (e.g., "text-0" -> "text")
  const trackType = rowTypeOrId.includes('-')
    ? rowTypeOrId.split('-')[0]
    : rowTypeOrId;

  if (typeof window === 'undefined') {
    return INDIVIDUAL_ROW_HEIGHTS[trackType]?.lg || TRACK_ROW_HEIGHTS.lg;
  }

  const width = window.innerWidth;
  const rowConfig = INDIVIDUAL_ROW_HEIGHTS[trackType];

  if (!rowConfig) {
    // Fallback to default heights if row type not configured
    return getCurrentTrackRowHeight();
  }

  if (width < 640) return rowConfig.sm;
  if (width < 1024) return rowConfig.md;
  return rowConfig.lg;
};

/**
 * Get Tailwind classes for a specific row type
 * Using standard Tailwind height classes for better compatibility
 *
 * @param rowTypeOrId - Either a track type (e.g., "text") or a row ID (e.g., "text-0")
 */
export const getRowHeightClasses = (rowTypeOrId: string): string => {
  // Extract track type from row ID if needed (e.g., "text-0" -> "text")
  const trackType = rowTypeOrId.includes('-')
    ? rowTypeOrId.split('-')[0]
    : rowTypeOrId;

  const config = INDIVIDUAL_ROW_HEIGHTS[trackType];
  if (!config) return TRACK_ROW_HEIGHT_CLASSES;

  // Map pixel values to standard Tailwind height classes
  const getHeightClass = (px: number): string => {
    switch (px) {
      case 24:
        return 'h-6'; // 24px
      case 28:
        return 'h-7'; // 28px
      case 32:
        return 'h-8'; // 32px
      case 40:
        return 'h-10'; // 40px
      case 48:
        return 'h-12'; // 48px
      default:
        return `h-[${px}px]`; // Fallback to arbitrary value
    }
  };

  return `sm:${getHeightClass(config.sm)} md:${getHeightClass(config.md)} lg:${getHeightClass(config.lg)}`;
};

/**
 * Get the track item height for a specific track type based on current viewport
 *
 * @param trackTypeOrId - Either a track type (e.g., "text") or a row ID (e.g., "text-0")
 */
export const getTrackItemHeight = (trackTypeOrId: string): number => {
  // Extract track type from row ID if needed (e.g., "text-0" -> "text")
  const trackType = trackTypeOrId.includes('-')
    ? trackTypeOrId.split('-')[0]
    : trackTypeOrId;

  if (typeof window === 'undefined') {
    return TRACK_ITEM_HEIGHTS[trackType]?.lg || 44;
  }

  const width = window.innerWidth;
  const itemConfig = TRACK_ITEM_HEIGHTS[trackType];

  if (!itemConfig) {
    // Fallback to default heights
    if (width < 640) return 22;
    if (width < 1024) return 28;
    return 44;
  }

  if (width < 640) return itemConfig.sm;
  if (width < 1024) return itemConfig.md;
  return itemConfig.lg;
};

/**
 * Get Tailwind classes for track item height based on track type
 * Using standard Tailwind height classes for better compatibility
 *
 * @param trackTypeOrId - Either a track type (e.g., "text") or a row ID (e.g., "text-0")
 */
export const getTrackItemHeightClasses = (trackTypeOrId: string): string => {
  // Extract track type from row ID if needed (e.g., "text-0" -> "text")
  const trackType = trackTypeOrId.includes('-')
    ? trackTypeOrId.split('-')[0]
    : trackTypeOrId;

  const config = TRACK_ITEM_HEIGHTS[trackType];
  if (!config) {
    // Default track item heights
    return 'sm:h-5 md:h-7 lg:h-11';
  }

  // Map pixel values to standard Tailwind height classes
  const getHeightClass = (px: number): string => {
    switch (px) {
      case 20:
        return 'h-5'; // 20px
      case 22:
        return 'h-[22px]'; // 22px
      case 24:
        return 'h-6'; // 24px
      case 28:
        return 'h-7'; // 28px
      case 30:
        return 'h-[30px]'; // 30px
      case 32:
        return 'h-8'; // 32px
      case 36:
        return 'h-9'; // 36px
      case 38:
        return 'h-[38px]'; // 38px
      case 44:
        return 'h-11'; // 44px
      case 46:
        return 'h-[46px]'; // 46px
      default:
        return `h-[${px}px]`; // Fallback to arbitrary value
    }
  };

  return `sm:${getHeightClass(config.sm)} md:${getHeightClass(config.md)} lg:${getHeightClass(config.lg)}`;
};

/**
 * Shared Tailwind classes for track row heights (default)
 * Use this string in all components that need to match track row heights
 */
export const TRACK_ROW_HEIGHT_CLASSES = 'sm:h-6 md:h-8 lg:h-12';

/**
 * Shared Tailwind classes for timeline header height
 * Use this string in all components that need to match header height
 */
export const TIMELINE_HEADER_HEIGHT_CLASSES = 'h-8';

/**
 * All track row IDs in their canonical order
 * This matches TRACK_ROWS from timelineTracks.tsx
 */
export const ALL_TRACK_ROW_IDS = [
  'text',
  'subtitle',
  'image',
  'video',
  'audio',
];

/**
 * Calculate the baseline height (sum of all 5 track rows)
 * This is used for centering when fewer than 5 tracks are visible
 */
export const calculateBaselineHeight = (): number => {
  return ALL_TRACK_ROW_IDS.reduce((sum, rowId) => {
    return sum + getRowHeight(rowId);
  }, 0);
};

/**
 * Calculate the total height of visible track rows
 */
export const calculateVisibleTracksHeight = (
  visibleTrackRows: string[],
): number => {
  return visibleTrackRows.reduce((sum, rowId) => {
    return sum + getRowHeight(rowId);
  }, 0);
};

/**
 * Calculate the vertical centering offset when fewer than 5 tracks are visible
 * This offset is applied to the visible tracks to center them within the baseline height
 * @param visibleTrackRows - Array of visible track row IDs
 * @returns The vertical offset in pixels to center the visible tracks
 */
export const calculateCenteringOffset = (
  visibleTrackRows: string[],
): number => {
  const baselineHeight = calculateBaselineHeight();
  const visibleHeight = calculateVisibleTracksHeight(visibleTrackRows);
  const shouldCenter = visibleTrackRows.length < ALL_TRACK_ROW_IDS.length;

  if (!shouldCenter) {
    return 0;
  }

  // Center the visible tracks within the baseline height
  return (baselineHeight - visibleHeight) / 2;
};
