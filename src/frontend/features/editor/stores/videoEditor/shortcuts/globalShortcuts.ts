/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Global shortcuts - active everywhere in the video editor
 * These include playback controls and navigation shortcuts
 */
export const createGlobalShortcuts = (
  store: any,
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
      store.togglePlayback();
    },
  },
  {
    id: 'navigate-home',
    keys: 'home',
    description: 'Go to Beginning',
    category: 'Navigation',
    scope: 'global',
    handler: () => {
      store.setCurrentFrame(0);
    },
  },
  {
    id: 'navigate-end',
    keys: 'end',
    description: 'Go to End',
    category: 'Navigation',
    scope: 'global',
    handler: () => {
      store.setCurrentFrame(effectiveEndFrame - 1);
    },
  },
  {
    id: 'navigate-frame-prev',
    keys: 'left',
    description: 'Previous Frame',
    category: 'Navigation',
    scope: 'global',
    handler: () => {
      const currentFrame = store.timeline.currentFrame;
      store.setCurrentFrame(Math.max(0, currentFrame - 1));
    },
  },
  {
    id: 'navigate-frame-next',
    keys: 'right',
    description: 'Next Frame',
    category: 'Navigation',
    scope: 'global',
    handler: () => {
      const currentFrame = store.timeline.currentFrame;
      store.setCurrentFrame(Math.min(effectiveEndFrame - 1, currentFrame + 1));
    },
  },
];
