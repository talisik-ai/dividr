/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Global shortcuts - active everywhere in the video editor
 * These include playback controls and navigation shortcuts
 */
export const createGlobalShortcuts = (
  getStore: () => any,
  effectiveEndFrame: number,
): ShortcutConfig[] => [
  {
    id: 'playback-toggle',
    keys: 'space',
    description: 'Play/Pause',
    category: 'Playback',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().togglePlayback();
    },
  },
  {
    id: 'navigate-home',
    keys: 'home',
    description: 'Go to Beginning',
    category: 'Navigation',
    scope: 'global',
    handler: () => {
      getStore().setCurrentFrame(0);
    },
  },
  {
    id: 'navigate-end',
    keys: 'end',
    description: 'Go to End',
    category: 'Navigation',
    scope: 'global',
    handler: () => {
      getStore().setCurrentFrame(effectiveEndFrame - 1);
    },
  },
  {
    id: 'navigate-frame-prev',
    keys: 'left',
    description: 'Move Playhead Backward (1 Frame)',
    category: 'Navigation',
    scope: 'global',
    handler: (e) => {
      e?.preventDefault();
      // Always get fresh state from store
      const store = getStore();
      const currentFrame = store.timeline.currentFrame;
      store.setCurrentFrame(Math.max(0, currentFrame - 1));
    },
  },
  {
    id: 'navigate-frame-next',
    keys: 'right',
    description: 'Move Playhead Forward (1 Frame)',
    category: 'Navigation',
    scope: 'global',
    handler: (e) => {
      e?.preventDefault();
      // Always get fresh state from store
      const store = getStore();
      const currentFrame = store.timeline.currentFrame;
      store.setCurrentFrame(Math.min(effectiveEndFrame - 1, currentFrame + 1));
    },
  },
  {
    id: 'navigate-frame-prev-fast',
    keys: 'shift+left',
    description: 'Move Playhead Backward (5 Frames)',
    category: 'Navigation',
    scope: 'global',
    handler: (e) => {
      e?.preventDefault();
      // Always get fresh state from store
      const store = getStore();
      const currentFrame = store.timeline.currentFrame;
      const fps = store.timeline.fps || 30;
      // Use 5 frames for most frame rates, 10 for higher frame rates (60fps+)
      const jumpFrames = fps >= 60 ? 10 : 5;
      store.setCurrentFrame(Math.max(0, currentFrame - jumpFrames));
    },
  },
  {
    id: 'navigate-frame-next-fast',
    keys: 'shift+right',
    description: 'Move Playhead Forward (5 Frames)',
    category: 'Navigation',
    scope: 'global',
    handler: (e) => {
      e?.preventDefault();
      // Always get fresh state from store
      const store = getStore();
      const currentFrame = store.timeline.currentFrame;
      const fps = store.timeline.fps || 30;
      // Use 5 frames for most frame rates, 10 for higher frame rates (60fps+)
      const jumpFrames = fps >= 60 ? 10 : 5;
      store.setCurrentFrame(
        Math.min(effectiveEndFrame - 1, currentFrame + jumpFrames),
      );
    },
  },
];
