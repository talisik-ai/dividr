/**
 * Paste Tracks Action Handler (Ctrl+V)
 * Pastes tracks from internal clipboard
 */

import { toast } from 'sonner';

export const pasteTracksAction = (
  hasClipboardData: () => boolean,
  pasteTracks: () => void,
) => {
  if (!hasClipboardData()) {
    toast.info('Nothing to paste');
    return;
  }

  pasteTracks();
  toast.success('Pasted tracks');
};
