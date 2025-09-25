import NewDark from '@/Assets/Logo/New-Dark.svg';
import New from '@/Assets/Logo/New-Light.svg';
import { cn } from '@/Lib/utils';
import { useTheme } from '@/Utility/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';

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

      return tracks.find(
        (track) =>
          track.type === 'video' &&
          track.previewUrl &&
          !track.muted &&
          track.isLinked && // Only linked video tracks should provide audio
          !hasPositionGapForVideo(track) && // Don't use video audio if linked audio has a gap
          timeline.currentFrame >= track.startFrame &&
          timeline.currentFrame < track.endFrame,
      );
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

  // Content scale
  const calculateContentScale = useCallback(() => {
    const containerAspect = containerSize.width / containerSize.height;
    const videoAspect = preview.canvasWidth / preview.canvasHeight;

    let actualWidth = preview.canvasWidth;
    let actualHeight = preview.canvasHeight;

    if (containerSize.width > 0 && containerSize.height > 0) {
      if (containerAspect > videoAspect) {
        const scale = containerSize.height / preview.canvasHeight;
        actualWidth = preview.canvasWidth * scale;
        actualHeight = containerSize.height;
      } else {
        const scale = containerSize.width / preview.canvasWidth;
        actualWidth = containerSize.width;
        actualHeight = preview.canvasHeight * scale;
      }
      actualWidth *= preview.previewScale;
      actualHeight *= preview.previewScale;
    }
    return { actualWidth, actualHeight };
  }, [
    containerSize,
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
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, video.duration || 0),
    );

    console.log('[DirectPreview] Video loadedmetadata - seeking to:', {
      currentFrame: timeline.currentFrame,
      trackStartFrame: activeVideoTrack.startFrame,
      relativeFrame,
      trackTime,
      sourceStartTime: activeVideoTrack.sourceStartTime || 0,
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
      audio.currentTime = Math.max(
        independentAudioTrack.sourceStartTime || 0,
        Math.min(targetTime, audio.duration || 0),
      );
      console.log(
        '[DirectPreview] Audio metadata loaded - seeking to position within range:',
        audio.currentTime,
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

  // Sync video element on scrubbing/seek (user interaction)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;
    if (playback.isPlaying) return; // don't fight playback

    const relativeFrame = Math.max(
      0,
      timeline.currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;
    const clampedTargetTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, video.duration || 0),
    );

    const diff = Math.abs(video.currentTime - clampedTargetTime);
    const tolerance = 1 / timeline.fps; // One frame tolerance

    if (diff > tolerance) {
      console.log('[DirectPreview] Seeking video - frame timing sync:', {
        currentFrame: timeline.currentFrame,
        trackStartFrame: activeVideoTrack.startFrame,
        relativeFrame,
        trackTime,
        sourceStartTime: activeVideoTrack.sourceStartTime || 0,
        targetTime,
        clampedTargetTime,
        currentVideoTime: video.currentTime,
        diff,
        tolerance,
        fps: timeline.fps,
      });
      video.currentTime = clampedTargetTime;
    }
  }, [
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    activeVideoTrack,
  ]);

  // Sync independent audio element on scrubbing/seek (user interaction)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !independentAudioTrack) return;
    if (playback.isPlaying) return; // don't fight playback

    // Only seek audio if timeline position is within the audio track's range
    const isWithinAudioRange =
      timeline.currentFrame >= independentAudioTrack.startFrame &&
      timeline.currentFrame < independentAudioTrack.endFrame;

    if (!isWithinAudioRange) {
      console.log(
        '[DirectPreview] Timeline position outside audio track range - not seeking audio',
        `Frame: ${timeline.currentFrame}, Audio range: ${independentAudioTrack.startFrame}-${independentAudioTrack.endFrame}`,
      );
      return; // Don't seek audio when timeline is outside its range
    }

    const relativeFrame =
      timeline.currentFrame - independentAudioTrack.startFrame;
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (independentAudioTrack.sourceStartTime || 0) + trackTime;
    const clampedTargetTime = Math.max(
      independentAudioTrack.sourceStartTime || 0,
      Math.min(targetTime, audio.duration || 0),
    );

    const diff = Math.abs(audio.currentTime - clampedTargetTime);
    const tolerance = 1 / timeline.fps; // One frame tolerance

    if (diff > tolerance) {
      console.log('[DirectPreview] Seeking audio - frame timing sync:', {
        currentFrame: timeline.currentFrame,
        trackStartFrame: independentAudioTrack.startFrame,
        relativeFrame,
        trackTime,
        sourceStartTime: independentAudioTrack.sourceStartTime || 0,
        targetTime,
        clampedTargetTime,
        currentAudioTime: audio.currentTime,
        diff,
        tolerance,
        fps: timeline.fps,
      });
      audio.currentTime = clampedTargetTime;
    }
  }, [
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    independentAudioTrack,
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

  const { actualWidth, actualHeight } = calculateContentScale();

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative overflow-hidden  rounded-lg',
        className,
        activeAudioTrack ? 'bg-transparent' : 'bg-zinc-100 dark:bg-zinc-900',
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {/* Video */}
      {(activeVideoTrack || activeAudioTrack) && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: '50%',
            top: '50%',
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
        return (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              width: actualWidth,
              height: actualHeight,
              left: '50%',
              top: '50%',
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
                    fontSize: `${Math.max(18, preview.canvasHeight * 0.045)}px`, // Slightly larger for better visibility
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
