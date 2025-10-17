/* eslint-disable @typescript-eslint/no-explicit-any */
import { ShortcutConfig } from './types';

// Import the store directly to avoid stale closures
import { useVideoEditorStore } from '../index';

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

      // CRITICAL: Always get fresh state directly from the store
      // This bypasses any stale closure issues
      const freshState = useVideoEditorStore.getState();
      const selectedTracks = freshState.timeline?.selectedTrackIds || [];
      const allTracks = freshState.tracks || [];

      console.log('[Duplicate] Fresh state check:', {
        selectedCount: selectedTracks.length,
        totalTracks: allTracks.length,
        selectedIds: selectedTracks,
      });

      // Early exit: no selection = no-op
      if (selectedTracks.length === 0) {
        console.warn('⚠️ No tracks selected for duplication');
        return;
      }

      // Early exit: no tracks exist
      if (allTracks.length === 0) {
        console.error('⚠️ Timeline is empty, cannot duplicate');
        return;
      }

      // Begin grouped transaction for batch duplicate
      freshState.beginGroup?.(
        `Duplicate ${selectedTracks.length} Track${selectedTracks.length > 1 ? 's' : ''}`,
      );

      // Batch duplicate: collect all new IDs and process linked tracks only once
      const processedTrackIds = new Set<string>();
      const newlyCreatedIds: string[] = [];

      selectedTracks.forEach((trackId: string) => {
        // Skip if already processed (e.g., as part of a linked pair)
        if (processedTrackIds.has(trackId)) {
          console.log(`[Duplicate] Skipping ${trackId} - already processed`);
          return;
        }

        // Validate track exists
        const track = allTracks.find((t: any) => t.id === trackId);
        if (!track) {
          console.error(
            `❌ Track ${trackId} not found in tracks array, skipping`,
          );
          return;
        }

        console.log(`[Duplicate] Processing track:`, {
          id: trackId,
          name: track.name,
          type: track.type,
          isLinked: track.isLinked,
          linkedTrackId: track.linkedTrackId,
        });

        // Check if this is a linked pair where BOTH tracks are selected
        const bothSidesSelected =
          track.isLinked &&
          track.linkedTrackId &&
          selectedTracks.includes(track.linkedTrackId);

        // Mark this track as processed
        processedTrackIds.add(trackId);

        // If both sides of a linked pair are selected, mark the partner as processed too
        // This prevents duplicating the pair twice
        if (bothSidesSelected && track.linkedTrackId) {
          processedTrackIds.add(track.linkedTrackId);
          console.log(
            `[Duplicate] Both sides selected, marking ${track.linkedTrackId} as processed`,
          );
        }

        // Duplicate the track - returns single ID or array of IDs [primary, linked]
        // Use skipGrouping=true since we're managing the group at batch level
        const result = freshState.duplicateTrack(
          trackId,
          bothSidesSelected,
          true,
        );
        console.log(`[Duplicate] Result:`, result);

        if (result) {
          // Handle both single ID and array of IDs
          if (Array.isArray(result)) {
            newlyCreatedIds.push(...result);
          } else {
            newlyCreatedIds.push(result);
          }
        }
      });

      // End grouped transaction
      freshState.endGroup?.();

      // Update selection to the newly duplicated tracks
      if (newlyCreatedIds.length > 0) {
        freshState.setSelectedTracks(newlyCreatedIds);
        console.log(
          `✅ Duplicated ${processedTrackIds.size} track(s) → created ${newlyCreatedIds.length} new track(s)`,
        );
        console.log(`   New IDs:`, newlyCreatedIds);
      } else {
        console.error('❌ Duplication produced no new tracks');
      }
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

      // CRITICAL: Always get fresh state directly from the store
      // This bypasses any stale closure issues
      const freshState = useVideoEditorStore.getState();
      const selectedTracks = freshState.timeline?.selectedTrackIds || [];
      const allTracks = freshState.tracks || [];

      console.log('[Duplicate] Fresh state check:', {
        selectedCount: selectedTracks.length,
        totalTracks: allTracks.length,
        selectedIds: selectedTracks,
      });

      // Early exit: no selection = no-op
      if (selectedTracks.length === 0) {
        console.warn('⚠️ No tracks selected for duplication');
        return;
      }

      // Early exit: no tracks exist
      if (allTracks.length === 0) {
        console.error('⚠️ Timeline is empty, cannot duplicate');
        return;
      }

      // Begin grouped transaction for batch duplicate
      freshState.beginGroup?.(
        `Duplicate ${selectedTracks.length} Track${selectedTracks.length > 1 ? 's' : ''}`,
      );

      // Batch duplicate: collect all new IDs and process linked tracks only once
      const processedTrackIds = new Set<string>();
      const newlyCreatedIds: string[] = [];

      selectedTracks.forEach((trackId: string) => {
        // Skip if already processed (e.g., as part of a linked pair)
        if (processedTrackIds.has(trackId)) {
          console.log(`[Duplicate] Skipping ${trackId} - already processed`);
          return;
        }

        // Validate track exists
        const track = allTracks.find((t: any) => t.id === trackId);
        if (!track) {
          console.error(
            `❌ Track ${trackId} not found in tracks array, skipping`,
          );
          return;
        }

        console.log(`[Duplicate] Processing track:`, {
          id: trackId,
          name: track.name,
          type: track.type,
          isLinked: track.isLinked,
          linkedTrackId: track.linkedTrackId,
        });

        // Check if this is a linked pair where BOTH tracks are selected
        const bothSidesSelected =
          track.isLinked &&
          track.linkedTrackId &&
          selectedTracks.includes(track.linkedTrackId);

        // Mark this track as processed
        processedTrackIds.add(trackId);

        // If both sides of a linked pair are selected, mark the partner as processed too
        // This prevents duplicating the pair twice
        if (bothSidesSelected && track.linkedTrackId) {
          processedTrackIds.add(track.linkedTrackId);
          console.log(
            `[Duplicate] Both sides selected, marking ${track.linkedTrackId} as processed`,
          );
        }

        // Duplicate the track - returns single ID or array of IDs [primary, linked]
        // Use skipGrouping=true since we're managing the group at batch level
        const result = freshState.duplicateTrack(
          trackId,
          bothSidesSelected,
          true,
        );
        console.log(`[Duplicate] Result:`, result);

        if (result) {
          // Handle both single ID and array of IDs
          if (Array.isArray(result)) {
            newlyCreatedIds.push(...result);
          } else {
            newlyCreatedIds.push(result);
          }
        }
      });

      // End grouped transaction
      freshState.endGroup?.();

      // Update selection to the newly duplicated tracks
      if (newlyCreatedIds.length > 0) {
        freshState.setSelectedTracks(newlyCreatedIds);
        console.log(
          `✅ Duplicated ${processedTrackIds.size} track(s) → created ${newlyCreatedIds.length} new track(s)`,
        );
        console.log(`   New IDs:`, newlyCreatedIds);
      } else {
        console.error('❌ Duplication produced no new tracks');
      }
    },
  },
  {
    id: 'track-copy-ctrl',
    keys: 'ctrl+c',
    description: 'Copy Track(s)',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();

      const freshState = useVideoEditorStore.getState();
      const selectedTracks = freshState.timeline?.selectedTrackIds || [];

      if (selectedTracks.length === 0) {
        console.warn('[Copy] No tracks selected');
        return;
      }

      freshState.copyTracks(selectedTracks);
      console.log(`[Copy] Copied ${selectedTracks.length} track(s)`);
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
    },
  },
  {
    id: 'track-copy-cmd',
    keys: 'cmd+c',
    description: 'Copy Track(s)',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();

      const freshState = useVideoEditorStore.getState();
      const selectedTracks = freshState.timeline?.selectedTrackIds || [];

      if (selectedTracks.length === 0) {
        console.warn('[Copy] No tracks selected');
        return;
      }

      freshState.copyTracks(selectedTracks);
      console.log(`[Copy] Copied ${selectedTracks.length} track(s)`);
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
    },
  },
  {
    id: 'track-cut-ctrl',
    keys: 'ctrl+x',
    description: 'Cut Track(s)',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();

      const freshState = useVideoEditorStore.getState();
      const selectedTracks = freshState.timeline?.selectedTrackIds || [];

      if (selectedTracks.length === 0) {
        console.warn('[Cut] No tracks selected');
        return;
      }

      freshState.cutTracks(selectedTracks);
      console.log(`[Cut] Cut ${selectedTracks.length} track(s)`);
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
    },
  },
  {
    id: 'track-cut-cmd',
    keys: 'cmd+x',
    description: 'Cut Track(s)',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();

      const freshState = useVideoEditorStore.getState();
      const selectedTracks = freshState.timeline?.selectedTrackIds || [];

      if (selectedTracks.length === 0) {
        console.warn('[Cut] No tracks selected');
        return;
      }

      freshState.cutTracks(selectedTracks);
      console.log(`[Cut] Cut ${selectedTracks.length} track(s)`);
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
    },
  },
  {
    id: 'track-paste-ctrl',
    keys: 'ctrl+v',
    description: 'Paste Track(s)',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();

      const freshState = useVideoEditorStore.getState();

      if (!freshState.hasClipboardData()) {
        console.warn('[Paste] No clipboard data to paste');
        return;
      }

      freshState.pasteTracks();
      console.log('[Paste] Pasted tracks from clipboard');
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
    },
  },
  {
    id: 'track-paste-cmd',
    keys: 'cmd+v',
    description: 'Paste Track(s)',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();

      const freshState = useVideoEditorStore.getState();

      if (!freshState.hasClipboardData()) {
        console.warn('[Paste] No clipboard data to paste');
        return;
      }

      freshState.pasteTracks();
      console.log('[Paste] Pasted tracks from clipboard');
    },
    options: {
      preventDefault: true,
      enableOnFormTags: false,
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
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      freshState.setSplitMode(false);
    },
  },
  {
    id: 'track-slice-tool-b',
    keys: 'b',
    description: 'Toggle Split Mode',
    category: 'Tools',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      freshState.toggleSplitMode();
    },
  },
  {
    id: 'track-slice-tool-c',
    keys: 'c',
    description: 'Toggle Split Mode',
    category: 'Tools',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      // Use fresh state to avoid stale closure issues
      const freshState = useVideoEditorStore.getState();
      freshState.toggleSplitMode();
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
      // Check if user is editing text
      const target = e?.target as HTMLElement;
      const isEditingText =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        target?.closest('[contenteditable="true"]');

      if (!isEditingText) {
        e?.preventDefault();
        store.removeSelectedTracks();
      }
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
      // Check if user is editing text
      const target = e?.target as HTMLElement;
      const isEditingText =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable ||
        target?.closest('[contenteditable="true"]');

      if (!isEditingText) {
        e?.preventDefault();
        store.removeSelectedTracks();
      }
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
  {
    id: 'track-link-ctrl-g',
    keys: 'ctrl+g',
    description: 'Link Clips',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.linkSelectedTracks();
    },
  },
  {
    id: 'track-link-cmd-g',
    keys: 'cmd+g',
    description: 'Link Clips',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.linkSelectedTracks();
    },
  },
  {
    id: 'track-unlink-ctrl-shift-g',
    keys: 'ctrl+shift+g',
    description: 'Unlink Clips',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.unlinkSelectedTracks();
    },
  },
  {
    id: 'track-unlink-cmd-shift-g',
    keys: 'cmd+shift+g',
    description: 'Unlink Clips',
    category: 'Track Editing',
    scope: 'track',
    handler: (e) => {
      e?.preventDefault();
      store.unlinkSelectedTracks();
    },
  },
];
