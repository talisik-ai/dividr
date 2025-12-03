import { useCallback, useEffect, useRef, useState } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { TrimState } from '../core/types';

/**
 * Hook for managing video element playback synchronization with enhanced reliability
 *
 * FIXED: Black frame flicker at segment boundaries
 * Key changes:
 * 1. Never reset isVideoReady during playback for same-source segments
 * 2. Skip seeks for continuous playback through cuts (same source file)
 * 3. Cache metadata per source URL, not per track ID
 * 4. Log segment transitions for debugging
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

// Cache for video metadata per source URL
interface VideoMetadataCache {
  duration: number;
  videoWidth: number;
  videoHeight: number;
  loadedAt: number;
}

const videoMetadataCache = new Map<string, VideoMetadataCache>();

// Debug logging flag - set to true to enable detailed logs
const DEBUG_SEGMENT_TRANSITIONS = true;

function logSegmentTransition(message: string, data?: any) {
  if (DEBUG_SEGMENT_TRANSITIONS) {
    console.log(`[VideoPlayback:SegmentTransition] ${message}`, data || '');
  }
}

export function useVideoPlayback({
  videoRef,
  activeVideoTrack,
  independentAudioTrack,
  currentFrame,
  fps, // Display FPS from source video (passed from VideoBlobPreview)
  isPlaying,
  isMuted,
  volume,
  playbackRate,
  setCurrentFrame,
  allTracks = [],
}: UseVideoPlaybackProps) {
  // Use display FPS from source video for frontend rendering
  const displayFps = fps;
  // Track previous trim state to detect actual trim changes
  const prevVideoTrimRef = useRef<TrimState | null>(null);

  // Track the last active video track to detect segment transitions
  const prevActiveTrackRef = useRef<{
    id: string;
    previewUrl: string;
    sourceStartTime: number;
  } | null>(null);

  // Track the previous track ID specifically for detecting clip transitions during playback
  const prevActiveTrackIdRef = useRef<string | undefined>(undefined);

  // NEW: Track the previous source URL to detect actual source file changes
  const prevSourceUrlRef = useRef<string | undefined>(undefined);

  // NEW: Track if we're in continuous playback mode (crossing segments of same source)
  const continuousPlaybackRef = useRef<boolean>(false);

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

  // NEW: Track last successful frame render to detect actual black frames
  const lastRenderedFrameRef = useRef<number>(-1);

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
      const tolerance = 1 / displayFps;

      if (video.readyState >= 2 && diff > tolerance) {
        // Mark seek in progress to prevent circular updates
        seekInProgressRef.current = true;

        logSegmentTransition('Performing seek', {
          from: video.currentTime,
          to: targetTime,
          diff,
          immediate,
          forceInvalidate,
        });

        // Buffer invalidation for trim edits only
        // Clear decoder buffer to force fresh decode at new trim position
        // NOTE: We don't do this for clip transitions to prevent black frames
        if (forceInvalidate) {
          // Micro-seek to clear decoder buffer and force fresh decode
          // This prevents showing stale frames at trim boundaries
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
    [displayFps],
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

    setVideoHealth((prev) => ({
      ...prev,
      recoveryAttempts: prev.recoveryAttempts + 1,
    }));

    // Force reload current frame
    const relativeFrame = Math.max(
      0,
      currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / displayFps;
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
    displayFps,
    isPlaying,
    performSeek,
  ]);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    const sourceUrl = activeVideoTrack.previewUrl || activeVideoTrack.source;

    // Check if metadata is already cached for this source
    const cachedMetadata = sourceUrl ? videoMetadataCache.get(sourceUrl) : null;

    if (cachedMetadata) {
      logSegmentTransition('Using cached metadata', {
        sourceUrl,
        cachedMetadata,
      });
    } else if (sourceUrl) {
      // Cache the metadata
      const metadata: VideoMetadataCache = {
        duration: video.duration,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        loadedAt: Date.now(),
      };
      videoMetadataCache.set(sourceUrl, metadata);
      logSegmentTransition('Cached new metadata', {
        sourceUrl,
        metadata,
      });
    }

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
    const trackTime = relativeFrame / displayFps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / displayFps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    // Seek immediately to correct position
    video.currentTime = clampedTargetTime;

    // Auto play if timeline is playing
    // CRITICAL: Resume playback immediately to ensure smooth track transitions
    if (isPlaying) {
      video.muted = isMuted || !!independentAudioTrack;
      // Try to play even if readyState < 3 to enable faster transitions
      video.play().catch(() => {
        /* ignore */
      });
    }
  }, [
    activeVideoTrack,
    currentFrame,
    displayFps,
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
  // OPTIMIZED: Only runs when paused to avoid performance overhead during playback
  useEffect(() => {
    const video = videoRef.current;
    // Only run black frame detection when paused (performance optimization)
    if (!video || !activeVideoTrack || !isVideoReady || isPlaying) return;

    let handle: number;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = 32;
    canvas.height = 32;

    let checkCount = 0;
    const maxChecks = 10; // Limit checks to prevent endless loop

    const checkForBlackFrame = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      if (!video || video.readyState < 2 || checkCount >= maxChecks) {
        return; // Stop checking after max attempts
      }

      checkCount++;

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

        if (isBlackFrame && shouldHaveContent) {
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
          // Stop checking once we have valid content
          checkCount = maxChecks;
        }
      } catch (err) {
        // Ignore canvas errors
      }

      // Continue checking if still within limit
      if (checkCount < maxChecks) {
        handle = video.requestVideoFrameCallback(checkForBlackFrame);
      }
    };

    handle = video.requestVideoFrameCallback(checkForBlackFrame);
    return () => {
      if (handle) {
        video.cancelVideoFrameCallback(handle);
      }
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
          (metadata.mediaTime - (trackForSync.sourceStartTime || 0)) *
            displayFps +
          trackForSync.startFrame;
        const newFrame = Math.floor(elapsedFrames);

        // Update last rendered frame for tracking
        lastRenderedFrameRef.current = newFrame;

        // Verify this frame update is consistent with the last seek
        const lastSeek = lastSeekStateRef.current;
        if (!lastSeek || Math.abs(newFrame - lastSeek.frame) > displayFps * 2) {
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
  }, [activeVideoTrack?.id, isPlaying, displayFps, setCurrentFrame]);

  // Sync video element on scrubbing/seek - MASTER SYNCHRONIZATION EFFECT
  // FIXED: Prevent unnecessary seeks at segment boundaries during continuous playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack || !isVideoReady) return;

    const currentSourceUrl =
      activeVideoTrack.previewUrl || activeVideoTrack.source;

    // Calculate target video time from timeline frame
    // This mapping is CRITICAL for trim/cut sync:
    // globalTimelineFrame -> relativeClipFrame -> sourceVideoTime
    const relativeFrame = Math.max(
      0,
      currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / displayFps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate the actual current video position (where video SHOULD be)
    const diff = Math.abs(video.currentTime - targetTime);
    const tolerance = 1 / displayFps;

    // Track state changes
    const currentTrackState = {
      id: activeVideoTrack.id,
      previewUrl: activeVideoTrack.previewUrl,
      sourceStartTime: activeVideoTrack.sourceStartTime || 0,
    };

    // Detect ACTUAL source file change (different video file loaded)
    const isSourceFileChange =
      prevSourceUrlRef.current !== undefined &&
      prevSourceUrlRef.current !== currentSourceUrl;

    // Detect clip/segment transition (track ID changed, regardless of source file)
    // This happens when:
    // 1. Moving from one clip to another (different segments)
    // 2. Crossing a cut point in the timeline
    const isClipTransition =
      prevActiveTrackIdRef.current !== undefined &&
      prevActiveTrackIdRef.current !== activeVideoTrack.id;

    // NEW: Detect if this is a continuous playback through segments of the SAME source
    const isSameSourceSegmentTransition =
      isClipTransition && !isSourceFileChange;

    // Log segment transitions for debugging
    if (isClipTransition) {
      logSegmentTransition('Clip transition detected', {
        from: prevActiveTrackIdRef.current,
        to: activeVideoTrack.id,
        isSourceFileChange,
        isSameSourceSegmentTransition,
        isPlaying,
        currentVideoTime: video.currentTime,
        targetTime,
        diff,
      });
    }

    // Update tracking refs
    prevActiveTrackRef.current = currentTrackState;
    prevActiveTrackIdRef.current = activeVideoTrack.id;
    prevSourceUrlRef.current = currentSourceUrl;

    // CRITICAL: Only detect trim changes when user is actively editing,
    // NOT when playback naturally crosses segment boundaries
    const currentTrimState: TrimState = {
      trackId: activeVideoTrack.id,
      startFrame: activeVideoTrack.startFrame,
      endFrame: activeVideoTrack.endFrame,
      sourceStartTime: activeVideoTrack.sourceStartTime || 0,
    };

    // User-initiated trim change detection (editing, not playback)
    const trimChanged =
      prevVideoTrimRef.current !== null &&
      prevVideoTrimRef.current.trackId === currentTrimState.trackId && // Same track
      (prevVideoTrimRef.current.startFrame !== currentTrimState.startFrame ||
        prevVideoTrimRef.current.endFrame !== currentTrimState.endFrame ||
        prevVideoTrimRef.current.sourceStartTime !==
          currentTrimState.sourceStartTime);

    prevVideoTrimRef.current = currentTrimState;

    // Determine if this is a scrubbing operation (paused and seeking)
    const isScrubbing = !isPlaying && diff > tolerance;

    // Update scrubbing state
    if (isScrubbing !== isScrubbingRef.current) {
      isScrubbingRef.current = isScrubbing;
    }

    // PROFESSIONAL PLAYBACK LOGIC:
    // During continuous playback, let the browser's video decoder handle
    // playback naturally. Only seek when absolutely necessary.

    // NEW: For same-source segment transitions during playback, DO NOT SEEK
    // The video decoder is already at the correct position since it's the same file
    // playing continuously. The only difference is the track metadata (startFrame, etc.)
    if (isSameSourceSegmentTransition && isPlaying) {
      logSegmentTransition('Skipping seek for same-source segment transition', {
        videoCurrentTime: video.currentTime,
        targetTime,
        diff,
      });

      // The video is already playing the correct content - just update refs
      // and let requestVideoFrameCallback handle timeline sync
      continuousPlaybackRef.current = true;

      // Ensure video is still playing
      if (video.paused && video.readyState >= 3) {
        video.play().catch(console.warn);
      }

      return; // Exit early - no seek needed
    }

    // SEEK DECISION LOGIC (OPTIMIZED FOR SMOOTH PLAYBACK):
    // Only seek when one of these conditions is true:
    // 1. User is scrubbing while paused
    // 2. User manually trimmed the current track (editing operation)
    // 3. Video is paused and out of sync
    // 4. Source file changed (different video)
    //
    // CRITICAL: DO NOT SEEK for:
    // - Same-source segment transitions during playback (handled above)
    // - Continuous playback through cuts of the same source
    const needsSeek =
      isScrubbing || // User scrubbing while paused
      (trimChanged && !isSourceFileChange) || // User edited trim points (but not source change)
      (!isPlaying && diff > tolerance && !isSourceFileChange) || // Paused and out of sync (but not source change)
      isSourceFileChange; // Different video file loaded

    if (needsSeek && diff > tolerance) {
      logSegmentTransition('Seeking required', {
        reason: {
          isScrubbing,
          trimChanged,
          isSourceFileChange,
          isPausedAndOutOfSync: !isPlaying && diff > tolerance,
        },
        diff,
      });

      // Immediate seeks for user interactions, trim edits, and source changes
      const useImmediate = isScrubbing || trimChanged || isSourceFileChange;

      // Buffer invalidation ONLY for trim edits (user-initiated changes)
      // DO NOT invalidate for clip transitions - this causes black frame flashes
      const forceInvalidate = trimChanged && !isClipTransition;

      queueSeek(targetTime, currentFrame, useImmediate, forceInvalidate);
    }

    // Reset continuous playback flag
    continuousPlaybackRef.current = false;
  }, [
    currentFrame,
    displayFps,
    isPlaying,
    activeVideoTrack,
    isVideoReady,
    queueSeek,
  ]);

  // Reset video ready state when track changes
  // FIXED: Don't reset isVideoReady for same-source segment transitions during playback
  useEffect(() => {
    const video = videoRef.current;
    if (activeVideoTrack?.id) {
      const currentSourceUrl =
        activeVideoTrack.previewUrl || activeVideoTrack.source;

      // Check if this is a segment transition (same video file, different segment)
      const isSameVideoFile =
        prevSourceUrlRef.current !== undefined &&
        prevSourceUrlRef.current === currentSourceUrl;

      logSegmentTransition('Track change effect', {
        trackId: activeVideoTrack.id,
        isSameVideoFile,
        isPlaying,
        videoReadyState: video?.readyState,
        currentSourceUrl,
        prevSourceUrl: prevSourceUrlRef.current,
      });

      if (isSameVideoFile) {
        // Same source file - video element is already loaded with correct content
        // Just ensure it's marked as ready
        if (video && video.readyState >= 2) {
          setIsVideoReady(true);

          // If playing, ensure video continues playing
          if (isPlaying && video.paused) {
            video.play().catch(console.warn);
          }
        }
      } else {
        // Different video file - reload required
        // CRITICAL FIX: Don't set isVideoReady to false during playback
        // This prevents stuttering when transitioning between tracks
        // The sync effect will handle the transition smoothly
        if (!isPlaying) {
          // Only block sync when paused (safe to wait for full load)
          setIsVideoReady(false);
        }
        // During playback, keep isVideoReady true to allow smooth transitions
      }

      setVideoHealth({
        consecutiveBlackFrames: 0,
        lastFrameCheck: 0,
        recoveryAttempts: 0,
        lastSeekTime: Date.now(),
      });

      // Force video element check and reload if needed (handles undo/redo restoration)
      // Only do this for actual source file changes
      if (video && activeVideoTrack.previewUrl && !isSameVideoFile) {
        // If video element doesn't have the correct source, force reload
        if (!video.src || video.readyState === 0) {
          logSegmentTransition('Force loading new source', {
            newSource: activeVideoTrack.previewUrl,
          });
          video.src = activeVideoTrack.previewUrl;
          video.load();
        }
      }
    }
  }, [activeVideoTrack?.id, activeVideoTrack?.previewUrl, videoRef, isPlaying]);

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
