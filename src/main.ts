import { spawn } from 'child_process';
import { app, BrowserWindow, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
import ffmpegPath from 'ffmpeg-static';
import ffprobePath from 'ffprobe-static';
import path from 'node:path';
import { VideoEditJob } from './Schema/ffmpegConfig';
import { cancelCurrentFfmpeg, runFfmpeg, runFfmpegWithProgress } from './Utility/ffmpegRunner';

if (started) {
  app.quit();
}

// IPC Handler for FFmpeg operations (backward compatibility)
ipcMain.handle('run-ffmpeg', async (event, job: VideoEditJob) => {
  try {
    const result = await runFfmpeg(job);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Enhanced IPC Handler for FFmpeg operations with real-time progress
ipcMain.handle('run-ffmpeg-with-progress', async (event, job: VideoEditJob) => {
  try {
    const result = await runFfmpegWithProgress(job, {
      onProgress: (progress) => {
        // Send progress updates to renderer process
        event.sender.send('ffmpeg-progress', progress);
      },
      onStatus: (status) => {
        // Send status updates to renderer process
        event.sender.send('ffmpeg-status', status);
      },
      onLog: (log, type) => {
        // Send log updates to renderer process
        event.sender.send('ffmpeg-log', { log, type });
      }
    });
    
    // Send completion event
    event.sender.send('ffmpeg-complete', { success: true, result });
    return { success: true, result };
  } catch (error) {
    // Send error event
    event.sender.send('ffmpeg-complete', { success: false, error: error.message });
    return { success: false, error: error.message };
  }
});

// IPC Handler to cancel FFmpeg operation
ipcMain.handle('cancel-ffmpeg', async (event) => {
  try {
    const cancelled = cancelCurrentFfmpeg();
    if (cancelled) {
      return { success: true, message: 'FFmpeg process cancelled successfully' };
    } else {
      return { success: false, message: 'No active FFmpeg process to cancel' };
    }
  } catch (error) {
    return { success: false, message: `Failed to cancel: ${error.message}` };
  }
});

// FFmpeg IPC handlers
ipcMain.handle('ffmpeg:detect-frame-rate', async (event, videoPath: string) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(ffprobePath.path, [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_streams',
      '-select_streams', 'v:0',
      videoPath
    ]);

    let output = '';
    
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      console.error(`ffprobe stderr: ${data}`);
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          const videoStream = result.streams[0];
          
          if (videoStream && videoStream.r_frame_rate) {
            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
            const frameRate = Math.round((num / den) * 100) / 100;
            resolve(frameRate);
          } else {
            resolve(30);
          }
        } catch (err) {
          console.error('Failed to parse ffprobe output:', err);
          resolve(30);
        }
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`ffprobe error: ${err.message}`));
    });
  });
});

// Global FFmpeg process tracking
let currentFfmpegProcess: any = null;

ipcMain.handle('ffmpeg:run', async (event, job: any) => {
  return new Promise((resolve, reject) => {
    if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
      reject(new Error('Another FFmpeg process is already running'));
      return;
    }

    // You'll need to import buildFfmpegCommand or recreate the logic here
    const args = ['-progress', 'pipe:1', '-y', /* ...buildFfmpegCommand(job) */];
    
    const ffmpeg = spawn(ffmpegPath as string, args);
    currentFfmpegProcess = ffmpeg;

    let logs = '';

    ffmpeg.stdout.on('data', (data) => {
      const text = data.toString();
      logs += `[stdout] ${text}\n`;
      event.sender.send('ffmpeg:progress', { type: 'stdout', data: text });
    });

    ffmpeg.stderr.on('data', (data) => {
      const text = data.toString();
      logs += `[stderr] ${text}\n`;
      event.sender.send('ffmpeg:progress', { type: 'stderr', data: text });
    });

    ffmpeg.on('close', (code) => {
      currentFfmpegProcess = null;
      if (code === 0) {
        resolve({ success: true, logs });
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      currentFfmpegProcess = null;
      reject(err);
    });
  });
});

ipcMain.handle('ffmpeg:cancel', async () => {
  if (currentFfmpegProcess) {
    currentFfmpegProcess.kill('SIGTERM');
    return true;
  }
  return false;
});


const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

