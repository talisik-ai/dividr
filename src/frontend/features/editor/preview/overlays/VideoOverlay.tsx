import React, { useEffect, useRef } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { VideoTransformBoundary } from '../components/VideoTransformBoundary';
import { OverlayRenderProps } from '../core/types';
import { getTrackZIndex } from '../utils/trackUtils';

/**
 * Video overlay component - renders the active video track with transform controls
 * Optimized to prevent unnecessary re-mounts
 */

export interface VideoOverlayProps extends OverlayRenderProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  activeVideoTrack?: VideoTrack;
  allTracks: VideoTrack[];
  selectedTrackIds: string[];
  onLoadedMetadata: () => void;
  onTransformUpdate: (
    trackId: string,
    transform: {
      x?: number;
      y?: number;
      scale?: number;
      rotation?: number;
      width?: number;
      height?: number;
    },
  ) => void;
  onSelect: (trackId: string) => void;
  onRotationStateChange?: (isRotating: boolean) => void;
  onDragStateChange?: (
    isDragging: boolean,
    position?: { x: number; y: number; width: number; height: number },
  ) => void;
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({
  videoRef,
  activeVideoTrack,
  allTracks,
  selectedTrackIds,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  coordinateSystem,
  interactionMode,
  onLoadedMetadata,
  onTransformUpdate,
  onSelect,
  onRotationStateChange,
  onDragStateChange,
}) => {
  // Track the previous video source to prevent unnecessary reloads
  const prevSourceRef = useRef<string | undefined>(undefined);
  const loadedMetadataRef = useRef(false);

  // Helper function to get the video source URL
  // Prefers previewUrl, falls back to constructing URL from source path
  const getVideoSource = (
    track: VideoTrack | undefined,
  ): string | undefined => {
    if (!track) return undefined;

    // Prefer previewUrl if available
    if (track.previewUrl && track.previewUrl.trim()) {
      return track.previewUrl;
    }

    // Fallback to constructing URL from source path
    if (track.source && track.source.trim()) {
      const sourcePath = track.source.trim();
      // Check if source is already a URL
      if (
        sourcePath.startsWith('http://') ||
        sourcePath.startsWith('https://')
      ) {
        return sourcePath;
      }
      // For local file paths, construct server URL
      // This matches the format used in createPreviewUrl
      const encodedPath = encodeURIComponent(sourcePath);
      return `http://localhost:3001/${encodedPath}`;
    }

    return undefined;
  };

  // Update video source only when it actually changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    const newSource = getVideoSource(activeVideoTrack);

    // Only update src if it actually changed OR if the video element is in error/empty state
    // This handles undo/redo scenarios and project reloads where the track is restored
    const needsReload =
      prevSourceRef.current !== newSource ||
      (newSource && !video.src) ||
      (newSource && video.readyState === 0) ||
      (newSource && video.src !== newSource);

    if (needsReload && newSource) {
      loadedMetadataRef.current = false;

      // Pause before changing source to prevent flicker
      if (!video.paused) {
        video.pause();
      }

      // Explicitly set the src attribute
      video.src = newSource;
      video.load(); // Explicitly load the new source

      prevSourceRef.current = newSource;
    } else if (!newSource && video.src) {
      // Clear src if no source is available
      video.removeAttribute('src');
      video.load();
      prevSourceRef.current = undefined;
    }
  }, [
    activeVideoTrack?.previewUrl,
    activeVideoTrack?.source,
    activeVideoTrack?.id,
    videoRef,
  ]);

  // Handle metadata loaded event and initialize transform if needed
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVideoTrack) return;

    const handleMetadata = () => {
      if (!loadedMetadataRef.current) {
        loadedMetadataRef.current = true;
        onLoadedMetadata();

        // Initialize transform if it doesn't exist and we have video dimensions
        if (
          !activeVideoTrack.textTransform &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          onTransformUpdate(activeVideoTrack.id, {
            x: 0,
            y: 0,
            scale: 1,
            rotation: 0,
            width: video.videoWidth,
            height: video.videoHeight,
          });
        }
      }
    };

    video.addEventListener('loadedmetadata', handleMetadata);

    // If metadata is already loaded when component mounts
    if (video.readyState >= 1 && activeVideoTrack?.previewUrl) {
      handleMetadata();
    }

    return () => {
      video.removeEventListener('loadedmetadata', handleMetadata);
    };
  }, [
    activeVideoTrack?.previewUrl,
    activeVideoTrack?.id,
    activeVideoTrack?.textTransform,
    onLoadedMetadata,
    onTransformUpdate,
    videoRef,
  ]);

  if (!activeVideoTrack) return null;

  // Check if the track should be visually hidden (but keep video element mounted for playback)
  const isVisuallyHidden = !activeVideoTrack.visible;
  const isSelected = selectedTrackIds.includes(activeVideoTrack.id);

  // Get video transform properties (use stored transform or defaults)
  const videoTransform = activeVideoTrack.textTransform || {
    x: 0, // Centered
    y: 0, // Centered
    scale: 1, // 100% scale
    rotation: 0, // No rotation
    width: activeVideoTrack.width || baseVideoWidth,
    height: activeVideoTrack.height || baseVideoHeight,
  };

  // Use the coordinate system's baseScale for consistent rendering
  const renderScale = coordinateSystem.baseScale;

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        overflow: 'visible', // Allow transform handles to extend beyond canvas
        zIndex: activeVideoTrack
          ? getTrackZIndex(activeVideoTrack, allTracks)
          : 0,
      }}
    >
      <VideoTransformBoundary
        track={activeVideoTrack}
        isSelected={isSelected}
        previewScale={coordinateSystem.baseScale}
        videoWidth={baseVideoWidth}
        videoHeight={baseVideoHeight}
        renderScale={renderScale}
        interactionMode={interactionMode}
        onTransformUpdate={onTransformUpdate}
        onSelect={onSelect}
        onRotationStateChange={onRotationStateChange}
        onDragStateChange={onDragStateChange}
        clipContent={true}
        clipWidth={actualWidth}
        clipHeight={actualHeight}
      >
        <div
          className="relative"
          style={{
            width: `${(videoTransform.width || activeVideoTrack.width || baseVideoWidth) * renderScale}px`,
            height: `${(videoTransform.height || activeVideoTrack.height || baseVideoHeight) * renderScale}px`,
            visibility: isVisuallyHidden ? 'hidden' : 'visible',
            // Disable pointer events in Pan Tool or Text Tool mode (allow panning/text creation on top)
            pointerEvents:
              isVisuallyHidden ||
              interactionMode === 'pan' ||
              interactionMode === 'text-edit'
                ? 'none'
                : 'auto',
          }}
        >
          <video
            ref={videoRef}
            className="w-full h-full"
            style={{
              objectFit: 'contain', // Always use contain to preserve aspect ratio
            }}
            playsInline
            controls={false}
            preload="metadata"
            src={getVideoSource(activeVideoTrack)}
          />
        </div>
      </VideoTransformBoundary>
    </div>
  );
};
