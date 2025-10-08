/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Timeline shortcuts - active when timeline is focused
 * These include zoom, in/out points, snapping, and split mode
 */
export const createTimelineShortcuts = (store: any): ShortcutConfig[] => [
  {
    id: 'timeline-set-in-point',
    keys: 'i',
    description: 'Set In Point',
    category: 'Timeline Markers',
    scope: 'timeline',
    handler: () => {
      const currentFrame = store.timeline.currentFrame;
      store.setInPoint(currentFrame);
    },
  },
  {
    id: 'timeline-set-out-point',
    keys: 'o',
    description: 'Set Out Point',
    category: 'Timeline Markers',
    scope: 'timeline',
    handler: () => {
      const currentFrame = store.timeline.currentFrame;
      store.setOutPoint(currentFrame);
    },
  },
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
    id: 'timeline-toggle-split-mode',
    keys: 'c',
    description: 'Toggle Split Mode',
    category: 'Timeline Tools',
    scope: 'timeline',
    handler: (e) => {
      e?.preventDefault();
      store.toggleSplitMode();
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
      store.setSplitMode(false);
    },
  },
];
