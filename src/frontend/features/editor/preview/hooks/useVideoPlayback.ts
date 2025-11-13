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

interface SeekState {
  targetTime: number;
  frame: number;
  timestamp: number;
  immediate: boolean;
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

  // Track the last active video track to detect segment transitions
  const prevActiveTrackRef = useRef<{
    id: string;
    previewUrl: string;
    sourceStartTime: number;
  } | null>(null);

  // Video health monitoring state
  const [videoHealth, setVideoHealth] = useState<VideoHealthState>({
    consecutiveBlackFrames: 0,
    lastFrameCheck: 0,
    recoveryAttempts: 0,
    lastSeekTime: 0,
  });

  // Unified seek state management
  const seekTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSeekStateRef = useRef<SeekState | null>(null);
  const seekInProgressRef = useRef<boolean>(false);

  // Track if video is ready for playback
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Track if we're currently scrubbing (rapid seeks)
  const isScrubbingRef = useRef<boolean>(false);

  // Unified seek function with frame buffer invalidation
  const performSeek = useCallback(
    (
      targetTime: number,
      targetFrame: number,
      immediate = false,
      forceInvalidate = false,
    ) => {
      const video = videoRef.current;
      if (!video) return;

      // Only seek if video is ready and time differs significantly
      const diff = Math.abs(video.currentTime - targetTime);
      const tolerance = 1 / fps;

      if (video.readyState >= 2 && diff > tolerance) {
        // Mark seek in progress to prevent circular updates
        seekInProgressRef.current = true;

        // Force invalidate any cached frames by triggering a micro-seek
        // This ensures the video decoder doesn't show stale frames
        // More aggressive invalidation for trim/cut operations
        if (forceInvalidate || diff > tolerance * 2) {
          // For larger seeks or forced invalidation, clear decoder buffer
          // by seeking to a slightly different position first
          if (forceInvalidate) {
            console.log(
              `🔄 Force invalidating buffer: ${video.currentTime.toFixed(3)}s -> ${targetTime.toFixed(3)}s (frame ${targetFrame})`,
            );
          }
          video.currentTime = targetTime + 0.001;
        }

        // Perform the actual seek
        video.currentTime = targetTime;

        // Store the last successful seek state
        lastSeekStateRef.current = {
          targetTime,
          frame: targetFrame,
          timestamp: Date.now(),
          immediate,
        };

        setVideoHealth((prev) => ({
          ...prev,
          lastSeekTime: Date.now(),
          recoveryAttempts: 0, // Reset recovery attempts on successful seek
        }));

        // Clear seek in progress flag after the video element processes the seek
        requestAnimationFrame(() => {
          seekInProgressRef.current = false;
        });
      } else if (diff <= tolerance) {
        // Already at target position, just update state
        seekInProgressRef.current = false;
      }
    },
    [fps],
  );

  // Smart seek queueing for rapid seeks (scrubbing)
  const queueSeek = useCallback(
    (
      targetTime: number,
      targetFrame: number,
      immediate = false,
      forceInvalidate = false,
    ) => {
      // Clear any pending debounced seeks
      if (seekTimeoutRef.current) {
        clearTimeout(seekTimeoutRef.current);
        seekTimeoutRef.current = null;
      }

      if (immediate) {
        // Immediate seek - execute right away (for scrubbing, trim changes)
        performSeek(targetTime, targetFrame, true, forceInvalidate);
      } else {
        // Debounced seek - batch rapid updates during playback
        seekTimeoutRef.current = setTimeout(() => {
          performSeek(targetTime, targetFrame, false, forceInvalidate);
          seekTimeoutRef.current = null;
        }, 8); // Reduced to 8ms for more responsive seeking
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
        performSeek(targetTime, currentFrame, true);
        if (isPlaying && video.paused) {
          video.play().catch(console.warn);
        }
      }, 100);
    } else {
      // Just seek if already loaded
      performSeek(targetTime, currentFrame, true);
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

    queueSeek(clampedTargetTime, currentFrame, true);

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
    queueSeek,
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
      // Only update timeline from video if we're not in the middle of a seek operation
      if (
        !video.paused &&
        isPlaying &&
        video.readyState >= 2 &&
        !seekInProgressRef.current
      ) {
        const elapsedFrames =
          (metadata.mediaTime - (trackForSync.sourceStartTime || 0)) * fps +
          trackForSync.startFrame;
        const newFrame = Math.floor(elapsedFrames);

        // Verify this frame update is consistent with the last seek
        const lastSeek = lastSeekStateRef.current;
        if (!lastSeek || Math.abs(newFrame - lastSeek.frame) > fps * 2) {
          // Large discrepancy detected or no recent seek - update timeline
          setCurrentFrame(newFrame);
        } else {
          // Normal playback progression
          setCurrentFrame(newFrame);
        }
      }
      handle = video.requestVideoFrameCallback(step);
    };

    handle = video.requestVideoFrameCallback(step);
    return () => video.cancelVideoFrameCallback(handle);
  }, [activeVideoTrack?.id, isPlaying, fps, setCurrentFrame]);

  // Sync video element on scrubbing/seek - MASTER SYNCHRONIZATION EFFECT
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack || !isVideoReady) return;

    // Detect segment transition (same media file, different trim offset)
    // This is critical for trim/cut operations where the track ID changes
    // but the underlying video source remains the same
    const currentTrackState = {
      id: activeVideoTrack.id,
      previewUrl: activeVideoTrack.previewUrl,
      sourceStartTime: activeVideoTrack.sourceStartTime || 0,
    };

    const isSegmentTransition =
      prevActiveTrackRef.current !== null &&
      prevActiveTrackRef.current.previewUrl === currentTrackState.previewUrl &&
      prevActiveTrackRef.current.id !== currentTrackState.id &&
      Math.abs(
        prevActiveTrackRef.current.sourceStartTime -
          currentTrackState.sourceStartTime,
      ) > 0.01;

    prevActiveTrackRef.current = currentTrackState;

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

    // Calculate target video time from timeline frame
    // This mapping is CRITICAL for trim/cut sync:
    // globalTimelineFrame -> relativeClipFrame -> sourceVideoTime
    const relativeFrame = Math.max(
      0,
      currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate trimmed boundaries to prevent seeking outside valid range
    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / fps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    // This ensures we never seek to pre-trim or post-trim content
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    const diff = Math.abs(video.currentTime - clampedTargetTime);
    const tolerance = 1 / fps;

    // Determine if this is a scrubbing operation (paused and seeking)
    const isScrubbing = !isPlaying && diff > tolerance;

    // Update scrubbing state
    if (isScrubbing !== isScrubbingRef.current) {
      isScrubbingRef.current = isScrubbing;
    }

    // Seek conditions:
    // 1. Trim boundaries changed (immediate seek required with buffer invalidation)
    // 2. Segment transition (same media, different offset - force buffer clear)
    // 3. Scrubbing/seeking while paused (immediate seek for responsiveness)
    // 4. Playing but significantly out of sync (debounced seek to avoid stuttering)
    const shouldSeek =
      trimChanged ||
      isSegmentTransition ||
      isScrubbing ||
      (isPlaying && diff > tolerance * 3);

    if (shouldSeek && diff > tolerance) {
      // Use immediate seek for trim changes, segment transitions, and scrubbing
      // Force buffer invalidation for trim/cut operations to prevent stale frames
      const useImmediate = trimChanged || isSegmentTransition || isScrubbing;
      const forceInvalidate = trimChanged || isSegmentTransition;

      queueSeek(clampedTargetTime, currentFrame, useImmediate, forceInvalidate);
    }
  }, [currentFrame, fps, isPlaying, activeVideoTrack, isVideoReady, queueSeek]);

  // Reset video ready state when track changes
  useEffect(() => {
    const video = videoRef.current;
    if (activeVideoTrack?.id) {
      // Check if this is a segment transition (same video file, different segment)
      const isSameVideoFile =
        prevActiveTrackRef.current !== null &&
        prevActiveTrackRef.current.previewUrl === activeVideoTrack.previewUrl;

      if (isSameVideoFile) {
        // Segment transition - video element is already loaded
        // Just ensure it's ready and force a seek to the new offset
        if (video && video.readyState >= 2) {
          console.log(
            `🔄 Segment transition detected: ${prevActiveTrackRef.current?.id} -> ${activeVideoTrack.id}`,
            `sourceStartTime: ${prevActiveTrackRef.current?.sourceStartTime}s -> ${activeVideoTrack.sourceStartTime}s`,
          );
          // Video is already loaded, just mark as ready
          setIsVideoReady(true);
        }
      } else {
        // Different video file - full reload required
        console.log(
          `🎬 Track changed to new video: ${activeVideoTrack.id}`,
          `sourceStartTime: ${activeVideoTrack.sourceStartTime}s`,
        );
        setIsVideoReady(false);
      }

      setVideoHealth({
        consecutiveBlackFrames: 0,
        lastFrameCheck: 0,
        recoveryAttempts: 0,
        lastSeekTime: Date.now(),
      });

      // Force video element check and reload if needed (handles undo/redo restoration)
      if (video && activeVideoTrack.previewUrl && !isSameVideoFile) {
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
