import { TRACK_COLORS } from './constants';

// Re-export all utilities
export * from './constants';
export * from './imageUtils';
export * from './snapUtils';
export * from './subtitleParser';
export * from './trackPositioning';

// Re-export track helpers
export { getTrackColor } from './trackHelpers';

// Helper function to get track color by index
export function getTrackColorByIndex(index: number): string {
  return TRACK_COLORS[index % TRACK_COLORS.length];
}
