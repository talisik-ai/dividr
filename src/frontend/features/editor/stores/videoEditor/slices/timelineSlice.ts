/* eslint-disable @typescript-eslint/no-explicit-any */
// slices/timelineSlice.ts
import { StateCreator } from 'zustand';
import { SnapPoint, TimelineState, VideoTrack } from '../types';

// Snap threshold for timeline snapping
export const SNAP_THRESHOLD = 5; // frames

export interface TimelineSlice {
  timeline: TimelineState;
  tracks: VideoTrack[];
  setCurrentFrame: (frame: number) => void;
  setTotalFrames: (frames: number) => void;
  setFps: (fps: number) => void;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setInPoint: (frame?: number) => void;
  setOutPoint: (frame?: number) => void;
  setSelectedTracks: (trackIds: string[]) => void;
  toggleSnap: () => void;
  toggleSplitMode: () => void;
  setSplitMode: (active: boolean) => void;

  // Snap functionality
  findSnapPoints: (
    currentFrame: number,
    excludeTrackId?: string,
  ) => SnapPoint[];
  snapToFrame: (
    targetFrame: number,
    snapPoints: SnapPoint[],
    threshold?: number,
    excludeTrackId?: string,
  ) => number | null;

  // Visual feedback for duplication
  duplicationFeedbackTrackIds: Set<string>;
  triggerDuplicationFeedback: (trackId: string) => void;
  clearDuplicationFeedback: (trackId: string) => void;

  // State management helpers
  markUnsavedChanges?: () => void;
}

export const createTimelineSlice: StateCreator<
  TimelineSlice,
  [],
  [],
  TimelineSlice
> = (set, get) => ({
  tracks: [],
  timeline: {
    currentFrame: 0,
    totalFrames: 3000,
    fps: 30,
    zoom: 1,
    scrollX: 0,
    selectedTrackIds: [],
    playheadVisible: true,
    snapEnabled: true,
    isSplitModeActive: false,
  },
  duplicationFeedbackTrackIds: new Set(),

  setCurrentFrame: (frame) =>
    set((state) => {
      // When tracks exist, use the maximum track end frame
      // Only use totalFrames as fallback when no tracks exist
      const effectiveEndFrame =
        state.tracks?.length > 0
          ? Math.max(...state.tracks.map((track: any) => track.endFrame))
          : state.timeline.totalFrames;

      return {
        timeline: {
          ...state.timeline,
          currentFrame: Math.max(0, Math.min(frame, effectiveEndFrame)),
        },
      };
    }),

  setTotalFrames: (frames) =>
    set((state) => {
      const newState = {
        timeline: { ...state.timeline, totalFrames: Math.max(1, frames) },
      };
      // Call markUnsavedChanges if available
      setTimeout(() => {
        if (state.markUnsavedChanges) {
          state.markUnsavedChanges();
        }
      }, 0);
      return newState;
    }),

  setFps: (fps) =>
    set((state) => {
      const newState = {
        timeline: { ...state.timeline, fps: Math.max(1, fps) },
      };
      // Call markUnsavedChanges if available
      setTimeout(() => {
        if (state.markUnsavedChanges) {
          state.markUnsavedChanges();
        }
      }, 0);
      return newState;
    }),

  setZoom: (zoom) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        zoom: Math.max(0.1, Math.min(zoom, 10)),
      },
    })),

  setScrollX: (scrollX) =>
    set((state) => ({
      timeline: { ...state.timeline, scrollX: Math.max(0, scrollX) },
    })),

  setInPoint: (frame) =>
    set((state) => ({
      timeline: { ...state.timeline, inPoint: frame },
    })),

  setOutPoint: (frame) =>
    set((state) => ({
      timeline: { ...state.timeline, outPoint: frame },
    })),

  setSelectedTracks: (trackIds) =>
    set((state) => ({
      timeline: { ...state.timeline, selectedTrackIds: trackIds },
    })),

  toggleSnap: () =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        snapEnabled: !state.timeline.snapEnabled,
      },
    })),

  toggleSplitMode: () =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        isSplitModeActive: !state.timeline.isSplitModeActive,
      },
    })),

  setSplitMode: (active) =>
    set((state) => ({
      timeline: {
        ...state.timeline,
        isSplitModeActive: active,
      },
    })),

  // Snap functionality
  findSnapPoints: (currentFrame, excludeTrackId) => {
    const state = get() as any;
    const snapPoints: SnapPoint[] = [];
    const { tracks, timeline } = state;

    // Add playhead as snap point
    snapPoints.push({
      frame: currentFrame,
      type: 'playhead',
    });

    // Add in/out points as snap points
    if (timeline.inPoint !== undefined) {
      snapPoints.push({
        frame: timeline.inPoint,
        type: 'in-point',
      });
    }
    if (timeline.outPoint !== undefined) {
      snapPoints.push({
        frame: timeline.outPoint,
        type: 'out-point',
      });
    }

    // Add track start and end points (excluding the current track being dragged)
    tracks.forEach((track: VideoTrack) => {
      if (excludeTrackId && track.id === excludeTrackId) {
        return;
      }

      snapPoints.push({
        frame: track.startFrame,
        type: 'track-start',
        trackId: track.id,
      });

      snapPoints.push({
        frame: track.endFrame,
        type: 'track-end',
        trackId: track.id,
      });
    });

    return snapPoints;
  },

  snapToFrame: (
    targetFrame,
    snapPoints,
    threshold = SNAP_THRESHOLD,
    excludeTrackId,
  ) => {
    let nearestSnapPoint: SnapPoint | null = null;
    let minDistance = threshold + 1;

    for (const snapPoint of snapPoints) {
      // Skip snap points from the same track being dragged
      if (excludeTrackId && snapPoint.trackId === excludeTrackId) {
        continue;
      }

      const distance = Math.abs(snapPoint.frame - targetFrame);
      if (distance <= threshold && distance < minDistance) {
        nearestSnapPoint = snapPoint;
        minDistance = distance;
      }
    }

    return nearestSnapPoint ? nearestSnapPoint.frame : null;
  },

  // Visual feedback for duplication
  triggerDuplicationFeedback: (trackId: string) => {
    console.log(`[Animation] Adding ${trackId} to feedback set`);
    set((state) => {
      const newSet = new Set(state.duplicationFeedbackTrackIds);
      newSet.add(trackId);
      console.log(`[Animation] Feedback set now contains:`, Array.from(newSet));
      return { duplicationFeedbackTrackIds: newSet };
    });

    // Auto-clear after animation duration (600ms)
    setTimeout(() => {
      console.log(`[Animation] Clearing ${trackId} after 600ms`);
      get().clearDuplicationFeedback(trackId);
    }, 600);
  },

  clearDuplicationFeedback: (trackId: string) => {
    console.log(`[Animation] Removing ${trackId} from feedback set`);
    set((state) => {
      const newSet = new Set(state.duplicationFeedbackTrackIds);
      newSet.delete(trackId);
      return { duplicationFeedbackTrackIds: newSet };
    });
  },
});
