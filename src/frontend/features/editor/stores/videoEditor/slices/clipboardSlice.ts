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

    // Use batch deletion by setting selection and calling removeSelectedTracks
    // This is much faster than calling removeTrack in a loop
    state.setSelectedTracks(tracksToRemove);

    // removeSelectedTracks already handles:
    // - Recording undo action
    // - Removing linked tracks
    // - Clearing selection
    // - Marking unsaved changes
    state.removeSelectedTracks();
  },

  pasteTracks: () => {
    const state = get() as any;
    const clipboardData = (get() as any).clipboard as ClipboardData | null;

    if (!clipboardData || clipboardData.tracks.length === 0) {
      console.warn('[Clipboard] No tracks in clipboard to paste');
      return;
    }

    // Get playhead position for paste at playhead behavior
    const playheadFrame = state.timeline?.currentFrame ?? 0;
    const existingTracks: VideoTrack[] = state.tracks || [];

    console.log(`[Clipboard] Pasting at playhead frame: ${playheadFrame}`);

    // Begin grouped transaction for atomic undo of all pasted tracks
    const trackCount = clipboardData.tracks.length;
    state.beginGroup?.(`Paste ${trackCount} Track${trackCount > 1 ? 's' : ''}`);

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

    // PROFESSIONAL PASTE BEHAVIOR:
    // 1. Paste at playhead position (not end of timeline)
    // 2. Determine track placement based on playhead intersection
    // 3. Handle collisions by shifting to available vertical slot above

    /**
     * Helper: Check if a time range intersects with the playhead
     */
    const intersectsPlayhead = (
      startFrame: number,
      endFrame: number,
    ): boolean => {
      return playheadFrame >= startFrame && playheadFrame < endFrame;
    };

    /**
     * Helper: Find clips at playhead position on a specific row
     */
    const findClipsAtPlayhead = (
      trackType: VideoTrack['type'],
      rowIndex: number,
    ): VideoTrack[] => {
      return existingTracks.filter(
        (t) =>
          t.type === trackType &&
          (t.trackRowIndex ?? 0) === rowIndex &&
          intersectsPlayhead(t.startFrame, t.endFrame),
      );
    };

    /**
     * Helper: Check if a position would collide with existing clips
     */
    const hasCollisionAtPosition = (
      startFrame: number,
      endFrame: number,
      trackType: VideoTrack['type'],
      rowIndex: number,
      excludeIds: string[] = [],
    ): boolean => {
      const excludeSet = new Set(excludeIds);
      return existingTracks.some(
        (t) =>
          t.type === trackType &&
          (t.trackRowIndex ?? 0) === rowIndex &&
          !excludeSet.has(t.id) &&
          startFrame < t.endFrame &&
          endFrame > t.startFrame,
      );
    };

    /**
     * Helper: Find next available row index above for collision avoidance
     * Returns the first row index (going up) where the clip can be placed without collision
     */
    const findAvailableRowAbove = (
      startFrame: number,
      endFrame: number,
      trackType: VideoTrack['type'],
      startingRowIndex: number,
      excludeIds: string[] = [],
      tracksToAdd: VideoTrack[] = [],
    ): number => {
      // Get all existing row indices for this track type
      const existingRowIndices = existingTracks
        .filter((t) => t.type === trackType)
        .map((t) => t.trackRowIndex ?? 0);

      // Include row indices from tracks being added in this paste operation
      const addingRowIndices = tracksToAdd
        .filter((t) => t.type === trackType)
        .map((t) => t.trackRowIndex ?? 0);

      const allRowIndices = [
        ...new Set([...existingRowIndices, ...addingRowIndices]),
      ];
      const maxRowIndex =
        allRowIndices.length > 0 ? Math.max(...allRowIndices) : 0;

      // Combine existing tracks with tracks being added for collision checking
      const allTracksForCollision = [...existingTracks, ...tracksToAdd];
      const excludeSet = new Set(excludeIds);

      // Try each row index starting from startingRowIndex, going up
      for (
        let rowIndex = startingRowIndex;
        rowIndex <= maxRowIndex + 1;
        rowIndex++
      ) {
        const wouldCollide = allTracksForCollision.some(
          (t) =>
            t.type === trackType &&
            (t.trackRowIndex ?? 0) === rowIndex &&
            !excludeSet.has(t.id) &&
            startFrame < t.endFrame &&
            endFrame > t.startFrame,
        );

        if (!wouldCollide) {
          return rowIndex;
        }
      }

      // If all rows have collisions, create a new row above the max
      return maxRowIndex + 1;
    };

    /**
     * Helper: Determine target row for a track based on playhead intersection rules
     *
     * Priority Order:
     * A. If playhead intersects existing clip on SAME row as copied clip → insert ABOVE
     * B. If playhead intersects a track but not on copied clip's row → paste on that row
     * C. If playhead doesn't intersect any track → paste on same row as original
     */
    const determineTargetRow = (
      track: VideoTrack,
      proposedStartFrame: number,
      proposedEndFrame: number,
      tracksToAdd: VideoTrack[] = [],
    ): number => {
      const originalRowIndex = track.trackRowIndex ?? 0;
      const trackType = track.type;

      // Rule A: Check if playhead intersects clips on the SAME row as the copied clip
      const clipsOnSameRow = findClipsAtPlayhead(trackType, originalRowIndex);
      if (clipsOnSameRow.length > 0) {
        console.log(
          `[Clipboard] Playhead intersects clip on same row (${originalRowIndex}), finding slot above`,
        );
        // Find available slot above the original row
        return findAvailableRowAbove(
          proposedStartFrame,
          proposedEndFrame,
          trackType,
          originalRowIndex + 1,
          [],
          tracksToAdd,
        );
      }

      // Rule B: Check if playhead intersects ANY track of the same type on a different row
      const allIntersectingClips = existingTracks.filter(
        (t) =>
          t.type === trackType && intersectsPlayhead(t.startFrame, t.endFrame),
      );

      if (allIntersectingClips.length > 0) {
        // Use the row of the intersected clip
        const intersectedRow = allIntersectingClips[0].trackRowIndex ?? 0;
        console.log(
          `[Clipboard] Playhead intersects clip on row ${intersectedRow}, checking for collision`,
        );

        // Check if we can place on that row without collision
        const wouldCollide = hasCollisionAtPosition(
          proposedStartFrame,
          proposedEndFrame,
          trackType,
          intersectedRow,
        );

        if (!wouldCollide) {
          return intersectedRow;
        }

        // If collision, find available slot above
        return findAvailableRowAbove(
          proposedStartFrame,
          proposedEndFrame,
          trackType,
          intersectedRow + 1,
          [],
          tracksToAdd,
        );
      }

      // Rule C: Playhead doesn't intersect any track - use original row
      // But still check for collision at that position
      const wouldCollide = hasCollisionAtPosition(
        proposedStartFrame,
        proposedEndFrame,
        trackType,
        originalRowIndex,
      );

      if (!wouldCollide) {
        console.log(
          `[Clipboard] No playhead intersection, using original row ${originalRowIndex}`,
        );
        return originalRowIndex;
      }

      // Collision at original row - find available slot above
      console.log(
        `[Clipboard] Collision at original row ${originalRowIndex}, finding slot above`,
      );
      return findAvailableRowAbove(
        proposedStartFrame,
        proposedEndFrame,
        trackType,
        originalRowIndex + 1,
        [],
        tracksToAdd,
      );
    };

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

      // PASTE AT PLAYHEAD: Use playhead as insertion point instead of end of timeline
      const proposedStartFrame = playheadFrame + relativeOffset;
      const proposedEndFrame = proposedStartFrame + duration;

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

          // Both tracks use playhead-based positioning
          const finalStartFrame = playheadFrame + relativeOffset;
          const linkedFinalStartFrame = playheadFrame + linkedRelativeOffset;
          const linkedFinalEndFrame = linkedFinalStartFrame + linkedDuration;

          // Determine target rows for both tracks
          const targetRowIndex = determineTargetRow(
            track,
            finalStartFrame,
            finalStartFrame + duration,
            newTracks,
          );
          const linkedTargetRowIndex = determineTargetRow(
            linkedTrack,
            linkedFinalStartFrame,
            linkedFinalEndFrame,
            newTracks,
          );

          // Create pasted tracks with ALL metadata preserved
          const pastedTrack: VideoTrack = {
            ...track,
            id: newId,
            startFrame: finalStartFrame,
            endFrame: finalStartFrame + duration,
            duration: duration,
            trackRowIndex: targetRowIndex,
            linkedTrackId: newLinkedId,
            isLinked: true,
          };

          const pastedLinkedTrack: VideoTrack = {
            ...linkedTrack,
            id: newLinkedId,
            startFrame: linkedFinalStartFrame,
            endFrame: linkedFinalEndFrame,
            duration: linkedDuration,
            trackRowIndex: linkedTargetRowIndex,
            linkedTrackId: newId,
            isLinked: true,
          };

          newTracks.push(pastedTrack, pastedLinkedTrack);
          newTrackIds.push(newId, newLinkedId);

          console.log(
            `[Clipboard] Pasted linked pair: ${track.type}-${targetRowIndex} at frame ${finalStartFrame}, ${linkedTrack.type}-${linkedTargetRowIndex} at frame ${linkedFinalStartFrame}`,
          );
        }
      } else {
        // Handle single/unlinked track
        processedIds.add(track.id);

        // Determine target row based on playhead intersection rules
        const targetRowIndex = determineTargetRow(
          track,
          proposedStartFrame,
          proposedEndFrame,
          newTracks,
        );

        // Create pasted track with ALL metadata preserved
        const pastedTrack: VideoTrack = {
          ...track,
          id: newId,
          startFrame: proposedStartFrame,
          endFrame: proposedEndFrame,
          duration: duration,
          trackRowIndex: targetRowIndex,
          // Break link if pasting only one side of a linked pair
          isLinked: false,
          linkedTrackId: undefined,
        };

        newTracks.push(pastedTrack);
        newTrackIds.push(newId);

        console.log(
          `[Clipboard] Pasted ${track.type} to row ${targetRowIndex} at frame ${proposedStartFrame}`,
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
    // This provides visual feedback by highlighting the pasted clips
    state.setSelectedTracks(newTrackIds);

    // Trigger duplication feedback animation for pasted tracks
    if (state.triggerDuplicationFeedback) {
      newTrackIds.forEach((id) => state.triggerDuplicationFeedback(id));
    }

    // Mark unsaved changes
    state.markUnsavedChanges?.();

    // End grouped transaction for all pasted tracks
    state.endGroup?.();

    console.log(
      `[Clipboard] Pasted ${newTrackIds.length} track(s) at playhead (frame ${playheadFrame}) with smart row placement`,
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
