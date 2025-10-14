/* eslint-disable @typescript-eslint/no-explicit-any */
import { v4 as uuidv4 } from 'uuid';
import { StateCreator } from 'zustand';
import { VideoTrack } from '../types';
import { SUBTITLE_EXTENSIONS } from '../utils/constants';
import { processSubtitleFile } from '../utils/subtitleParser';
import {
  findNearestAvailablePosition,
  getTrackColor,
} from '../utils/trackHelpers';

/**
 * Helper to find adjacent clips on the same track type
 * Returns the nearest clip to the left and right of the current track
 */
const findAdjacentClips = (
  currentTrack: VideoTrack,
  allTracks: VideoTrack[],
): { leftClip: VideoTrack | null; rightClip: VideoTrack | null } => {
  // Filter tracks of the same type, excluding current track and its linked counterpart
  const sameTypeTracks = allTracks.filter(
    (t) =>
      t.id !== currentTrack.id &&
      t.id !== currentTrack.linkedTrackId &&
      t.type === currentTrack.type,
  );

  // Find the closest clip to the left (highest endFrame that's <= currentTrack.startFrame)
  const leftClip =
    sameTypeTracks
      .filter((t) => t.endFrame <= currentTrack.startFrame)
      .sort((a, b) => b.endFrame - a.endFrame)[0] || null;

  // Find the closest clip to the right (lowest startFrame that's >= currentTrack.endFrame)
  const rightClip =
    sameTypeTracks
      .filter((t) => t.startFrame >= currentTrack.endFrame)
      .sort((a, b) => a.startFrame - b.startFrame)[0] || null;

  return { leftClip, rightClip };
};

/**
 * CapCut-style non-destructive trimming helper with adjacent clip boundary checking
 * Clamps track resizing within:
 * 1. Original source media boundaries
 * 2. Adjacent clip boundaries (prevents overlapping)
 *
 * FIXED: Proper trimming that maintains timeline position when trimming back and forth
 * - Left trim: adjusts startFrame and sourceStartTime, endFrame stays fixed
 * - Right trim: adjusts endFrame, startFrame and sourceStartTime stay fixed
 * - Boundaries: prevents trimming beyond source media limits AND neighboring clips
 */
const resizeTrackWithTrimming = (
  track: VideoTrack,
  newStartFrame: number | undefined,
  newEndFrame: number | undefined,
  fps: number,
  allTracks: VideoTrack[],
  snapEnabled = false,
  snapThreshold = 5,
): VideoTrack => {
  const currentStartFrame = track.startFrame;
  const currentEndFrame = track.endFrame;
  const currentSourceStartTime = track.sourceStartTime || 0;

  // Use sourceDuration if available, otherwise fall back to current duration
  const sourceDurationFrames = track.sourceDuration || track.duration;
  const sourceDurationSeconds = sourceDurationFrames / fps;

  // Calculate the current source end time based on current trim state
  const currentDurationSeconds = (currentEndFrame - currentStartFrame) / fps;
  const currentSourceEndTime = currentSourceStartTime + currentDurationSeconds;

  // Find adjacent clips to enforce non-overlapping boundaries
  const { leftClip, rightClip } = findAdjacentClips(track, allTracks);

  // Initialize with current values
  let finalStartFrame = currentStartFrame;
  let finalEndFrame = currentEndFrame;
  let finalSourceStartTime = currentSourceStartTime;

  // Handle LEFT trim (dragging left edge)
  if (newStartFrame !== undefined) {
    // BOUNDARY CHECK: Prevent trimming left into adjacent clip
    let boundedNewStartFrame = newStartFrame;

    if (leftClip) {
      // Check if magnetic snapping is enabled and we're close to the boundary
      const distanceToLeftBoundary = Math.abs(
        newStartFrame - leftClip.endFrame,
      );

      if (snapEnabled && distanceToLeftBoundary <= snapThreshold) {
        // Snap exactly to the left clip's end boundary
        boundedNewStartFrame = leftClip.endFrame;
      } else {
        // Hard boundary: cannot trim beyond the left clip's end
        boundedNewStartFrame = Math.max(leftClip.endFrame, newStartFrame);
      }
    }

    // Also ensure we don't go below frame 0
    boundedNewStartFrame = Math.max(0, boundedNewStartFrame);

    // Calculate how many frames we're trimming from the left
    const frameDelta = boundedNewStartFrame - currentStartFrame;
    const timeDelta = frameDelta / fps;

    // Calculate new source start time (trimming right moves in-point forward)
    const proposedSourceStartTime = currentSourceStartTime + timeDelta;

    // Clamp to source boundaries [0, sourceDuration]
    finalSourceStartTime = Math.max(
      0,
      Math.min(sourceDurationSeconds, proposedSourceStartTime),
    );

    // Calculate the actual frame delta after clamping
    const clampedTimeDelta = finalSourceStartTime - currentSourceStartTime;
    const clampedFrameDelta = Math.round(clampedTimeDelta * fps);

    // Apply the clamped delta to the start frame
    finalStartFrame = currentStartFrame + clampedFrameDelta;

    // End frame stays the same (this is key for proper left trim)
    finalEndFrame = currentEndFrame;

    // Ensure we don't exceed the end frame (minimum 1 frame duration)
    if (finalStartFrame >= finalEndFrame) {
      finalStartFrame = finalEndFrame - 1;
      finalSourceStartTime =
        currentSourceStartTime + (finalStartFrame - currentStartFrame) / fps;
    }
  }
  // Handle RIGHT trim (dragging right edge)
  else if (newEndFrame !== undefined) {
    // Start frame and source start time stay the same (this is key for proper right trim)
    finalStartFrame = currentStartFrame;
    finalSourceStartTime = currentSourceStartTime;

    // BOUNDARY CHECK: Prevent trimming right into adjacent clip
    let boundedNewEndFrame = newEndFrame;

    if (rightClip) {
      // Check if magnetic snapping is enabled and we're close to the boundary
      const distanceToRightBoundary = Math.abs(
        newEndFrame - rightClip.startFrame,
      );

      if (snapEnabled && distanceToRightBoundary <= snapThreshold) {
        // Snap exactly to the right clip's start boundary
        boundedNewEndFrame = rightClip.startFrame;
      } else {
        // Hard boundary: cannot trim beyond the right clip's start
        boundedNewEndFrame = Math.min(rightClip.startFrame, newEndFrame);
      }
    }

    // Calculate how many frames we're trimming from the right
    const frameDelta = boundedNewEndFrame - currentEndFrame;
    const timeDelta = frameDelta / fps;

    // Calculate new source end time
    const proposedSourceEndTime = currentSourceEndTime + timeDelta;

    // Clamp to source boundaries [sourceStartTime, sourceDuration]
    const clampedSourceEndTime = Math.max(
      finalSourceStartTime + 1 / fps, // Minimum 1 frame
      Math.min(sourceDurationSeconds, proposedSourceEndTime),
    );

    // Calculate the new duration based on clamped source end time
    const newDurationSeconds = clampedSourceEndTime - finalSourceStartTime;
    const newDurationFrames = Math.round(newDurationSeconds * fps);

    // Apply the new end frame
    finalEndFrame = finalStartFrame + newDurationFrames;

    // Ensure minimum 1 frame duration
    if (finalEndFrame <= finalStartFrame) {
      finalEndFrame = finalStartFrame + 1;
    }
  }

  // Calculate final duration
  const finalDurationFrames = finalEndFrame - finalStartFrame;

  return {
    ...track,
    startFrame: finalStartFrame,
    endFrame: finalEndFrame,
    duration: finalDurationFrames,
    sourceStartTime: finalSourceStartTime,
  };
};

export interface TracksSlice {
  tracks: VideoTrack[];
  addTrack: (track: Omit<VideoTrack, 'id'>) => Promise<string>;
  addTrackFromMediaLibrary: (
    mediaId: string,
    startFrame?: number,
  ) => Promise<string>;
  removeTrack: (trackId: string) => void;
  removeSelectedTracks: () => void;
  updateTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
  moveTrack: (trackId: string, newStartFrame: number) => void;
  moveSelectedTracks: (draggedTrackId: string, newStartFrame: number) => void;
  resizeTrack: (
    trackId: string,
    newStartFrame?: number,
    newEndFrame?: number,
  ) => void;
  duplicateTrack: (
    trackId: string,
    duplicateLinked?: boolean,
  ) => string | string[];
  splitTrack: (trackId: string, frame: number) => void;
  splitAtPlayhead: () => boolean;
  splitAtPosition: (frame: number, trackId?: string) => boolean;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  linkTracks: (videoTrackId: string, audioTrackId: string) => void;
  unlinkTracks: (trackId: string) => void;
  linkSelectedTracks: () => void;
  unlinkSelectedTracks: () => void;
  toggleLinkedAudioMute: (videoTrackId: string) => void;

  // State management helpers
  markUnsavedChanges?: () => void;
  updateProjectThumbnailFromTimeline?: () => Promise<void>;
}

export const createTracksSlice: StateCreator<
  TracksSlice,
  [],
  [],
  TracksSlice
> = (set, get) => ({
  tracks: [],

  addTrack: async (trackData) => {
    const id = uuidv4();

    // Record action for undo/redo BEFORE state change
    const state = get() as any;
    state.recordAction?.('Add Track');

    if (trackData.type === 'video') {
      const audioId = uuidv4();
      const duration = trackData.endFrame - trackData.startFrame;

      const state = get() as any;
      const existingVideoTracks = state.tracks.filter(
        (t: VideoTrack) => t.type === 'video',
      );
      const existingAudioTracks = state.tracks.filter(
        (t: VideoTrack) => t.type === 'audio',
      );

      const videoStartFrame = findNearestAvailablePosition(
        trackData.startFrame,
        duration,
        existingVideoTracks,
      );
      const audioStartFrame = findNearestAvailablePosition(
        trackData.startFrame,
        duration,
        existingAudioTracks,
      );

      const videoTrack: VideoTrack = {
        ...trackData,
        id,
        type: 'video',
        startFrame: videoStartFrame,
        endFrame: videoStartFrame + duration,
        sourceStartTime: trackData.sourceStartTime || 0,
        sourceDuration: duration, // Store original duration for trimming boundaries
        color: getTrackColor(state.tracks.length),
        muted: false,
        linkedTrackId: audioId,
        isLinked: true,
      };

      const mediaItem = state.mediaLibrary?.find(
        (item: any) =>
          item.source === trackData.source && item.type === 'video',
      );
      const extractedAudio = mediaItem?.extractedAudio;

      const audioTrack: VideoTrack = {
        ...trackData,
        id: audioId,
        type: 'audio',
        name: extractedAudio
          ? `${trackData.name.replace(/\.[^/.]+$/, '')} (Extracted Audio)`
          : `${trackData.name} (Audio)`,
        startFrame: audioStartFrame,
        endFrame: audioStartFrame + duration,
        sourceStartTime: trackData.sourceStartTime || 0,
        sourceDuration: duration, // Store original duration for trimming boundaries
        color: getTrackColor(state.tracks.length + 1),
        muted: false,
        linkedTrackId: id,
        isLinked: true,
        source: extractedAudio?.audioPath || trackData.source,
        previewUrl: extractedAudio?.previewUrl || undefined,
      };

      set((state: any) => ({
        tracks: [...state.tracks, videoTrack, audioTrack],
      }));

      state.markUnsavedChanges?.();
      state.updateProjectThumbnailFromTimeline?.();

      return id;
    } else {
      const state = get() as any;
      const existingTracks = state.tracks.filter(
        (t: VideoTrack) => t.type === trackData.type,
      );
      const duration = trackData.endFrame - trackData.startFrame;

      const startFrame = findNearestAvailablePosition(
        trackData.startFrame,
        duration,
        existingTracks,
      );

      const track: VideoTrack = {
        ...trackData,
        id,
        startFrame,
        endFrame: startFrame + duration,
        sourceStartTime: trackData.sourceStartTime || 0,
        sourceDuration: duration, // Store original duration for trimming boundaries
        color: getTrackColor(state.tracks.length),
        muted: trackData.type === 'audio' ? false : undefined,
      };

      set((state: any) => ({
        tracks: [...state.tracks, track],
      }));

      state.markUnsavedChanges?.();
      return id;
    }
  },

  addTrackFromMediaLibrary: async (mediaId, startFrame = 0) => {
    const state = get() as any;
    const mediaItem = state.mediaLibrary?.find(
      (item: any) => item.id === mediaId,
    );
    if (!mediaItem) {
      console.error('Media item not found in library:', mediaId);
      return '';
    }

    // Helper function to detect subtitle files
    const isSubtitleFile = (fileName: string): boolean => {
      return SUBTITLE_EXTENSIONS.some((ext) =>
        fileName.toLowerCase().endsWith(ext),
      );
    };

    // Handle subtitle files specially - parse and create individual tracks
    if (mediaItem.type === 'subtitle' && isSubtitleFile(mediaItem.name)) {
      try {
        // Read subtitle content
        const subtitleContent = await window.electronAPI.readFile(
          mediaItem.source,
        );
        if (subtitleContent) {
          console.log(
            `📖 Processing subtitle from media library: ${mediaItem.name}`,
          );

          // Parse subtitle content and create individual tracks
          const subtitleTracks = await processSubtitleFile(
            {
              name: mediaItem.name,
              path: mediaItem.source,
              type: 'subtitle',
              extension: mediaItem.name.split('.').pop() || '',
              size: mediaItem.size || 0,
            },
            subtitleContent,
            state.tracks.length,
            state.timeline.fps,
            getTrackColor,
            mediaItem.previewUrl,
          );

          // Add each subtitle segment as a track at the specified start frame
          const addedIds: string[] = [];
          let currentStartFrame = startFrame;

          for (const [index, track] of subtitleTracks.entries()) {
            const adjustedTrack = {
              ...track,
              startFrame: currentStartFrame,
              endFrame: currentStartFrame + track.duration,
            };
            console.log(
              `📝 Adding subtitle segment ${index + 1}: "${track.subtitleText?.substring(0, 50)}..." at frame ${currentStartFrame}`,
            );
            const trackId = await get().addTrack(adjustedTrack);
            addedIds.push(trackId);

            // For the next track, use the end frame of current + small gap
            currentStartFrame =
              adjustedTrack.endFrame + Math.round(0.5 * state.timeline.fps); // 0.5 second gap
          }

          return addedIds[0] || ''; // Return first track ID for consistency
        }
      } catch (error) {
        console.error(
          `❌ Error processing subtitle file ${mediaItem.name}:`,
          error,
        );
        // Fall through to single track creation
      }
    }

    // Convert media library item to single track (for non-subtitles or fallback)
    const duration = Math.floor(mediaItem.duration * state.timeline.fps);
    const track = {
      type: mediaItem.type,
      name: mediaItem.name,
      source: mediaItem.source,
      previewUrl: mediaItem.previewUrl,
      originalFile: mediaItem.originalFile,
      tempFilePath: mediaItem.tempFilePath,
      height: mediaItem.metadata?.height,
      width: mediaItem.metadata?.width,
      duration,
      startFrame,
      endFrame: startFrame + duration,
      sourceStartTime: 0,
      visible: true,
      locked: false,
      color: getTrackColor(state.tracks.length),
      ...(mediaItem.type === 'subtitle' && {
        subtitleText: `Subtitle: ${mediaItem.name}`,
      }),
    };

    console.log(
      `I GOT THE WIDTH ${mediaItem.metadata?.width} AND HEIGHT ${mediaItem.metadata?.height} IN tracksSlice`,
    );
    return await get().addTrack(track);
  },

  removeTrack: (trackId) => {
    const state = get() as any;

    // Record action for undo/redo
    state.recordAction?.('Delete Track');

    const trackToRemove = state.tracks.find(
      (t: VideoTrack) => t.id === trackId,
    );
    const isVideoTrack = trackToRemove?.type === 'video';
    let tracksToRemove = [trackId];

    if (trackToRemove?.isLinked && trackToRemove.linkedTrackId) {
      tracksToRemove = [...tracksToRemove, trackToRemove.linkedTrackId];
    }

    set((state: any) => ({
      tracks: state.tracks.filter(
        (t: VideoTrack) => !tracksToRemove.includes(t.id),
      ),
      timeline: {
        ...state.timeline,
        selectedTrackIds: state.timeline.selectedTrackIds.filter(
          (id: string) => !tracksToRemove.includes(id),
        ),
      },
    }));

    state.markUnsavedChanges?.();

    const remainingTracks = (get() as any).tracks;
    const hasVideoTracks = remainingTracks.some(
      (track: VideoTrack) => track.type === 'video',
    );

    if (isVideoTrack || !hasVideoTracks) {
      state.updateProjectThumbnailFromTimeline?.();
    }
  },

  removeSelectedTracks: () => {
    const state = get() as any;
    const selectedTrackIds = state.timeline.selectedTrackIds;

    if (selectedTrackIds.length === 0) return;

    // Record action for undo/redo
    state.recordAction?.('Delete Selected Tracks');

    const tracksToRemove = state.tracks.filter((track: VideoTrack) =>
      selectedTrackIds.includes(track.id),
    );
    const hasVideoTracks = tracksToRemove.some(
      (track: VideoTrack) => track.type === 'video',
    );

    set((state: any) => ({
      tracks: state.tracks.filter(
        (t: VideoTrack) => !selectedTrackIds.includes(t.id),
      ),
      timeline: {
        ...state.timeline,
        selectedTrackIds: [],
      },
    }));

    state.markUnsavedChanges?.();

    const remainingTracks = (get() as any).tracks;
    const remainingVideoTracks = remainingTracks.some(
      (track: VideoTrack) => track.type === 'video',
    );

    if (hasVideoTracks || !remainingVideoTracks) {
      state.updateProjectThumbnailFromTimeline?.();
    }
  },

  updateTrack: (trackId, updates) => {
    set((state: any) => ({
      tracks: state.tracks.map((track: VideoTrack) =>
        track.id === trackId ? { ...track, ...updates } : track,
      ),
    }));

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  moveTrack: (trackId, newStartFrame) => {
    set((state: any) => {
      const trackToMove = state.tracks.find(
        (t: VideoTrack) => t.id === trackId,
      );

      if (!trackToMove) return state;

      // Get linked track if exists
      const linkedTrack =
        trackToMove.isLinked && trackToMove.linkedTrackId
          ? state.tracks.find(
              (t: VideoTrack) => t.id === trackToMove.linkedTrackId,
            )
          : null;

      const originalStartFrame = trackToMove.startFrame;
      const duration = trackToMove.endFrame - trackToMove.startFrame;

      // Clamp to timeline boundary (frame 0)
      const boundedNewStartFrame = Math.max(0, newStartFrame);
      const boundedDelta = boundedNewStartFrame - originalStartFrame;

      // Helper: Find the maximum safe movement delta by checking boundaries
      // Returns the delta that stops at the nearest obstacle (doesn't jump to gaps)
      const findSafeMovementDelta = (
        trackStart: number,
        trackDuration: number,
        movementDelta: number,
        conflicts: VideoTrack[],
      ): number => {
        if (movementDelta === 0) return 0;

        const proposedStart = trackStart + movementDelta;
        const proposedEnd = proposedStart + trackDuration;
        const originalEnd = trackStart + trackDuration;

        // Check if proposed position overlaps any conflict
        const hasOverlap = conflicts.some(
          (conflict) =>
            proposedStart < conflict.endFrame &&
            proposedEnd > conflict.startFrame,
        );

        if (!hasOverlap) {
          return movementDelta; // No collision, full movement allowed
        }

        // COLLISION: Stop at the boundary instead of jumping to gaps
        if (movementDelta > 0) {
          // Moving RIGHT: find the nearest obstacle and stop when we touch it
          let safeDelta = movementDelta;
          conflicts.forEach((conflict) => {
            // Distance we can move before our END touches the conflict's START
            const spaceBeforeConflict = conflict.startFrame - originalEnd;
            if (spaceBeforeConflict >= 0 && spaceBeforeConflict < safeDelta) {
              safeDelta = spaceBeforeConflict;
            }
          });
          return safeDelta;
        } else {
          // Moving LEFT: find the nearest obstacle and stop when we touch it
          let safeDelta = movementDelta; // negative value
          conflicts.forEach((conflict) => {
            // Distance we can move before our START touches the conflict's END
            const spaceAfterConflict = conflict.endFrame - trackStart;

            if (spaceAfterConflict <= 0 && spaceAfterConflict > safeDelta) {
              safeDelta = spaceAfterConflict;
            }
          });
          return safeDelta;
        }
      };

      let finalMovementDelta = boundedDelta;

      if (linkedTrack) {
        const linkedDuration = linkedTrack.endFrame - linkedTrack.startFrame;
        const linkedOriginalStart = linkedTrack.startFrame;

        // Get conflicts for both tracks
        const primaryConflicts = state.tracks.filter((t: VideoTrack) => {
          if (t.id === trackId || t.id === linkedTrack.id) return false;
          if (trackToMove.type === 'video' && t.type === 'video') return true;
          if (trackToMove.type !== 'video' && t.type === trackToMove.type)
            return true;
          return false;
        });

        const linkedConflicts = state.tracks.filter((t: VideoTrack) => {
          if (t.id === trackId || t.id === linkedTrack.id) return false;
          return t.type === linkedTrack.type;
        });

        // Find safe movement for BOTH tracks
        const primarySafeDelta = findSafeMovementDelta(
          originalStartFrame,
          duration,
          boundedDelta,
          primaryConflicts,
        );

        const linkedSafeDelta = findSafeMovementDelta(
          linkedOriginalStart,
          linkedDuration,
          boundedDelta,
          linkedConflicts,
        );

        // Use the most restrictive (smallest absolute value) delta
        finalMovementDelta =
          Math.abs(primarySafeDelta) < Math.abs(linkedSafeDelta)
            ? primarySafeDelta
            : linkedSafeDelta;
      } else {
        // Single track: check its own conflicts
        const conflicts = state.tracks.filter((t: VideoTrack) => {
          if (t.id === trackId) return false;
          if (trackToMove.type === 'video' && t.type === 'video') return true;
          if (trackToMove.type !== 'video' && t.type === trackToMove.type)
            return true;
          return false;
        });

        finalMovementDelta = findSafeMovementDelta(
          originalStartFrame,
          duration,
          boundedDelta,
          conflicts,
        );
      }

      // Apply the final movement
      return {
        tracks: state.tracks.map((track: VideoTrack) => {
          if (track.id === trackId) {
            const finalStart = originalStartFrame + finalMovementDelta;
            return {
              ...track,
              startFrame: finalStart,
              endFrame: finalStart + duration,
            };
          }

          // Move linked track by the SAME delta
          if (trackToMove?.isLinked && track.id === trackToMove.linkedTrackId) {
            const linkedDuration = track.endFrame - track.startFrame;
            const linkedFinalStart = track.startFrame + finalMovementDelta;
            return {
              ...track,
              startFrame: linkedFinalStart,
              endFrame: linkedFinalStart + linkedDuration,
            };
          }
          return track;
        }),
      };
    });

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  moveSelectedTracks: (draggedTrackId, newStartFrame) => {
    set((state: any) => {
      const draggedTrack = state.tracks.find(
        (t: VideoTrack) => t.id === draggedTrackId,
      );

      if (!draggedTrack) return state;

      // Get all selected track IDs (including linked partners)
      const selectedTrackIds = state.timeline.selectedTrackIds || [];

      // If the dragged track is not in selection, fall back to single track move
      if (!selectedTrackIds.includes(draggedTrackId)) {
        console.warn(
          '⚠️ Dragged track not in selection, falling back to single move',
        );
        return state;
      }

      // Calculate the movement delta based on the dragged track
      const originalDraggedStart = draggedTrack.startFrame;
      const rawMovementDelta = newStartFrame - originalDraggedStart;

      // Build a map of all tracks that need to move (including linked partners)
      const tracksToMove = new Set<string>();
      selectedTrackIds.forEach((id: string) => {
        tracksToMove.add(id);
        const track = state.tracks.find((t: VideoTrack) => t.id === id);
        if (track?.isLinked && track.linkedTrackId) {
          tracksToMove.add(track.linkedTrackId);
        }
      });

      // CRITICAL: Enforce timeline left boundary (frame 0) BEFORE collision detection
      // Find the leftmost track in the selection
      let minStartFrame = Infinity;
      tracksToMove.forEach((trackId) => {
        const track = state.tracks.find((t: VideoTrack) => t.id === trackId);
        if (track) {
          minStartFrame = Math.min(minStartFrame, track.startFrame);
        }
      });

      // Calculate what the leftmost track's new position would be
      const proposedMinStartFrame = minStartFrame + rawMovementDelta;

      // If any track would go below frame 0, clamp the entire group's movement
      let boundedMovementDelta = rawMovementDelta;
      if (proposedMinStartFrame < 0) {
        // Adjust delta so the leftmost track stops exactly at frame 0
        boundedMovementDelta = -minStartFrame;
      }

      // Group non-moving tracks by type for collision detection
      const tracksByType = new Map<string, VideoTrack[]>();
      state.tracks.forEach((t: VideoTrack) => {
        if (!tracksToMove.has(t.id)) {
          const key = t.type === 'video' ? 'video' : t.type;
          if (!tracksByType.has(key)) {
            tracksByType.set(key, []);
          }
          const typeGroup = tracksByType.get(key);
          if (typeGroup) {
            typeGroup.push(t);
          }
        }
      });

      // Helper: Find safe movement delta for a group by checking boundaries
      // Stops at the nearest obstacle WITHOUT jumping to gaps
      const findGroupSafeMovementDelta = (movementDelta: number): number => {
        if (movementDelta === 0) return 0;

        let minSafeDelta = movementDelta;

        // Check each moving track against its type-specific conflicts
        tracksToMove.forEach((trackId) => {
          const track = state.tracks.find((t: VideoTrack) => t.id === trackId);
          if (!track) return;

          const typeKey = track.type === 'video' ? 'video' : track.type;
          const conflicts = tracksByType.get(typeKey) || [];

          const trackStart = track.startFrame;
          const trackEnd = track.endFrame;

          // Check all conflicts in the direction of movement
          // Don't use hasOverlap check - we need to find the nearest boundary regardless
          if (movementDelta > 0) {
            // Moving RIGHT: find nearest obstacle and stop when our END touches their START
            conflicts.forEach((conflict) => {
              const spaceBeforeConflict = conflict.startFrame - trackEnd;
              // Only consider conflicts ahead of us (in our path)
              if (
                spaceBeforeConflict >= 0 &&
                spaceBeforeConflict < minSafeDelta
              ) {
                minSafeDelta = spaceBeforeConflict;
              }
            });
          } else if (movementDelta < 0) {
            // Moving LEFT: find nearest obstacle and stop when our START touches their END
            conflicts.forEach((conflict) => {
              const spaceAfterConflict = conflict.endFrame - trackStart;
              // Only consider conflicts behind us (in our path)
              // spaceAfterConflict should be negative or zero (conflict is behind/at us)
              // We want the one closest to zero (least negative = nearest obstacle)
              if (
                spaceAfterConflict <= 0 &&
                spaceAfterConflict > minSafeDelta
              ) {
                minSafeDelta = spaceAfterConflict;
              }
            });
          }
        });

        return minSafeDelta;
      };

      // Find the safe movement delta that works for ALL tracks in the group
      const finalMovementDelta =
        findGroupSafeMovementDelta(boundedMovementDelta);

      // Calculate final positions preserving exact relative spacing
      const finalPositions = new Map<
        string,
        { startFrame: number; endFrame: number }
      >();

      tracksToMove.forEach((trackId) => {
        const track = state.tracks.find((t: VideoTrack) => t.id === trackId);
        if (!track) return;

        const duration = track.endFrame - track.startFrame;
        const finalStart = track.startFrame + finalMovementDelta;
        const finalEnd = finalStart + duration;

        finalPositions.set(trackId, {
          startFrame: finalStart,
          endFrame: finalEnd,
        });
      });

      // Apply the movements with preserved gaps
      return {
        tracks: state.tracks.map((track: VideoTrack) => {
          if (finalPositions.has(track.id)) {
            const newPos = finalPositions.get(track.id);
            if (newPos) {
              return {
                ...track,
                startFrame: newPos.startFrame,
                endFrame: newPos.endFrame,
              };
            }
          }
          return track;
        }),
      };
    });

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  resizeTrack: (trackId, newStartFrame, newEndFrame) => {
    set((state: any) => {
      const trackToResize = state.tracks.find(
        (t: VideoTrack) => t.id === trackId,
      );

      if (!trackToResize) return state;

      // Get snap settings from timeline state
      const snapEnabled = state.timeline?.snapEnabled ?? false;
      const snapThreshold = 5; // frames - matches SNAP_THRESHOLD from timelineSlice

      return {
        tracks: state.tracks.map((track: VideoTrack) => {
          if (track.id === trackId) {
            return resizeTrackWithTrimming(
              track,
              newStartFrame,
              newEndFrame,
              state.timeline.fps,
              state.tracks,
              snapEnabled,
              snapThreshold,
            );
          }

          // Handle linked track resizing
          if (
            trackToResize?.isLinked &&
            track.id === trackToResize.linkedTrackId
          ) {
            return resizeTrackWithTrimming(
              track,
              newStartFrame,
              newEndFrame,
              state.timeline.fps,
              state.tracks,
              snapEnabled,
              snapThreshold,
            );
          }
          return track;
        }),
      };
    });

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  duplicateTrack: (trackId, duplicateLinked = true) => {
    const state = get() as any;

    // Record action for undo/redo
    state.recordAction?.('Duplicate Track');

    const originalTrack = state.tracks.find(
      (t: VideoTrack) => t.id === trackId,
    );
    if (!originalTrack) {
      console.error(`❌ Cannot duplicate: track ${trackId} not found`);
      return '';
    }

    const newId = uuidv4();
    const duration = originalTrack.endFrame - originalTrack.startFrame;

    // Industry-standard: Place duplicate immediately after original on timeline
    const proposedStartFrame = originalTrack.endFrame;

    // Duplicate linked pair if track is linked AND duplicateLinked is true
    if (
      originalTrack.isLinked &&
      originalTrack.linkedTrackId &&
      duplicateLinked
    ) {
      const linkedTrack = state.tracks.find(
        (t: VideoTrack) => t.id === originalTrack.linkedTrackId,
      );
      if (linkedTrack) {
        const newLinkedId = uuidv4();
        const linkedDuration = linkedTrack.endFrame - linkedTrack.startFrame;

        // Calculate relative offset between linked tracks
        const relativeOffset =
          linkedTrack.startFrame - originalTrack.startFrame;

        // FIX: For linked pairs, use the MAXIMUM end frame across BOTH tracks
        // This ensures both duplicates are placed after ALL existing clips
        // and maintain perfect alignment (matching Premiere Pro behavior)
        const maxEndFrameInPair = Math.max(
          originalTrack.endFrame,
          linkedTrack.endFrame,
        );

        // Find the latest end frame across ALL tracks of each type
        const existingTracksOfSameType = state.tracks.filter(
          (t: VideoTrack) => t.type === originalTrack.type,
        );
        const existingLinkedTracksOfSameType = state.tracks.filter(
          (t: VideoTrack) => t.type === linkedTrack.type,
        );

        // Get the maximum end frame for each track type
        const lastVideoEnd =
          existingTracksOfSameType.length > 0
            ? Math.max(
                ...existingTracksOfSameType.map((t: VideoTrack) => t.endFrame),
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

        // Use the MAXIMUM of all end frames as the unified insertion point
        // This ensures both tracks start at the same timeline position
        const unifiedInsertionPoint = Math.max(
          maxEndFrameInPair,
          lastVideoEnd,
          lastAudioEnd,
        );

        // Both tracks start at the unified insertion point
        // maintaining their original relative offset
        const finalStartFrame = unifiedInsertionPoint;
        const linkedFinalStartFrame = finalStartFrame + relativeOffset;

        // Create duplicate with ALL metadata preserved (reference-based)
        const duplicatedTrack: VideoTrack = {
          ...originalTrack, // Preserve ALL properties including transforms, effects, etc.
          id: newId,
          name: `${originalTrack.name}`,
          startFrame: finalStartFrame,
          endFrame: finalStartFrame + duration,
          duration: duration, // Explicitly set duration to match the timeline segment
          linkedTrackId: newLinkedId,
          // Explicitly preserve critical metadata
          source: originalTrack.source, // Same source reference
          sourceStartTime: originalTrack.sourceStartTime, // Same trim in-point
          sourceDuration: originalTrack.sourceDuration, // Same source boundaries
          previewUrl: originalTrack.previewUrl,
          originalFile: originalTrack.originalFile,
          tempFilePath: originalTrack.tempFilePath,
          offsetX: originalTrack.offsetX,
          offsetY: originalTrack.offsetY,
          width: originalTrack.width,
          height: originalTrack.height,
          volume: originalTrack.volume,
        };

        const duplicatedLinkedTrack: VideoTrack = {
          ...linkedTrack, // Preserve ALL properties
          id: newLinkedId,
          name: `${linkedTrack.name}`,
          startFrame: linkedFinalStartFrame,
          endFrame: linkedFinalStartFrame + linkedDuration,
          duration: linkedDuration, // Explicitly set duration to match the timeline segment
          linkedTrackId: newId,
          // Explicitly preserve critical metadata
          source: linkedTrack.source,
          sourceStartTime: linkedTrack.sourceStartTime,
          sourceDuration: linkedTrack.sourceDuration,
          previewUrl: linkedTrack.previewUrl,
          originalFile: linkedTrack.originalFile,
          tempFilePath: linkedTrack.tempFilePath,
          volume: linkedTrack.volume,
        };

        set((state: any) => ({
          tracks: [...state.tracks, duplicatedTrack, duplicatedLinkedTrack],
        }));

        state.triggerDuplicationFeedback?.(newId);
        state.triggerDuplicationFeedback?.(newLinkedId);

        state.markUnsavedChanges?.();
        // Return both IDs for linked tracks
        return [newId, newLinkedId];
      }
    }

    // Single track duplication (unlinked OR linked but duplicateLinked=false)
    const existingTracksOfSameType = state.tracks.filter(
      (t: VideoTrack) => t.type === originalTrack.type,
    );

    const finalStartFrame = findNearestAvailablePosition(
      proposedStartFrame,
      duration,
      existingTracksOfSameType,
    );

    // Create duplicate with ALL metadata preserved (reference-based)
    // If original was linked but we're only duplicating one side, break the link
    const duplicatedTrack: VideoTrack = {
      ...originalTrack, // Preserve ALL properties including transforms, effects, etc.
      id: newId,
      name: `${originalTrack.name}`,
      startFrame: finalStartFrame,
      endFrame: finalStartFrame + duration,
      duration: duration, // Explicitly set duration to match the timeline segment
      // Explicitly preserve critical metadata
      source: originalTrack.source, // Same source reference
      sourceStartTime: originalTrack.sourceStartTime, // Same trim in-point
      sourceDuration: originalTrack.sourceDuration, // Same source boundaries
      previewUrl: originalTrack.previewUrl,
      originalFile: originalTrack.originalFile,
      tempFilePath: originalTrack.tempFilePath,
      offsetX: originalTrack.offsetX,
      offsetY: originalTrack.offsetY,
      width: originalTrack.width,
      height: originalTrack.height,
      volume: originalTrack.volume,
      subtitleText: originalTrack.subtitleText,
      // Break link if duplicating only one side of a linked pair
      isLinked: false,
      linkedTrackId: undefined,
    };

    set((state: any) => ({
      tracks: [...state.tracks, duplicatedTrack],
    }));

    state.triggerDuplicationFeedback?.(newId);

    state.markUnsavedChanges?.();
    return newId;
  },

  splitTrack: (trackId, frame) => {
    const state = get() as any;
    const track = state.tracks.find((t: VideoTrack) => t.id === trackId);
    if (!track || frame <= track.startFrame || frame >= track.endFrame) return;

    const splitTimeInSeconds = (frame - track.startFrame) / state.timeline.fps;
    const originalSourceStartTime = track.sourceStartTime || 0;

    const firstPart: VideoTrack = {
      ...track,
      endFrame: frame,
      duration: frame - track.startFrame,
      sourceStartTime: originalSourceStartTime,
      sourceDuration: track.sourceDuration, // Preserve original source duration
    };

    const secondPartId = uuidv4();
    const secondPart: VideoTrack = {
      ...track,
      id: secondPartId,
      name: track.name,
      startFrame: frame,
      endFrame: track.endFrame,
      duration: track.endFrame - frame,
      sourceStartTime: originalSourceStartTime + splitTimeInSeconds,
      sourceDuration: track.sourceDuration, // Preserve original source duration
    };

    let linkedTrackSecondPartId: string | undefined;
    if (track.isLinked && track.linkedTrackId) {
      const linkedTrack = state.tracks.find(
        (t: VideoTrack) => t.id === track.linkedTrackId,
      );

      if (linkedTrack) {
        const linkedSplitTimeInSeconds =
          (frame - linkedTrack.startFrame) / state.timeline.fps;
        const linkedOriginalSourceStartTime = linkedTrack.sourceStartTime || 0;

        const linkedFirstPart: VideoTrack = {
          ...linkedTrack,
          endFrame: frame,
          duration: frame - linkedTrack.startFrame,
          sourceStartTime: linkedOriginalSourceStartTime,
          sourceDuration: linkedTrack.sourceDuration, // Preserve original source duration
        };

        linkedTrackSecondPartId = uuidv4();
        const linkedSecondPart: VideoTrack = {
          ...linkedTrack,
          id: linkedTrackSecondPartId,
          name: linkedTrack.name,
          startFrame: frame,
          endFrame: linkedTrack.endFrame,
          duration: linkedTrack.endFrame - frame,
          sourceStartTime:
            linkedOriginalSourceStartTime + linkedSplitTimeInSeconds,
          sourceDuration: linkedTrack.sourceDuration, // Preserve original source duration
        };

        firstPart.linkedTrackId = linkedFirstPart.id;
        linkedFirstPart.linkedTrackId = firstPart.id;
        secondPart.linkedTrackId = linkedSecondPart.id;
        linkedSecondPart.linkedTrackId = secondPartId;

        set((state: any) => ({
          tracks: state.tracks
            .filter(
              (t: VideoTrack) => t.id !== track.id && t.id !== linkedTrack.id,
            )
            .concat([firstPart, secondPart, linkedFirstPart, linkedSecondPart]),
        }));
      } else {
        set((state: any) => ({
          tracks: state.tracks
            .filter((t: VideoTrack) => t.id !== track.id)
            .concat([firstPart, secondPart]),
        }));
      }
    } else {
      set((state: any) => ({
        tracks: state.tracks
          .filter((t: VideoTrack) => t.id !== track.id)
          .concat([firstPart, secondPart]),
      }));
    }

    state.markUnsavedChanges?.();
  },

  splitAtPlayhead: () => {
    const state = get() as any;

    // Record action for undo/redo BEFORE checking tracks
    state.recordAction?.('Split at Playhead');

    const currentFrame = state.timeline.currentFrame;
    const selectedTrackIds = state.timeline.selectedTrackIds;

    const tracksToSplit: VideoTrack[] = [];

    if (selectedTrackIds.length > 0) {
      const selectedTracks = state.tracks.filter(
        (track: VideoTrack) =>
          selectedTrackIds.includes(track.id) &&
          currentFrame > track.startFrame &&
          currentFrame < track.endFrame,
      );

      const processedTrackIds = new Set<string>();

      selectedTracks.forEach((track: VideoTrack) => {
        if (processedTrackIds.has(track.id)) return;

        if (track.isLinked && track.linkedTrackId) {
          const linkedTrack = state.tracks.find(
            (t: VideoTrack) => t.id === track.linkedTrackId,
          );

          if (linkedTrack && selectedTrackIds.includes(linkedTrack.id)) {
            tracksToSplit.push(track, linkedTrack);
            processedTrackIds.add(track.id);
            processedTrackIds.add(linkedTrack.id);
          } else {
            tracksToSplit.push(track);
            processedTrackIds.add(track.id);
          }
        } else {
          tracksToSplit.push(track);
          processedTrackIds.add(track.id);
        }
      });
    } else {
      const intersectingTracks = state.tracks.filter(
        (track: VideoTrack) =>
          currentFrame > track.startFrame && currentFrame < track.endFrame,
      );

      const processedTrackIds = new Set<string>();

      intersectingTracks.forEach((track: VideoTrack) => {
        if (processedTrackIds.has(track.id)) return;

        if (track.isLinked && track.linkedTrackId) {
          const linkedTrack = state.tracks.find(
            (t: VideoTrack) => t.id === track.linkedTrackId,
          );

          if (
            linkedTrack &&
            currentFrame > linkedTrack.startFrame &&
            currentFrame < linkedTrack.endFrame
          ) {
            tracksToSplit.push(track, linkedTrack);
            processedTrackIds.add(track.id);
            processedTrackIds.add(linkedTrack.id);
          }
        } else {
          tracksToSplit.push(track);
          processedTrackIds.add(track.id);
        }
      });
    }

    if (tracksToSplit.length === 0) return false;

    const processedIds = new Set<string>();

    tracksToSplit.forEach((track: VideoTrack) => {
      if (processedIds.has(track.id)) return;
      (get() as any).splitTrack(track.id, currentFrame);
      processedIds.add(track.id);
    });

    return true;
  },

  splitAtPosition: (frame, trackId) => {
    const state = get() as any;

    // Record action for undo/redo BEFORE checking tracks
    state.recordAction?.('Split at Position');

    let tracksToSplit: VideoTrack[] = [];

    if (trackId) {
      const targetTrack = state.tracks.find(
        (track: VideoTrack) => track.id === trackId,
      );
      if (
        targetTrack &&
        frame > targetTrack.startFrame &&
        frame < targetTrack.endFrame
      ) {
        tracksToSplit = [targetTrack];

        if (targetTrack.isLinked && targetTrack.linkedTrackId) {
          const linkedTrack = state.tracks.find(
            (t: VideoTrack) => t.id === targetTrack.linkedTrackId,
          );
          if (
            linkedTrack &&
            frame > linkedTrack.startFrame &&
            frame < linkedTrack.endFrame
          ) {
            tracksToSplit.push(linkedTrack);
          }
        }
      }
    } else {
      const intersectingTracks = state.tracks.filter(
        (track: VideoTrack) =>
          frame > track.startFrame && frame < track.endFrame,
      );

      const processedTrackIds = new Set<string>();

      intersectingTracks.forEach((track: VideoTrack) => {
        if (processedTrackIds.has(track.id)) return;

        if (track.isLinked && track.linkedTrackId) {
          const linkedTrack = state.tracks.find(
            (t: VideoTrack) => t.id === track.linkedTrackId,
          );
          if (
            linkedTrack &&
            frame > linkedTrack.startFrame &&
            frame < linkedTrack.endFrame
          ) {
            tracksToSplit.push(track, linkedTrack);
            processedTrackIds.add(track.id);
            processedTrackIds.add(linkedTrack.id);
          } else {
            tracksToSplit.push(track);
            processedTrackIds.add(track.id);
          }
        } else {
          tracksToSplit.push(track);
          processedTrackIds.add(track.id);
        }
      });
    }

    if (tracksToSplit.length === 0) return false;

    const processedIds = new Set<string>();

    tracksToSplit.forEach((track: VideoTrack) => {
      if (processedIds.has(track.id)) return;
      (get() as any).splitTrack(track.id, frame);
      processedIds.add(track.id);
    });

    return true;
  },

  toggleTrackVisibility: (trackId) => {
    const state = get() as any;
    const targetTrack = state.tracks.find((t: VideoTrack) => t.id === trackId);
    if (!targetTrack) return;

    if (targetTrack.type === 'audio') return;

    const newVisibleState = !targetTrack.visible;

    set((state: any) => ({
      tracks: state.tracks.map((track: VideoTrack) => {
        if (track.id === trackId) {
          return { ...track, visible: newVisibleState };
        }
        return track;
      }),
    }));

    state.markUnsavedChanges?.();
  },

  toggleTrackMute: (trackId) => {
    const state = get() as any;
    const targetTrack = state.tracks.find((t: VideoTrack) => t.id === trackId);
    if (!targetTrack) return;

    if (targetTrack.type !== 'audio') return;

    const newMutedState = !targetTrack.muted;

    set((state: any) => ({
      tracks: state.tracks.map((track: VideoTrack) => {
        if (track.id === trackId) {
          return { ...track, muted: newMutedState };
        }
        return track;
      }),
    }));

    state.markUnsavedChanges?.();
  },

  linkTracks: (videoTrackId, audioTrackId) => {
    // Record action for undo/redo BEFORE state change
    const state = get() as any;
    state.recordAction?.('Link Tracks');

    set((state: any) => {
      const videoTrack = state.tracks.find(
        (t: VideoTrack) => t.id === videoTrackId,
      );
      const audioTrack = state.tracks.find(
        (t: VideoTrack) => t.id === audioTrackId,
      );

      if (!videoTrack || !audioTrack) return state;

      return {
        tracks: state.tracks.map((track: VideoTrack) => {
          if (track.id === videoTrackId) {
            return { ...track, linkedTrackId: audioTrackId, isLinked: true };
          }
          if (track.id === audioTrackId) {
            return {
              ...track,
              linkedTrackId: videoTrackId,
              isLinked: true,
            };
          }
          return track;
        }),
      };
    });

    const currentState = get() as any;
    currentState.markUnsavedChanges?.();
  },

  unlinkTracks: (trackId) => {
    const state = get() as any;

    // Record action for undo/redo BEFORE state change
    state.recordAction?.('Unlink Tracks');

    const trackToUnlink = state.tracks.find(
      (t: VideoTrack) => t.id === trackId,
    );
    if (!trackToUnlink?.isLinked) return;

    set((state: any) => ({
      tracks: state.tracks.map((track: VideoTrack) => {
        if (track.id === trackId || track.id === trackToUnlink.linkedTrackId) {
          return {
            ...track,
            linkedTrackId: undefined,
            isLinked: false,
          };
        }
        return track;
      }),
    }));

    const currentState = get() as any;
    currentState.markUnsavedChanges?.();
  },

  toggleLinkedAudioMute: (videoTrackId) => {
    const state = get() as any;
    const videoTrack = state.tracks.find(
      (t: VideoTrack) => t.id === videoTrackId,
    );
    if (!videoTrack?.isLinked || !videoTrack.linkedTrackId) return;

    const newMutedState = !videoTrack.muted;

    set((state: any) => ({
      tracks: state.tracks.map((track: VideoTrack) => {
        if (track.id === videoTrackId) {
          return { ...track, muted: newMutedState };
        }
        if (track.id === videoTrack.linkedTrackId) {
          return { ...track, muted: newMutedState };
        }
        return track;
      }),
    }));

    state.markUnsavedChanges?.();
  },

  linkSelectedTracks: () => {
    const state = get() as any;
    const selectedTrackIds = state.timeline.selectedTrackIds;

    if (selectedTrackIds.length < 2) {
      // console.log('Cannot link: Need at least 2 tracks selected');
      return;
    }

    // Get selected tracks
    const selectedTracks = state.tracks.filter((t: VideoTrack) =>
      selectedTrackIds.includes(t.id),
    );

    // Try to find a video and audio track pair to link
    const videoTrack = selectedTracks.find(
      (t: VideoTrack) => t.type === 'video' && !t.isLinked,
    );
    const audioTrack = selectedTracks.find(
      (t: VideoTrack) => t.type === 'audio' && !t.isLinked,
    );

    if (videoTrack && audioTrack) {
      (get() as any).linkTracks(videoTrack.id, audioTrack.id);
    } else {
      console.log(
        'Cannot link: Need to select one video and one audio track that are not already linked',
      );
    }
  },

  unlinkSelectedTracks: () => {
    const state = get() as any;
    const selectedTrackIds = state.timeline.selectedTrackIds;

    if (selectedTrackIds.length === 0) {
      return;
    }

    // Unlink all selected tracks that are linked
    selectedTrackIds.forEach((trackId: string) => {
      const track = state.tracks.find((t: VideoTrack) => t.id === trackId);
      if (track?.isLinked) {
        (get() as any).unlinkTracks(trackId);
      }
    });
  },
});
