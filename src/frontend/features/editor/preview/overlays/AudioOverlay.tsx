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

  // CRITICAL: Key must be based ONLY on the source file URL, NOT startFrame
  // This ensures React reuses the same audio element when crossing segment boundaries
  // from the same source, allowing continuous playback without resets
  return (
    <audio
      ref={audioRef}
      key={`audio-${independentAudioTrack.previewUrl}`}
      preload="metadata"
      src={independentAudioTrack.previewUrl}
      onLoadedMetadata={onLoadedMetadata}
      style={{ display: 'none' }}
    />
  );
};
