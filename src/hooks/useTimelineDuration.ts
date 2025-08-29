import { useMemo } from 'react';
import { useVideoEditorStore } from '../store/videoEditorStore';

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

  // Memoize expensive calculations - only recalculates when tracks or timeline change
  return useMemo(() => {
    // Calculate effective timeline duration based on actual tracks
    const effectiveEndFrame =
      tracks.length > 0
        ? Math.max(
            ...tracks.map((track) => track.endFrame),
            timeline.totalFrames,
          )
        : timeline.totalFrames;

    const totalSeconds = effectiveEndFrame / timeline.fps;
    const totalMinutes = totalSeconds / 60;
    const totalHours = totalSeconds / 3600;

    // Format time with better precision and readability
    const formatTime = (frame: number): string => {
      const seconds = frame / timeline.fps;
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      const frameRemainder = Math.floor((seconds % 1) * timeline.fps);

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
  }, [tracks, timeline.totalFrames, timeline.fps]); // Only recalculate when these change
};
