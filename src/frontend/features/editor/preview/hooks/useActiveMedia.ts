import { useMemo } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { hasAudioPositionGap, hasVideoPositionGap } from '../utils/trackUtils';

/**
 * Hook for determining which media tracks are currently active
 */

export interface UseActiveMediaProps {
  tracks: VideoTrack[];
  currentFrame: number;
}

export interface ActiveMedia {
  activeVideoTrack?: VideoTrack;
  independentAudioTrack?: VideoTrack;
  videoTrackWithAudio?: VideoTrack;
  activeAudioTrack?: VideoTrack;
}

export function useActiveMedia({
  tracks,
  currentFrame,
}: UseActiveMediaProps): ActiveMedia {
  // Active video track for playback (visibility is handled by VideoOverlay)
  // We return the track regardless of visibility to keep video element mounted
  const activeVideoTrack = useMemo(() => {
    try {
      return tracks.find(
        (track) =>
          track.type === 'video' &&
          track.previewUrl &&
          currentFrame >= track.startFrame &&
          currentFrame < track.endFrame,
      );
    } catch {
      return undefined;
    }
  }, [tracks, currentFrame]);

  // Independent audio track for audio-only playback (separate from video)
  const independentAudioTrack = useMemo(() => {
    try {
      const audioTrack = tracks.find(
        (track) =>
          track.type === 'audio' &&
          (!track.isLinked ||
            track.previewUrl ||
            hasAudioPositionGap(track, tracks)) &&
          !track.muted &&
          currentFrame >= track.startFrame &&
          currentFrame < track.endFrame,
      );

      if (audioTrack) {
        // If audio track has its own previewUrl (extracted audio), use it directly
        if (audioTrack.previewUrl) {
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
  }, [tracks, currentFrame]);

  // Video track that provides audio when no independent audio track exists
  const videoTrackWithAudio = useMemo(() => {
    try {
      if (independentAudioTrack) return undefined;

      return tracks.find((track) => {
        if (track.type !== 'video' || !track.previewUrl || !track.isLinked)
          return false;

        // Check if the linked audio track is muted
        const linkedAudioTrack = tracks.find(
          (t) => t.id === track.linkedTrackId,
        );
        const isLinkedAudioMuted = linkedAudioTrack
          ? linkedAudioTrack.muted
          : false;

        return (
          !isLinkedAudioMuted &&
          !hasVideoPositionGap(track, tracks) &&
          currentFrame >= track.startFrame &&
          currentFrame < track.endFrame
        );
      });
    } catch {
      return undefined;
    }
  }, [tracks, currentFrame, independentAudioTrack]);

  // Combined audio track reference for compatibility
  const activeAudioTrack = independentAudioTrack || videoTrackWithAudio;

  return {
    activeVideoTrack,
    independentAudioTrack,
    videoTrackWithAudio,
    activeAudioTrack,
  };
}
