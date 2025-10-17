/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Centralized Timeline Interaction Handlers
 *
 * This module consolidates all timeline click/interaction logic in one place
 * to prevent conflicts and improve maintainability.
 *
 * Interaction Types:
 * - Click on empty timeline/row: Seek playhead
 * - Double click on empty timeline/row: Activate marquee selection (future)
 * - Click on timeline track: Select the track
 * - Click and hold and drag: Drag/move timeline track
 * - Right click timeline track: Context menu for track
 * - Split mode click: Split track at position
 */

import { getVisibleRowsInOrder } from './trackRowPositions';

import { VideoTrack } from '../../stores/videoEditor/types';

export type ClickTarget =
  | 'empty-space'
  | 'track'
  | 'ruler'
  | 'context-menu'
  | 'resize-handle';

export interface ClickInfo {
  target: ClickTarget;
  button: number; // 0 = left, 1 = middle, 2 = right
  clientX: number;
  clientY: number;
  frame: number;
  trackId?: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export interface TimelineInteractionHandlers {
  onSeek: (frame: number) => void;
  onStartMarquee: (
    startX: number,
    startY: number,
    clearSelection: boolean,
  ) => void;
  onSelectTrack: (trackId: string, multiSelect: boolean) => void;
  onStartDrag: (trackId: string, startX: number) => void;
  onStartResize: (
    trackId: string,
    side: 'left' | 'right',
    startX: number,
  ) => void;
  onSplit: (frame: number, trackId: string) => void;
}

export interface TimelineState {
  isSplitModeActive: boolean;
  tracks: VideoTrack[];
}

/**
 * Determines if a click target is from a context menu
 */
export const isContextMenuClick = (target: EventTarget | null): boolean => {
  if (!target || !(target instanceof Element)) return false;
  return (
    target.closest('[role="menu"]') !== null ||
    target.closest('[data-radix-context-menu-content]') !== null
  );
};

/**
 * Centralized handler for timeline mousedown events
 * Returns the action to take and whether to stop propagation
 */
export const handleTimelineMouseDown = (
  clickInfo: ClickInfo,
  timelineState: TimelineState,
  handlers: TimelineInteractionHandlers,
): { shouldStopPropagation: boolean } => {
  const { target, button, shiftKey, ctrlKey, metaKey, frame, trackId } =
    clickInfo;
  const { isSplitModeActive, tracks } = timelineState;

  // Right-click is always for context menu - don't interfere
  if (button === 2) {
    return { shouldStopPropagation: false };
  }

  // Context menu clicks should be ignored
  if (target === 'context-menu') {
    return { shouldStopPropagation: true };
  }

  // PRIORITY 1: Split mode takes precedence over everything
  if (isSplitModeActive && target === 'track' && trackId) {
    handlers.onSplit(frame, trackId);
    return { shouldStopPropagation: true };
  }

  // PRIORITY 2: Resize handles
  if (target === 'resize-handle' && trackId) {
    // Note: The side ('left' or 'right') should be determined by the caller
    // This is handled in the TrackItem component
    return { shouldStopPropagation: true };
  }

  // PRIORITY 3: Track interactions (select, drag)
  if (target === 'track' && trackId && !isSplitModeActive) {
    const track = tracks.find((t) => t.id === trackId);

    // If track is locked, only allow selection
    if (track?.locked) {
      handlers.onSelectTrack(trackId, shiftKey || ctrlKey || metaKey);
      return { shouldStopPropagation: true };
    }

    // Track click: Select the track (drag will be handled by track component)
    // Use Shift for multi-select (toggle), without modifier = replace selection
    handlers.onSelectTrack(trackId, shiftKey || ctrlKey || metaKey);
    return { shouldStopPropagation: true };
  }

  // PRIORITY 4: Empty space interactions (seek by default, marquee on drag)
  if (target === 'empty-space' && !isSplitModeActive) {
    // Single click on empty space seeks the playhead
    handlers.onSeek(frame);

    // Also prepare for potential marquee selection if user drags
    const { startX, startY } = clickInfo as any;
    const clearSelection = !shiftKey && !ctrlKey && !metaKey;
    handlers.onStartMarquee(startX, startY, clearSelection);

    return { shouldStopPropagation: true };
  }

  // PRIORITY 5: Ruler interactions (seek)
  if (target === 'ruler' && !isSplitModeActive) {
    handlers.onSeek(frame);
    return { shouldStopPropagation: true };
  }

  return { shouldStopPropagation: false };
};

/**
 * Centralized handler for timeline click events
 * This is called AFTER mousedown, so it's mainly for final actions
 */
export const handleTimelineClick = (
  clickInfo: ClickInfo,
  timelineState: TimelineState,
): { shouldStopPropagation: boolean } => {
  const { target, button, trackId } = clickInfo;
  const { isSplitModeActive } = timelineState;

  // Right-click is always for context menu
  if (button === 2) {
    return { shouldStopPropagation: false };
  }

  // Context menu clicks should be ignored
  if (target === 'context-menu') {
    return { shouldStopPropagation: true };
  }

  // Split mode clicks are handled in mousedown
  if (isSplitModeActive && target === 'track') {
    return { shouldStopPropagation: true };
  }

  // Track clicks (selection is already handled in mousedown)
  if (target === 'track' && trackId && !isSplitModeActive) {
    return { shouldStopPropagation: true };
  }

  return { shouldStopPropagation: false };
};

/**
 * Centralized handler for timeline double-click events
 */
export const handleTimelineDoubleClick = (
  clickInfo: ClickInfo,
  timelineState: TimelineState,
): {
  action: 'activate-marquee-tool' | 'none';
  shouldStopPropagation: boolean;
} => {
  const { target } = clickInfo;
  const { isSplitModeActive } = timelineState;

  // Double-click on empty space could activate marquee tool (future feature)
  if (target === 'empty-space' && !isSplitModeActive) {
    return { action: 'activate-marquee-tool', shouldStopPropagation: true };
  }

  return { action: 'none', shouldStopPropagation: false };
};

/**
 * Helper to find which track is at a given position
 */
export const findTrackAtPosition = (
  clientX: number,
  clientY: number,
  tracksElement: HTMLElement | null,
  frameWidth: number,
  tracks: VideoTrack[],
  visibleTrackRows?: string[],
): VideoTrack | null => {
  if (!tracksElement) return null;

  const rect = tracksElement.getBoundingClientRect();
  const x = clientX - rect.left + tracksElement.scrollLeft;
  const y = clientY - rect.top;
  const frame = Math.floor(x / frameWidth);

  // Find which track row is being hovered based on Y position
  const trackRowHeight = 48; // Height of each track row
  const rowIndex = Math.floor(y / trackRowHeight);

  // Map row index to track type based on visible track rows (dynamic)
  const visibleRows = visibleTrackRows || ['video', 'audio'];
  const visibleRowsInOrder = getVisibleRowsInOrder(visibleRows);
  const trackType = visibleRowsInOrder[rowIndex] as VideoTrack['type'];

  if (!trackType) return null;

  // Find tracks of this type that intersect with the frame
  const intersectingTracks = tracks.filter(
    (track) =>
      track.type === trackType &&
      frame >= track.startFrame &&
      frame <= track.endFrame,
  );

  // Return the first intersecting track, or null if none found
  return intersectingTracks.length > 0 ? intersectingTracks[0] : null;
};

/**
 * Helper to calculate frame from client X position
 */
export const calculateFrameFromPosition = (
  clientX: number,
  tracksElement: HTMLElement | null,
  frameWidth: number,
  maxFrame: number,
): number => {
  if (!tracksElement) return 0;

  const rect = tracksElement.getBoundingClientRect();
  const x = clientX - rect.left + tracksElement.scrollLeft;
  const frame = Math.floor(x / frameWidth);

  return Math.max(0, Math.min(frame, maxFrame));
};
