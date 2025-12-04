import { useMemo } from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import { hasAudioPositionGap } from '../utils/trackUtils';

/**
 * Hook for determining which media tracks are currently active
 * Supports multi-track layering for CapCut/Premiere-like compositing
 */

export interface UseActiveMediaProps {
  tracks: VideoTrack[];
  currentFrame: number;
}

export interface ActiveMedia {
  /** Primary video track (for backward compatibility) */
  activeVideoTrack?: VideoTrack;
  /** ALL active video tracks at current frame, sorted by z-index */
  activeVideoTracks: VideoTrack[];
  /** Primary independent audio track (for backward compatibility) */
  independentAudioTrack?: VideoTrack;
  /** ALL active independent audio tracks at current frame */
  activeIndependentAudioTracks: VideoTrack[];
  /** Video track that provides audio (when no independent audio) */
  videoTrackWithAudio?: VideoTrack;
  /** Combined audio track reference (for backward compatibility) */
  activeAudioTrack?: VideoTrack;
}

export function useActiveMedia({
  tracks,
  currentFrame,
}: UseActiveMediaProps): ActiveMedia {
  // ALL active video tracks at current frame (sorted by z-index for layering)
  const activeVideoTracks = useMemo(() => {
    try {
      return tracks
        .filter(
          (track) =>
            track.type === 'video' &&
            track.previewUrl &&
            track.visible &&
            currentFrame >= track.startFrame &&
            currentFrame < track.endFrame,
        )
        .sort((a, b) => {
          // Sort by trackRowIndex (lower = behind, higher = in front)
          const rowA = a.trackRowIndex ?? 0;
          const rowB = b.trackRowIndex ?? 0;
          return rowA - rowB;
        });
    } catch {
      return [];
    }
  }, [tracks, currentFrame]);

  // Primary active video track (first/bottom layer - for backward compatibility)
  const activeVideoTrack = activeVideoTracks[0];

  // ALL active independent audio tracks at current frame
  const activeIndependentAudioTracks = useMemo(() => {
    try {
      const audioTracks: VideoTrack[] = [];

      tracks.forEach((track) => {
        // Must be an audio track
        if (track.type !== 'audio') return;

        // Must be visible
        if (!track.visible) return;

        // Must be in current frame range
        if (currentFrame < track.startFrame || currentFrame >= track.endFrame)
          return;

        // Must not be muted
        if (track.muted) return;

        // Check if it qualifies as independent audio
        const hasUrl = !!track.previewUrl;
        const isUnlinked = !track.isLinked;
        const hasGap = hasAudioPositionGap(track, tracks);

        // Standalone audio file (has its own previewUrl)
        if (hasUrl) {
          audioTracks.push(track);
          return;
        }

        // Unlinked from video
        if (isUnlinked) {
          // Try to find a matching video to borrow previewUrl
          const matchingVideoTrack = tracks.find(
            (t) =>
              t.type === 'video' && t.source === track.source && t.previewUrl,
          );

          if (matchingVideoTrack?.previewUrl) {
            audioTracks.push({
              ...track,
              previewUrl: matchingVideoTrack.previewUrl,
            });
          }
          return;
        }

        // Has position gap from linked video
        if (hasGap) {
          const matchingVideoTrack = tracks.find(
            (t) =>
              t.type === 'video' && t.source === track.source && t.previewUrl,
          );

          if (matchingVideoTrack?.previewUrl) {
            audioTracks.push({
              ...track,
              previewUrl: matchingVideoTrack.previewUrl,
            });
          }
          return;
        }
      });

      return audioTracks;
    } catch {
      return [];
    }
  }, [tracks, currentFrame]);

  // Primary independent audio track (for backward compatibility)
  const independentAudioTrack = activeIndependentAudioTracks[0];

  // Video tracks that provide audio (linked video+audio pairs where audio comes from video element)
  const videoTracksWithAudio = useMemo(() => {
    try {
      // If there are independent audio tracks, those handle audio
      if (activeIndependentAudioTracks.length > 0) return [];

      return tracks.filter((track) => {
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
          track.visible &&
          currentFrame >= track.startFrame &&
          currentFrame < track.endFrame
        );
      });
    } catch {
      return [];
    }
  }, [tracks, currentFrame, activeIndependentAudioTracks]);

  // Primary video track with audio (for backward compatibility)
  const videoTrackWithAudio = videoTracksWithAudio[0];

  // Combined audio track reference (for backward compatibility)
  const activeAudioTrack = independentAudioTrack || videoTrackWithAudio;

  return {
    activeVideoTrack,
    activeVideoTracks,
    independentAudioTrack,
    activeIndependentAudioTracks,
    videoTrackWithAudio,
    activeAudioTrack,
  };
}
