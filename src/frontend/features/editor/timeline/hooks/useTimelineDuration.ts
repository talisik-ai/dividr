import { useMemo } from 'react';
import { useVideoEditorStore } from '../../stores/videoEditor/index';
import { getDisplayFps } from '../../stores/videoEditor/types/timeline.types';

export interface TimelineDuration {
  totalFrames: number;
  totalSeconds: number;
  totalMinutes: number;
  totalHours: number;
  formattedTime: string;
  effectiveEndFrame: number;
}

export const useTimelineDuration = (): TimelineDuration => {
  const { tracks, timeline } = useVideoEditorStore();
  // Get display FPS from source video tracks (dynamic but static once determined)
  const displayFps = useMemo(() => getDisplayFps(tracks), [tracks]);

  // Memoize expensive calculations - only recalculates when tracks or timeline change
  return useMemo(() => {
    // Calculate effective timeline duration based on actual tracks
    // When tracks exist, use the maximum track end frame
    // Only use totalFrames as fallback when no tracks exist
    const effectiveEndFrame =
      tracks.length > 0
        ? Math.max(...tracks.map((track) => track.endFrame))
        : timeline.totalFrames;

    const totalSeconds = effectiveEndFrame / displayFps;
    const totalMinutes = totalSeconds / 60;
    const totalHours = totalSeconds / 3600;

    // Format time with better precision and readability
    const formatTime = (frame: number): string => {
      const seconds = frame / displayFps;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const frameRemainder = Math.floor((seconds % 1) * displayFps);

      if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frameRemainder.toString().padStart(2, '0')}`;
      }
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frameRemainder.toString().padStart(2, '0')}`;
    };

    return {
      totalFrames: effectiveEndFrame,
      totalSeconds,
      totalMinutes,
      totalHours,
      formattedTime: formatTime(effectiveEndFrame),
      effectiveEndFrame,
    };
  }, [tracks, timeline.totalFrames, displayFps]); // Only recalculate when these change
};
