/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

/**
 * Track shortcuts - active when tracks are selected or focused
 * These include split, delete, duplicate, visibility, and mute operations
 */
export const createTrackShortcuts = (store: any): ShortcutConfig[] => [
  {
    id: 'track-slice-playhead-ctrl-b',
    keys: 'ctrl+b',
    description: 'Slice at Playhead',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.splitAtPlayhead();
    },
  },
  {
    id: 'track-slice-playhead-cmd-b',
    keys: 'cmd+b',
    description: 'Slice at Playhead',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.splitAtPlayhead();
    },
  },
  {
    id: 'track-duplicate',
    keys: 'ctrl+d',
    description: 'Duplicate Track',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      const selectedTracks = store.timeline.selectedTrackIds;
      selectedTracks.forEach((trackId: string) =>
        store.duplicateTrack(trackId),
      );
    },
  },
  {
    id: 'track-duplicate-cmd',
    keys: 'cmd+d',
    description: 'Duplicate Track',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      const selectedTracks = store.timeline.selectedTrackIds;
      selectedTracks.forEach((trackId: string) =>
        store.duplicateTrack(trackId),
      );
    },
  },
  {
    id: 'track-selection-tool',
    keys: 'v',
    description: 'Selection Tool',
    category: 'Tools',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      // Exit split mode to return to selection tool
      store.setSplitMode(false);
    },
  },
  {
    id: 'track-slice-tool',
    keys: 'b',
    description: 'Slice Tool Mode',
    category: 'Tools',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      // Enter split mode for slice tool
      store.setSplitMode(true);
    },
  },
  {
    id: 'track-toggle-mute',
    keys: 'm',
    description: 'Toggle Track Mute',
    category: 'Track Properties',
    scope: 'track',
    handler: () => {
      const selectedTracks = store.timeline.selectedTrackIds;
      selectedTracks.forEach((trackId: string) =>
        store.toggleTrackMute(trackId),
      );
    },
  },
  {
    id: 'track-delete',
    keys: 'del',
    description: 'Delete Selected Tracks',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.removeSelectedTracks();
    },
    options: {
      enableOnFormTags: false,
    },
  },
  {
    id: 'track-delete-backspace',
    keys: 'backspace',
    description: 'Delete Selected Tracks',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.removeSelectedTracks();
    },
    options: {
      enableOnFormTags: false,
    },
  },
  {
    id: 'track-deselect',
    keys: 'escape',
    description: 'Deselect All Tracks',
    category: 'Track Selection',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.setSelectedTracks([]);
    },
  },
];
