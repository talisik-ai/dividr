import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { TrimState } from '../core/types';

/**
 * Hook for managing video element playback synchronization with enhanced reliability
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
  allTracks?: VideoTrack[]; // All tracks to check linked audio mute state
}

interface VideoHealthState {
  consecutiveBlackFrames: number;
  lastFrameCheck: number;
  recoveryAttempts: number;
  lastSeekTime: number;
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
  allTracks = [],
}: UseVideoPlaybackProps) {
  // Track previous trim state to detect actual trim changes
  const prevVideoTrimRef = useRef<TrimState | null>(null);

  // Video health monitoring state
  const [videoHealth, setVideoHealth] = useState<VideoHealthState>({
    consecutiveBlackFrames: 0,
    lastFrameCheck: 0,
    recoveryAttempts: 0,
    lastSeekTime: 0,
  });

  // Debounce timer for seek operations
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  // Track if video is ready for playback
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Debounced seek function to prevent overlapping seeks
  const performSeek = useCallback(
    (targetTime: number) => {
      const video = videoRef.current;
      if (!video) return;

      // Clear any pending seeks
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
        seekTimeoutRef.current = null;
      }

      // Only seek if video is ready and time differs significantly
      const diff = Math.abs(video.currentTime - targetTime);
      const tolerance = 1 / fps;

      if (video.readyState >= 2 && diff > tolerance) {
        video.currentTime = targetTime;
        setVideoHealth((prev) => ({
          ...prev,
          lastSeekTime: Date.now(),
          recoveryAttempts: 0, // Reset recovery attempts on successful seek
        }));
      }
    },
    [fps],
  );

  // Debounced seek with retry mechanism
  const debouncedSeek = useCallback(
    (targetTime: number, immediate = false) => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }

      pendingSeekRef.current = targetTime;

      if (immediate) {
        performSeek(targetTime);
      } else {
        seekTimeoutRef.current = setTimeout(() => {
          performSeek(targetTime);
          seekTimeoutRef.current = null;
        }, 16); // ~1 frame delay at 60fps to batch seeks
      }
    },
    [performSeek],
  );

  // Video recovery function - attempts to restore video playback
  const recoverVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    const maxRecoveryAttempts = 3;
    if (videoHealth.recoveryAttempts >= maxRecoveryAttempts) {
      console.warn('[VideoPlayback] Max recovery attempts reached');
      return;
    }

    console.log(
      `[VideoPlayback] Attempting recovery (attempt ${videoHealth.recoveryAttempts + 1}/${maxRecoveryAttempts})`,
    );

    setVideoHealth((prev) => ({
      ...prev,
      recoveryAttempts: prev.recoveryAttempts + 1,
    }));

    // Force reload current frame
    const relativeFrame = Math.max(
      0,
      currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Try loading the video element
    if (video.readyState < 2) {
      video.load();
      // Wait a brief moment for load to start, then seek
      setTimeout(() => {
        performSeek(targetTime);
        if (isPlaying && video.paused) {
          video.play().catch(console.warn);
        }
      }, 100);
    } else {
      // Just seek if already loaded
      performSeek(targetTime);
    }
  }, [
    videoRef,
    activeVideoTrack,
    videoHealth.recoveryAttempts,
    currentFrame,
    fps,
    isPlaying,
    performSeek,
  ]);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    setIsVideoReady(true);
    setVideoHealth({
      consecutiveBlackFrames: 0,
      lastFrameCheck: 0,
      recoveryAttempts: 0,
      lastSeekTime: Date.now(),
    });

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

    debouncedSeek(clampedTargetTime, true);

    // Auto play if timeline is playing
    if (isPlaying && video.paused && video.readyState >= 3) {
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
    debouncedSeek,
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
      // Check if the video track has a linked audio track and if it's muted
      let linkedAudioIsMuted = false;
      if (activeVideoTrack?.isLinked && activeVideoTrack.linkedTrackId) {
        const linkedAudioTrack = allTracks.find(
          (t) => t.id === activeVideoTrack.linkedTrackId,
        );
        linkedAudioIsMuted = linkedAudioTrack?.muted ?? false;
      }

      const shouldMuteVideo =
        isMuted || // Global mute
        !!independentAudioTrack || // Independent audio is playing
        linkedAudioIsMuted || // Linked audio track is muted
        (activeVideoTrack?.muted ?? false) || // Video track itself is muted
        (!independentAudioTrack && !activeVideoTrack); // No audio source

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
    activeVideoTrack?.isLinked,
    activeVideoTrack?.linkedTrackId,
    independentAudioTrack,
    allTracks,
  ]);

  // Black screen detection and auto-recovery using requestVideoFrameCallback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack || !isVideoReady) return;

    let handle: number;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = 32;
    canvas.height = 32;

    const checkForBlackFrame = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      if (!video || video.readyState < 2) {
        handle = video.requestVideoFrameCallback(checkForBlackFrame);
        return;
      }

      try {
        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Check if frame is completely black (or very dark)
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          totalBrightness += (r + g + b) / 3;
        }

        const avgBrightness = totalBrightness / (canvas.width * canvas.height);
        const isBlackFrame = avgBrightness < 5; // Very dark threshold

        // Only trigger recovery if we're past initial load and expected to have content
        const timeSinceLastSeek = Date.now() - videoHealth.lastSeekTime;
        const shouldHaveContent =
          metadata.mediaTime > 0 && timeSinceLastSeek > 500;

        if (isBlackFrame && shouldHaveContent && !isPlaying) {
          setVideoHealth((prev) => {
            const newCount = prev.consecutiveBlackFrames + 1;
            // Trigger recovery after 3 consecutive black frames
            if (newCount >= 3 && prev.recoveryAttempts < 3) {
              console.warn(
                `[VideoPlayback] Black screen detected (${newCount} frames)`,
              );
              // Schedule recovery on next tick
              setTimeout(() => recoverVideo(), 0);
            }
            return {
              ...prev,
              consecutiveBlackFrames: newCount,
              lastFrameCheck: Date.now(),
            };
          });
        } else if (!isBlackFrame) {
          // Reset counter if we see valid content
          setVideoHealth((prev) => ({
            ...prev,
            consecutiveBlackFrames: 0,
            lastFrameCheck: Date.now(),
          }));
        }
      } catch (err) {
        // Ignore canvas errors
      }

      handle = video.requestVideoFrameCallback(checkForBlackFrame);
    };

    handle = video.requestVideoFrameCallback(checkForBlackFrame);
    return () => {
      video.cancelVideoFrameCallback(handle);
      canvas.remove();
    };
  }, [
    activeVideoTrack?.id,
    isVideoReady,
    isPlaying,
    recoverVideo,
    videoHealth.lastSeekTime,
  ]);

  // Sync timeline to video frames during playback
  useEffect(() => {
    const video = videoRef.current;
    const trackForSync = activeVideoTrack;
    if (!video || !trackForSync || !isPlaying) return;

    let handle: number;

    const step = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      if (!video.paused && isPlaying && video.readyState >= 2) {
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

  // Sync video element on scrubbing/seek with debouncing
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack || !isVideoReady) return;

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
      // Use debounced seek for scrubbing, immediate for trim changes
      debouncedSeek(clampedTargetTime, trimChanged);
    }
  }, [
    currentFrame,
    fps,
    isPlaying,
    activeVideoTrack,
    isVideoReady,
    debouncedSeek,
  ]);

  // Reset video ready state when track changes
  useEffect(() => {
    const video = videoRef.current;
    if (activeVideoTrack?.id) {
      setIsVideoReady(false);
      setVideoHealth({
        consecutiveBlackFrames: 0,
        lastFrameCheck: 0,
        recoveryAttempts: 0,
        lastSeekTime: Date.now(),
      });

      // Force video element check and reload if needed (handles undo/redo restoration)
      if (video && activeVideoTrack.previewUrl) {
        // If video element doesn't have the correct source, force reload
        if (!video.src || video.readyState === 0) {
          console.log(
            `🔄 useVideoPlayback: Force reloading video for restored track ${activeVideoTrack.id}`,
          );
          video.src = activeVideoTrack.previewUrl;
          video.load();
        }
      }
    }
  }, [activeVideoTrack?.id, activeVideoTrack?.previewUrl, videoRef]);

  // Cleanup seek timeout on unmount
  useEffect(() => {
    return () => {
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
      }
    };
  }, []);

  return {
    handleLoadedMetadata,
  };
}
