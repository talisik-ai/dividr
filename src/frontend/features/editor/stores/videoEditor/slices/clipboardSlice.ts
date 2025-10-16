/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuidv4 } from 'uuid';
import { StateCreator } from 'zustand';
import { VideoTrack } from '../types/track.types';
import { findNearestAvailablePosition } from '../utils/trackHelpers';

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

      // Check if this track is part of a linked pair in the clipboard
      const isPartOfLinkedPair =
        track.isLinked &&
        track.linkedTrackId &&
        clipboardData.tracks.some((t) => t.id === track.linkedTrackId);

      if (isPartOfLinkedPair && track.linkedTrackId) {
        // Handle linked pair - replicate duplicate logic for linked tracks
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

          // Calculate relative offset between linked tracks (preserve spacing)
          const relativeOffset = linkedTrack.startFrame - track.startFrame;

          // Find the latest end frame across ALL tracks of each type in the current timeline
          const existingTracksOfSameType = state.tracks.filter(
            (t: VideoTrack) => t.type === track.type,
          );
          const existingLinkedTracksOfSameType = state.tracks.filter(
            (t: VideoTrack) => t.type === linkedTrack.type,
          );

          // Get the maximum end frame for each track type from CURRENT timeline
          const lastVideoEnd =
            existingTracksOfSameType.length > 0
              ? Math.max(
                  ...existingTracksOfSameType.map(
                    (t: VideoTrack) => t.endFrame,
                  ),
                )
              : 0;
          const lastAudioEnd =
            existingLinkedTracksOfSameType.length > 0
              ? Math.max(
                  ...existingLinkedTracksOfSameType.map(
                    (t: VideoTrack) => t.endFrame,
                  ),
                )
              : 0;

          // Use the MAXIMUM of current timeline end frames as the unified insertion point
          // This ensures Cut+Paste places tracks at the end of the current timeline, not old positions
          const unifiedInsertionPoint = Math.max(lastVideoEnd, lastAudioEnd);

          // Both tracks start at the unified insertion point maintaining relative offset
          const finalStartFrame = unifiedInsertionPoint;
          const linkedFinalStartFrame = finalStartFrame + relativeOffset;

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
        // Handle single track (unlinked or only one side copied)
        processedIds.add(track.id);

        // Find existing tracks of the same type
        const existingTracksOfSameType = state.tracks.filter(
          (t: VideoTrack) => t.type === track.type,
        );

        // Proposed start: place at the end of the timeline for this track type
        // This ensures Cut+Paste behaves like Copy+Paste and Duplicate
        const proposedStartFrame =
          existingTracksOfSameType.length > 0
            ? Math.max(
                ...existingTracksOfSameType.map((t: VideoTrack) => t.endFrame),
              )
            : 0;

        // Use the smart positioning function to find the best spot
        const finalStartFrame = findNearestAvailablePosition(
          proposedStartFrame,
          duration,
          existingTracksOfSameType,
        );

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
      `[Clipboard] Pasted ${newTrackIds.length} track(s) with preserved relationships`,
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
