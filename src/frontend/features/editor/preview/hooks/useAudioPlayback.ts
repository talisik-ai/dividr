import { useCallback, useEffect, useRef } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { TrimState } from '../core/types';

/**
 * Hook for managing audio element playback synchronization
 */

export interface UseAudioPlaybackProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  independentAudioTrack?: VideoTrack;
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playbackRate: number;
}

export function useAudioPlayback({
  audioRef,
  independentAudioTrack,
  currentFrame,
  fps,
  isPlaying,
  isMuted,
  volume,
  playbackRate,
}: UseAudioPlaybackProps) {
  // Track previous trim state to detect actual trim changes
  const prevAudioTrimRef = useRef<TrimState | null>(null);

  // Handle audio metadata loaded
  const handleAudioLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Only seek audio if timeline position is within the audio track's range
    const isWithinAudioRange =
      currentFrame >= independentAudioTrack.startFrame &&
      currentFrame < independentAudioTrack.endFrame;

    if (isWithinAudioRange) {
      const relativeFrame = currentFrame - independentAudioTrack.startFrame;
      const trackTime = relativeFrame / fps;
      const targetTime =
        (independentAudioTrack.sourceStartTime || 0) + trackTime;

      const trackDurationSeconds =
        (independentAudioTrack.endFrame - independentAudioTrack.startFrame) /
        fps;
      const trimmedEndTime =
        (independentAudioTrack.sourceStartTime || 0) + trackDurationSeconds;

      audio.currentTime = Math.max(
        independentAudioTrack.sourceStartTime || 0,
        Math.min(targetTime, Math.min(trimmedEndTime, audio.duration || 0)),
      );
    }

    // Auto play if timeline is playing
    if (isPlaying && audio.paused) {
      audio.muted = isMuted || independentAudioTrack.muted;
      audio.play().catch(() => {
        /* ignore */
      });
    }
  }, [independentAudioTrack, currentFrame, fps, isPlaying, isMuted]);

  // Sync play/pause & volume for independent audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Check if timeline position is within the audio track's range
    const isWithinAudioRange =
      currentFrame >= independentAudioTrack.startFrame &&
      currentFrame < independentAudioTrack.endFrame;

    try {
      if (isPlaying) {
        if (isWithinAudioRange && audio.paused && audio.readyState >= 3) {
          audio.play().catch(console.warn);
        } else if (!isWithinAudioRange && !audio.paused) {
          audio.pause();
        }
      } else {
        if (!audio.paused) {
          audio.pause();
        }
      }

      // Handle audio volume
      const shouldMute = isMuted || independentAudioTrack.muted;
      audio.volume = shouldMute ? 0 : Math.min(volume, 1);
      audio.playbackRate = Math.max(0.25, Math.min(playbackRate, 4));
    } catch (err) {
      console.warn('Audio sync error:', err);
    }
  }, [
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    independentAudioTrack?.id,
    independentAudioTrack?.muted,
    currentFrame,
  ]);

  // Sync independent audio element on scrubbing/seek
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Only seek audio if timeline position is within the audio track's range
    const isWithinAudioRange =
      currentFrame >= independentAudioTrack.startFrame &&
      currentFrame < independentAudioTrack.endFrame;

    if (!isWithinAudioRange) {
      return;
    }

    // Detect if trim boundaries actually changed
    const currentTrimState: TrimState = {
      trackId: independentAudioTrack.id,
      startFrame: independentAudioTrack.startFrame,
      endFrame: independentAudioTrack.endFrame,
      sourceStartTime: independentAudioTrack.sourceStartTime || 0,
    };

    const trimChanged =
      !prevAudioTrimRef.current ||
      prevAudioTrimRef.current.trackId !== currentTrimState.trackId ||
      prevAudioTrimRef.current.startFrame !== currentTrimState.startFrame ||
      prevAudioTrimRef.current.endFrame !== currentTrimState.endFrame ||
      prevAudioTrimRef.current.sourceStartTime !==
        currentTrimState.sourceStartTime;

    prevAudioTrimRef.current = currentTrimState;

    const relativeFrame = currentFrame - independentAudioTrack.startFrame;
    const trackTime = relativeFrame / fps;
    const targetTime = (independentAudioTrack.sourceStartTime || 0) + trackTime;

    const trackDurationSeconds =
      (independentAudioTrack.endFrame - independentAudioTrack.startFrame) / fps;
    const trimmedEndTime =
      (independentAudioTrack.sourceStartTime || 0) + trackDurationSeconds;

    const clampedTargetTime = Math.max(
      independentAudioTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, audio.duration || 0)),
    );

    const diff = Math.abs(audio.currentTime - clampedTargetTime);
    const tolerance = 1 / fps;

    const shouldSeek = trimChanged || (!isPlaying && diff > tolerance);

    if (shouldSeek && diff > tolerance) {
      audio.currentTime = clampedTargetTime;
    }
  }, [
    currentFrame,
    fps,
    isPlaying,
    independentAudioTrack?.id,
    independentAudioTrack?.startFrame,
    independentAudioTrack?.endFrame,
    independentAudioTrack?.sourceStartTime,
    independentAudioTrack?.sourceDuration,
  ]);

  return {
    handleAudioLoadedMetadata,
  };
}
