import { cn } from '@/frontend/utils/utils';
import React, { useMemo } from 'react';
import { useVideoEditorStore } from '../../stores/videoEditor/index';
import { SubtitleProperties } from './subtitles/subtitleProperties';
import { TextProperties } from './text/textProperties';

interface PropertiesPanelProps {
  className?: string;
}

const PropertiesPanelComponent: React.FC<PropertiesPanelProps> = ({
  className,
}) => {
  // Only subscribe to tracks and timeline for selection logic
  const tracks = useVideoEditorStore((state) => state.tracks);
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );

  // Get selected tracks
  const selectedTracks = useMemo(
    () => tracks.filter((track) => selectedTrackIds.includes(track.id)),
    [tracks, selectedTrackIds],
  );

  // Determine track type to render appropriate properties
  const hasSubtitleSelection = useMemo(
    () => selectedTracks.some((track) => track.type === 'subtitle'),
    [selectedTracks],
  );

  const hasTextSelection = useMemo(
    () => selectedTracks.some((track) => track.type === 'text'),
    [selectedTracks],
  );

  // Don't render if no tracks are selected
  if (selectedTracks.length === 0) {
    return null;
  }

  // Don't render if none of the selected tracks have implemented properties
  if (!hasSubtitleSelection && !hasTextSelection) {
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

      {/* Future: Add more track type properties here */}
      {/* Example: hasVideoSelection && <VideoProperties ... /> */}
      {/* Example: hasAudioSelection && <AudioProperties ... /> */}
      {/* Example: hasImageSelection && <ImageProperties ... /> */}
    </div>
  );
};

PropertiesPanelComponent.displayName = 'PropertiesPanel';

export const PropertiesPanel = React.memo(PropertiesPanelComponent);
