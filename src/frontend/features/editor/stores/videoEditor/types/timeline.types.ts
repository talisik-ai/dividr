import React from 'react';
import { useVideoEditorStore } from '../index';

// Get display FPS from source video tracks (dynamic but static once determined)
// This ensures timeline tracks, video length, and playback remain stable
// regardless of export FPS changes (CapCut-like behavior)
// Falls back to 30 if no video tracks exist
export const getDisplayFps = (
  tracks: Array<{ type: string; sourceFps?: number }>,
): number => {
  const videoTracks = tracks.filter((track) => track.type === 'video');
  if (videoTracks.length === 0) return 30; // Default fallback

  // Use the first video track's source FPS
  const firstVideoTrack = videoTracks[0];
  return firstVideoTrack.sourceFps || 30; // Fallback to 30 if sourceFps not available
};

// Hook to get display FPS from store tracks
export const useDisplayFps = () => {
  const tracks = useVideoEditorStore((state) => state.tracks);
  return React.useMemo(() => getDisplayFps(tracks), [tracks]);
};

export interface TimelineState {
  currentFrame: number;
  totalFrames: number;
  fps: number; // Export FPS - only used for backend processing/export, not frontend rendering
  zoom: number;
  scrollX: number;
  inPoint?: number;
  outPoint?: number;
  selectedTrackIds: string[];
  playheadVisible: boolean;
  snapEnabled: boolean;
  isSplitModeActive: boolean;
  visibleTrackRows: string[]; // Track row IDs that are visible (e.g., ['video', 'audio', 'subtitle', 'image'])
}

export interface SnapPoint {
  frame: number;
  type: 'playhead' | 'track-start' | 'track-end' | 'in-point' | 'out-point';
  trackId?: string;
}
