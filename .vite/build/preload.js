"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // General IPC methods
  invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => electron.ipcRenderer.on(channel, listener),
  removeListener: (channel, listener) => electron.ipcRenderer.removeListener(channel, listener),
  // Original API for backward compatibility
  runFfmpeg: (job) => electron.ipcRenderer.invoke("run-ffmpeg", job),
  // Enhanced API with progress tracking
  runFfmpegWithProgress: (job, handlers) => {
    if (handlers) {
      const removeListeners = () => {
        electron.ipcRenderer.removeAllListeners("ffmpeg-progress");
        electron.ipcRenderer.removeAllListeners("ffmpeg-status");
        electron.ipcRenderer.removeAllListeners("ffmpeg-log");
        electron.ipcRenderer.removeAllListeners("ffmpeg-complete");
      };
      removeListeners();
      if (handlers.onProgress) {
        electron.ipcRenderer.on("ffmpeg-progress", (_, progress) => handlers.onProgress(progress));
      }
      if (handlers.onStatus) {
        electron.ipcRenderer.on("ffmpeg-status", (_, status) => handlers.onStatus(status));
      }
      if (handlers.onLog) {
        electron.ipcRenderer.on("ffmpeg-log", (_, logData) => handlers.onLog(logData));
      }
      if (handlers.onComplete) {
        electron.ipcRenderer.on("ffmpeg-complete", (_, result) => {
          handlers.onComplete(result);
          removeListeners();
        });
      }
    }
    return electron.ipcRenderer.invoke("run-ffmpeg-with-progress", job);
  },
  // Cancel FFmpeg operation
  cancelFfmpeg: () => electron.ipcRenderer.invoke("cancel-ffmpeg")
});
