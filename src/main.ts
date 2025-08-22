import { spawn } from 'child_process';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
// Dynamic import of ffmpeg binaries to avoid module resolution issues
let ffmpegPath: string | null = null;
let ffprobePath: { path: string } | null = null;

// Initialize ffmpeg paths dynamically with fallbacks
async function initializeFfmpegPaths() {
  try {
    // Try to import ffmpeg-static dynamically
    const ffmpegStatic = await import('ffmpeg-static');
    ffmpegPath = ffmpegStatic.default;
    console.log('✅ FFmpeg binary path (static):', ffmpegPath);
  } catch (error) {
    console.error('❌ Failed to load ffmpeg-static:', error.message);

    // Fallback to system FFmpeg if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { execSync } = require('child_process');
      const systemFfmpeg = execSync('where ffmpeg', {
        encoding: 'utf8',
      }).trim();
      ffmpegPath = systemFfmpeg.split('\n')[0]; // Get first result
      console.log('✅ Using system FFmpeg:', ffmpegPath);
    } catch (systemError) {
      console.error('❌ System FFmpeg not found:', systemError.message);
      console.error(
        '📋 Please install FFmpeg or ensure ffmpeg-static package is properly installed',
      );
    }
  }

  try {
    // Try to import ffprobe-static dynamically
    const ffprobeStatic = await import('ffprobe-static');
    ffprobePath = ffprobeStatic.default;
    console.log('✅ FFprobe binary path (static):', ffprobePath?.path);
  } catch (error) {
    console.error('❌ Failed to load ffprobe-static:', error.message);

    // Fallback to system FFprobe if available
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { execSync } = require('child_process');
      const systemFfprobe = execSync('where ffprobe', {
        encoding: 'utf8',
      }).trim();
      ffprobePath = { path: systemFfprobe.split('\n')[0] }; // Get first result
      console.log('✅ Using system FFprobe:', ffprobePath.path);
    } catch (systemError) {
      console.error('❌ System FFprobe not found:', systemError.message);
      console.error(
        '📋 Please install FFmpeg or ensure ffprobe-static package is properly installed',
      );
    }
  }
}
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { VideoEditJob } from './Schema/ffmpegConfig';
import { buildFfmpegCommand } from './Utility/commandBuilder';
import {
  cancelCurrentFfmpeg,
  runFfmpeg,
  runFfmpegWithProgress,
} from './Utility/ffmpegRunner';

if (started) {
  app.quit();
}

// Create a simple HTTP server to serve media files
let mediaServer: http.Server | null = null;
const MEDIA_SERVER_PORT = 3001;

function createMediaServer() {
  mediaServer = http.createServer((req, res) => {
    if (!req.url) {
      res.writeHead(404);
      res.end();
      return;
    }

    // Parse the file path from the URL
    const urlPath = decodeURIComponent(req.url.slice(1)); // Remove leading slash

    try {
      if (!fs.existsSync(urlPath)) {
        res.writeHead(404);
        res.end('File not found');
        return;
      }

      const stats = fs.statSync(urlPath);
      const ext = path.extname(urlPath).toLowerCase();

      // Set appropriate MIME type
      let mimeType = 'application/octet-stream';
      if (['.mp4', '.webm', '.ogg'].includes(ext)) {
        mimeType = `video/${ext.slice(1)}`;
      } else if (['.mp3', '.wav', '.aac'].includes(ext)) {
        mimeType = `audio/${ext.slice(1)}`;
      } else if (['.jpg', '.jpeg'].includes(ext)) {
        mimeType = 'image/jpeg';
      } else if (ext === '.png') {
        mimeType = 'image/png';
      } else if (ext === '.gif') {
        mimeType = 'image/gif';
      }

      // Handle range requests for video streaming
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunksize = end - start + 1;

        const stream = fs.createReadStream(urlPath, { start, end });
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*',
        });
        stream.pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*',
        });
        fs.createReadStream(urlPath).pipe(res);
      }
    } catch (error) {
      console.error('Error serving file:', error);
      res.writeHead(500);
      res.end('Internal server error');
    }
  });

  mediaServer.listen(MEDIA_SERVER_PORT, 'localhost', () => {
    console.log(
      `📁 Media server started on http://localhost:${MEDIA_SERVER_PORT}`,
    );
  });

  mediaServer.on('error', (error) => {
    console.error('Media server error:', error);
  });
}

// Start media server when app is ready
app.whenReady().then(() => {
  createMediaServer();
});

// IPC Handler for opening file dialog
ipcMain.handle(
  'open-file-dialog',
  async (
    event,
    options?: {
      title?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
      properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
    },
  ) => {
    try {
      const result = await dialog.showOpenDialog({
        title: options?.title || 'Select Media Files',
        properties: options?.properties || ['openFile', 'multiSelections'],
        filters: options?.filters || [
          {
            name: 'Media Files',
            extensions: [
              'mp4',
              'avi',
              'mov',
              'mkv',
              'mp3',
              'wav',
              'aac',
              'jpg',
              'jpeg',
              'png',
              'gif',
            ],
          },
          {
            name: 'Video Files',
            extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv', 'flv'],
          },
          {
            name: 'Audio Files',
            extensions: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'],
          },
          {
            name: 'Image Files',
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (!result.canceled && result.filePaths.length > 0) {
        // Get file info for each selected file
        const fileInfos = result.filePaths.map((filePath) => {
          const stats = fs.statSync(filePath);
          const fileName = path.basename(filePath);
          const ext = path.extname(fileName).toLowerCase().slice(1);

          // Determine file type based on extension
          let type: 'video' | 'audio' | 'image' = 'video';
          if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(ext)) {
            type = 'audio';
          } else if (
            ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'].includes(ext)
          ) {
            type = 'image';
          }

          return {
            path: filePath,
            name: fileName,
            size: stats.size,
            type,
            extension: ext,
          };
        });

        return { success: true, files: fileInfos };
      } else {
        return { success: false, canceled: true };
      }
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
);

// IPC Handler for save dialog
ipcMain.handle(
  'show-save-dialog',
  async (
    event,
    options?: {
      title?: string;
      defaultPath?: string;
      buttonLabel?: string;
      filters?: Array<{ name: string; extensions: string[] }>;
    },
  ) => {
    try {
      const result = await dialog.showSaveDialog({
        title: options?.title || 'Save Video As',
        defaultPath:
          options?.defaultPath || path.join(os.homedir(), 'Downloads'),
        buttonLabel: options?.buttonLabel || 'Save',
        filters: options?.filters || [
          {
            name: 'Video Files',
            extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'wmv'],
          },
          {
            name: 'All Files',
            extensions: ['*'],
          },
        ],
      });

      if (result.canceled) {
        return { success: false, canceled: true };
      }

      return {
        success: true,
        filePath: result.filePath,
        directory: path.dirname(result.filePath || ''),
        filename: path.basename(result.filePath || ''),
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
);

// IPC Handler for getting downloads directory
ipcMain.handle('get-downloads-directory', async () => {
  try {
    return {
      success: true,
      path: path.join(os.homedir(), 'Downloads'),
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

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
      },
    });

    // Send completion event
    event.sender.send('ffmpeg-complete', { success: true, result });
    return { success: true, result };
  } catch (error) {
    // Send error event
    event.sender.send('ffmpeg-complete', {
      success: false,
      error: error.message,
    });
    return { success: false, error: error.message };
  }
});

// IPC Handler to cancel FFmpeg operation
ipcMain.handle('cancel-ffmpeg', async () => {
  try {
    const cancelled = cancelCurrentFfmpeg();
    if (cancelled) {
      return {
        success: true,
        message: 'FFmpeg process cancelled successfully',
      };
    } else {
      return { success: false, message: 'No active FFmpeg process to cancel' };
    }
  } catch (error) {
    return { success: false, message: `Failed to cancel: ${error.message}` };
  }
});

// IPC Handler for creating preview URLs from file paths
ipcMain.handle('create-preview-url', async (event, filePath: string) => {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const ext = path.extname(filePath).toLowerCase().slice(1);

    // For images, create full data URL (they're usually small)
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(ext)) {
      const fileBuffer = fs.readFileSync(filePath);
      let mimeType = 'image/jpeg';
      if (['png'].includes(ext)) {
        mimeType = 'image/png';
      } else if (['gif'].includes(ext)) {
        mimeType = 'image/gif';
      }

      const base64 = fileBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64}`;

      return { success: true, url: dataUrl };
    }

    // For videos and other media, use the local media server
    if (
      ['mp4', 'webm', 'ogg', 'avi', 'mov', 'mkv', 'mp3', 'wav', 'aac'].includes(
        ext,
      )
    ) {
      // URL encode the file path for the media server
      const encodedPath = encodeURIComponent(filePath);
      const serverUrl = `http://localhost:${MEDIA_SERVER_PORT}/${encodedPath}`;

      console.log(`🎬 Created server URL for media: ${serverUrl}`);
      return { success: true, url: serverUrl };
    }

    // For other file types, return error
    return { success: false, error: 'Unsupported file type' };
  } catch (error) {
    console.error('Failed to create preview URL:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler for serving files as streams (for large video files)
ipcMain.handle(
  'get-file-stream',
  async (event, filePath: string, start?: number, end?: number) => {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // If no range specified, return small chunk for preview
      const startByte = start || 0;
      const endByte = end || Math.min(startByte + 1024 * 1024, fileSize - 1); // 1MB max chunk

      const buffer = Buffer.alloc(endByte - startByte + 1);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, buffer.length, startByte);
      fs.closeSync(fd);

      return {
        success: true,
        data: buffer.toString('base64'),
        start: startByte,
        end: endByte,
        total: fileSize,
      };
    } catch (error) {
      console.error('Failed to get file stream:', error);
      return { success: false, error: error.message };
    }
  },
);

// FFmpeg IPC handlers
ipcMain.handle('ffmpeg:detect-frame-rate', async (event, videoPath: string) => {
  return new Promise((resolve, reject) => {
    if (!ffprobePath?.path) {
      reject(
        new Error(
          'FFprobe binary not available. Please ensure ffprobe-static is properly installed.',
        ),
      );
      return;
    }

    const ffprobe = spawn(ffprobePath.path, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_streams',
      '-select_streams',
      'v:0',
      videoPath,
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

// Get media file duration using FFprobe
ipcMain.handle('ffmpeg:get-duration', async (event, filePath: string) => {
  return new Promise((resolve, reject) => {
    if (!ffprobePath?.path) {
      reject(
        new Error(
          'FFprobe binary not available. Please ensure ffprobe-static is properly installed.',
        ),
      );
      return;
    }

    const ffprobe = spawn(ffprobePath.path, [
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      filePath,
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

          // Try to get duration from format first (most reliable)
          if (result.format && result.format.duration) {
            const duration = parseFloat(result.format.duration);
            console.log(
              `📏 Duration from format: ${duration}s for ${filePath}`,
            );
            resolve(duration);
            return;
          }

          // Fallback: try to get duration from streams
          if (result.streams && result.streams.length > 0) {
            for (const stream of result.streams) {
              if (stream.duration && parseFloat(stream.duration) > 0) {
                const duration = parseFloat(stream.duration);
                console.log(
                  `📏 Duration from stream: ${duration}s for ${filePath}`,
                );
                resolve(duration);
                return;
              }
            }
          }

          // Last fallback: images get 5 seconds, others get 60 seconds
          const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
          const fallbackDuration = isImage ? 5 : 60;
          console.warn(
            `⚠️ Could not determine duration for ${filePath}, using fallback: ${fallbackDuration}s`,
          );
          resolve(fallbackDuration);
        } catch (err) {
          console.error('Failed to parse ffprobe output:', err);
          const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
          resolve(isImage ? 5 : 60); // Fallback
        }
      } else {
        console.error(`ffprobe failed with code ${code} for ${filePath}`);
        const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
        resolve(isImage ? 5 : 60); // Fallback
      }
    });

    ffprobe.on('error', (err) => {
      console.error(`ffprobe error for ${filePath}:`, err.message);
      const isImage = /\.(jpg|jpeg|png|gif|bmp|webp)$/i.test(filePath);
      resolve(isImage ? 5 : 60); // Fallback
    });
  });
});

// Global FFmpeg process tracking
let currentFfmpegProcess: ReturnType<typeof spawn> | null = null;

ipcMain.handle('ffmpegRun', async (event, job: VideoEditJob) => {
  return new Promise((resolve, reject) => {
    if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
      reject(new Error('Another FFmpeg process is already running'));
      return;
    }

    const location = job.outputPath || 'public/output/';

    // Build proper FFmpeg command
    const baseArgs = buildFfmpegCommand(job, location);
    const args = ['-progress', 'pipe:1', '-y', ...baseArgs];

    console.log('Running FFmpeg with args:', args);

    if (!ffmpegPath) {
      throw new Error(
        'FFmpeg binary not available. Please ensure ffmpeg-static is properly installed.',
      );
    }

    const ffmpeg = spawn(ffmpegPath, args);
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
        reject(new Error(`FFmpeg exited with code ${code}\nLogs:\n${logs}`));
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
    width: 900,
    height: 700,
    frame: false,
    autoHideMenuBar: true,
    minWidth: 750,
    minHeight: 500,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      nodeIntegration: true,
      // devTools: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // MAIN FUNCTIONS FOR TITLE BAR
  ipcMain.on('close-btn', () => {
    if (!mainWindow) return;
    app.quit();
  });

  ipcMain.on('minimize-btn', () => {
    if (mainWindow) mainWindow.minimize();
  });

  ipcMain.on('maximize-btn', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  });
  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

app.on('ready', async () => {
  // Initialize FFmpeg paths before creating the window
  await initializeFfmpegPaths();
  createWindow();
});

app.on('window-all-closed', () => {
  if (mediaServer) {
    mediaServer.close();
    console.log('📁 Media server stopped');
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (mediaServer) {
    mediaServer.close();
    console.log('📁 Media server stopped');
  }
});
