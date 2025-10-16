/**
 * Import Media Action Handler (Ctrl+I)
 * Opens file picker to import media files into the project
 */

import { toast } from 'sonner';

export const importMediaAction = async (
  importMediaFromDialog: () => Promise<{
    success: boolean;
    importedFiles?: Array<{
      id: string;
      name: string;
      type: string;
      size: number;
      url: string;
    }>;
    canceled?: boolean;
  }>,
) => {
  try {
    const result = await importMediaFromDialog();

    if (result.success && result.importedFiles?.length) {
      const count = result.importedFiles.length;
      toast.success(`Imported ${count} file${count > 1 ? 's' : ''}`);
    } else if (!result.success && !result.canceled) {
      toast.error('Failed to import media');
    }
    // If canceled, do nothing (user cancelled the dialog)
  } catch (error) {
    console.error('[Import Media] Failed:', error);
    toast.error('Failed to import media');
  }
};
