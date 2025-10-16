/**
 * Duplicate Tracks Action Handler (Ctrl+D)
 * Duplicates selected tracks
 */

import { toast } from 'sonner';

export const duplicateTracksAction = (
  selectedTrackIds: string[],
  tracks: Array<{ id: string; isLinked?: boolean; linkedTrackId?: string }>,
  duplicateTrack: (
    trackId: string,
    duplicateLinked: boolean,
  ) => string | string[],
  setSelectedTracks: (trackIds: string[]) => void,
) => {
  if (selectedTrackIds.length === 0) {
    toast.info('No tracks selected to duplicate');
    return;
  }

  const processedTrackIds = new Set<string>();
  const newlyCreatedIds: string[] = [];

  selectedTrackIds.forEach((trackId: string) => {
    if (processedTrackIds.has(trackId)) {
      return;
    }

    const track = tracks.find((t) => t.id === trackId);
    if (!track) {
      console.error(`❌ Track ${trackId} not found in tracks array, skipping`);
      return;
    }

    const bothSidesSelected =
      track.isLinked &&
      track.linkedTrackId &&
      selectedTrackIds.includes(track.linkedTrackId);

    processedTrackIds.add(trackId);

    if (bothSidesSelected && track.linkedTrackId) {
      processedTrackIds.add(track.linkedTrackId);
    }

    const result = duplicateTrack(trackId, bothSidesSelected);

    if (result) {
      if (Array.isArray(result)) {
        newlyCreatedIds.push(...result);
      } else {
        newlyCreatedIds.push(result);
      }
    }
  });

  if (newlyCreatedIds.length > 0) {
    setSelectedTracks(newlyCreatedIds);
    const trackText = newlyCreatedIds.length === 1 ? 'track' : 'tracks';
    toast.success(`Duplicated ${newlyCreatedIds.length} ${trackText}`);
  } else {
    console.error('❌ Duplication produced no new tracks');
  }
};
