import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoEditorStore } from '../../../store/videoEditorStore';

interface VideoDirectPreviewProps {
  className?: string;
}

export const VideoDirectPreview: React.FC<VideoDirectPreviewProps> = ({
  className,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [dragActive, setDragActive] = useState(false);

  const {
    tracks,
    timeline,
    playback,
    preview,
    textStyle,
    getTextStyleForSubtitle,
    importMediaFromDrop,
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

  // Load video source once
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack?.previewUrl) return;
    if (video.src !== activeVideoTrack.previewUrl) {
      console.log(
        '[DirectPreview] Updating video src to',
        activeVideoTrack.previewUrl,
      );
      video.src = activeVideoTrack.previewUrl;
    }
  }, [activeVideoTrack?.id, activeVideoTrack?.previewUrl]);

  // Add effect to auto-resume playback after src change when video is ready
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function handleAutoResume() {
      // Clamp relative frame to 0 to prevent negative seeks
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
          '[DirectPreview] Auto-resume: seeking to',
          clampedTargetTime,
          'for frame',
          timeline.currentFrame,
          'in track',
          activeVideoTrack.id,
        );
        video.currentTime = clampedTargetTime;
      }
      if (playback.isPlaying && video.paused) {
        console.log(
          '[DirectPreview] Auto-resume: video is ready, calling play() after src change',
        );
        video.play().catch(() => {
          console.log('playing again ehe');
        });
      }
    }

    video.addEventListener('loadeddata', handleAutoResume);
    video.addEventListener('canplay', handleAutoResume);

    return () => {
      video.removeEventListener('loadeddata', handleAutoResume);
      video.removeEventListener('canplay', handleAutoResume);
    };
  }, [
    activeVideoTrack,
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
  ]);

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
      video.volume = playback.muted ? 0 : Math.min(playback.volume, 1);
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
        await importMediaFromDrop(files);
      }
    },
    [importMediaFromDrop],
  );

  const { actualWidth, actualHeight } = calculateContentScale();

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden ${className}`}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      style={{ backgroundColor: preview.backgroundColor }}
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
            className="w-full h-full object-contain"
            playsInline
            controls={false}
            preload="metadata"
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
                  className="text-white text-center absolute bottom-5 left-0 right-0"
                  style={{
                    fontSize: `${Math.max(18, actualHeight * 0.045)}px`,
                    fontFamily: appliedStyle.fontFamily,
                    fontWeight: appliedStyle.fontWeight,
                    fontStyle: appliedStyle.fontStyle,
                    textTransform: appliedStyle.textTransform,
                    lineHeight: '1.2',
                    whiteSpace: 'pre-wrap',
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

      {/* Drag overlay */}
      {dragActive && (
        <div className="absolute inset-0 bg-blue-500 bg-opacity-30 border-2 border-blue-400 border-dashed flex items-center justify-center z-10">
          <div className="text-white text-center">
            <div className="text-4xl mb-2">📁</div>
            <div className="text-lg font-bold">Drop media files here</div>
          </div>
        </div>
      )}

      {/* Placeholder */}
      {!activeVideoTrack && tracks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">🎬</div>
            <div>Drop video files to get started</div>
          </div>
        </div>
      )}
    </div>
  );
};
