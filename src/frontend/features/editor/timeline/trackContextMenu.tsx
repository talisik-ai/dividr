import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/frontend/components/ui/context-menu';
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
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';

interface TrackContextMenuProps {
  track: VideoTrack;
  children: React.ReactNode;
}

export const TrackContextMenu: React.FC<TrackContextMenuProps> = memo(
  ({ track, children }) => {
    const currentFrame = useVideoEditorStore(
      (state) => state.timeline.currentFrame,
    );
    const isSelected = useVideoEditorStore((state) =>
      state.timeline.selectedTrackIds.includes(track.id),
    );
    const selectedCount = useVideoEditorStore(
      (state) => state.timeline.selectedTrackIds.length,
    );

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
    }, []);

    const hasMultipleSelected = selectedCount > 1;

    const canSplit = useMemo(
      () =>
        currentFrame > track.startFrame &&
        currentFrame < track.endFrame &&
        !track.locked,
      [currentFrame, track.startFrame, track.endFrame, track.locked],
    );

    // Only audio tracks get mute option
    const hasAudio = track.type === 'audio';
    // Video, image, and subtitle tracks get visibility option
    const hasVisibility =
      track.type === 'video' ||
      track.type === 'image' ||
      track.type === 'subtitle';

    const handleSelectTrack = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isSelected) {
          storeActions.setSelectedTracks([track.id]);
        }
      },
      [track.id, isSelected, storeActions],
    );

    const handleDeleteTrack = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
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
        e.stopPropagation();
        storeActions.duplicateTrack(track.id);
      },
      [track.id, storeActions],
    );

    const handleSplitTrack = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (canSplit) {
          storeActions.splitTrack(track.id, currentFrame);
        }
      },
      [track.id, currentFrame, canSplit, storeActions],
    );

    const handleToggleVisibility = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        storeActions.toggleTrackVisibility(track.id);
      },
      [track.id, storeActions],
    );

    const handleToggleMute = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        storeActions.toggleTrackMute(track.id);
      },
      [track.id, storeActions],
    );

    return (
      <ContextMenu>
        <ContextMenuTrigger asChild onContextMenu={(e) => e.stopPropagation()}>
          {children}
        </ContextMenuTrigger>
        <ContextMenuContent
          className="w-56"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {!isSelected && (
            <>
              <ContextMenuItem onClick={handleSelectTrack}>
                Select Track
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}

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

          {(hasVisibility || hasAudio) && <ContextMenuSeparator />}

          {hasVisibility && (
            <ContextMenuItem onClick={handleToggleVisibility}>
              {track.visible ? (
                <EyeOff className="mr-2" />
              ) : (
                <Eye className="mr-2" />
              )}
              {track.visible ? 'Hide Track' : 'Show Track'}
              <ContextMenuShortcut>V</ContextMenuShortcut>
            </ContextMenuItem>
          )}

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

          {(hasVisibility || hasAudio) && <ContextMenuSeparator />}

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
