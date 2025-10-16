/**
 * Select All Tracks Action Handler (Ctrl+A)
 * Selects all tracks on the timeline
 */

import { toast } from 'sonner';

export const selectAllTracksAction = (
  tracks: Array<{ id: string }>,
  setSelectedTracks: (ids: string[]) => void,
) => {
  if (tracks.length === 0) {
    toast.info('No tracks to select');
    return;
  }

  const allTrackIds = tracks.map((track) => track.id);
  setSelectedTracks(allTrackIds);
};
