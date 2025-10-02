import { Button } from '@/frontend/components/ui/button';
import { cn } from '@/frontend/utils/utils';
import { Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import { useVideoEditorStore, VideoTrack } from '../stores/VideoEditorStore';
import { TrackRowDefinition, TRACK_ROWS } from './timelineTracks';

interface TrackControllerRowProps {
  rowDef: TrackRowDefinition;
  tracks: VideoTrack[];
}

const TrackControllerRow: React.FC<TrackControllerRowProps> = React.memo(
  ({ rowDef, tracks }) => {
    // Subscribe to only the actions we need, not the entire store
    const toggleTrackVisibility = useVideoEditorStore(
      (state) => state.toggleTrackVisibility,
    );
    const toggleTrackMute = useVideoEditorStore(
      (state) => state.toggleTrackMute,
    );

    // Check if any non-audio tracks in this row are visible
    const hasVisibleTracks = tracks.some(
      (track) => track.type !== 'audio' && track.visible,
    );

    // Check if any audio tracks in this row are audible (not muted)
    const hasAudibleTracks = useMemo(() => {
      const audible = tracks.some((track) => {
        if (track.type === 'audio') {
          return !track.muted;
        }
        return false;
      });
      console.log(
        `🎵 Has audible tracks: ${audible}`,
        tracks.map((t) => ({ name: t.name, muted: t.muted })),
      );
      return audible;
    }, [tracks]);

    const handleToggleVisibility = useCallback(() => {
      // Only handle visibility for non-audio tracks (video, image, subtitle)
      tracks.forEach((track) => {
        if (track.type !== 'audio') {
          toggleTrackVisibility(track.id);
          console.log(
            `📹 Toggling ${track.type} track visibility: ${track.id}`,
          );
        }
      });
    }, [tracks, toggleTrackVisibility]);

    const handleToggleMute = useCallback(() => {
      // Handle mute for audio tracks only
      tracks.forEach((track) => {
        if (track.type === 'audio') {
          toggleTrackMute(track.id);
        }
      });
    }, [tracks, toggleTrackMute]);

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
          {/* Show visibility toggle for video, image, and subtitle tracks only */}
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

          {/* Show audio control for audio tracks only */}
          {rowDef.trackTypes.includes('audio') && (
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
