/* eslint-disable @typescript-eslint/no-explicit-any */
import { VideoEditJob } from './backend/ffmpeg/schema/ffmpegConfig';
import { FfmpegEventHandlers } from './preload';

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

      showItemInFolder: (filePath: string) => Promise<{
        success: boolean;
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
      readFileAsBuffer: (filePath: string) => Promise<ArrayBuffer>;

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

      // Video dimensions method
      getVideoDimensions: (filePath: string) => Promise<{
        width: number;
        height: number;
      }>;

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

      // ========================================================================
      // Python Faster-Whisper API
      // ========================================================================
      /**
       * Transcribe audio file using Python Faster-Whisper
       * @param audioPath - Path to audio file
       * @param options - Transcription options
       * @returns Transcription result with word-level timestamps
       */
      whisperTranscribe: (
        audioPath: string,
        options?: {
          model?:
            | 'tiny'
            | 'base'
            | 'small'
            | 'medium'
            | 'large'
            | 'large-v2'
            | 'large-v3';
          language?: string;
          translate?: boolean;
          device?: 'cpu' | 'cuda';
          computeType?: 'int8' | 'int16' | 'float16' | 'float32';
          beamSize?: number;
          vad?: boolean;
        },
      ) => Promise<{
        success: boolean;
        result?: {
          segments: Array<{
            start: number;
            end: number;
            text: string;
            words?: Array<{
              word: string;
              start: number;
              end: number;
              confidence: number;
            }>;
          }>;
          language: string;
          language_probability: number;
          duration: number;
          text: string;
          processing_time: number;
          model: string;
          device: string;
          segment_count: number;
          real_time_factor?: number;
          faster_than_realtime?: boolean;
        };
        error?: string;
      }>;

      /**
       * Cancel active transcription
       */
      whisperCancel: () => Promise<{ success: boolean; message: string }>;

      /**
       * Get Python Whisper status
       */
      whisperStatus: () => Promise<{
        available: boolean;
        pythonPath: string | null;
        pythonScriptPath: string | null;
        isProcessing: boolean;
      }>;

      /**
       * Listen for transcription progress updates
       */
      onWhisperProgress: (
        callback: (progress: {
          stage: 'loading' | 'processing' | 'complete' | 'error';
          progress: number;
          message?: string;
        }) => void,
      ) => void;

      /**
       * Remove progress listener
       */
      removeWhisperProgressListener: () => void;

      /**
       * Check if media file has audio
       */
      mediaHasAudio: (filePath: string) => Promise<{
        success: boolean;
        hasAudio: boolean;
        error?: string;
      }>;

      // ========================================================================
      // Media Tools API (Noise Reduction)
      // ========================================================================

      /**
       * Reduce noise from audio file
       * @param inputPath - Path to input audio file
       * @param outputPath - Path to output audio file
       * @param options - Noise reduction options
       */
      mediaToolsNoiseReduce: (
        inputPath: string,
        outputPath: string,
        options?: {
          stationary?: boolean;
          propDecrease?: number;
          nFft?: number;
        },
      ) => Promise<{
        success: boolean;
        result?: {
          success: boolean;
          outputPath: string;
          message?: string;
        };
        error?: string;
      }>;

      /**
       * Cancel active media-tools operation
       */
      mediaToolsCancel: () => Promise<{ success: boolean; message: string }>;

      /**
       * Get media-tools status
       */
      mediaToolsStatus: () => Promise<{
        available: boolean;
        mode: 'standalone' | 'python' | 'unavailable';
        mediaToolsPath: string | null;
        pythonPath: string | null;
        mainPyScriptPath: string | null;
        isProcessing: boolean;
      }>;

      /**
       * Listen for media-tools progress updates
       */
      onMediaToolsProgress: (
        callback: (progress: {
          stage: 'loading' | 'processing' | 'saving' | 'complete' | 'error';
          progress: number;
          message?: string;
        }) => void,
      ) => void;

      /**
       * Remove media-tools progress listener
       */
      removeMediaToolsProgressListener: () => void;

      // ========================================================================
      // Noise Reduction Cache APIs
      // ========================================================================

      /**
       * Get a unique output path for noise reduction
       * @param inputPath - Path to input audio file
       */
      noiseReductionGetOutputPath: (inputPath: string) => Promise<{
        success: boolean;
        outputPath?: string;
        error?: string;
      }>;

      /**
       * Cleanup noise reduction temp files
       * @param filePaths - Array of file paths to clean up
       */
      noiseReductionCleanupFiles: (filePaths: string[]) => Promise<{
        success: boolean;
        cleanedCount?: number;
        error?: string;
      }>;

      /**
       * Create preview URL data from processed file
       * @param filePath - Path to processed audio file
       */
      noiseReductionCreatePreviewUrl: (filePath: string) => Promise<{
        success: boolean;
        base64?: string;
        mimeType?: string;
        error?: string;
      }>;

      // ========================================================================
      // Runtime Download APIs
      // ========================================================================

      /**
       * Check runtime installation status
       */
      runtimeStatus: () => Promise<{
        installed: boolean;
        version: string | null;
        path: string | null;
        needsUpdate: boolean;
        requiredVersion: string;
      }>;

      /**
       * Start runtime download
       */
      runtimeDownload: () => Promise<{
        success: boolean;
        error?: string;
      }>;

      /**
       * Cancel runtime download
       */
      runtimeCancelDownload: () => Promise<{
        success: boolean;
      }>;

      /**
       * Verify runtime installation
       */
      runtimeVerify: () => Promise<{
        valid: boolean;
      }>;

      /**
       * Remove runtime
       */
      runtimeRemove: () => Promise<{
        success: boolean;
        error?: string;
      }>;

      /**
       * Listen for runtime download progress
       */
      onRuntimeDownloadProgress: (
        callback: (progress: {
          stage:
            | 'fetching'
            | 'downloading'
            | 'extracting'
            | 'verifying'
            | 'complete'
            | 'error';
          progress: number;
          bytesDownloaded?: number;
          totalBytes?: number;
          speed?: number;
          message?: string;
          error?: string;
        }) => void,
      ) => void;

      /**
       * Remove runtime download progress listener
       */
      removeRuntimeDownloadProgressListener: () => void;
    };
    appControl: {
      showWindow: () => Promise<boolean>;
      hideWindow: () => Promise<boolean>;
      quitApp: () => Promise<void>;
      closeApp: () => void;
      minimizeApp: () => void;
      maximizeApp: () => void;
      openExternalLink: (link: string) => Promise<void>;
      getMaximizeState: () => Promise<boolean>;
      onMaximizeChanged: (callback: (isMaximized: boolean) => void) => void;
      offMaximizeChanged: () => void;
      // File association: Handle .dividr files opened via double-click
      onOpenProjectFile: (callback: (filePath: string) => void) => void;
      offOpenProjectFile: () => void;
    };
  }
}
// eslint-disable-next-line prettier/prettier
export {};
// eslint-disable-next-line prettier/prettier
