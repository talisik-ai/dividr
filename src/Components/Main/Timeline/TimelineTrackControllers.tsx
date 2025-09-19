import { cn } from '@/Lib/utils';
import { Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';
import { Button } from '../../sub/ui/Button';
import { TrackRowDefinition, TRACK_ROWS } from './TimelineTracks';

interface TrackControllerRowProps {
  rowDef: TrackRowDefinition;
  tracks: VideoTrack[];
}

const TrackControllerRow: React.FC<TrackControllerRowProps> = React.memo(
  ({ rowDef, tracks }) => {
    const { toggleTrackVisibility, toggleTrackMute, toggleLinkedAudioMute } =
      useVideoEditorStore();

    // Check if any tracks in this row are visible/audible
    const hasVisibleTracks = tracks.some((track) => track.visible);

    // For audible tracks, check the track's own muted state (both video and audio tracks now have muted states)
    const hasAudibleTracks = useMemo(() => {
      return tracks.some((track) => {
        if (track.type === 'audio' || track.type === 'video') {
          // Both audio and video tracks now have muted state that represents the audio output
          return !track.muted;
        }
        return false;
      });
    }, [tracks]);

    const handleToggleVisibility = useCallback(() => {
      // For video tracks, also toggle visibility of linked audio track
      // For other tracks, toggle normally
      tracks.forEach((track) => {
        toggleTrackVisibility(track.id);

        // If this is a linked video track, also toggle its linked audio track visibility
        if (track.type === 'video' && track.isLinked && track.linkedTrackId) {
          // Note: Video track visibility doesn't affect audio track visibility
          // Audio tracks remain visible but the video track controls the visual output
          console.log(`📹 Toggling video track visibility: ${track.id}`);
        }
      });
    }, [tracks, toggleTrackVisibility]);

    const handleToggleMute = useCallback(() => {
      tracks.forEach((track) => {
        if (track.type === 'audio') {
          // For audio tracks, toggle their own mute state
          toggleTrackMute(track.id);
          console.log(`🎵 Toggling audio track mute: ${track.id}`);
        } else if (
          track.type === 'video' &&
          track.isLinked &&
          track.linkedTrackId
        ) {
          // For video tracks, toggle their linked audio track's mute state
          toggleLinkedAudioMute(track.id);
        }
      });
    }, [tracks, toggleTrackMute, toggleLinkedAudioMute]);

    return (
      <div className="flex items-center justify-between px-2 mb-2 sm:h-6 md:h-8 lg:h-12 border-b border-border/20">
        {/* Track type info */}
        {/* <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs" title={rowDef.name}>
            {rowDef.icon}
          </span>
          <span className="text-xs font-medium text-muted-foreground truncate">
            {rowDef.name}
          </span>
          {tracks.length > 0 && (
            <span className="text-[10px] text-muted-foreground/60 bg-accent px-1 rounded">
              {tracks.length}
            </span>
          )}
        </div> */}

        {/* Track controls */}
        <div className="flex items-center justify-center gap-1">
          {/* Show visibility toggle for video, image, and subtitle tracks */}
          {(rowDef.trackTypes.includes('video') ||
            rowDef.trackTypes.includes('image') ||
            rowDef.trackTypes.includes('subtitle')) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleToggleVisibility}
              disabled={tracks.length === 0}
              title={hasVisibleTracks ? 'Hide tracks' : 'Show tracks'}
            >
              {hasVisibleTracks ? (
                <Eye className="h-3 w-3" />
              ) : (
                <EyeOff className="h-3 w-3 text-muted-foreground/50" />
              )}
            </Button>
          )}

          {/* Show audio control for both audio tracks AND video tracks (for their linked audio) */}
          {(rowDef.trackTypes.includes('audio') ||
            rowDef.trackTypes.includes('video')) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={handleToggleMute}
              disabled={tracks.length === 0}
              title={hasAudibleTracks ? 'Mute audio' : 'Unmute audio'}
            >
              {hasAudibleTracks ? (
                <Volume2 className="h-3 w-3" />
              ) : (
                <VolumeX className="h-3 w-3 text-muted-foreground/50" />
              )}
            </Button>
          )}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if tracks data actually changes
    if (prevProps.rowDef.id !== nextProps.rowDef.id) return false;
    if (prevProps.tracks.length !== nextProps.tracks.length) return false;

    // Deep check on relevant track properties that affect the UI
    return prevProps.tracks.every((prevTrack, index) => {
      const nextTrack = nextProps.tracks[index];
      return (
        prevTrack.id === nextTrack.id &&
        prevTrack.visible === nextTrack.visible &&
        prevTrack.muted === nextTrack.muted &&
        prevTrack.type === nextTrack.type
      );
    });
  },
);

interface TimelineTrackControllersProps {
  tracks: VideoTrack[];
  className?: string;
}

export const TimelineTrackControllers: React.FC<TimelineTrackControllersProps> =
  React.memo(
    ({ tracks, className }) => {
      // Group tracks by their designated rows
      const tracksByRow = useMemo(() => {
        const grouped: Record<string, VideoTrack[]> = {};

        TRACK_ROWS.forEach((row) => {
          grouped[row.id] = tracks.filter((track) =>
            row.trackTypes.includes(track.type),
          );
        });

        return grouped;
      }, [tracks]);

      return (
        <div className={cn('', className)}>
          {/* Header spacer to align with timeline ruler */}
          <div className="h-8 border-b border-border/20 flex items-center px-2">
            <span className="text-xs font-medium text-muted-foreground"></span>
          </div>

          {/* Track controller rows */}
          <div className="flex flex-col items-center">
            {TRACK_ROWS.map((rowDef) => (
              <TrackControllerRow
                key={rowDef.id}
                rowDef={rowDef}
                tracks={tracksByRow[rowDef.id] || []}
              />
            ))}
          </div>
        </div>
      );
    },
    (prevProps, nextProps) => {
      // Custom comparison - only re-render if tracks or className change
      if (prevProps.className !== nextProps.className) return false;
      if (prevProps.tracks.length !== nextProps.tracks.length) return false;

      // Deep check on relevant track properties that affect controllers
      return prevProps.tracks.every((prevTrack, index) => {
        const nextTrack = nextProps.tracks[index];
        return (
          prevTrack.id === nextTrack.id &&
          prevTrack.visible === nextTrack.visible &&
          prevTrack.muted === nextTrack.muted &&
          prevTrack.type === nextTrack.type
        );
      });
    },
  );
