import React from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { OverlayRenderProps } from '../core/types';
import { getTrackZIndex } from '../utils/trackUtils';

/**
 * Video overlay component - renders the active video track
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

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        width: actualWidth,
        height: actualHeight,
        left: `calc(50% + ${panX}px)`,
        top: `calc(50% + ${panY}px)`,
        transform: 'translate(-50%, -50%)',
        opacity: activeVideoTrack ? 1 : 0,
        pointerEvents: activeVideoTrack ? 'auto' : 'none',
        zIndex: activeVideoTrack
          ? getTrackZIndex(activeVideoTrack, allTracks)
          : 0,
      }}
    >
      <video
        ref={videoRef}
        key={`video-${activeVideoTrack?.previewUrl || 'no-video'}`}
        className="w-full h-full"
        style={{ objectFit }}
        playsInline
        controls={false}
        preload="metadata"
        src={activeVideoTrack?.previewUrl}
        onLoadedMetadata={onLoadedMetadata}
      />
    </div>
  );
};
