/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

// Import the store directly to avoid stale closures
import { useVideoEditorStore } from '../index';

/**
 * Timeline shortcuts - active when timeline is focused
 * These include zoom, in/out points, snapping, and split mode
 */
export const createTimelineShortcuts = (store: any): ShortcutConfig[] => [
  {
    id: 'timeline-zoom-in',
    keys: 'equal',
    description: 'Zoom In',
    category: 'Timeline Zoom',
    scope: 'timeline',
    handler: () => {
      const currentZoom = store.timeline.zoom;
      store.setZoom(Math.min(currentZoom * 1.2, 10));
    },
  },
  {
    id: 'timeline-zoom-out',
    keys: 'minus',
    description: 'Zoom Out',
    category: 'Timeline Zoom',
    scope: 'timeline',
    handler: () => {
      const currentZoom = store.timeline.zoom;
      store.setZoom(Math.max(currentZoom / 1.2, 0.1));
    },
  },
  {
    id: 'timeline-zoom-reset',
    keys: '0',
    description: 'Reset Zoom',
    category: 'Timeline Zoom',
    scope: 'timeline',
    handler: () => {
      store.setZoom(1);
    },
  },
  {
    id: 'timeline-toggle-snap',
    keys: 's',
    description: 'Toggle Snapping',
    category: 'Timeline Tools',
    scope: 'timeline',
    handler: () => {
      store.toggleSnap();
    },
  },
  {
    id: 'timeline-toggle-split-mode-c',
    keys: 'c',
    description: 'Toggle Split Mode',
    category: 'Timeline Tools',
    scope: 'timeline',
    handler: (e) => {
      e?.preventDefault();
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      freshState.toggleSplitMode();
    },
  },
  {
    id: 'timeline-toggle-split-mode-b',
    keys: 'b',
    description: 'Toggle Split Mode',
    category: 'Timeline Tools',
    scope: 'timeline',
    handler: (e) => {
      e?.preventDefault();
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      freshState.toggleSplitMode();
    },
  },
  {
    id: 'timeline-exit-split-mode',
    keys: 'escape',
    description: 'Exit Split Mode',
    category: 'Timeline Tools',
    scope: 'timeline',
    handler: (e) => {
      e?.preventDefault();
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      freshState.setSplitMode(false);
    },
  },
  {
    id: 'timeline-select-all-ctrl',
    keys: 'ctrl+a',
    description: 'Select All Tracks',
    category: 'Timeline Selection',
    scope: 'timeline',
    handler: (e) => {
      e?.preventDefault();
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      const allTrackIds = freshState.tracks.map((track: any) => track.id);
      freshState.setSelectedTracks(allTrackIds);
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
    },
  },
  {
    id: 'timeline-select-all-cmd',
    keys: 'cmd+a',
    description: 'Select All Tracks',
    category: 'Timeline Selection',
    scope: 'timeline',
    handler: (e) => {
      e?.preventDefault();
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      const allTrackIds = freshState.tracks.map((track: any) => track.id);
      freshState.setSelectedTracks(allTrackIds);
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
    },
  },
];
