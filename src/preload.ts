import { contextBridge, ipcRenderer } from 'electron';
import { VideoEditJob } from './Schema/ffmpegConfig';
import { FfmpegProgress } from './Utility/ffmpegRunner';

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

  // File preview methods
  createPreviewUrl: (filePath: string) =>
    ipcRenderer.invoke('create-preview-url', filePath),
  getFileStream: (filePath: string, start?: number, end?: number) =>
    ipcRenderer.invoke('get-file-stream', filePath, start, end),

  // FFmpeg API
  ffmpegRun: (job: VideoEditJob) => ipcRenderer.invoke('ffmpegRun', job),
  runFfmpeg: (job: VideoEditJob) => ipcRenderer.invoke('run-ffmpeg', job),
  getDuration: (filePath: string) =>
    ipcRenderer.invoke('ffmpeg:get-duration', filePath),

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
