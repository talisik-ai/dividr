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
  allIndependentAudioTracks?: VideoTrack[];
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
      const audioTrack = tracks.find((track) => {
        // Must be an audio track
        if (track.type !== 'audio') return false;

        // Must be visible
        if (!track.visible) return false;

        // Must be in current frame range
        if (currentFrame < track.startFrame || currentFrame >= track.endFrame) {
          return false;
        }

        // Must not be muted
        if (track.muted) {
          return false;
        }

        // Check if it qualifies as independent
        const hasUrl = !!track.previewUrl;
        const isUnlinked = !track.isLinked;
        const hasGap = hasAudioPositionGap(track, tracks);

        // Standalone audio file (has its own previewUrl) - THIS IS THE KEY FOR MP3/WAV
        if (hasUrl) return true;

        // Unlinked from video
        if (isUnlinked) return true;

        // Has position gap
        if (hasGap) return true;

        return false;
      });

      if (!audioTrack) return undefined;

      // If audio track has its own previewUrl, use it directly
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
    } catch (err) {
      console.error('[useActiveMedia] Error:', err);
      return undefined;
    }
  }, [tracks, currentFrame]);

  // All independent audio tracks for multi-track mixing
  const allIndependentAudioTracks = useMemo(() => {
    try {
      return tracks
        .filter((track) => {
          if (track.type !== 'audio') return false;
          if (currentFrame < track.startFrame || currentFrame >= track.endFrame)
            return false;
          if (track.muted) return false;

          // Standalone audio with previewUrl
          if (track.previewUrl) return true;

          // Unlinked audio
          if (!track.isLinked) {
            // Try to find a matching video to borrow previewUrl
            const matchingVideo = tracks.find(
              (t) =>
                t.type === 'video' && t.source === track.source && t.previewUrl,
            );
            return !!matchingVideo?.previewUrl;
          }

          // Linked audio with position gap
          if (hasAudioPositionGap(track, tracks)) return true;

          return false;
        })
        .map((track) => {
          // Ensure each track has a previewUrl
          if (track.previewUrl) return track;

          const matchingVideo = tracks.find(
            (t) =>
              t.type === 'video' && t.source === track.source && t.previewUrl,
          );
          return {
            ...track,
            previewUrl: matchingVideo?.previewUrl,
          };
        })
        .filter((track) => track.previewUrl); // Only return tracks with valid URLs
    } catch {
      return [];
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
    allIndependentAudioTracks,
    videoTrackWithAudio,
    activeAudioTrack,
  };
}
