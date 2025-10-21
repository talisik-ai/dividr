/**
 * Copy Tracks Action Handler (Ctrl+C)
 * Copies selected tracks to internal clipboard
 */

import { toast } from 'sonner';

export const copyTracksAction = (
  selectedTrackIds: string[],
  copyTracks: (trackIds: string[]) => void,
) => {
  if (selectedTrackIds.length === 0) {
    toast.info('No tracks selected to copy');
    return;
  }

  copyTracks(selectedTrackIds);

  const trackText = selectedTrackIds.length === 1 ? 'track' : 'tracks';
  toast.success(`Copied ${selectedTrackIds.length} ${trackText}`);
};
