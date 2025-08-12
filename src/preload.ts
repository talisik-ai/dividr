import { contextBridge, ipcRenderer } from 'electron';
import { VideoEditJob } from './Schema/ffmpegConfig';
import { FfmpegProgress } from './Utility/ffmpegRunner';

// Progress event handlers type
export interface FfmpegEventHandlers {
  onProgress?: (progress: FfmpegProgress) => void;
  onStatus?: (status: string) => void;
  onLog?: (log: { log: string; type: 'stdout' | 'stderr' }) => void;
  onComplete?: (result: { success: boolean; result?: any; error?: string }) => void;
}

// Expose FFmpeg API to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // General IPC methods
  invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.on(channel, listener),
  removeListener: (channel: string, listener: (...args: any[]) => void) => ipcRenderer.removeListener(channel, listener),
  
  // Original API for backward compatibility
  runFfmpeg: (job: VideoEditJob) => ipcRenderer.invoke('run-ffmpeg', job),
  
  // Enhanced API with progress tracking
  runFfmpegWithProgress: (job: VideoEditJob, handlers?: FfmpegEventHandlers) => {
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
        ipcRenderer.on('ffmpeg-progress', (_, progress) => handlers.onProgress!(progress));
      }
      
      if (handlers.onStatus) {
        ipcRenderer.on('ffmpeg-status', (_, status) => handlers.onStatus!(status));
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