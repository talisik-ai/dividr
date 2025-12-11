/* eslint-disable @typescript-eslint/no-explicit-any */
import { contextBridge, ipcRenderer } from 'electron';
import { FfmpegProgress } from './backend/ffmpeg/export/ffmpegRunner';
import { VideoEditJob } from './backend/ffmpeg/schema/ffmpegConfig';

// Progress event handlers type
export interface FfmpegEventHandlers {
  onProgress?: (progress: FfmpegProgress) => void;
  onStatus?: (status: string) => void;
  onLog?: (log: { log: string; type: 'stdout' | 'stderr' }) => void;
  onComplete?: (result: {
    success: boolean;
    result?: any;
    error?: string;
  }) => void;
}

// Expose FFmpeg API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // General IPC methods
  invoke: (channel: string, ...args: any[]) =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void) =>
    ipcRenderer.on(channel, listener),
  removeListener: (channel: string, listener: (...args: any[]) => void) =>
    ipcRenderer.removeListener(channel, listener),

  // File dialog methods
  openFileDialog: (options?: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
  }) => ipcRenderer.invoke('open-file-dialog', options),

  showSaveDialog: (options?: {
    title?: string;
    defaultPath?: string;
    buttonLabel?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }) => ipcRenderer.invoke('show-save-dialog', options),

  getDownloadsDirectory: () => ipcRenderer.invoke('get-downloads-directory'),

  showItemInFolder: (filePath: string) =>
    ipcRenderer.invoke('show-item-in-folder', filePath),

  // File preview methods
  createPreviewUrl: (filePath: string) =>
    ipcRenderer.invoke('create-preview-url', filePath),
  getFileStream: (filePath: string, start?: number, end?: number) =>
    ipcRenderer.invoke('get-file-stream', filePath, start, end),

  // File processing methods
  processDroppedFiles: (
    fileBuffers: Array<{
      name: string;
      type: string;
      size: number;
      buffer: ArrayBuffer;
    }>,
  ) => ipcRenderer.invoke('process-dropped-files', fileBuffers),
  cleanupTempFiles: (filePaths: string[]) =>
    ipcRenderer.invoke('cleanup-temp-files', filePaths),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  readFileAsBuffer: (filePath: string) =>
    ipcRenderer.invoke('read-file-as-buffer', filePath),

  // FFmpeg API
  ffmpegRun: (job: VideoEditJob) => ipcRenderer.invoke('ffmpegRun', job),
  runFfmpeg: (job: VideoEditJob) => ipcRenderer.invoke('run-ffmpeg', job),
  getDuration: (filePath: string) =>
    ipcRenderer.invoke('ffmpeg:get-duration', filePath),
  runCustomFFmpeg: (args: string[], outputDir: string) =>
    ipcRenderer.invoke('run-custom-ffmpeg', args, outputDir),

  // Get Dimensions
  getVideoDimensions: (filePath: string) =>
    ipcRenderer.invoke('getVideoDimensions', filePath),
  // Audio extraction method
  extractAudioFromVideo: (videoPath: string, outputDir?: string) =>
    ipcRenderer.invoke('extract-audio-from-video', videoPath, outputDir),

  // Cleanup extracted audio files
  cleanupExtractedAudio: (audioPaths: string[]) =>
    ipcRenderer.invoke('cleanup-extracted-audio', audioPaths),

  // Background sprite sheet generation methods
  generateSpriteSheetBackground: (options: {
    jobId: string;
    videoPath: string;
    outputDir: string;
    commands: string[][];
  }) => ipcRenderer.invoke('generate-sprite-sheet-background', options),

  getSpriteSheetProgress: (jobId: string) =>
    ipcRenderer.invoke('get-sprite-sheet-progress', jobId),

  cancelSpriteSheetJob: (jobId: string) =>
    ipcRenderer.invoke('cancel-sprite-sheet-job', jobId),

  // Sprite sheet event listeners
  onSpriteSheetJobCompleted: (
    callback: (data: {
      jobId: string;
      outputFiles: string[];
      outputDir: string;
    }) => void,
  ) =>
    ipcRenderer.on('sprite-sheet-job-completed', (event, data) =>
      callback(data),
    ),

  onSpriteSheetJobError: (
    callback: (data: { jobId: string; error: string }) => void,
  ) =>
    ipcRenderer.on('sprite-sheet-job-error', (event, data) => callback(data)),

  removeSpriteSheetListeners: () => {
    ipcRenderer.removeAllListeners('sprite-sheet-job-completed');
    ipcRenderer.removeAllListeners('sprite-sheet-job-error');
  },

  // FFmpeg diagnostics
  getFFmpegStatus: () => ipcRenderer.invoke('ffmpeg:status'),

  // Enhanced API with progress tracking
  runFfmpegWithProgress: (
    job: VideoEditJob,
    handlers?: FfmpegEventHandlers,
  ) => {
    // Set up event listeners if handlers provided
    if (handlers) {
      const removeListeners = () => {
        ipcRenderer.removeAllListeners('ffmpeg-progress');
        ipcRenderer.removeAllListeners('ffmpeg-status');
        ipcRenderer.removeAllListeners('ffmpeg-log');
        ipcRenderer.removeAllListeners('ffmpeg-complete');
      };

      // Clean up any existing listeners
      removeListeners();

      // Set up new listeners
      if (handlers.onProgress) {
        ipcRenderer.on('ffmpeg-progress', (_, progress) =>
          handlers.onProgress!(progress),
        );
      }

      if (handlers.onStatus) {
        ipcRenderer.on('ffmpeg-status', (_, status) =>
          handlers.onStatus!(status),
        );
      }

      if (handlers.onLog) {
        ipcRenderer.on('ffmpeg-log', (_, logData) => handlers.onLog!(logData));
      }

      if (handlers.onComplete) {
        ipcRenderer.on('ffmpeg-complete', (_, result) => {
          handlers.onComplete!(result);
          removeListeners(); // Clean up after completion
        });
      }
    }

    return ipcRenderer.invoke('run-ffmpeg-with-progress', job);
  },

  // Cancel FFmpeg operation
  cancelFfmpeg: () => ipcRenderer.invoke('cancel-ffmpeg'),

  // Subtitle file operations
  writeSubtitleFile: (options: {
    content: string;
    filename: string;
    outputPath: string;
  }) => ipcRenderer.invoke('write-subtitle-file', options),

  deleteFile: (filePath: string) => ipcRenderer.invoke('delete-file', filePath),

  // ============================================================================

  // Python Faster-Whisper API
  // ============================================================================

  // Transcribe audio file (Python Faster-Whisper)
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
  ) => ipcRenderer.invoke('whisper:transcribe', audioPath, options),

  // Cancel active transcription
  whisperCancel: () => ipcRenderer.invoke('whisper:cancel'),

  // Get Whisper status and available models
  whisperStatus: () => ipcRenderer.invoke('whisper:status'),

  // Listen for transcription progress updates
  onWhisperProgress: (
    callback: (progress: {
      stage: 'loading' | 'processing' | 'complete' | 'error';
      progress: number;
      message?: string;
    }) => void,
  ) => ipcRenderer.on('whisper:progress', (_, progress) => callback(progress)),

  // Remove progress listener
  removeWhisperProgressListener: () =>
    ipcRenderer.removeAllListeners('whisper:progress'),

  // Check if media file has audio
  mediaHasAudio: (filePath: string) =>
    ipcRenderer.invoke('media:has-audio', filePath),
});

contextBridge.exposeInMainWorld('appControl', {
  showWindow: () => ipcRenderer.invoke('show-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  setAutoLaunch: (enabled: boolean) =>
    ipcRenderer.invoke('set-auto-launch', enabled),
  quitApp: () => ipcRenderer.send('close-btn'),
  minimizeApp: () => ipcRenderer.send('minimize-btn'),
  maximizeApp: () => ipcRenderer.send('maximize-btn'),
  getAutoLaunch: () => ipcRenderer.invoke('get-auto-launch'),
  getMaximizeState: () => ipcRenderer.invoke('get-maximize-state'),
  onMaximizeChanged: (callback: (isMaximized: boolean) => void) => {
    ipcRenderer.on('window-maximize-changed', (_event, isMaximized: boolean) =>
      callback(isMaximized),
    );
  },
  offMaximizeChanged: () => {
    ipcRenderer.removeAllListeners('window-maximize-changed');
  },

  // Clipboard monitoring
  getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),
  onClipboardChange: (callback: (text: string) => void) => {
    ipcRenderer.on('clipboard-changed', (_event, text: string) =>
      callback(text),
    );
  },
  offClipboardChange: () => {
    ipcRenderer.removeAllListeners('clipboard-changed');
  },
  startClipboardMonitoring: () =>
    ipcRenderer.invoke('start-clipboard-monitoring'),
  stopClipboardMonitoring: () =>
    ipcRenderer.invoke('stop-clipboard-monitoring'),
  isClipboardMonitoringActive: () =>
    ipcRenderer.invoke('is-clipboard-monitoring-active'),
  isWindowFocused: () => ipcRenderer.invoke('is-window-focused'),
  clearLastClipboardText: () => ipcRenderer.invoke('clear-last-clipboard-text'),
  clearClipboard: () => ipcRenderer.invoke('clear-clipboard'),
});
