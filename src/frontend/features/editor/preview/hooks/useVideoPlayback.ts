import { useCallback, useEffect, useRef } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { TrimState } from '../core/types';

/**
 * Hook for managing video element playback synchronization
 */

export interface UseVideoPlaybackProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  activeVideoTrack?: VideoTrack;
  independentAudioTrack?: VideoTrack;
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  isMuted: boolean;
  volume: number;
  playbackRate: number;
  setCurrentFrame: (frame: number) => void;
}

export function useVideoPlayback({
  videoRef,
  activeVideoTrack,
  independentAudioTrack,
  currentFrame,
  fps,
  isPlaying,
  isMuted,
  volume,
  playbackRate,
  setCurrentFrame,
}: UseVideoPlaybackProps) {
  // Track previous trim state to detect actual trim changes
  const prevVideoTrimRef = useRef<TrimState | null>(null);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    // Seek to correct position based on the video track
    const relativeFrame = Math.max(
      0,
      currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / fps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    video.currentTime = clampedTargetTime;

    // Auto play if timeline is playing
    if (isPlaying && video.paused) {
      video.muted = isMuted || !!independentAudioTrack;
      video.play().catch(() => {
        /* ignore */
      });
    }
  }, [
    activeVideoTrack,
    currentFrame,
    fps,
    isPlaying,
    isMuted,
    independentAudioTrack,
  ]);

  // Keep the simplified canplay effect for auto-play only
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleAutoPlay() {
      if (isPlaying && video!.paused) {
        video!.muted = isMuted;
        video!.play().catch(() => {
          /* ignore */
        });
      }
    }

    video.addEventListener('canplay', handleAutoPlay);
    return () => video.removeEventListener('canplay', handleAutoPlay);
  }, [isPlaying, isMuted]);

  // Sync play/pause & volume for video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (isPlaying) {
        if (video.paused && video.readyState >= 3) {
          video.play().catch(console.warn);
        }
      } else {
        if (!video.paused) {
          video.pause();
        }
      }

      // Handle video volume
      const shouldMuteVideo =
        isMuted ||
        !!independentAudioTrack ||
        (activeVideoTrack?.muted ?? false) ||
        (!independentAudioTrack && !activeVideoTrack);

      video.volume = shouldMuteVideo ? 0 : Math.min(volume, 1);
      video.playbackRate = Math.max(0.25, Math.min(playbackRate, 4));
    } catch (err) {
      console.warn('Video sync error:', err);
    }
  }, [
    isPlaying,
    volume,
    isMuted,
    playbackRate,
    activeVideoTrack?.id,
    activeVideoTrack?.previewUrl,
    activeVideoTrack?.muted,
    independentAudioTrack,
  ]);

  // Sync timeline to video frames
  useEffect(() => {
    const video = videoRef.current;
    const trackForSync = activeVideoTrack;
    if (!video || !trackForSync || isPlaying) return;

    let handle: number;

    const step = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      if (!video.paused && !isPlaying) {
        const elapsedFrames =
          (metadata.mediaTime - (trackForSync.sourceStartTime || 0)) * fps +
          trackForSync.startFrame;
        setCurrentFrame(Math.floor(elapsedFrames));
      }
      handle = video.requestVideoFrameCallback(step);
    };

    handle = video.requestVideoFrameCallback(step);
    return () => video.cancelVideoFrameCallback(handle);
  }, [activeVideoTrack?.id, isPlaying, fps, setCurrentFrame]);

  // Sync video element on scrubbing/seek
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    // Detect if trim boundaries actually changed
    const currentTrimState: TrimState = {
      trackId: activeVideoTrack.id,
      startFrame: activeVideoTrack.startFrame,
      endFrame: activeVideoTrack.endFrame,
      sourceStartTime: activeVideoTrack.sourceStartTime || 0,
    };

    const trimChanged =
      !prevVideoTrimRef.current ||
      prevVideoTrimRef.current.trackId !== currentTrimState.trackId ||
      prevVideoTrimRef.current.startFrame !== currentTrimState.startFrame ||
      prevVideoTrimRef.current.endFrame !== currentTrimState.endFrame ||
      prevVideoTrimRef.current.sourceStartTime !==
        currentTrimState.sourceStartTime;

    prevVideoTrimRef.current = currentTrimState;

    const relativeFrame = Math.max(
      0,
      currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / fps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    const diff = Math.abs(video.currentTime - clampedTargetTime);
    const tolerance = 1 / fps;

    const shouldSeek = trimChanged || (!isPlaying && diff > tolerance);

    if (shouldSeek && diff > tolerance) {
      video.currentTime = clampedTargetTime;
    }
  }, [currentFrame, fps, isPlaying, activeVideoTrack]);

  return {
    handleLoadedMetadata,
  };
}
