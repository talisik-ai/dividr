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
 * CapCut-style non-destructive trimming helper
 * Clamps track resizing within the original source media boundaries
 *
 * FIXED: Prevents resize actions from converting to drag actions when
 * reaching trim boundaries by maintaining original timeline positions
 * when source boundaries are hit.
 */
const resizeTrackWithTrimming = (
  track: VideoTrack,
  newStartFrame: number | undefined,
  newEndFrame: number | undefined,
  fps: number,
): VideoTrack => {
  const currentStartFrame = track.startFrame;
  const currentEndFrame = track.endFrame;
  const currentSourceStartTime = track.sourceStartTime || 0;

  // Use sourceDuration if available, otherwise fall back to current duration
  const sourceDurationFrames = track.sourceDuration || track.duration;
  const sourceDurationSeconds = sourceDurationFrames / fps;

  // Calculate the current source end time
  const currentSourceEndTime =
    currentSourceStartTime + (currentEndFrame - currentStartFrame) / fps;

  // Determine the new timeline positions
  const updatedStartFrame = newStartFrame ?? currentStartFrame;
  const updatedEndFrame = newEndFrame ?? currentEndFrame;

  // Calculate how much we're trimming from each side (in frames)
  const leftTrimFrames = updatedStartFrame - currentStartFrame;
  const rightTrimFrames = currentEndFrame - updatedEndFrame;

  // Calculate new source start time (trimming from left moves in-point forward)
  let newSourceStartTime = currentSourceStartTime;
  if (newStartFrame !== undefined) {
    newSourceStartTime = currentSourceStartTime + leftTrimFrames / fps;
  }

  // Calculate new source end time (trimming from right moves out-point backward)
  let newSourceEndTime = currentSourceEndTime;
  if (newEndFrame !== undefined) {
    newSourceEndTime = currentSourceEndTime - rightTrimFrames / fps;
  }

  // CRITICAL: Clamp to source media boundaries (CapCut behavior)
  // The in-point cannot go before 0
  newSourceStartTime = Math.max(0, newSourceStartTime);
  // The out-point cannot exceed the source duration
  newSourceEndTime = Math.min(sourceDurationSeconds, newSourceEndTime);

  // Ensure we don't have negative or zero duration
  if (newSourceEndTime <= newSourceStartTime) {
    // Prevent invalid state - maintain at least 1 frame
    newSourceEndTime = newSourceStartTime + 1 / fps;
  }

  // Calculate the final duration in frames
  const newDurationSeconds = newSourceEndTime - newSourceStartTime;
  const newDurationFrames = Math.round(newDurationSeconds * fps);

  // Calculate final timeline positions
  // If trimming from left, the start frame changes
  // If trimming from right, the end frame changes
  let finalStartFrame = updatedStartFrame;
  let finalEndFrame = updatedEndFrame;

  // Check if we hit source boundaries and need to adjust timeline positions
  // Use a small epsilon to account for floating point precision
  const epsilon = 0.001;
  const hitLeftBoundary =
    newStartFrame !== undefined && newSourceStartTime <= epsilon;
  const hitRightBoundary =
    newEndFrame !== undefined &&
    Math.abs(newSourceEndTime - sourceDurationSeconds) <= epsilon;

  // Only adjust timeline positions if we hit boundaries
  if (hitLeftBoundary && newStartFrame !== undefined) {
    // We hit the left boundary, so the start frame is clamped to the original position
    // and we adjust the end frame to maintain the new duration
    finalStartFrame = currentStartFrame;
    finalEndFrame = finalStartFrame + newDurationFrames;
  } else if (hitRightBoundary && newEndFrame !== undefined) {
    // We hit the right boundary, so the end frame is clamped to the original position
    // and we adjust the start frame to maintain the new duration
    finalEndFrame = currentEndFrame;
    finalStartFrame = finalEndFrame - newDurationFrames;
  } else {
    // No boundary hit, use the normal logic
    if (newStartFrame !== undefined) {
      finalEndFrame = finalStartFrame + newDurationFrames;
    } else if (newEndFrame !== undefined) {
      finalStartFrame = finalEndFrame - newDurationFrames;
    }
  }

  // Ensure minimum track length (1 frame)
  if (finalEndFrame <= finalStartFrame) {
    finalEndFrame = finalStartFrame + 1;
  }

  console.log(`[Trim] ${track.name}:`, {
    timeline: {
      old: `${currentStartFrame} → ${currentEndFrame}`,
      new: `${finalStartFrame} → ${finalEndFrame}`,
    },
    source: {
      oldStart: currentSourceStartTime.toFixed(3),
      newStart: newSourceStartTime.toFixed(3),
      oldEnd: currentSourceEndTime.toFixed(3),
      newEnd: newSourceEndTime.toFixed(3),
      duration: sourceDurationSeconds.toFixed(3),
    },
    trim: {
      leftFrames: leftTrimFrames,
      rightFrames: rightTrimFrames,
    },
    boundaries: {
      hitLeft: hitLeftBoundary,
      hitRight: hitRightBoundary,
    },
  });

  return {
    ...track,
    startFrame: finalStartFrame,
    endFrame: finalEndFrame,
    duration: newDurationFrames,
    sourceStartTime: newSourceStartTime,
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
  resizeTrack: (
    trackId: string,
    newStartFrame?: number,
    newEndFrame?: number,
  ) => void;
  duplicateTrack: (trackId: string) => string;
  splitTrack: (trackId: string, frame: number) => void;
  splitAtPlayhead: () => boolean;
  splitAtPosition: (frame: number, trackId?: string) => boolean;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  linkTracks: (videoTrackId: string, audioTrackId: string) => void;
  unlinkTracks: (trackId: string) => void;
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

          console.log(
            `➕ Adding ${subtitleTracks.length} subtitle tracks from media library`,
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

      return {
        tracks: state.tracks.map((track: VideoTrack) => {
          if (track.id === trackId) {
            const duration = track.endFrame - track.startFrame;

            const conflictingTracks = state.tracks.filter((t: VideoTrack) => {
              if (t.id === trackId) return false;
              if (trackToMove?.isLinked && t.id === trackToMove.linkedTrackId)
                return false;

              if (track.type === 'video' && t.type === 'video') return true;
              if (track.type !== 'video' && t.type === track.type) return true;

              return false;
            });

            const finalStartFrame = findNearestAvailablePosition(
              newStartFrame,
              duration,
              conflictingTracks,
              state.timeline.currentFrame,
            );

            return {
              ...track,
              startFrame: finalStartFrame,
              endFrame: finalStartFrame + duration,
            };
          }

          if (trackToMove?.isLinked && track.id === trackToMove.linkedTrackId) {
            const linkedDuration = track.endFrame - track.startFrame;
            const currentOffset = track.startFrame - trackToMove.startFrame;
            const newLinkedStartFrame = newStartFrame + currentOffset;

            const finalStartFrame = findNearestAvailablePosition(
              newLinkedStartFrame,
              linkedDuration,
              state.tracks.filter((t: VideoTrack) => {
                if (t.id === track.id || t.id === trackToMove.id) return false;
                return t.type === track.type;
              }),
            );

            return {
              ...track,
              startFrame: finalStartFrame,
              endFrame: finalStartFrame + linkedDuration,
            };
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

      return {
        tracks: state.tracks.map((track: VideoTrack) => {
          if (track.id === trackId) {
            return resizeTrackWithTrimming(
              track,
              newStartFrame,
              newEndFrame,
              state.timeline.fps,
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
            );
          }
          return track;
        }),
      };
    });

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  duplicateTrack: (trackId) => {
    const state = get() as any;
    const originalTrack = state.tracks.find(
      (t: VideoTrack) => t.id === trackId,
    );
    if (!originalTrack) return '';

    const newId = uuidv4();
    const duration = originalTrack.endFrame - originalTrack.startFrame;

    if (originalTrack.isLinked && originalTrack.linkedTrackId) {
      const linkedTrack = state.tracks.find(
        (t: VideoTrack) => t.id === originalTrack.linkedTrackId,
      );
      if (linkedTrack) {
        const newLinkedId = uuidv4();

        const duplicatedTrack: VideoTrack = {
          ...originalTrack,
          id: newId,
          name: `${originalTrack.name} Copy`,
          startFrame: originalTrack.endFrame,
          endFrame: originalTrack.endFrame + duration,
          linkedTrackId: newLinkedId,
          sourceDuration: originalTrack.sourceDuration, // Preserve source duration
        };

        const duplicatedLinkedTrack: VideoTrack = {
          ...linkedTrack,
          id: newLinkedId,
          name: `${linkedTrack.name} Copy`,
          startFrame: linkedTrack.endFrame,
          endFrame: linkedTrack.endFrame + duration,
          linkedTrackId: newId,
          sourceDuration: linkedTrack.sourceDuration, // Preserve source duration
        };

        set((state: any) => ({
          tracks: [...state.tracks, duplicatedTrack, duplicatedLinkedTrack],
        }));
      }
    } else {
      const duplicatedTrack: VideoTrack = {
        ...originalTrack,
        id: newId,
        name: `${originalTrack.name} Copy`,
        startFrame: originalTrack.endFrame,
        endFrame: originalTrack.endFrame + duration,
        sourceDuration: originalTrack.sourceDuration, // Preserve source duration
      };

      set((state: any) => ({
        tracks: [...state.tracks, duplicatedTrack],
      }));
    }

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

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  unlinkTracks: (trackId) => {
    const state = get() as any;
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

    state.markUnsavedChanges?.();
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
});
