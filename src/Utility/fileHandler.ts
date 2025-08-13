/**
 * File handling utilities for converting browser File objects to file paths
 * that can be accessed by FFmpeg in the main process.
 */

import { VideoEditJob } from '../Schema/ffmpegConfig';

export interface FileConversionResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

/**
 * Converts a browser File object to a temporary file path accessible by FFmpeg
 */
export async function convertFileToPath(file: File): Promise<FileConversionResult> {
  try {
    // Convert File to ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // Save to temporary file via IPC
    const result = await window.electronAPI.saveTempFile({
      name: file.name,
      buffer: arrayBuffer
    });
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error converting file'
    };
  }
}

/**
 * Converts an array of File objects to temporary file paths
 */
export async function convertFilesToPaths(files: File[]): Promise<{
  success: boolean;
  filePaths: string[];
  errors: string[];
}> {
  const results = await Promise.allSettled(
    files.map(file => convertFileToPath(file))
  );
  
  const filePaths: string[] = [];
  const errors: string[] = [];
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled' && result.value.success) {
      filePaths.push(result.value.filePath!);
    } else {
      const error = result.status === 'rejected' 
        ? result.reason?.message || 'Unknown error'
        : result.value.error || 'Conversion failed';
      errors.push(`File ${files[index].name}: ${error}`);
    }
  });
  
  return {
    success: errors.length === 0,
    filePaths,
    errors
  };
}

/**
 * Cleans up temporary files after FFmpeg processing
 */
export async function cleanupTempFiles(filePaths: string[]): Promise<void> {
  try {
    await window.electronAPI.cleanupTempFiles(filePaths);
  } catch (error) {
    console.warn('Failed to cleanup temporary files:', error);
  }
}

/**
 * Checks if a path is a blob URL that needs conversion
 */
export function isBlobUrl(path: string): boolean {
  return path.startsWith('blob:');
}

/**
 * Enhanced file handling that maintains a mapping between original sources and temp paths
 */
export class FilePathManager {
  private fileMap = new Map<string, string>(); // original source -> temp path
  private tempFiles: string[] = [];
  
  /**
   * Converts a file source (File object or path) to a usable file path
   */
  async convertSource(source: File | string): Promise<string> {
    if (typeof source === 'string') {
      // If it's already a path and not a blob URL, return as-is
      if (!isBlobUrl(source)) {
        return source;
      }
      throw new Error('String blob URLs cannot be converted without the original File object');
    }
    
    // It's a File object, convert it
    const result = await convertFileToPath(source);
    if (!result.success) {
      throw new Error(result.error || 'Failed to convert file');
    }
    
    const tempPath = result.filePath!;
    this.fileMap.set(source.name, tempPath);
    this.tempFiles.push(tempPath);
    
    return tempPath;
  }
  
  /**
   * Converts multiple sources to file paths
   */
  async convertSources(sources: (File | string)[]): Promise<string[]> {
    return Promise.all(sources.map(source => this.convertSource(source)));
  }
  
  /**
   * Cleans up all managed temporary files
   */
  async cleanup(): Promise<void> {
    if (this.tempFiles.length > 0) {
      await cleanupTempFiles(this.tempFiles);
      this.tempFiles = [];
      this.fileMap.clear();
    }
  }
  
  /**
   * Gets the temporary path for a given original source
   */
  getTempPath(originalSource: string): string | undefined {
    return this.fileMap.get(originalSource);
  }
} 

/**
 * Creates a VideoEditJob from track data, automatically converting File objects to file paths
 */
export async function createVideoEditJobFromTracks(
  tracks: Array<{
    file?: File;
    path?: string;
    operations?: VideoEditJob['operations'];
  }>,
  output: string,
  globalOperations?: VideoEditJob['operations']
): Promise<{
  job: VideoEditJob;
  fileManager: FilePathManager;
}> {
  const fileManager = new FilePathManager();
  const inputs: string[] = [];
  
  // Convert all inputs to file paths
  for (const track of tracks) {
    if (track.file) {
      const path = await fileManager.convertSource(track.file);
      inputs.push(path);
    } else if (track.path) {
      inputs.push(track.path);
    } else {
      throw new Error('Each track must have either a file or path property');
    }
  }
  
  const job: VideoEditJob = {
    inputs,
    output,
    operations: {
      ...globalOperations,
      // Merge any track-specific operations if needed
    }
  };
  
  return { job, fileManager };
}

/**
 * Helper function to convert tracks from the video editor store to a VideoEditJob
 */
export async function createJobFromVideoTracks(
  tracks: Array<{
    originalFile?: File;
    source: string;
    name: string;
  }>,
  output: string,
  operations?: VideoEditJob['operations']
): Promise<{
  job: VideoEditJob;
  fileManager: FilePathManager;
}> {
  const fileManager = new FilePathManager();
  const inputs: string[] = [];
  
  for (const track of tracks) {
    if (track.originalFile) {
      // Convert File object to temp path
      const path = await fileManager.convertSource(track.originalFile);
      inputs.push(path);
    } else if (!isBlobUrl(track.source)) {
      // Use the path directly if it's not a blob URL
      inputs.push(track.source);
    } else {
      throw new Error(`Cannot convert blob URL without original File object for track: ${track.name}`);
    }
  }
  
  const job: VideoEditJob = {
    inputs,
    output,
    operations: operations || {}
  };
  
  return { job, fileManager };
} 