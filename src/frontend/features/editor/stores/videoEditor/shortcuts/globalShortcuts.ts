/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createProjectShortcuts,
  type ProjectShortcutHandlers,
} from './projectShortcuts';
import { ShortcutConfig } from './types';

/**
 * Global shortcuts - active everywhere in the video editor
 * These include playback controls, navigation shortcuts, and project-level actions
 */
export const createGlobalShortcuts = (
  getStore: () => any,
  effectiveEndFrame: number,
  projectHandlers: ProjectShortcutHandlers,
): ShortcutConfig[] => [
  // Project-level shortcuts (New, Open, Save, Import, Export, Close)
  ...createProjectShortcuts(getStore, projectHandlers),
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
  {
    id: 'navigate-next-edit-point',
    keys: 'down',
    description: 'Jump to Next Edit Point',
    category: 'Navigation',
    scope: 'global',
    handler: (e) => {
      e?.preventDefault();
      // Get fresh state from store
      const store = getStore();
      const currentFrame = store.timeline.currentFrame;
      const tracks = store.tracks || [];

      // Collect all edit points (track start frames) that are after current frame
      const editPoints = new Set<number>();
      tracks.forEach((track: any) => {
        if (track.startFrame > currentFrame) {
          editPoints.add(track.startFrame);
        }
        // Also consider end frames as edit points
        if (track.endFrame > currentFrame) {
          editPoints.add(track.endFrame);
        }
      });

      // Find the nearest edit point after current frame
      const sortedEditPoints = Array.from(editPoints).sort((a, b) => a - b);
      const nextEditPoint = sortedEditPoints[0];

      if (nextEditPoint !== undefined) {
        store.setCurrentFrame(nextEditPoint);
      }
    },
  },
  {
    id: 'navigate-prev-edit-point',
    keys: 'up',
    description: 'Jump to Previous Edit Point',
    category: 'Navigation',
    scope: 'global',
    handler: (e) => {
      e?.preventDefault();
      // Get fresh state from store
      const store = getStore();
      const currentFrame = store.timeline.currentFrame;
      const tracks = store.tracks || [];

      // Collect all edit points (track start frames) that are before current frame
      const editPoints = new Set<number>();
      tracks.forEach((track: any) => {
        if (track.startFrame < currentFrame) {
          editPoints.add(track.startFrame);
        }
        // Also consider end frames as edit points
        if (track.endFrame < currentFrame) {
          editPoints.add(track.endFrame);
        }
      });

      // Add frame 0 as a potential edit point
      editPoints.add(0);

      // Find the nearest edit point before current frame
      const sortedEditPoints = Array.from(editPoints).sort((a, b) => b - a);
      const prevEditPoint = sortedEditPoints[0];

      if (prevEditPoint !== undefined) {
        store.setCurrentFrame(prevEditPoint);
      }
    },
  },
  {
    id: 'preview-toggle-fullscreen',
    keys: 'f',
    description: 'Toggle Fullscreen',
    category: 'Preview',
    scope: 'global',
    priority: 'high',
    handler: (e) => {
      e?.preventDefault();
      getStore().toggleFullscreen();
    },
  },
];
