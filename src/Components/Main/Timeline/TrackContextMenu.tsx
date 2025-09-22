import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/Components/sub/ui/Context-Menu';
import {
  Copy,
  Eye,
  EyeOff,
  Scissors,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, { useCallback, useMemo } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';

interface TrackContextMenuProps {
  track: VideoTrack;
  children: React.ReactNode;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = ({
  track,
  children,
}) => {
  // Use selective subscriptions to prevent unnecessary re-renders
  const currentFrame = useVideoEditorStore(
    (state) => state.timeline.currentFrame,
  );
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );

  // Get store actions using getState() to avoid reactive subscriptions
  const {
    removeTrack,
    duplicateTrack,
    splitTrack,
    toggleTrackVisibility,
    toggleTrackMute,
    setSelectedTracks,
  } = useVideoEditorStore.getState();

  // Memoize computed values to prevent recalculation
  const isSelected = useMemo(
    () => selectedTrackIds.includes(track.id),
    [selectedTrackIds, track.id],
  );

  const hasMultipleSelected = useMemo(
    () => selectedTrackIds.length > 1,
    [selectedTrackIds.length],
  );

  const canSplit = useMemo(
    () =>
      currentFrame > track.startFrame &&
      currentFrame < track.endFrame &&
      !track.locked,
    [currentFrame, track.startFrame, track.endFrame, track.locked],
  );

  const hasAudio = useMemo(
    () => track.type === 'audio' || track.type === 'video',
    [track.type],
  );

  // Memoized handlers to prevent recreation on every render
  const handleSelectTrack = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!isSelected) {
        setSelectedTracks([track.id]);
      }
    },
    [track.id, isSelected, setSelectedTracks],
  );

  const handleDeleteTrack = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (hasMultipleSelected) {
        // If multiple tracks are selected, remove all selected tracks
        const { removeSelectedTracks } = useVideoEditorStore.getState();
        removeSelectedTracks();
      } else {
        // Remove just this track
        removeTrack(track.id);
      }
    },
    [track.id, hasMultipleSelected, removeTrack],
  );

  const handleDuplicateTrack = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      duplicateTrack(track.id);
    },
    [track.id, duplicateTrack],
  );

  const handleSplitTrack = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (canSplit) {
        splitTrack(track.id, currentFrame);
      }
    },
    [track.id, currentFrame, canSplit, splitTrack],
  );

  const handleToggleVisibility = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      toggleTrackVisibility(track.id);
    },
    [track.id, toggleTrackVisibility],
  );

  const handleToggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (hasAudio) {
        toggleTrackMute(track.id);
      }
    },
    [track.id, hasAudio, toggleTrackMute],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Selection actions */}
        {!isSelected && (
          <>
            <ContextMenuItem onClick={handleSelectTrack}>
              Select Track
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {/* Track manipulation */}
        <ContextMenuItem onClick={handleDuplicateTrack} disabled={track.locked}>
          <Copy className="mr-2" />
          Duplicate Track
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuItem
          onClick={handleSplitTrack}
          disabled={!canSplit || track.locked}
        >
          <Scissors className="mr-2" />
          Split at Playhead
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>

        <ContextMenuSeparator />

        {/* Visibility controls */}
        <ContextMenuItem onClick={handleToggleVisibility}>
          {track.visible ? (
            <EyeOff className="mr-2" />
          ) : (
            <Eye className="mr-2" />
          )}
          {track.visible ? 'Hide Track' : 'Show Track'}
          <ContextMenuShortcut>V</ContextMenuShortcut>
        </ContextMenuItem>

        {/* Audio controls (only for audio/video tracks) */}
        {hasAudio && (
          <ContextMenuItem onClick={handleToggleMute}>
            {track.muted ? (
              <Volume2 className="mr-2" />
            ) : (
              <VolumeX className="mr-2" />
            )}
            {track.muted ? 'Unmute Track' : 'Mute Track'}
            <ContextMenuShortcut>M</ContextMenuShortcut>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator />

        {/* Destructive actions */}
        <ContextMenuItem
          onClick={handleDeleteTrack}
          variant="destructive"
          disabled={track.locked}
        >
          <Trash2 className="mr-2" />
          {hasMultipleSelected
            ? `Delete ${selectedTrackIds.length} Tracks`
            : 'Delete Track'}
          <ContextMenuShortcut>Del</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

TrackContextMenu.displayName = 'TrackContextMenu';
