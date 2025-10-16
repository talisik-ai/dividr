/**
 * Cut Tracks Action Handler (Ctrl+X)
 * Cuts selected tracks to internal clipboard (copy + delete)
 */

import { toast } from 'sonner';

export const cutTracksAction = (
  selectedTrackIds: string[],
  cutTracks: (trackIds: string[]) => void,
) => {
  if (selectedTrackIds.length === 0) {
    toast.info('No tracks selected to cut');
    return;
  }

  cutTracks(selectedTrackIds);

  const trackText = selectedTrackIds.length === 1 ? 'track' : 'tracks';
  toast.success(`Cut ${selectedTrackIds.length} ${trackText}`);
};
