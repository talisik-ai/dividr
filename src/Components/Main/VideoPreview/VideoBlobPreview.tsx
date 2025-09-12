import NewDark from '@/Assets/Logo/New-Dark.svg';
import New from '@/Assets/Logo/New-Light.svg';
import { cn } from '@/Lib/utils';
import { useTheme } from '@/Utility/ThemeProvider';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../../Store/VideoEditorStore';

interface VideoBlobPreviewProps {
  className?: string;
}

export const VideoBlobPreview: React.FC<VideoBlobPreviewProps> = ({
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
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

  // Active video track
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
  }, [activeVideoTrack, timeline.currentFrame]);

  // Add effect to pause playback at the end of the last segment
  useEffect(() => {
    if (!playback.isPlaying) return;
    // Find the last visible video track
    const visibleVideoTracks = tracks
      .filter(
        (track) => track.type === 'video' && track.visible && track.previewUrl,
      )
      .sort((a, b) => a.endFrame - b.endFrame);
    const lastTrack = visibleVideoTracks[visibleVideoTracks.length - 1];
    if (lastTrack && timeline.currentFrame >= lastTrack.endFrame) {
      // Pause playback if we've reached or passed the end of the last segment
      playback.isPlaying = false;
      // If you have a setPlayback or similar action, use that instead:
      // setPlayback((prev) => ({ ...prev, isPlaying: false }));
      // Or dispatch an action to pause playback
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }
  }, [timeline.currentFrame, tracks, playback, videoRef]);

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

  // Add handler for loadedmetadata
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;
    // Seek to correct position
    const relativeFrame = Math.max(
      0,
      timeline.currentFrame - activeVideoTrack.startFrame,
    );
    const trackTime = relativeFrame / timeline.fps;
    const targetTime = (activeVideoTrack.sourceStartTime || 0) + trackTime;
    video.currentTime = Math.max(
      activeVideoTrack.sourceStartTime || 0,
      Math.min(targetTime, video.duration || 0),
    );
    // Auto play if timeline is playing
    if (playback.isPlaying && video.paused) {
      video.muted = playback.muted; // ensure muted if needed for autoplay
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

  // Sync play/pause & volume
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    try {
      if (playback.isPlaying) {
        if (video.paused && video.readyState >= 3) {
          console.log(
            '[DirectPreview] Resuming playback (playback.isPlaying && video.paused)',
          );
          video.play().catch(console.warn);
        }
      } else {
        if (!video.paused) {
          console.log(
            '[DirectPreview] Pausing playback (playback.isPlaying is false)',
          );
          video.pause();
        }
      }
      // Check if current track is muted OR global playback is muted
      const isTrackMuted = activeVideoTrack?.muted === true;
      const shouldMute = playback.muted || isTrackMuted;
      video.volume = shouldMute ? 0 : Math.min(playback.volume, 1);
      video.playbackRate = Math.max(0.25, Math.min(playback.playbackRate, 4));
    } catch (err) {
      console.warn('Video sync error:', err);
    }
  }, [
    playback.isPlaying,
    playback.volume,
    playback.muted,
    playback.playbackRate,
    activeVideoTrack?.id, // <-- add this
    activeVideoTrack?.previewUrl, // (optional, for extra safety)
    activeVideoTrack?.muted, // Track mute state
  ]);

  // Sync timeline to video frames
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    let handle: number;
    const fps = timeline.fps;

    const step = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      if (!video.paused && playback.isPlaying) {
        const elapsedFrames =
          (metadata.mediaTime - (activeVideoTrack.sourceStartTime || 0)) * fps +
          activeVideoTrack.startFrame;
        setCurrentFrame(Math.floor(elapsedFrames));
      }
      handle = video.requestVideoFrameCallback(step);
    };

    handle = video.requestVideoFrameCallback(step);
    return () => video.cancelVideoFrameCallback(handle);
  }, [activeVideoTrack?.id, playback.isPlaying, timeline.fps, setCurrentFrame]);

  // Sync on scrubbing/seek (user interaction)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;
    if (playback.isPlaying) return; // don’t fight playback

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
    if (diff > 0.05) {
      console.log(
        '[DirectPreview] Seeking video to',
        clampedTargetTime,
        'for frame',
        timeline.currentFrame,
        'in track',
        activeVideoTrack.id,
      );
      video.currentTime = clampedTargetTime;
    }
  }, [
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    activeVideoTrack,
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
        activeVideoTrack ? 'bg-transparent' : 'bg-zinc-100 dark:bg-zinc-900',
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      {/* Video */}
      {activeVideoTrack && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            width: actualWidth,
            height: actualHeight,
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <video
            ref={videoRef}
            key={activeVideoTrack.previewUrl}
            className="w-full h-full object-contain"
            playsInline
            controls={false}
            preload="metadata"
            src={activeVideoTrack.previewUrl}
            onLoadedMetadata={handleLoadedMetadata}
          />
        </div>
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
      {!activeVideoTrack && tracks.length === 0 && (
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
