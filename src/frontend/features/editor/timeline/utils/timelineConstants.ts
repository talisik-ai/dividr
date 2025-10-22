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
  text: { sm: 24, md: 32, lg: 40 }, // Smaller for text tracks (h-6, h-8, h-10)
  subtitle: { sm: 24, md: 32, lg: 40 }, // Smaller for subtitle tracks (h-6, h-8, h-10)
  logo: { sm: 24, md: 32, lg: 48 }, // Standard for logo/image tracks (h-6, h-8, h-12)
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
  text: { sm: 20, md: 28, lg: 36 }, // Track item height for text (fits in h-6, h-8, h-10)
  subtitle: { sm: 20, md: 28, lg: 36 }, // Track item height for subtitle (fits in h-6, h-8, h-10)
  logo: { sm: 20, md: 28, lg: 44 }, // Track item height for logo/image (fits in h-6, h-8, h-12)
  video: { sm: 20, md: 28, lg: 44 }, // Track item height for video (fits in h-6, h-8, h-12)
  audio: { sm: 20, md: 28, lg: 44 }, // Track item height for audio (fits in h-6, h-8, h-12)
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
 */
export const getRowHeight = (rowType: string): number => {
  if (typeof window === 'undefined') {
    return INDIVIDUAL_ROW_HEIGHTS[rowType]?.lg || TRACK_ROW_HEIGHTS.lg;
  }

  const width = window.innerWidth;
  const rowConfig = INDIVIDUAL_ROW_HEIGHTS[rowType];

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
 */
export const getRowHeightClasses = (rowType: string): string => {
  const config = INDIVIDUAL_ROW_HEIGHTS[rowType];
  if (!config) return TRACK_ROW_HEIGHT_CLASSES;

  // Map pixel values to standard Tailwind height classes
  const getHeightClass = (px: number): string => {
    switch (px) {
      case 24:
        return 'h-6'; // 24px
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
 */
export const getTrackItemHeight = (trackType: string): number => {
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
 */
export const getTrackItemHeightClasses = (trackType: string): string => {
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
      case 28:
        return 'h-7'; // 28px
      case 36:
        return 'h-9'; // 36px
      case 44:
        return 'h-11'; // 44px
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
