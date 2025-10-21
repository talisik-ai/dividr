/**
 * Deselect All Tracks Action Handler
 * Clears all track selections on the timeline
 */

export const deselectAllTracksAction = (
  setSelectedTracks: (ids: string[]) => void,
  selectedTrackIds: string[],
) => {
  if (selectedTrackIds.length === 0) {
    return; // Nothing to deselect
  }

  setSelectedTracks([]);
};
