/**
 * Export Video Action Handler (Ctrl+E)
 * Triggers the export button click programmatically
 * This ensures we use the same export flow as the ExportButton component
 */

import { toast } from 'sonner';

export const exportVideoAction = (tracksCount: number) => {
  try {
    if (tracksCount === 0) {
      toast.error('No tracks to export');
      return;
    }

    // Find and click the export button programmatically
    // This ensures we use the exact same export flow
    const exportButton = document.querySelector(
      '[data-export-button]',
    ) as HTMLButtonElement;

    if (exportButton) {
      exportButton.click();
    } else {
      // Fallback: show toast
      toast.info(
        'Export button not found. Please use the Export button in the header.',
      );
    }
  } catch (error) {
    console.error('[Export Video] Failed:', error);
    toast.error('Failed to open export dialog');
  }
};
