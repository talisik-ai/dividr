/* eslint-disable @typescript-eslint/no-explicit-any */
import { FfmpegEventHandlers } from './preload';
import { VideoEditJob } from './Schema/ffmpegConfig';

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      // General IPC methods
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, listener: (...args: any[]) => void) => void;
      removeListener: (
        channel: string,
        listener: (...args: any[]) => void,
      ) => void;

      // File dialog methods
      openFileDialog: (options?: {
        title?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
        properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
      }) => Promise<{
        success: boolean;
        files?: Array<{
          path: string;
          name: string;
          size: number;
          type: 'video' | 'audio' | 'image';
          extension: string;
        }>;
        canceled?: boolean;
        error?: string;
      }>;

      showSaveDialog: (options?: {
        title?: string;
        defaultPath?: string;
        buttonLabel?: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{
        success: boolean;
        filePath?: string;
        directory?: string;
        filename?: string;
        canceled?: boolean;
        error?: string;
      }>;

      getDownloadsDirectory: () => Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>;

      // File preview methods
      createPreviewUrl: (filePath: string) => Promise<{
        success: boolean;
        url?: string;
        error?: string;
      }>;
      getFileStream: (
        filePath: string,
        start?: number,
        end?: number,
      ) => Promise<{
        success: boolean;
        data?: string;
        start?: number;
        end?: number;
        total?: number;
        error?: string;
      }>;

      // File processing methods
      processDroppedFiles: (
        fileBuffers: Array<{
          name: string;
          type: string;
          size: number;
          buffer: ArrayBuffer;
        }>,
      ) => Promise<{
        success: boolean;
        files?: Array<{
          name: string;
          originalName: string;
          type: 'video' | 'audio' | 'image';
          size: number;
          extension: string;
          path: string;
          hasPath: boolean;
          isTemporary: boolean;
        }>;
        error?: string;
      }>;
      cleanupTempFiles: (filePaths: string[]) => Promise<{
        success: boolean;
        cleanedCount?: number;
        error?: string;
      }>;
      readFile: (filePath: string) => Promise<string>;

      // Subtitle file operations
      writeSubtitleFile: (options: {
        content: string;
        filename: string;
        outputPath: string;
      }) => Promise<{
        success: boolean;
        filePath?: string;
        error?: string;
      }>;
      deleteFile: (filePath: string) => Promise<{
        success: boolean;
        error?: string;
      }>;

      ffmpegRun: (job: VideoEditJob) => Promise<{
        success: boolean;
        result?: { command: string; logs: string };
        error?: string;
      }>;
      runFfmpeg: (job: VideoEditJob) => Promise<{
        success: boolean;
        result?: { command: string; logs: string };
        error?: string;
      }>;
      getDuration: (filePath: string) => Promise<number>;
      runFfmpegWithProgress: (
        job: VideoEditJob,
        handlers?: FfmpegEventHandlers,
      ) => Promise<{
        success: boolean;
        result?: { command: string; logs: string };
        error?: string;
      }>;
      cancelFfmpeg: () => Promise<{
        success: boolean;
        message?: string;
      }>;
      runCustomFFmpeg: (
        args: string[],
        outputDir: string,
      ) => Promise<{
        success: boolean;
        error?: string;
        output?: string[];
      }>;

      // Audio extraction method
      extractAudioFromVideo: (
        videoPath: string,
        outputDir?: string,
      ) => Promise<{
        success: boolean;
        audioPath?: string;
        previewUrl?: string;
        size?: number;
        message?: string;
        error?: string;
      }>;

      // Cleanup extracted audio files
      cleanupExtractedAudio: (audioPaths: string[]) => Promise<{
        success: boolean;
        deletedFiles: string[];
        failedFiles: string[];
        errors: string[];
      }>;

      // Background sprite sheet generation methods
      generateSpriteSheetBackground: (options: {
        jobId: string;
        videoPath: string;
        outputDir: string;
        commands: string[][];
      }) => Promise<{
        success: boolean;
        jobId?: string;
        message?: string;
        error?: string;
      }>;

      getSpriteSheetProgress: (jobId: string) => Promise<{
        success: boolean;
        progress?: {
          current: number;
          total: number;
          stage: string;
        };
        elapsedTime?: number;
        error?: string;
      }>;

      cancelSpriteSheetJob: (jobId: string) => Promise<{
        success: boolean;
        message?: string;
        error?: string;
      }>;

      // Sprite sheet event listeners
      onSpriteSheetJobCompleted: (
        callback: (data: {
          jobId: string;
          outputFiles: string[];
          outputDir: string;
        }) => void,
      ) => void;
      onSpriteSheetJobError: (
        callback: (data: { jobId: string; error: string }) => void,
      ) => void;
      removeSpriteSheetListeners: () => void;
    };
    appControl: {
      showWindow: () => Promise<boolean>;
      hideWindow: () => Promise<boolean>;
      quitApp: () => Promise<void>;
      closeApp: () => void;
      minimizeApp: () => void;
      maximizeApp: () => void;
      openExternalLink: (link: string) => Promise<void>;
    };
  }
}
// eslint-disable-next-line prettier/prettier
export {};
// eslint-disable-next-line prettier/prettier
