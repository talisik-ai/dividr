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
  onLoadedMetadata,
}) => {
  if (!activeVideoTrack) return null;

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
        className="w-full h-full object-contain"
        playsInline
        controls={false}
        preload="metadata"
        src={activeVideoTrack?.previewUrl}
        onLoadedMetadata={onLoadedMetadata}
      />
    </div>
  );
};
