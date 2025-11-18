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
  fps, // Display FPS from source video (passed from VideoBlobPreview)
  isPlaying,
  isMuted,
  volume,
  playbackRate,
}: UseAudioPlaybackProps) {
  // Use display FPS from source video for frontend rendering
  const displayFps = fps;
  // Track previous trim state to detect actual trim changes
  const prevAudioTrimRef = useRef<TrimState | null>(null);

  // Track the last active audio track to detect segment transitions
  const prevActiveAudioTrackRef = useRef<{
    id: string;
    previewUrl: string;
    sourceStartTime: number;
  } | null>(null);

  // Track if we're in a seek operation
  const seekInProgressRef = useRef<boolean>(false);

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
      const trackTime = relativeFrame / displayFps;
      const targetTime =
        (independentAudioTrack.sourceStartTime || 0) + trackTime;

      // Direct time assignment, no clamping during metadata load
      audio.currentTime = targetTime;
    }

    // Auto play if timeline is playing
    if (isPlaying && audio.paused) {
      audio.muted = isMuted || independentAudioTrack.muted;
      audio.play().catch(() => {
        /* ignore */
      });
    }
  }, [independentAudioTrack, currentFrame, displayFps, isPlaying, isMuted]);

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

  // Sync independent audio element on scrubbing/seek - CONTINUOUS PLAYBACK LOGIC
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

    const tolerance = 1 / fps;

    // Track state changes
    const currentTrackState = {
      id: independentAudioTrack.id,
      previewUrl: independentAudioTrack.previewUrl,
      sourceStartTime: independentAudioTrack.sourceStartTime || 0,
    };

    // Detect ACTUAL source file change (different audio file loaded)
    const isSourceFileChange =
      prevActiveAudioTrackRef.current !== null &&
      prevActiveAudioTrackRef.current.previewUrl !==
        currentTrackState.previewUrl;

    // Detect segment boundary crossing within same source (cut/trim segments)
    const isSameSourceSegmentChange =
      prevActiveAudioTrackRef.current !== null &&
      prevActiveAudioTrackRef.current.previewUrl ===
        currentTrackState.previewUrl &&
      prevActiveAudioTrackRef.current.id !== currentTrackState.id;

    prevActiveAudioTrackRef.current = currentTrackState;

    // CRITICAL: Only detect trim changes when user is actively editing,
    // NOT when playback naturally crosses segment boundaries
    const currentTrimState: TrimState = {
      trackId: independentAudioTrack.id,
      startFrame: independentAudioTrack.startFrame,
      endFrame: independentAudioTrack.endFrame,
      sourceStartTime: independentAudioTrack.sourceStartTime || 0,
    };

    // User-initiated trim change detection (editing, not playback)
    const trimChanged =
      prevAudioTrimRef.current !== null &&
      prevAudioTrimRef.current.trackId === currentTrimState.trackId && // Same track
      (prevAudioTrimRef.current.startFrame !== currentTrimState.startFrame ||
        prevAudioTrimRef.current.endFrame !== currentTrimState.endFrame ||
        prevAudioTrimRef.current.sourceStartTime !==
          currentTrimState.sourceStartTime);

    prevAudioTrimRef.current = currentTrimState;

    // PROFESSIONAL AUDIO PLAYBACK LOGIC:
    // During continuous playback, let the browser's audio decoder handle
    // playback naturally. Only seek when absolutely necessary.
    const isContinuousPlayback = isPlaying && !seekInProgressRef.current;

    // Check if audio is playing continuously through same source
    // (even across cut boundaries - this is the key to smooth audio playback)
    const isPlayingThroughCuts =
      isContinuousPlayback && isSameSourceSegmentChange;

    // CRITICAL FIX: During continuous playback through cuts, DO NOT recalculate
    // targetTime based on segment offset, as this causes audio to jump backward
    // and trigger false drift correction. Instead, just let audio continue playing.
    let targetTime: number;
    let diff: number;

    if (isPlayingThroughCuts) {
      // During continuous playback through cuts, don't recalculate time
      // Just check that audio is still playing (not paused/stuck)
      targetTime = audio.currentTime; // Expected = actual (no change needed)
      diff = 0; // No difference, let it play naturally
    } else {
      // Normal time calculation for scrubbing, paused, or different sources
      const relativeFrame = currentFrame - independentAudioTrack.startFrame;
      const trackTime = relativeFrame / displayFps;
      targetTime = (independentAudioTrack.sourceStartTime || 0) + trackTime;
      diff = Math.abs(audio.currentTime - targetTime);
    }

    // Determine if this is a scrubbing operation (paused and seeking)
    const isScrubbing = !isPlaying && diff > tolerance;

    // SEEK DECISION LOGIC:
    // Only seek when one of these conditions is true:
    // 1. User is scrubbing while paused
    // 2. Source file changed (different audio loaded)
    // 3. User manually trimmed the current track (editing operation)
    // 4. Paused and out of sync
    //
    // DO NOT SEEK when:
    // - Playing continuously through cut boundaries (diff = 0, let it play)
    // - Audio time is within acceptable tolerance
    const needsSeek =
      isScrubbing || // User scrubbing
      isSourceFileChange || // Different audio file
      trimChanged || // User edited trim points
      (!isContinuousPlayback && diff > tolerance); // Paused and out of syncs

    if (needsSeek && diff > tolerance) {
      seekInProgressRef.current = true;
      audio.currentTime = targetTime;

      // Clear seek in progress flag after audio element processes the seek
      requestAnimationFrame(() => {
        seekInProgressRef.current = false;
      });
    }
  }, [
    currentFrame,
    displayFps,
    isPlaying,
    independentAudioTrack?.id,
    independentAudioTrack?.startFrame,
    independentAudioTrack?.endFrame,
    independentAudioTrack?.sourceStartTime,
    independentAudioTrack?.sourceDuration,
    independentAudioTrack?.previewUrl,
  ]);

  return {
    handleAudioLoadedMetadata,
  };
}
