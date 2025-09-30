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
import React, { memo, useCallback, useMemo } from 'react';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../../Store/VideoEditorStore';

interface TrackContextMenuProps {
  track: VideoTrack;
  children: React.ReactNode;
}

// Memoized component with custom comparison
export const TrackContextMenu: React.FC<TrackContextMenuProps> = memo(
  ({ track, children }) => {
    // Only subscribe to the specific values we need
    const currentFrame = useVideoEditorStore(
      (state) => state.timeline.currentFrame,
    );
    const isSelected = useVideoEditorStore((state) =>
      state.timeline.selectedTrackIds.includes(track.id),
    );
    const selectedCount = useVideoEditorStore(
      (state) => state.timeline.selectedTrackIds.length,
    );

    // Get store actions using getState() to avoid reactive subscriptions
    const storeActions = useMemo(() => {
      const state = useVideoEditorStore.getState();
      return {
        removeTrack: state.removeTrack,
        duplicateTrack: state.duplicateTrack,
        splitTrack: state.splitTrack,
        toggleTrackVisibility: state.toggleTrackVisibility,
        toggleTrackMute: state.toggleTrackMute,
        setSelectedTracks: state.setSelectedTracks,
        removeSelectedTracks: state.removeSelectedTracks,
      };
    }, []); // Empty deps - actions are stable

    // Memoize computed values
    const hasMultipleSelected = selectedCount > 1;

    const canSplit = useMemo(
      () =>
        currentFrame > track.startFrame &&
        currentFrame < track.endFrame &&
        !track.locked,
      [currentFrame, track.startFrame, track.endFrame, track.locked],
    );

    const hasAudio = track.type === 'audio' || track.type === 'video';

    // Memoized handlers with stable dependencies
    const handleSelectTrack = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (!isSelected) {
          storeActions.setSelectedTracks([track.id]);
        }
      },
      [track.id, isSelected, storeActions],
    );

    const handleDeleteTrack = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (hasMultipleSelected) {
          storeActions.removeSelectedTracks();
        } else {
          storeActions.removeTrack(track.id);
        }
      },
      [track.id, hasMultipleSelected, storeActions],
    );

    const handleDuplicateTrack = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        storeActions.duplicateTrack(track.id);
      },
      [track.id, storeActions],
    );

    const handleSplitTrack = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (canSplit) {
          storeActions.splitTrack(track.id, currentFrame);
        }
      },
      [track.id, currentFrame, canSplit, storeActions],
    );

    const handleToggleVisibility = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        storeActions.toggleTrackVisibility(track.id);
      },
      [track.id, storeActions],
    );

    const handleToggleMute = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (hasAudio) {
          storeActions.toggleTrackMute(track.id);
        }
      },
      [track.id, hasAudio, storeActions],
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
          <ContextMenuItem
            onClick={handleDuplicateTrack}
            disabled={track.locked}
          >
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
              ? `Delete ${selectedCount} Tracks`
              : 'Delete Track'}
            <ContextMenuShortcut>Del</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison function for memo
    // Only re-render if track properties we care about have changed
    const prevTrack = prevProps.track;
    const nextTrack = nextProps.track;

    return (
      prevTrack.id === nextTrack.id &&
      prevTrack.startFrame === nextTrack.startFrame &&
      prevTrack.endFrame === nextTrack.endFrame &&
      prevTrack.locked === nextTrack.locked &&
      prevTrack.visible === nextTrack.visible &&
      prevTrack.muted === nextTrack.muted &&
      prevTrack.type === nextTrack.type &&
      prevProps.children === nextProps.children
    );
  },
);

TrackContextMenu.displayName = 'TrackContextMenu';
