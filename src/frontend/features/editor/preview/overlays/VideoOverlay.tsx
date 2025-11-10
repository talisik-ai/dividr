import React, { useEffect, useRef } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { OverlayRenderProps } from '../core/types';
import { getTrackZIndex } from '../utils/trackUtils';

/**
 * Video overlay component - renders the active video track
 * Optimized to prevent unnecessary re-mounts
 */

export interface VideoOverlayProps extends OverlayRenderProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  activeVideoTrack?: VideoTrack;
  allTracks: VideoTrack[];
  onLoadedMetadata: () => void;
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({
  videoRef,
  activeVideoTrack,
  allTracks,
  panX,
  panY,
  actualWidth,
  actualHeight,
  baseVideoWidth,
  baseVideoHeight,
  onLoadedMetadata,
}) => {
  // Track the previous video source to prevent unnecessary reloads
  const prevSourceRef = useRef<string | undefined>(undefined);
  const loadedMetadataRef = useRef(false);

  // Update video source only when it actually changes
  useEffect(() => {
    const video = videoRef.current;
    const newSource = activeVideoTrack?.previewUrl;

    if (!video) return;

    // Only update src if it actually changed OR if the video element is in error/empty state
    // This handles undo/redo scenarios where the track is restored
    const needsReload =
      prevSourceRef.current !== newSource ||
      (newSource && !video.src) ||
      (newSource && video.readyState === 0);

    if (needsReload) {
      loadedMetadataRef.current = false;

      if (newSource) {
        // Pause before changing source to prevent flicker
        if (!video.paused) {
          video.pause();
        }
        video.src = newSource;
        video.load(); // Explicitly load the new source
        console.log(`🔄 VideoOverlay: Reloading source for track`, {
          trackId: activeVideoTrack?.id,
          source: newSource,
        });
      } else {
        video.removeAttribute('src');
        video.load();
      }

      prevSourceRef.current = newSource;
    }
  }, [activeVideoTrack?.previewUrl, activeVideoTrack?.id, videoRef]);

  // Handle metadata loaded event
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleMetadata = () => {
      if (!loadedMetadataRef.current) {
        loadedMetadataRef.current = true;
        onLoadedMetadata();
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
  }, [activeVideoTrack?.previewUrl, onLoadedMetadata, videoRef]);

  if (!activeVideoTrack) return null;

  // Determine if we should use object-cover (crop to fill) or object-contain (fit with letterboxing)
  // Use object-cover when the canvas aspect ratio differs significantly from the video aspect ratio
  const videoAspectRatio =
    activeVideoTrack.width && activeVideoTrack.height
      ? activeVideoTrack.width / activeVideoTrack.height
      : 16 / 9;
  const canvasAspectRatio = baseVideoWidth / baseVideoHeight;
  const aspectRatioDifference = Math.abs(videoAspectRatio - canvasAspectRatio);

  // Use cover mode when aspect ratios differ by more than 5%
  const useCoverMode = aspectRatioDifference > 0.05;
  const objectFit: React.CSSProperties['objectFit'] = useCoverMode
    ? 'cover'
    : 'contain';

  // Check if the track should be visually hidden (but keep video element mounted for playback)
  const isVisuallyHidden = !activeVideoTrack.visible;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        // Use visibility instead of opacity to hide while maintaining video element
        visibility: isVisuallyHidden ? 'hidden' : 'visible',
        pointerEvents: isVisuallyHidden ? 'none' : 'auto',
        zIndex: activeVideoTrack
          ? getTrackZIndex(activeVideoTrack, allTracks)
          : 0,
      }}
    >
      <video
        ref={videoRef}
        className="w-full h-full"
        style={{ objectFit }}
        playsInline
        controls={false}
        preload="metadata"
      />
    </div>
  );
};
