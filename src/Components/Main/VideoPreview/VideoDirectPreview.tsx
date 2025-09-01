import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useVideoEditorStore } from '../../../store/videoEditorStore';

interface VideoDirectPreviewProps {
  className?: string;
}

/**
 * Optimized Video Preview using Direct Video Element Rendering
 * Much simpler and more efficient than blob generation
 * Maintains audio, reduces complexity, and provides better performance
 */
export const VideoDirectPreview: React.FC<VideoDirectPreviewProps> = ({
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
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
  } = useVideoEditorStore();

  // Convert frame to time
  const currentTime = timeline.currentFrame / timeline.fps;

  // Helper function to get active subtitle tracks
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

  // Container size management
  useEffect(() => {
    const updateContainerSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateContainerSize();
    const resizeObserver = new ResizeObserver(updateContainerSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate content scale
  const calculateContentScale = useCallback(() => {
    const containerAspect = containerSize.width / containerSize.height;
    const videoAspect = preview.canvasWidth / preview.canvasHeight;

    let scaleX = 1;
    let scaleY = 1;
    let actualWidth = preview.canvasWidth;
    let actualHeight = preview.canvasHeight;

    if (containerSize.width > 0 && containerSize.height > 0) {
      if (containerAspect > videoAspect) {
        scaleY = containerSize.height / preview.canvasHeight;
        scaleX = scaleY;
        actualWidth = preview.canvasWidth * scaleX;
        actualHeight = containerSize.height;
      } else {
        scaleX = containerSize.width / preview.canvasWidth;
        scaleY = scaleX;
        actualWidth = containerSize.width;
        actualHeight = preview.canvasHeight * scaleY;
      }

      scaleX *= preview.previewScale;
      scaleY *= preview.previewScale;
      actualWidth *= preview.previewScale;
      actualHeight *= preview.previewScale;
    }

    return { scaleX, scaleY, actualWidth, actualHeight };
  }, [containerSize, preview.canvasWidth, preview.canvasHeight, preview.previewScale]);

  // Drag and drop handlers
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

  // Get the primary video track (first visible video track)
  const primaryVideoTrack = tracks.find(
    (track) =>
      track.type === 'video' &&
      track.visible &&
      track.previewUrl &&
      timeline.currentFrame >= track.startFrame &&
      timeline.currentFrame < track.endFrame,
  );

  // Manage primary video element
  useEffect(() => {
    const videoElements = videoElementsRef.current;

    // Clean up old video elements
    for (const [trackId, video] of videoElements.entries()) {
      if (!tracks.some(t => t.id === trackId)) {
        video.pause();
        video.src = '';
        video.remove();
        videoElements.delete(trackId);
      }
    }

    // Create/update primary video element
    if (primaryVideoTrack && !videoElements.has(primaryVideoTrack.id)) {
      const video = document.createElement('video');
      video.style.display = 'none';
      video.muted = false; // Keep audio!
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      video.src = primaryVideoTrack.previewUrl!;
      
      document.body.appendChild(video);
      videoElements.set(primaryVideoTrack.id, video);
    }

    return () => {
      // Cleanup on unmount
      for (const video of videoElements.values()) {
        video.pause();
        video.src = '';
        video.remove();
      }
      videoElements.clear();
    };
  }, [tracks, primaryVideoTrack]);

  // Sync video playback and seeking
  useEffect(() => {
    if (!primaryVideoTrack) return;

    const video = videoElementsRef.current.get(primaryVideoTrack.id);
    if (!video) return;

    // Calculate target time within the track
    const trackTime = (timeline.currentFrame - primaryVideoTrack.startFrame) / timeline.fps;
    const sourceTime = (primaryVideoTrack.sourceStartTime || 0) + trackTime;

    // Sync playback state
    if (playback.isPlaying) {
      if (video.paused) {
        video.play().catch(console.error);
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }

    // Sync seeking (only if significant difference)
    if (Math.abs(video.currentTime - sourceTime) > 0.2) {
      video.currentTime = Math.max(0, sourceTime);
    }

    // Sync volume and rate
    video.volume = playback.muted ? 0 : playback.volume;
    video.playbackRate = playback.playbackRate;

  }, [
    primaryVideoTrack,
    timeline.currentFrame,
    timeline.fps,
    playback.isPlaying,
    playback.volume,
    playback.muted,
    playback.playbackRate,
  ]);

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
      {/* Primary Video Display */}
      {primaryVideoTrack && (
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
            ref={(videoEl) => {
              if (videoEl && primaryVideoTrack) {
                const existingVideo = videoElementsRef.current.get(primaryVideoTrack.id);
                if (existingVideo && existingVideo !== videoEl) {
                  // Copy state from hidden video to display video
                  videoEl.src = existingVideo.src;
                  videoEl.currentTime = existingVideo.currentTime;
                  videoEl.volume = existingVideo.volume;
                  videoEl.playbackRate = existingVideo.playbackRate;
                  videoEl.muted = existingVideo.muted;
                  
                  if (!existingVideo.paused) {
                    videoEl.play().catch(console.error);
                  }
                }
              }
            }}
            className="w-full h-full object-contain"
            style={{
              width: preview.canvasWidth,
              height: preview.canvasHeight,
            }}
            playsInline
            controls={false}
          />
        </div>
      )}

      {/* Subtitle Overlay */}
      {(() => {
        const activeSubtitles = getActiveSubtitleTracks();
        if (activeSubtitles.length === 0) return null;

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
            {activeSubtitles.map((track) => {
              const appliedStyle = getTextStyleForSubtitle(textStyle.activeStyle);

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
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    color: '#FFFFFF',
                    backgroundColor: 'rgba(0, 0, 0, 0.5)',
                    padding: '2px 0',
                    margin: '0 auto',
                    textAlign: 'center',
                    display: 'inline-block',
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

      {/* No content placeholder */}
      {!primaryVideoTrack && tracks.length === 0 && (
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
