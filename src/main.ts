import { spawn } from 'child_process';
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import started from 'electron-squirrel-startup';
// Dynamic import of ffmpeg binaries to avoid module resolution issues
let ffmpegPath: string | null = null;
let ffprobePath: { path: string } | null = null;

// Initialize ffmpeg paths dynamically with fallbacks
function initializeFfmpegPaths() {
  console.log('🔍 Initializing FFmpeg paths...');
  console.log('📦 Is packaged:', app.isPackaged);
  console.log('🌍 Environment:', process.env.NODE_ENV || 'production');

  // Method 1: Try require approach (only for development)
  if (!app.isPackaged) {
    try {
      console.log('🔄 Attempting require method (development mode)...');

      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const fs = require('fs');
        if (fs.existsSync(ffmpegStatic)) {
          ffmpegPath = ffmpegStatic;
          console.log('✅ FFmpeg resolved via require:', ffmpegPath);
        } else {
          console.log('⚠️ FFmpeg require returned invalid path:', ffmpegStatic);
        }
      }
    } catch (requireError) {
      console.log('⚠️ Require method failed:', requireError.message);
    }
  } else {
    console.log(
      '🚫 Skipping require method for packaged app - using manual resolution',
    );
  }

  // FFprobe require method (only for development, same issue as ffmpeg)
  if (!app.isPackaged) {
    try {
      console.log('🔄 Attempting FFprobe require method (development mode)...');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const ffprobeStatic = require('ffprobe-static');
      if (ffprobeStatic) {
        ffprobePath = ffprobeStatic;
        console.log('✅ FFprobe resolved via require:', ffprobePath?.path);
      }
    } catch (requireError) {
      console.log('⚠️ FFprobe require method failed:', requireError.message);
    }
  } else {
    console.log(
      '🚫 Skipping FFprobe require method for packaged app - using manual resolution',
    );
  }

  // Method 2: Manual path resolution for packaged apps (always used for packaged apps)
  if (app.isPackaged) {
    try {
      console.log('🔄 Attempting manual path resolution...');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const path = require('path');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const fs = require('fs');

      // Get the correct base paths for packaged apps
      const appPath = app.getAppPath();
      const resourcesPath = process.resourcesPath;
      const isWindows = process.platform === 'win32';
      const ffmpegBinary = isWindows ? 'ffmpeg.exe' : 'ffmpeg';

      console.log('📁 App path:', appPath);
      console.log('📁 Resources path:', resourcesPath);
      console.log('🖥️ Platform:', process.platform);

      const possiblePaths = [
        // Primary: Resources path + app.asar.unpacked - try without .exe first (common for ffmpeg-static)
        path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'ffmpeg-static',
          'ffmpeg',
        ),
        // Then try with platform-specific extension
        path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'ffmpeg-static',
          ffmpegBinary,
        ),
        // Fallback: App path relative - try without .exe first
        path.join(
          appPath,
          '..',
          'app.asar.unpacked',
          'node_modules',
          'ffmpeg-static',
          'ffmpeg',
        ),
        path.join(
          appPath,
          '..',
          'app.asar.unpacked',
          'node_modules',
          'ffmpeg-static',
          ffmpegBinary,
        ),
        // Direct node_modules paths (for unpackaged scenarios)
        path.join(appPath, 'node_modules', 'ffmpeg-static', 'ffmpeg'),
        path.join(appPath, 'node_modules', 'ffmpeg-static', ffmpegBinary),
        path.join(resourcesPath, 'node_modules', 'ffmpeg-static', 'ffmpeg'),
        path.join(resourcesPath, 'node_modules', 'ffmpeg-static', ffmpegBinary),
      ];

      for (const testPath of possiblePaths) {
        console.log('🔍 Checking FFmpeg path:', testPath);
        if (fs.existsSync(testPath)) {
          ffmpegPath = testPath;
          console.log('✅ FFmpeg found at manual path:', testPath);
          break;
        } else {
          console.log('❌ FFmpeg not found at:', testPath);
        }
      }

      // Similar logic for ffprobe - it has a different directory structure
      const ffprobeBinary = isWindows ? 'ffprobe.exe' : 'ffprobe';
      const platformPath = isWindows
        ? path.join('bin', 'win32', 'x64')
        : path.join('bin', 'linux', 'x64');

      const ffprobePaths = [
        // Primary: ffprobe-static has platform-specific subdirectories
        path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'ffprobe-static',
          platformPath,
          'ffprobe',
        ),
        path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'ffprobe-static',
          platformPath,
          ffprobeBinary,
        ),
        // Fallback: App path relative with platform subdirectories
        path.join(
          appPath,
          '..',
          'app.asar.unpacked',
          'node_modules',
          'ffprobe-static',
          platformPath,
          'ffprobe',
        ),
        path.join(
          appPath,
          '..',
          'app.asar.unpacked',
          'node_modules',
          'ffprobe-static',
          platformPath,
          ffprobeBinary,
        ),
        // Legacy paths (try root directory too)
        path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'ffprobe-static',
          'ffprobe',
        ),
        path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          'ffprobe-static',
          ffprobeBinary,
        ),
        // Direct node_modules paths (for unpackaged scenarios)
        path.join(
          appPath,
          'node_modules',
          'ffprobe-static',
          platformPath,
          'ffprobe',
        ),
        path.join(
          appPath,
          'node_modules',
          'ffprobe-static',
          platformPath,
          ffprobeBinary,
        ),
        path.join(appPath, 'node_modules', 'ffprobe-static', 'ffprobe'),
        path.join(appPath, 'node_modules', 'ffprobe-static', ffprobeBinary),
        path.join(
          resourcesPath,
          'node_modules',
          'ffprobe-static',
          platformPath,
          'ffprobe',
        ),
        path.join(
          resourcesPath,
          'node_modules',
          'ffprobe-static',
          platformPath,
          ffprobeBinary,
        ),
        path.join(resourcesPath, 'node_modules', 'ffprobe-static', 'ffprobe'),
        path.join(
          resourcesPath,
          'node_modules',
          'ffprobe-static',
          ffprobeBinary,
        ),
      ];

      for (const testPath of ffprobePaths) {
        console.log('🔍 Checking FFprobe path:', testPath);
        if (fs.existsSync(testPath)) {
          ffprobePath = { path: testPath };
          console.log('✅ FFprobe found at manual path:', testPath);
          break;
        } else {
          console.log('❌ FFprobe not found at:', testPath);
        }
      }
    } catch (manualError) {
      console.log('⚠️ Manual path resolution failed:', manualError.message);
    }
  }

  // Method 3: System fallback
  if (!ffmpegPath) {
    try {
      console.log('🔄 Attempting system FFmpeg fallback...');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { execSync } = require('child_process');
      const systemFfmpeg = execSync('where ffmpeg', {
        encoding: 'utf8',
      }).trim();
      ffmpegPath = systemFfmpeg.split('\n')[0];
      console.log('✅ Using system FFmpeg:', ffmpegPath);
    } catch (systemError) {
      console.log('⚠️ System FFmpeg not available:', systemError.message);
    }
  }

  if (!ffprobePath) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const { execSync } = require('child_process');
      const systemFfprobe = execSync('where ffprobe', {
        encoding: 'utf8',
      }).trim();
      ffprobePath = { path: systemFfprobe.split('\n')[0] };
      console.log('✅ Using system FFprobe:', ffprobePath.path);
    } catch (systemError) {
      console.log('⚠️ System FFprobe not available:', systemError.message);
    }
  }

  // Final status report
  console.log('🎯 FFmpeg initialization complete:');
  console.log(
    '  - FFmpeg available:',
    !!ffmpegPath,
    ffmpegPath ? `(${ffmpegPath})` : '',
  );
  console.log(
    '  - FFprobe available:',
    !!ffprobePath?.path,
    ffprobePath?.path ? `(${ffprobePath.path})` : '',
  );

  if (!ffmpegPath || !ffprobePath?.path) {
    console.error('❌ FFmpeg initialization failed!');
    console.error(
      '📋 Please ensure ffmpeg-static and ffprobe-static packages are installed correctly',
    );
    console.error('📋 Or install FFmpeg system-wide as a fallback');
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

// IPC Handler for processing dropped files by writing them to temp location
ipcMain.handle(
  'process-dropped-files',
  async (
    event,
    fileBuffers: Array<{
      name: string;
      type: string;
      size: number;
      buffer: ArrayBuffer;
    }>,
  ) => {
    try {
      console.log(
        '🎯 Processing dropped files in main process:',
        fileBuffers.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      );

      const tempDir = path.join(os.tmpdir(), 'dividr-uploads');

      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const processedFiles = [];

      for (const fileData of fileBuffers) {
        // Create a unique filename to avoid conflicts
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(fileData.name);
        const baseName = path.basename(fileData.name, ext);
        const uniqueFileName = `${baseName}_${timestamp}_${random}${ext}`;
        const tempFilePath = path.join(tempDir, uniqueFileName);

        // Write the file buffer to temp location
        const buffer = Buffer.from(fileData.buffer);
        fs.writeFileSync(tempFilePath, buffer);

        // Determine file type based on extension
        const extension = ext.toLowerCase().slice(1);
        let type: 'video' | 'audio' | 'image' = 'video';
        if (['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(extension)) {
          type = 'audio';
        } else if (
          ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(
            extension,
          )
        ) {
          type = 'image';
        }

        processedFiles.push({
          name: fileData.name,
          originalName: fileData.name,
          type,
          size: fileData.size,
          extension,
          path: tempFilePath,
          hasPath: true,
          isTemporary: true,
        });

        console.log(
          `📁 Wrote temporary file: ${fileData.name} -> ${tempFilePath}`,
        );
      }

      return { success: true, files: processedFiles };
    } catch (error) {
      console.error('Failed to process dropped files:', error);
      return { success: false, error: error.message };
    }
  },
);

// IPC Handler for cleaning up temporary files
ipcMain.handle('cleanup-temp-files', async (event, filePaths: string[]) => {
  try {
    let cleanedCount = 0;
    for (const filePath of filePaths) {
      try {
        if (fs.existsSync(filePath) && filePath.includes('dividr-uploads')) {
          fs.unlinkSync(filePath);
          cleanedCount++;
          console.log(`🗑️ Cleaned up temporary file: ${filePath}`);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to cleanup file ${filePath}:`, error);
      }
    }
    return { success: true, cleanedCount };
  } catch (error) {
    console.error('Failed to cleanup temporary files:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler for reading file content
ipcMain.handle('read-file', async (event, filePath: string) => {
  try {
    console.log(`📖 Reading file content from: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file content as UTF-8 text
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`📄 Successfully read file, content length: ${content.length}`);

    return content;
  } catch (error) {
    console.error(`❌ Failed to read file ${filePath}:`, error);
    throw error;
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
  console.log('🎯 MAIN PROCESS: ffmpegRun handler called!');
  console.log('🎯 MAIN PROCESS: Received job:', JSON.stringify(job, null, 2));

  if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
    throw new Error('Another FFmpeg process is already running');
  }

  const location = job.outputPath || 'public/output/';
  // Ensure we have an absolute path for the location
  const absoluteLocation = path.isAbsolute(location)
    ? location
    : path.resolve(location);
  let tempSubtitlePath: string | null = null;

  try {
    // Create temporary subtitle file if subtitle content is provided
    if (job.subtitleContent && job.operations.subtitles) {
      tempSubtitlePath = path.join(absoluteLocation, 'temp_subtitles.srt');

      // Ensure directory exists
      if (!fs.existsSync(absoluteLocation)) {
        fs.mkdirSync(absoluteLocation, { recursive: true });
      }

      // Write subtitle content to file
      fs.writeFileSync(tempSubtitlePath, job.subtitleContent, 'utf8');
      console.log('📝 Created temporary subtitle file:', tempSubtitlePath);

      // Update the job to use the absolute path instead of just the filename
      job.operations.subtitles = tempSubtitlePath;
      console.log('📁 Updated subtitle path to absolute:', tempSubtitlePath);
    }

    // Verify subtitle file exists before running FFmpeg
    if (tempSubtitlePath) {
      if (!fs.existsSync(tempSubtitlePath)) {
        throw new Error(`Subtitle file does not exist: ${tempSubtitlePath}`);
      }
      console.log('✅ Subtitle file verified to exist:', tempSubtitlePath);
    }

    // Build proper FFmpeg command
    const baseArgs = buildFfmpegCommand(job, absoluteLocation);
    const args = ['-progress', 'pipe:1', '-y', ...baseArgs];

    console.log('🎬 COMPLETE FFMPEG COMMAND:');
    console.log(['ffmpeg', ...args].join(' '));

    return new Promise((resolve, reject) => {
      console.log('🚀 Starting FFmpeg with args:', args);

      // Double-check subtitle file still exists right before spawning
      if (tempSubtitlePath && !fs.existsSync(tempSubtitlePath)) {
        reject(
          new Error(
            `Subtitle file disappeared before FFmpeg start: ${tempSubtitlePath}`,
          ),
        );
        return;
      }

      if (!ffmpegPath) {
        reject(
          new Error(
            'FFmpeg binary not available. Please ensure ffmpeg-static is properly installed.',
          ),
        );
        return;
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
        console.log(`🏁 FFmpeg process finished with code: ${code}`);

        // Always cleanup temporary subtitle file after FFmpeg completes
        if (tempSubtitlePath && fs.existsSync(tempSubtitlePath)) {
          try {
            fs.unlinkSync(tempSubtitlePath);
            console.log(
              '🗑️ Cleaned up temporary subtitle file after FFmpeg completion',
            );
          } catch (cleanupError) {
            console.warn(
              '⚠️ Failed to cleanup temporary subtitle file after completion:',
              cleanupError,
            );
          }
        }

        if (code === 0) {
          resolve({ success: true, logs });
        } else {
          reject(new Error(`FFmpeg exited with code ${code}\nLogs:\n${logs}`));
        }
      });

      ffmpeg.on('error', (err) => {
        currentFfmpegProcess = null;
        console.log('❌ FFmpeg process error:', err.message);

        // Cleanup temporary subtitle file on error
        if (tempSubtitlePath && fs.existsSync(tempSubtitlePath)) {
          try {
            fs.unlinkSync(tempSubtitlePath);
            console.log(
              '🗑️ Cleaned up temporary subtitle file after FFmpeg error',
            );
          } catch (cleanupError) {
            console.warn(
              '⚠️ Failed to cleanup temporary subtitle file after error:',
              cleanupError,
            );
          }
        }

        reject(err);
      });
    });
  } catch (error) {
    console.log('💥 Setup error occurred before FFmpeg could start:', error);

    // Only cleanup on setup errors, not FFmpeg execution errors
    if (tempSubtitlePath && fs.existsSync(tempSubtitlePath)) {
      try {
        fs.unlinkSync(tempSubtitlePath);
        console.log('🗑️ Cleaned up temporary subtitle file due to setup error');
      } catch (cleanupError) {
        console.warn(
          '⚠️ Failed to cleanup temporary subtitle file after setup error:',
          cleanupError,
        );
      }
    }
    throw error;
  }
});

ipcMain.handle('ffmpeg:cancel', async () => {
  if (currentFfmpegProcess) {
    currentFfmpegProcess.kill('SIGTERM');
    return true;
  }
  return false;
});

// Diagnostic handler to check FFmpeg status
ipcMain.handle('ffmpeg:status', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const fs = require('fs');

  const ffmpegExists = ffmpegPath ? fs.existsSync(ffmpegPath) : false;
  const ffprobeExists = ffprobePath?.path
    ? fs.existsSync(ffprobePath.path)
    : false;

  return {
    ffmpegPath,
    ffprobePath: ffprobePath?.path,
    ffmpegExists,
    ffprobeExists,
    isReady: ffmpegPath !== null && ffprobePath?.path !== null,
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
    environment: process.env.NODE_ENV || 'production',
  };
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
    // Only open DevTools in development
    mainWindow.webContents.openDevTools();
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

app.on('ready', () => {
  // Initialize FFmpeg paths before creating the window
  initializeFfmpegPaths();
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
