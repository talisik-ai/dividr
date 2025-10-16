/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuidv4 } from 'uuid';
import { StateCreator } from 'zustand';
import { VideoTrack } from '../types/track.types';

/**
 * ClipboardData - Represents copied/cut track data
 */
export interface ClipboardData {
  tracks: VideoTrack[];
  operation: 'copy' | 'cut';
  timestamp: number;
}

/**
 * ClipboardSlice - Manages internal clipboard for track copy/cut/paste operations
 */
export interface ClipboardSlice {
  clipboard: ClipboardData | null;

  // Copy selected tracks to clipboard
  copyTracks: (trackIds: string[]) => void;

  // Cut selected tracks to clipboard (copy + mark for deletion)
  cutTracks: (trackIds: string[]) => void;

  // Paste tracks from clipboard
  pasteTracks: () => void;

  // Clear clipboard
  clearClipboard: () => void;

  // Check if clipboard has data
  hasClipboardData: () => boolean;
}

export const createClipboardSlice: StateCreator<
  ClipboardSlice,
  [],
  [],
  ClipboardSlice
> = (set, get) => ({
  clipboard: null,

  copyTracks: (trackIds: string[]) => {
    const state = get() as any;

    if (trackIds.length === 0) {
      console.warn('[Clipboard] No tracks selected for copy');
      return;
    }

    // Process tracks to include linked pairs if both sides are selected
    const processedTrackIds = new Set<string>();
    const tracksToCopy: VideoTrack[] = [];

    trackIds.forEach((trackId: string) => {
      if (processedTrackIds.has(trackId)) {
        return;
      }

      const track = state.tracks.find((t: VideoTrack) => t.id === trackId);
      if (!track) {
        console.error(`[Clipboard] Track ${trackId} not found, skipping`);
        return;
      }

      // Check if this is a linked pair where BOTH tracks are selected
      const bothSidesSelected =
        track.isLinked &&
        track.linkedTrackId &&
        trackIds.includes(track.linkedTrackId);

      processedTrackIds.add(trackId);
      tracksToCopy.push(track);

      // If both sides of a linked pair are selected, include the linked track
      if (bothSidesSelected && track.linkedTrackId) {
        const linkedTrack = state.tracks.find(
          (t: VideoTrack) => t.id === track.linkedTrackId,
        );
        if (linkedTrack && !processedTrackIds.has(linkedTrack.id)) {
          processedTrackIds.add(linkedTrack.id);
          tracksToCopy.push(linkedTrack);
        }
      }
    });

    if (tracksToCopy.length === 0) {
      console.warn('[Clipboard] No valid tracks found to copy');
      return;
    }

    // Deep clone the tracks to prevent reference issues
    const clonedTracks = JSON.parse(JSON.stringify(tracksToCopy));

    set({
      clipboard: {
        tracks: clonedTracks,
        operation: 'copy',
        timestamp: Date.now(),
      },
    });

    console.log(
      `[Clipboard] Copied ${clonedTracks.length} track(s) to clipboard`,
    );
  },

  cutTracks: (trackIds: string[]) => {
    const state = get() as any;

    if (trackIds.length === 0) {
      console.warn('[Clipboard] No tracks selected for cut');
      return;
    }

    // Process tracks to include linked pairs if both sides are selected
    const processedTrackIds = new Set<string>();
    const tracksToCut: VideoTrack[] = [];
    const tracksToRemove: string[] = [];

    trackIds.forEach((trackId: string) => {
      if (processedTrackIds.has(trackId)) {
        return;
      }

      const track = state.tracks.find((t: VideoTrack) => t.id === trackId);
      if (!track) {
        console.error(`[Clipboard] Track ${trackId} not found, skipping`);
        return;
      }

      // Check if this is a linked pair where BOTH tracks are selected
      const bothSidesSelected =
        track.isLinked &&
        track.linkedTrackId &&
        trackIds.includes(track.linkedTrackId);

      processedTrackIds.add(trackId);
      tracksToCut.push(track);
      tracksToRemove.push(trackId);

      // If both sides of a linked pair are selected, include the linked track
      if (bothSidesSelected && track.linkedTrackId) {
        const linkedTrack = state.tracks.find(
          (t: VideoTrack) => t.id === track.linkedTrackId,
        );
        if (linkedTrack && !processedTrackIds.has(linkedTrack.id)) {
          processedTrackIds.add(linkedTrack.id);
          tracksToCut.push(linkedTrack);
          tracksToRemove.push(linkedTrack.id);
        }
      }
    });

    if (tracksToCut.length === 0) {
      console.warn('[Clipboard] No valid tracks found to cut');
      return;
    }

    // Deep clone the tracks
    const clonedTracks = JSON.parse(JSON.stringify(tracksToCut));

    // Store in clipboard
    set({
      clipboard: {
        tracks: clonedTracks,
        operation: 'cut',
        timestamp: Date.now(),
      },
    });

    console.log(`[Clipboard] Cut ${clonedTracks.length} track(s) to clipboard`);

    // Record action for undo/redo before removing tracks
    state.recordAction?.('Cut Track');

    // Remove the cut tracks from timeline
    tracksToRemove.forEach((trackId) => {
      state.removeTrack(trackId);
    });

    // Clear selection
    state.setSelectedTracks([]);

    // Mark unsaved changes
    state.markUnsavedChanges?.();
  },

  pasteTracks: () => {
    const state = get() as any;
    const clipboardData = (get() as any).clipboard as ClipboardData | null;

    if (!clipboardData || clipboardData.tracks.length === 0) {
      console.warn('[Clipboard] No tracks in clipboard to paste');
      return;
    }

    // Record action for undo/redo
    state.recordAction?.('Paste Track');

    const newTrackIds: string[] = [];
    const newTracks: VideoTrack[] = [];
    const linkedPairs: Map<string, string> = new Map(); // Map old ID to new ID for linked tracks

    // First pass: Create all track ID mappings
    clipboardData.tracks.forEach((track: VideoTrack) => {
      const newId = uuidv4();
      linkedPairs.set(track.id, newId);
    });

    // Calculate the minimum start frame of ALL clipboard tracks (for maintaining relative positions)
    const minStartFrame = Math.min(
      ...clipboardData.tracks.map((track) => track.startFrame),
    );

    // Find the unified insertion point (end of timeline across all track types)
    const allTrackTypes = [...new Set(clipboardData.tracks.map((t) => t.type))];
    let maxInsertionPoint = 0;

    allTrackTypes.forEach((trackType) => {
      const existingTracksOfType = state.tracks.filter(
        (t: VideoTrack) => t.type === trackType,
      );
      if (existingTracksOfType.length > 0) {
        const maxEnd = Math.max(
          ...existingTracksOfType.map((t: VideoTrack) => t.endFrame),
        );
        maxInsertionPoint = Math.max(maxInsertionPoint, maxEnd);
      }
    });

    // Group tracks by whether they are linked pairs or singles
    const processedIds = new Set<string>();

    clipboardData.tracks.forEach((track: VideoTrack) => {
      if (processedIds.has(track.id)) {
        return;
      }

      const newId = linkedPairs.get(track.id);
      if (!newId) {
        console.error(`[Clipboard] Failed to get new ID for track ${track.id}`);
        return;
      }

      const duration = track.endFrame - track.startFrame;

      // Calculate relative offset from the minimum start frame (preserve spacing)
      const relativeOffset = track.startFrame - minStartFrame;

      // Check if this track is part of a linked pair in the clipboard
      const isPartOfLinkedPair =
        track.isLinked &&
        track.linkedTrackId &&
        clipboardData.tracks.some((t) => t.id === track.linkedTrackId);

      if (isPartOfLinkedPair && track.linkedTrackId) {
        // Handle linked pair
        const linkedTrack = clipboardData.tracks.find(
          (t) => t.id === track.linkedTrackId,
        );

        if (linkedTrack) {
          processedIds.add(track.id);
          processedIds.add(linkedTrack.id);

          const newLinkedId = linkedPairs.get(linkedTrack.id);
          if (!newLinkedId) {
            console.error(
              `[Clipboard] Failed to get new ID for linked track ${linkedTrack.id}`,
            );
            return;
          }

          const linkedDuration = linkedTrack.endFrame - linkedTrack.startFrame;
          const linkedRelativeOffset = linkedTrack.startFrame - minStartFrame;

          // Both tracks maintain their relative positions from the group
          const finalStartFrame = maxInsertionPoint + relativeOffset;
          const linkedFinalStartFrame =
            maxInsertionPoint + linkedRelativeOffset;

          // Create pasted tracks with ALL metadata preserved
          const pastedTrack: VideoTrack = {
            ...track,
            id: newId,
            startFrame: finalStartFrame,
            endFrame: finalStartFrame + duration,
            duration: duration,
            linkedTrackId: newLinkedId,
            isLinked: true,
          };

          const pastedLinkedTrack: VideoTrack = {
            ...linkedTrack,
            id: newLinkedId,
            startFrame: linkedFinalStartFrame,
            endFrame: linkedFinalStartFrame + linkedDuration,
            duration: linkedDuration,
            linkedTrackId: newId,
            isLinked: true,
          };

          newTracks.push(pastedTrack, pastedLinkedTrack);
          newTrackIds.push(newId, newLinkedId);

          console.log(
            `[Clipboard] Pasted linked pair: ${newId} at frame ${finalStartFrame}, ${newLinkedId} at frame ${linkedFinalStartFrame}`,
          );
        }
      } else {
        // Handle single/unlinked track
        processedIds.add(track.id);

        // Maintain relative position from the group
        const finalStartFrame = maxInsertionPoint + relativeOffset;

        // Create pasted track with ALL metadata preserved
        const pastedTrack: VideoTrack = {
          ...track,
          id: newId,
          startFrame: finalStartFrame,
          endFrame: finalStartFrame + duration,
          duration: duration,
          // Break link if pasting only one side of a linked pair
          isLinked: false,
          linkedTrackId: undefined,
        };

        newTracks.push(pastedTrack);
        newTrackIds.push(newId);

        console.log(
          `[Clipboard] Pasted single track: ${newId} at frame ${finalStartFrame}`,
        );
      }
    });

    // CRITICAL: Update tracks array using set() to trigger re-render
    // Cast set to any to bypass TypeScript restrictions since all slices share the same set/get
    const globalSet = set as any;
    globalSet((fullState: any) => ({
      tracks: [...fullState.tracks, ...newTracks],
    }));

    // Select the newly pasted tracks (this also triggers re-render)
    state.setSelectedTracks(newTrackIds);

    // Mark unsaved changes
    state.markUnsavedChanges?.();

    console.log(
      `[Clipboard] Pasted ${newTrackIds.length} track(s) with preserved relationships and spacing`,
    );
  },

  clearClipboard: () => {
    set({ clipboard: null });
    console.log('[Clipboard] Clipboard cleared');
  },

  hasClipboardData: () => {
    const clipboardData = (get() as any).clipboard as ClipboardData | null;
    return clipboardData !== null && clipboardData.tracks.length > 0;
  },
});
