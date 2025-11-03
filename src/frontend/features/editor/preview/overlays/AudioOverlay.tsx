import React from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';

/**
 * Audio overlay component - renders independent audio tracks
 */

export interface AudioOverlayProps {
  audioRef: React.RefObject<HTMLAudioElement>;
  independentAudioTrack?: VideoTrack;
  onLoadedMetadata: () => void;
}

export const AudioOverlay: React.FC<AudioOverlayProps> = ({
  audioRef,
  independentAudioTrack,
  onLoadedMetadata,
}) => {
  if (!independentAudioTrack || !independentAudioTrack.previewUrl) return null;

  return (
    <audio
      ref={audioRef}
      key={`audio-${independentAudioTrack.previewUrl}-${independentAudioTrack.startFrame}`}
      preload="metadata"
      src={independentAudioTrack.previewUrl}
      onLoadedMetadata={onLoadedMetadata}
      style={{ display: 'none' }}
    />
  );
};
