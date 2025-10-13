import NewDark from '@/frontend/assets/logo/New-Dark.svg';
import New from '@/frontend/assets/logo/New-Light.svg';
import { useTheme } from '@/frontend/providers/ThemeProvider';
import { cn } from '@/frontend/utils/utils';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePreviewShortcuts } from '../stores/videoEditor/hooks/usePreviewShortcuts';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';

interface VideoBlobPreviewProps {
  className?: string;
}

export const VideoBlobPreview: React.FC<VideoBlobPreviewProps> = ({
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragActive, setDragActive] = useState(false);
  const [isPreviewFocused, setIsPreviewFocused] = useState(false);

  // Initialize preview shortcuts
  usePreviewShortcuts(isPreviewFocused);

  // Pan/drag state
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  // Pinch zoom state
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialScale: number;
    centerX: number;
    centerY: number;
  } | null>(null);

  // Track previous trim state to detect actual trim changes (not just playback progression)
  const prevVideoTrimRef = useRef<{
    trackId: string;
    startFrame: number;
    endFrame: number;
    sourceStartTime: number;
  } | null>(null);
  const prevAudioTrimRef = useRef<{
    trackId: string;
    startFrame: number;
    endFrame: number;
    sourceStartTime: number;
  } | null>(null);

  const { theme } = useTheme();
  const {
    tracks,
    timeline,
    playback,
    preview,
    textStyle,
    getTextStyleForSubtitle,
    importMediaFromDialog,
    importMediaToTimeline,
    setCurrentFrame,
    setPreviewPan,
    setPreviewScale,
    setPreviewInteractionMode,
  } = useVideoEditorStore();

  // Active video track for visual display (must be visible)
  const activeVideoTrack = React.useMemo(() => {
    try {
      return tracks.find(
        (track) =>
          track.type === 'video' &&
          track.visible &&
          track.previewUrl &&
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame,
      );
    } catch {
      return undefined;
    }
  }, [tracks, timeline.currentFrame]);

  // Helper function to check if a linked audio track has a position gap from its video counterpart
  const hasPositionGap = useCallback(
    (audioTrack: VideoTrack) => {
      if (!audioTrack.isLinked || !audioTrack.linkedTrackId) return false;

      const linkedVideoTrack = tracks.find(
        (t) => t.id === audioTrack.linkedTrackId,
      );
      if (!linkedVideoTrack) return false;

      // Check if there's a significant gap between the linked tracks
      const gap = Math.abs(audioTrack.startFrame - linkedVideoTrack.startFrame);
      return gap > 0; // Any gap means they should be treated independently for preview
    },
    [tracks],
  );

  // Helper function to check if a linked video track has a position gap from its audio counterpart
  const hasPositionGapForVideo = useCallback(
    (videoTrack: VideoTrack) => {
      if (!videoTrack.isLinked || !videoTrack.linkedTrackId) return false;

      const linkedAudioTrack = tracks.find(
        (t) => t.id === videoTrack.linkedTrackId,
      );
      if (!linkedAudioTrack) return false;

      // Check if there's a significant gap between the linked tracks
      const gap = Math.abs(videoTrack.startFrame - linkedAudioTrack.startFrame);
      return gap > 0; // Any gap means they should be treated independently for preview
    },
    [tracks],
  );

  // Independent audio track for audio-only playback (separate from video)
  // Consider audio tracks that are either unlinked OR have their own extracted audio
  // OR are linked but have different positions (gaps) from their video counterpart
  const independentAudioTrack = React.useMemo(() => {
    try {
      const audioTrack = tracks.find(
        (track) =>
          track.type === 'audio' &&
          (!track.isLinked || track.previewUrl || hasPositionGap(track)) && // Unlinked OR has extracted audio OR has position gap
          !track.muted &&
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame,
      );

      if (audioTrack) {
        // If audio track has its own previewUrl (extracted audio), use it directly
        if (audioTrack.previewUrl) {
          console.log(
            `🎵 [IndependentAudio] Using extracted audio for track: ${audioTrack.id}`,
            `Src: ${audioTrack.previewUrl}`,
          );
          return audioTrack;
        }

        // Fallback: Find a video track with the same source to get the previewUrl
        const matchingVideoTrack = tracks.find(
          (track) =>
            track.type === 'video' &&
            track.source === audioTrack.source &&
            track.previewUrl,
        );

        // Return audio track with borrowed previewUrl if available
        return {
          ...audioTrack,
          previewUrl: matchingVideoTrack?.previewUrl || audioTrack.previewUrl,
        };
      }

      return undefined;
    } catch {
      return undefined;
    }
  }, [tracks, timeline.currentFrame]);

  // Video track that provides audio when no independent audio track exists
  const videoTrackWithAudio = React.useMemo(() => {
    try {
      // Use video track for audio if:
      // 1. There's no independent (unlinked) audio track, AND
      // 2. The video track itself is not muted, AND
      // 3. The video track is linked (has a linked audio track) OR there's no corresponding audio track
      // 4. The linked audio track doesn't have a position gap (should be synchronized)
      if (independentAudioTrack) return undefined;

      return tracks.find((track) => {
        if (track.type !== 'video' || !track.previewUrl || !track.isLinked)
          return false;

        // Check if the linked audio track is muted
        const linkedAudioTrack = tracks.find(
          (t) => t.id === track.linkedTrackId,
        );
        const isLinkedAudioMuted = linkedAudioTrack
          ? linkedAudioTrack.muted
          : false;

        return (
          !isLinkedAudioMuted && // Don't use video audio if linked audio is muted
          !hasPositionGapForVideo(track) && // Don't use video audio if linked audio has a gap
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame
        );
      });
    } catch {
      return undefined;
    }
  }, [tracks, timeline.currentFrame, independentAudioTrack]);

  // Combined audio track reference for compatibility with existing code
  const activeAudioTrack = independentAudioTrack || videoTrackWithAudio;

  // Add debug logs to segment/track detection
  useEffect(() => {
    if (activeVideoTrack) {
      console.log(
        '[DirectPreview] Timeline/frame changed. Current frame:',
        timeline.currentFrame,
        'Active video track:',
        activeVideoTrack.id,
        'Src:',
        activeVideoTrack.previewUrl,
        'Frames:',
        activeVideoTrack.startFrame,
        '-',
        activeVideoTrack.endFrame,
      );
    } else {
      console.log(
        '[DirectPreview] Timeline/frame changed. No active video track. Current frame:',
        timeline.currentFrame,
      );
    }

    if (independentAudioTrack) {
      console.log(
        '[DirectPreview] Independent audio track:',
        independentAudioTrack.id,
        'Source:',
        independentAudioTrack.source,
        'PreviewUrl:',
        independentAudioTrack.previewUrl,
        'Frames:',
        independentAudioTrack.startFrame,
        '-',
        independentAudioTrack.endFrame,
        'isLinked:',
        independentAudioTrack.isLinked,
      );
    }

    if (videoTrackWithAudio) {
      console.log(
        '[DirectPreview] Video track providing audio:',
        videoTrackWithAudio.id,
        'Src:',
        videoTrackWithAudio.previewUrl,
        'Frames:',
        videoTrackWithAudio.startFrame,
        '-',
        videoTrackWithAudio.endFrame,
        'isLinked:',
        videoTrackWithAudio.isLinked,
        'muted:',
        videoTrackWithAudio.muted,
      );
    }

    console.log(
      '[DirectPreview] Audio decision: independentAudioTrack =',
      !!independentAudioTrack,
      ', videoTrackWithAudio =',
      !!videoTrackWithAudio,
    );
  }, [activeVideoTrack, independentAudioTrack, timeline.currentFrame]);

  // Reset pan when video track changes or when there's no video
  useEffect(() => {
    // Reset pan to center when switching videos or when no video is present
    if (preview.panX !== 0 || preview.panY !== 0) {
      setPreviewPan(0, 0);
    }
  }, [activeVideoTrack?.id]);

  // Auto-reset pan and mode when zooming out
  useEffect(() => {
    if (preview.previewScale <= 1) {
      // When zooming to 100% or below, reset pan to center
      if (preview.panX !== 0 || preview.panY !== 0) {
        setPreviewPan(0, 0);
      }

      // Auto-switch to select mode when zooming out
      if (preview.interactionMode === 'pan') {
        setPreviewInteractionMode('select');
      }
    }
  }, [
    preview.previewScale,
    preview.panX,
    preview.panY,
    preview.interactionMode,
    setPreviewPan,
    setPreviewInteractionMode,
  ]);

  // Add effect to pause playback at the end of ALL tracks (not just video)
  useEffect(() => {
    if (!playback.isPlaying) return;

    // Find the last track of ANY type (video, audio, subtitle, image)
    const allTracks = tracks
      .filter((track) => track.visible) // Only consider visible tracks
      .sort((a, b) => a.endFrame - b.endFrame);
    const lastTrack = allTracks[allTracks.length - 1];

    if (lastTrack && timeline.currentFrame >= lastTrack.endFrame) {
      // Pause playback if we've reached or passed the end of the last track
      playback.isPlaying = false;
      // If you have a setPlayback or similar action, use that instead:
      // setPlayback((prev) => ({ ...prev, isPlaying: false }));
      // Or dispatch an action to pause playback
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    }
  }, [timeline.currentFrame, tracks, playback, videoRef, audioRef]);

  // Resize observer
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Content scale - calculates the preview size to fill the container while maintaining aspect ratio
  const calculateContentScale = useCallback(() => {
    // Use actual video dimensions if available, otherwise fall back to canvas dimensions
    const videoWidth = activeVideoTrack?.width || preview.canvasWidth;
    const videoHeight = activeVideoTrack?.height || preview.canvasHeight;

    const containerAspect = containerSize.width / containerSize.height;
    const videoAspect = videoWidth / videoHeight;

    let actualWidth = videoWidth;
    let actualHeight = videoHeight;

    if (containerSize.width > 0 && containerSize.height > 0) {
      // Calculate the maximum size that fits the container while maintaining aspect ratio
      if (containerAspect > videoAspect) {
        // Container is wider than video - fit to height
        const scale = containerSize.height / videoHeight;
        actualWidth = videoWidth * scale;
        actualHeight = containerSize.height;
      } else {
        // Container is taller than video - fit to width
        const scale = containerSize.width / videoWidth;
        actualWidth = containerSize.width;
        actualHeight = videoHeight * scale;
      }

      // Apply previewScale as a zoom multiplier on the fitted size
      // previewScale = 1 means fill the container (default behavior)
      // previewScale > 1 means zoom in
      // previewScale < 1 means zoom out
      actualWidth *= preview.previewScale;
      actualHeight *= preview.previewScale;
    }
    return { actualWidth, actualHeight };
  }, [
    containerSize,
    activeVideoTrack?.width,
    activeVideoTrack?.height,
    preview.canvasWidth,
    preview.canvasHeight,
    preview.previewScale,
  ]);

  // Subtitle tracks
  const getActiveSubtitleTracks = useCallback(() => {
    const currentFrame = timeline.currentFrame;
    return tracks.filter(
      (track) =>
        track.type === 'subtitle' &&
        track.visible &&
        currentFrame >= track.startFrame &&
        currentFrame <= track.endFrame &&
        track.subtitleText,
    );
  }, [tracks, timeline.currentFrame]);

  // Add handler for video loadedmetadata
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    // Seek to correct position based on the video track
    const relativeFrame = Math.max(
      0,
      timeline.currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / timeline.fps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    console.log('[DirectPreview] Video loadedmetadata - seeking to:', {
      currentFrame: timeline.currentFrame,
      trackStartFrame: activeVideoTrack.startFrame,
      trackEndFrame: activeVideoTrack.endFrame,
      relativeFrame,
      trackTime,
      sourceStartTime: activeVideoTrack.sourceStartTime || 0,
      trimmedEndTime,
      targetTime,
      clampedTargetTime,
      videoDuration: video.duration,
    });

    video.currentTime = clampedTargetTime;

    // Auto play if timeline is playing
    if (playback.isPlaying && video.paused) {
      video.muted = playback.muted || !!independentAudioTrack; // mute video if independent audio
      video.play().catch(() => {
        /* hello */
      });
    }
  }, [
    activeVideoTrack,
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    playback.muted,
    independentAudioTrack,
  ]);

  // Add handler for audio loadedmetadata
  const handleAudioLoadedMetadata = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Only seek audio if timeline position is within the audio track's range
    const isWithinAudioRange =
      timeline.currentFrame >= independentAudioTrack.startFrame &&
      timeline.currentFrame < independentAudioTrack.endFrame;

    if (isWithinAudioRange) {
      // Seek to correct position based on the audio track
      const relativeFrame =
        timeline.currentFrame - independentAudioTrack.startFrame;
      const trackTime = relativeFrame / timeline.fps;
      const targetTime =
        (independentAudioTrack.sourceStartTime || 0) + trackTime;

      // Calculate the trimmed end time based on track duration
      const trackDurationSeconds =
        (independentAudioTrack.endFrame - independentAudioTrack.startFrame) /
        timeline.fps;
      const trimmedEndTime =
        (independentAudioTrack.sourceStartTime || 0) + trackDurationSeconds;

      // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
      audio.currentTime = Math.max(
        independentAudioTrack.sourceStartTime || 0,
        Math.min(targetTime, Math.min(trimmedEndTime, audio.duration || 0)),
      );
      console.log(
        '[DirectPreview] Audio metadata loaded - seeking to position within range:',
        audio.currentTime,
        'trimmedEndTime:',
        trimmedEndTime,
      );
    } else {
      console.log(
        '[DirectPreview] Audio metadata loaded - timeline outside audio range, not seeking',
      );
    }

    // Auto play if timeline is playing
    if (playback.isPlaying && audio.paused) {
      audio.muted = playback.muted || independentAudioTrack.muted;
      audio.play().catch(() => {
        /* hello */
      });
    }
  }, [
    independentAudioTrack,
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    playback.muted,
  ]);

  // Keep the simplified canplay effect for auto-play only
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleAutoPlay() {
      if (playback.isPlaying && video.paused) {
        video.muted = playback.muted;
        video.play().catch(() => {
          /* hello */
        });
      }
    }

    video.addEventListener('canplay', handleAutoPlay);
    return () => video.removeEventListener('canplay', handleAutoPlay);
  }, [playback.isPlaying, playback.muted]);

  // Sync play/pause & volume for video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (playback.isPlaying) {
        if (video.paused && video.readyState >= 3) {
          console.log(
            '[DirectPreview] Resuming video playback (playback.isPlaying && video.paused)',
          );
          video.play().catch(console.warn);
        }
      } else {
        if (!video.paused) {
          console.log(
            '[DirectPreview] Pausing video playback (playback.isPlaying is false)',
          );
          video.pause();
        }
      }

      // Handle video volume
      // Mute video if:
      // 1. Global playback is muted, OR
      // 2. There's an independent (unlinked) audio track playing, OR
      // 3. The video track itself is muted, OR
      // 4. There's no audio track at all (neither independent nor video-based)
      const shouldMuteVideo =
        playback.muted ||
        !!independentAudioTrack ||
        (activeVideoTrack?.muted ?? false) ||
        (!independentAudioTrack && !videoTrackWithAudio); // Mute when no audio source

      console.log('[DirectPreview] Video volume decision:', {
        playbackMuted: playback.muted,
        hasIndependentAudio: !!independentAudioTrack,
        videoTrackMuted: activeVideoTrack?.muted ?? false,
        hasVideoTrackWithAudio: !!videoTrackWithAudio,
        noAudioAtAll: !independentAudioTrack && !videoTrackWithAudio,
        shouldMuteVideo,
        finalVolume: shouldMuteVideo ? 0 : Math.min(playback.volume, 1),
      });

      video.volume = shouldMuteVideo ? 0 : Math.min(playback.volume, 1);
      video.playbackRate = Math.max(0.25, Math.min(playback.playbackRate, 4));

      // Ensure video plays at the correct rate to match timeline
      console.log(
        '[DirectPreview] Video playback rate set to:',
        video.playbackRate,
      );
    } catch (err) {
      console.warn('Video sync error:', err);
    }
  }, [
    playback.isPlaying,
    playback.volume,
    playback.muted,
    playback.playbackRate,
    activeVideoTrack?.id,
    activeVideoTrack?.previewUrl,
    activeVideoTrack?.muted,
    independentAudioTrack,
  ]);

  // Sync play/pause & volume for independent audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Check if timeline position is within the audio track's range
    const isWithinAudioRange =
      timeline.currentFrame >= independentAudioTrack.startFrame &&
      timeline.currentFrame < independentAudioTrack.endFrame;

    try {
      if (playback.isPlaying) {
        // Only play audio if timeline position is within audio track's range
        if (isWithinAudioRange && audio.paused && audio.readyState >= 3) {
          console.log(
            '[DirectPreview] Resuming audio playback (independent audio track) - within range',
          );
          audio.play().catch(console.warn);
        } else if (!isWithinAudioRange && !audio.paused) {
          console.log(
            '[DirectPreview] Pausing audio - timeline outside audio track range',
            `Frame: ${timeline.currentFrame}, Audio range: ${independentAudioTrack.startFrame}-${independentAudioTrack.endFrame}`,
          );
          audio.pause();
        }
      } else {
        if (!audio.paused) {
          console.log(
            '[DirectPreview] Pausing audio playback (independent audio track)',
          );
          audio.pause();
        }
      }

      // Handle audio volume
      const shouldMute = playback.muted || independentAudioTrack.muted;
      audio.volume = shouldMute ? 0 : Math.min(playback.volume, 1);
      audio.playbackRate = Math.max(0.25, Math.min(playback.playbackRate, 4));
    } catch (err) {
      console.warn('Audio sync error:', err);
    }
  }, [
    playback.isPlaying,
    playback.volume,
    playback.muted,
    playback.playbackRate,
    independentAudioTrack?.id,
    independentAudioTrack?.muted,
    timeline.currentFrame, // Added to check range on timeline changes
  ]);

  // Sync timeline to video frames - DISABLED during timeline-controlled playback
  useEffect(() => {
    const video = videoRef.current;
    const trackForSync = activeVideoTrack || activeAudioTrack;
    if (!video || !trackForSync || playback.isPlaying) return; // Don't sync during playback

    let handle: number;
    const fps = timeline.fps;

    const step = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      // Only sync when video is playing but timeline playback is NOT active
      if (!video.paused && !playback.isPlaying) {
        const elapsedFrames =
          (metadata.mediaTime - (trackForSync.sourceStartTime || 0)) * fps +
          trackForSync.startFrame;
        setCurrentFrame(Math.floor(elapsedFrames));
      }
      handle = video.requestVideoFrameCallback(step);
    };

    handle = video.requestVideoFrameCallback(step);
    return () => video.cancelVideoFrameCallback(handle);
  }, [
    activeVideoTrack?.id,
    activeAudioTrack?.id,
    playback.isPlaying,
    timeline.fps,
    setCurrentFrame,
  ]);

  // Sync video element on scrubbing/seek (user interaction and track changes)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    // Detect if trim boundaries actually changed (not just playback progression)
    const currentTrimState = {
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

    // Update the ref for next comparison
    prevVideoTrimRef.current = currentTrimState;

    const relativeFrame = Math.max(
      0,
      timeline.currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (activeVideoTrack.endFrame - activeVideoTrack.startFrame) / timeline.fps;
    const trimmedEndTime =
      (activeVideoTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, video.duration || 0)),
    );

    const diff = Math.abs(video.currentTime - clampedTargetTime);
    const tolerance = 1 / timeline.fps; // One frame tolerance

    // Seek logic:
    // 1. If trim boundaries changed: ALWAYS seek (even during playback)
    // 2. If NOT playing (scrubbing): Seek if position differs
    // 3. If playing normally: Let the video play naturally (don't seek on every frame)
    const shouldSeek = trimChanged || (!playback.isPlaying && diff > tolerance);

    if (shouldSeek && diff > tolerance) {
      console.log('[DirectPreview] Seeking video:', {
        reason: trimChanged ? 'trim changed' : 'scrubbing',
        clampedTargetTime,
        currentVideoTime: video.currentTime,
        diff,
      });
      video.currentTime = clampedTargetTime;
    }
  }, [
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    activeVideoTrack,
  ]);

  // Sync independent audio element on scrubbing/seek (user interaction and track changes)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;

    // Only seek audio if timeline position is within the audio track's range
    const isWithinAudioRange =
      timeline.currentFrame >= independentAudioTrack.startFrame &&
      timeline.currentFrame < independentAudioTrack.endFrame;

    if (!isWithinAudioRange) {
      return; // Don't seek audio when timeline is outside its range
    }

    // Detect if trim boundaries actually changed (not just playback progression)
    const currentTrimState = {
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

    // Update the ref for next comparison
    prevAudioTrimRef.current = currentTrimState;

    const relativeFrame =
      timeline.currentFrame - independentAudioTrack.startFrame;
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (independentAudioTrack.sourceStartTime || 0) + trackTime;

    // Calculate the trimmed end time based on track duration
    const trackDurationSeconds =
      (independentAudioTrack.endFrame - independentAudioTrack.startFrame) /
      timeline.fps;
    const trimmedEndTime =
      (independentAudioTrack.sourceStartTime || 0) + trackDurationSeconds;

    // Clamp to trimmed boundaries [sourceStartTime, trimmedEndTime]
    const clampedTargetTime = Math.max(
      independentAudioTrack.sourceStartTime || 0,
      Math.min(targetTime, Math.min(trimmedEndTime, audio.duration || 0)),
    );

    const diff = Math.abs(audio.currentTime - clampedTargetTime);
    const tolerance = 1 / timeline.fps; // One frame tolerance

    // Seek logic:
    // 1. If trim boundaries changed: ALWAYS seek (even during playback)
    // 2. If NOT playing (scrubbing): Seek if position differs
    // 3. If playing normally: Let the audio play naturally (don't seek on every frame)
    const shouldSeek = trimChanged || (!playback.isPlaying && diff > tolerance);

    if (shouldSeek && diff > tolerance) {
      console.log('[DirectPreview] Seeking audio:', {
        reason: trimChanged ? 'trim changed' : 'scrubbing',
        clampedTargetTime,
        currentAudioTime: audio.currentTime,
        diff,
      });
      audio.currentTime = clampedTargetTime;
    }
  }, [
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    independentAudioTrack?.id,
    independentAudioTrack?.startFrame,
    independentAudioTrack?.endFrame,
    independentAudioTrack?.sourceStartTime,
    independentAudioTrack?.sourceDuration,
  ]);

  // Drag/drop
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        console.log(`🎯 Dropping ${files.length} files onto video preview`);
        const result = await importMediaToTimeline(files);
        if (result.success) {
          console.log(
            `✅ Successfully imported ${result.importedFiles.length} files to timeline from video preview`,
          );
        } else {
          console.error(
            '❌ Failed to import files to timeline from video preview',
          );
        }
      }
    },
    [importMediaToTimeline],
  );

  // Pan/drag handlers for zoomed preview
  const handlePanStart = useCallback(
    (e: React.MouseEvent) => {
      // Only enable panning when in pan mode and zoomed in
      if (preview.interactionMode !== 'pan') return;
      if (preview.previewScale <= 1) return;

      // Don't start panning if clicking on the placeholder
      if (!activeVideoTrack && !activeAudioTrack) return;

      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: preview.panX,
        panY: preview.panY,
      };
    },
    [
      preview.interactionMode,
      preview.previewScale,
      preview.panX,
      preview.panY,
      activeVideoTrack,
      activeAudioTrack,
    ],
  );

  const handlePanMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning || !panStartRef.current) return;

      const deltaX = e.clientX - panStartRef.current.x;
      const deltaY = e.clientY - panStartRef.current.y;

      const newPanX = panStartRef.current.panX + deltaX;
      const newPanY = panStartRef.current.panY + deltaY;

      setPreviewPan(newPanX, newPanY);
    },
    [isPanning, setPreviewPan],
  );

  const handlePanEnd = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Wheel zoom handler with cursor-based pivot
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      // Support both Ctrl+Scroll and Alt+Scroll for zooming
      if (!e.ctrlKey && !e.altKey && !e.metaKey) return;

      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      // Get cursor position relative to container
      const rect = container.getBoundingClientRect();
      const cursorX = e.clientX - rect.left;
      const cursorY = e.clientY - rect.top;

      // Calculate cursor position in preview space (accounting for current pan)
      const previewCenterX = rect.width / 2;
      const previewCenterY = rect.height / 2;

      // Position relative to center, accounting for current pan
      const relativeX = cursorX - previewCenterX - preview.panX;
      const relativeY = cursorY - previewCenterY - preview.panY;

      // Determine zoom direction and factor
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      const oldScale = preview.previewScale;
      const newScale = Math.max(0.1, Math.min(oldScale * zoomFactor, 8));

      // If scale didn't actually change (hit limits), don't adjust pan
      if (newScale === oldScale) return;

      // Calculate new pan to keep cursor point stationary
      // The point under the cursor should remain in the same visual position
      const scaleDelta = newScale / oldScale - 1;
      const newPanX = preview.panX - relativeX * scaleDelta;
      const newPanY = preview.panY - relativeY * scaleDelta;

      // Apply zoom and adjust pan
      setPreviewScale(newScale);
      setPreviewPan(newPanX, newPanY);
    },
    [
      preview.previewScale,
      preview.panX,
      preview.panY,
      setPreviewScale,
      setPreviewPan,
    ],
  );

  // Pinch zoom handlers for touchpad/touchscreen
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2) {
        // Start pinch gesture
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );

        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        pinchStateRef.current = {
          initialDistance: distance,
          initialScale: preview.previewScale,
          centerX,
          centerY,
        };
      }
    },
    [preview.previewScale],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStateRef.current) {
        e.preventDefault();

        const touch1 = e.touches[0];
        const touch2 = e.touches[1];

        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY,
        );

        const container = containerRef.current;
        if (!container) return;

        const rect = container.getBoundingClientRect();
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;

        // Calculate scale change
        const scaleChange = distance / pinchStateRef.current.initialDistance;
        const newScale = Math.max(
          0.1,
          Math.min(pinchStateRef.current.initialScale * scaleChange, 8),
        );

        // Calculate cursor position relative to container
        const cursorX = centerX - rect.left;
        const cursorY = centerY - rect.top;

        // Position relative to center
        const previewCenterX = rect.width / 2;
        const previewCenterY = rect.height / 2;
        const relativeX = cursorX - previewCenterX - preview.panX;
        const relativeY = cursorY - previewCenterY - preview.panY;

        // Calculate new pan to keep pinch center stationary
        const oldScale = preview.previewScale;
        if (newScale !== oldScale) {
          const scaleDelta = newScale / oldScale - 1;
          const newPanX = preview.panX - relativeX * scaleDelta;
          const newPanY = preview.panY - relativeY * scaleDelta;

          setPreviewScale(newScale);
          setPreviewPan(newPanX, newPanY);
        }
      }
    },
    [
      preview.previewScale,
      preview.panX,
      preview.panY,
      setPreviewScale,
      setPreviewPan,
    ],
  );

  const handleTouchEnd = useCallback(() => {
    pinchStateRef.current = null;
  }, []);

  // Add global mouse up listener for panning
  useEffect(() => {
    if (!isPanning) return;

    const handleGlobalMouseUp = () => {
      handlePanEnd();
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isPanning, handlePanEnd]);

  const { actualWidth, actualHeight } = calculateContentScale();

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden rounded-lg',
        className,
        'bg-zinc-100 dark:bg-zinc-900',
        // Change cursor based on interaction mode and state
        (() => {
          if (!activeVideoTrack && !activeAudioTrack) return 'cursor-default';

          // Pan mode cursor
          if (preview.interactionMode === 'pan' && preview.previewScale > 1) {
            return isPanning ? 'cursor-grabbing' : 'cursor-grab';
          }

          // Select mode or zoomed out
          return 'cursor-default';
        })(),
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      onMouseDown={handlePanStart}
      onMouseMove={handlePanMove}
      onMouseUp={handlePanEnd}
      onMouseLeave={() => {
        handlePanEnd();
        setIsPreviewFocused(false);
      }}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onFocus={() => setIsPreviewFocused(true)}
      onBlur={() => setIsPreviewFocused(false)}
      onMouseEnter={() => setIsPreviewFocused(true)}
      tabIndex={0}
    >
      {/* Video */}
      {(activeVideoTrack || activeAudioTrack) && (
        <div
          className="absolute inset-0 flex items-center justify-center transition-[width,height,left,top] duration-150 ease-out"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: `calc(50% + ${preview.panX}px)`,
            top: `calc(50% + ${preview.panY}px)`,
            transform: 'translate(-50%, -50%)',
            // Hide video visually if track is not visible, but keep element for audio
            opacity: activeVideoTrack ? 1 : 0,
            pointerEvents: activeVideoTrack ? 'auto' : 'none',
          }}
        >
          <video
            ref={videoRef}
            key={`video-${activeVideoTrack?.previewUrl || 'no-video'}`}
            className="w-full h-full object-contain"
            playsInline
            controls={false}
            preload="metadata"
            src={activeVideoTrack?.previewUrl}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>
      )}

      {/* Independent Audio Element */}
      {independentAudioTrack && independentAudioTrack.previewUrl && (
        <audio
          ref={audioRef}
          key={`audio-${independentAudioTrack.previewUrl}-${independentAudioTrack.startFrame}`}
          preload="metadata"
          src={independentAudioTrack.previewUrl}
          onLoadedMetadata={handleAudioLoadedMetadata}
          style={{ display: 'none' }}
        />
      )}

      {/* Subtitles */}
      {(() => {
        const activeSubs = getActiveSubtitleTracks();
        if (activeSubs.length === 0) return null;

        // Use actual video height for subtitle sizing
        const videoHeight = activeVideoTrack?.height || preview.canvasHeight;

        return (
          <div
            className="absolute inset-0 pointer-events-none transition-[width,height,left,top] duration-150 ease-out"
            style={{
              width: actualWidth,
              height: actualHeight,
              left: `calc(50% + ${preview.panX}px)`,
              top: `calc(50% + ${preview.panY}px)`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            {activeSubs.map((track) => {
              const appliedStyle = getTextStyleForSubtitle(
                textStyle.activeStyle,
              );
              return (
                <div
                  key={track.id}
                  className="text-white text-center absolute bottom-10 left-0 right-0 bg-secondary dark:bg-secondary-dark"
                  style={{
                    // Match FFmpeg's ASS subtitle styling with applied text styles
                    fontSize: `${Math.max(18, videoHeight * 0.045)}px`, // Slightly larger for better visibility
                    fontFamily: appliedStyle.fontFamily, // Apply selected font family
                    fontWeight: appliedStyle.fontWeight, // Apply selected font weight
                    fontStyle: appliedStyle.fontStyle, // Apply selected font style
                    textTransform: appliedStyle.textTransform, // Apply text transform
                    lineHeight: '1.2', // Slightly more line height for readability
                    textShadow: 'none', // No outline to match FFmpeg output
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap', // Preserve line breaks exactly like FFmpeg
                    color: '#FFFFFF', // Pure white, FFmpeg default
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    padding: '2px 0',
                    margin: '0 auto',
                    maxWidth: '90%',
                  }}
                >
                  {track.subtitleText}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Placeholder */}
      {!activeAudioTrack && tracks.length === 0 && (
        <div
          className={cn(
            'absolute inset-0 flex flex-col gap-2 items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200',
            dragActive
              ? 'border-secondary bg-secondary/10'
              : 'border-accent hover:!border-secondary hover:bg-secondary/10',
          )}
          onClick={async () => {
            const result = await importMediaFromDialog();
            if (result.success && result.importedFiles.length > 0) {
              console.log(
                'Files imported successfully from placeholder click:',
                result.importedFiles,
              );
            }
          }}
        >
          <img src={theme === 'dark' ? NewDark : New} alt="New Project" />
          <p className="text-sm text-muted-foreground">
            Click to browse or drag and drop files here
          </p>
        </div>
      )}
    </div>
  );
};
