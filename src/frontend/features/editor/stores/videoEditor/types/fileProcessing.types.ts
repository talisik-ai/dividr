export interface ImportedFileData {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  thumbnail?: string;
}

export interface ImportResult {
  success: boolean;
  importedFiles: ImportedFileData[];
}

export interface FileBuffer {
  name: string;
  type: string;
  size: number;
  buffer: ArrayBuffer;
}

export interface ProcessedFileInfo {
  name: string;
  path: string;
  type: string;
  extension: string;
  size: number;
}

export interface FileProcessingSlice {
  // Import methods
  importMediaFromDialog: () => Promise<ImportResult>;
  importMediaFromFiles: (files: File[]) => Promise<void>;
  importMediaFromDrop: (files: File[]) => Promise<ImportResult>;
  importMediaToTimeline: (files: File[]) => Promise<ImportResult>;
}
