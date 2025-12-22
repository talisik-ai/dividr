import { cn } from '@/frontend/utils/utils';
import React, { useMemo } from 'react';
import { useVideoEditorStore } from '../../stores/videoEditor/index';
import { AudioProperties } from './audio/audioProperties';
import { ImageProperties } from './image/imageProperties';
import { SubtitleProperties } from './subtitles/subtitleProperties';
import { TextProperties } from './text/textProperties';
import { VideoProperties } from './video/videoProperties';

interface PropertiesPanelProps {
  className?: string;
}

const PropertiesPanelComponent: React.FC<PropertiesPanelProps> = ({
  className,
}) => {
  // Only subscribe to specific state slices to minimize re-renders
  const tracks = useVideoEditorStore((state) => state.tracks);
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );

  // Memoize selected tracks to prevent unnecessary recalculations
  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedTrackIds.includes(track.id)),
    [tracks, selectedTrackIds],
  );

  // Memoize track type checks to prevent unnecessary recalculations
  const hasSubtitleSelection = useMemo(
    () => selectedTracks.some((track) => track.type === 'subtitle'),
    [selectedTracks],
  );

  const hasTextSelection = useMemo(
    () => selectedTracks.some((track) => track.type === 'text'),
    [selectedTracks],
  );

  const hasVideoSelection = useMemo(
    () => selectedTracks.some((track) => track.type === 'video'),
    [selectedTracks],
  );

  const hasImageSelection = useMemo(
    () => selectedTracks.some((track) => track.type === 'image'),
    [selectedTracks],
  );

  const hasAudioSelection = useMemo(
    () => selectedTracks.some((track) => track.type === 'audio'),
    [selectedTracks],
  );

  // Early return if no tracks are selected
  if (selectedTracks.length === 0) {
    return null;
  }

  // Early return if none of the selected tracks have implemented properties
  if (
    !hasSubtitleSelection &&
    !hasTextSelection &&
    !hasVideoSelection &&
    !hasImageSelection &&
    !hasAudioSelection
  ) {
    return null;
  }

  return (
    <div
      className={cn(
        'w-80 flex flex-col border-l border-accent bg-transparent',
        className,
      )}
    >
      {/* Dynamic Properties Rendering based on track type */}
      {hasTextSelection && (
        <TextProperties selectedTrackIds={selectedTrackIds} />
      )}

      {hasSubtitleSelection && !hasTextSelection && (
        <SubtitleProperties selectedTrackIds={selectedTrackIds} />
      )}

      {hasVideoSelection && !hasTextSelection && !hasSubtitleSelection && (
        <VideoProperties selectedTrackIds={selectedTrackIds} />
      )}

      {hasAudioSelection &&
        !hasTextSelection &&
        !hasSubtitleSelection &&
        !hasVideoSelection && (
          <AudioProperties selectedTrackIds={selectedTrackIds} />
        )}

      {hasImageSelection &&
        !hasTextSelection &&
        !hasSubtitleSelection &&
        !hasVideoSelection &&
        !hasAudioSelection && (
          <ImageProperties selectedTrackIds={selectedTrackIds} />
        )}

      {/* Future: Add more track type properties here */}
      {/* Example: hasAudioSelection && <AudioProperties ... /> */}
    </div>
  );
};

PropertiesPanelComponent.displayName = 'PropertiesPanel';

// Memoize the component to prevent re-renders when parent re-renders
export const PropertiesPanel = React.memo(PropertiesPanelComponent);
