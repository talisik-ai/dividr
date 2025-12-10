/* eslint-disable @typescript-eslint/no-explicit-any */
import { toast } from 'sonner';

export type ImportSource =
  | 'dialog'
  | 'library-drop'
  | 'timeline-drop'
  | 'preview-drop';

export interface MediaImportOptions {
  addToTimeline: boolean;
  startFrame?: number;
  showToasts?: boolean;
}

// Deduplication map
const ongoingImports = new Map<string, Promise<any>>();

function generateImportKey(files: File[]): string {
  return files
    .map((f) => `${f.name}:${f.size}:${f.lastModified}`)
    .sort()
    .join('|');
}

export async function importMediaUnified(
  files: File[],
  source: ImportSource,
  storeActions: {
    importMediaFromDrop: (files: File[]) => Promise<any>;
    importMediaToTimeline: (files: File[]) => Promise<any>;
    addTrackFromMediaLibrary: (id: string, frame: number) => Promise<any>;
  },
  options: MediaImportOptions = { addToTimeline: false },
): Promise<any> {
  const importKey = generateImportKey(files);

  // Prevent duplicate imports
  if (ongoingImports.has(importKey)) {
    console.log('⚠️ Import already in progress');
    return ongoingImports.get(importKey)!;
  }

  const importFn = options.addToTimeline
    ? storeActions.importMediaToTimeline
    : storeActions.importMediaFromDrop;

  const importPromise = importFn(files);
  ongoingImports.set(importKey, importPromise);

  if (options.showToasts !== false) {
    const destination = options.addToTimeline ? ' to timeline' : '';
    toast.promise(importPromise, {
      loading: `Adding ${files.length} file${files.length > 1 ? 's' : ''}${destination}...`,
      success: (result) => {
        if (result.importedFiles?.length === 0) {
          throw new Error(result.error || 'No files imported');
        }
        const imported = result.importedFiles?.length || 0;
        const rejected = result.rejectedFiles?.length || 0;
        return `Imported ${imported} file${imported > 1 ? 's' : ''}${rejected > 0 ? ` (${rejected} rejected)` : ''}`;
      },
      error: (err) => err?.error || 'Import failed',
    });
  }

  try {
    return await importPromise;
  } finally {
    ongoingImports.delete(importKey);
  }
}

/**
 * Unified handler for dialog-based imports (file explorer)
 */
export async function importMediaFromDialogUnified(
  importMediaFromDialog: () => Promise<any>,
  storeActions: {
    importMediaFromDrop: (files: File[]) => Promise<any>;
    importMediaToTimeline: (files: File[]) => Promise<any>;
    addTrackFromMediaLibrary: (id: string, frame: number) => Promise<any>;
  },
  options: MediaImportOptions = { addToTimeline: false },
): Promise<any> {
  const importPromise = importMediaFromDialog();

  if (options.showToasts !== false) {
    toast.promise(importPromise, {
      loading: 'Importing files...',
      success: (result) => {
        if (!result?.success || result.importedFiles?.length === 0) {
          throw new Error(result?.error || 'No files imported');
        }
        const imported = result.importedFiles?.length || 0;
        const rejected = result.rejectedFiles?.length || 0;
        return `Imported ${imported} file${imported > 1 ? 's' : ''}${rejected > 0 ? ` (${rejected} rejected)` : ''}`;
      },
      error: (err) => err?.error || err?.message || 'Import failed',
    });
  }

  const result = await importPromise;

  // If addToTimeline is true and we have imported files, add them to timeline
  if (
    options.addToTimeline &&
    result?.success &&
    result.importedFiles?.length > 0
  ) {
    for (const file of result.importedFiles) {
      try {
        await storeActions.addTrackFromMediaLibrary(
          file.id,
          options.startFrame || 0,
        );
      } catch (err) {
        console.warn(`Failed to add ${file.name} to timeline:`, err);
      }
    }
  }

  return result;
}
