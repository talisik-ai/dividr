/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-var-requires */
import { spawn } from 'child_process';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import started from 'electron-squirrel-startup';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildFfmpegCommand } from './backend/ffmpeg/export/commandBuilder';
import {
  cancelCurrentFfmpeg,
  runFfmpeg,
  runFfmpegWithProgress,
} from './backend/ffmpeg/export/ffmpegRunner';
import { VideoEditJob } from './backend/ffmpeg/schema/ffmpegConfig';

// Import unified media-tools runner (transcription + noise reduction)
import { buildArnnDenCommand } from './backend/ffmpeg/alternativeDenoise';
import type {
  MediaToolsProgress,
  NoiseReductionResult,
  WhisperResult,
} from './backend/media-tools/mediaToolsRunner';
import {
  cancelCurrentOperation,
  cancelTranscription,
  getMediaToolsStatus,
  getPythonWhisperStatus,
  initializePythonWhisper,
  reduceNoise,
  transcribeAudio,
} from './backend/media-tools/mediaToolsRunner';

// Import runtime download manager for on-demand installation
import {
  cancelDownload,
  checkRuntimeStatus,
  downloadRuntime,
  removeRuntime,
  verifyInstallation,
} from './backend/runtime/runtimeDownloadManager';

// Import file I/O manager for controlled concurrency
import { backgroundTaskQueue } from './backend/io/BackgroundTaskQueue';
import { fileIOManager } from './backend/io/FileIOManager';

// Import hardware capabilities service for hybrid proxy encoding
import {
  buildProxyFFmpegArgs,
  buildVaapiProxyFFmpegArgs,
  detectHardwareCapabilities,
  getProxyEncoderConfig,
  getSoftwareEncoderConfig,
  type ProxyEncoderConfig,
} from './backend/hardware/hardwareCapabilitiesService';

// Backward compatible type alias
type WhisperProgress = MediaToolsProgress;

// Import Vite dev server URL
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

// Global variables
let mainWindow: BrowserWindow | null = null;
const forceQuit = false;
let isWindowFocused = true;
// Dynamic import of ffmpeg binaries to avoid module resolution issues
let ffmpegPath: string | null = null;
let ffprobePath: { path: string } | null = null;

// File path to open when app starts (from double-click on .dividr file)
let pendingFilePath: string | null = null;

/**
 * Get .dividr file path from command-line arguments (Windows double-click)
 */
function getFileFromArgs(args: string[] = process.argv): string | null {
  // Skip the first arg (executable path) and any electron-specific args
  const fileArgs = args.slice(1);
  for (const arg of fileArgs) {
    if (
      arg.endsWith('.dividr') &&
      !arg.startsWith('-') &&
      !arg.startsWith('--')
    ) {
      return arg;
    }
  }
  return null;
}

// Check for file argument on startup
pendingFilePath = getFileFromArgs();

// Single instance lock - ensures only one instance of the app runs
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  app.quit();
} else {
  // Handle second instance launch (e.g., double-click on .dividr file while app is running)
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      // Restore and focus the existing window
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();

      // Check if a .dividr file was passed
      const filePath = getFileFromArgs(commandLine);
      if (filePath) {
        mainWindow.webContents.send('open-project-file', filePath);
      }
    }
  });
}

// macOS: Handle file opened via Finder (before app is ready)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (filePath.endsWith('.dividr')) {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('open-project-file', filePath);
    } else {
      pendingFilePath = filePath;
    }
  }
});

// Background worker management for sprite sheet generation
interface SpriteSheetJob {
  id: string;
  videoPath: string;
  outputDir: string;
  commands: string[][];
  progress: {
    current: number;
    total: number;
    stage: string;
  };
  startTime: number;
}

const activeSpriteSheetJobs = new Map<string, SpriteSheetJob>();
const spriteSheetJobCounter = 0;

// Initialize ffmpeg paths dynamically with fallbacks
async function initializeFfmpegPaths() {
  console.log('🔍 Initializing FFmpeg paths...');
  console.log('📦 Is packaged:', app.isPackaged);
  console.log('🌍 Environment:', process.env.NODE_ENV || 'production');

  // Method 1: Try ffmpeg-static first (bundled, fast, reliable)
  if (!ffmpegPath) {
    try {
      console.log('🔄 Attempting ffmpeg-static (bundled binary)...');

      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const ffmpegStatic = require('ffmpeg-static');
      if (ffmpegStatic) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const fs = require('fs');
        if (fs.existsSync(ffmpegStatic)) {
          ffmpegPath = ffmpegStatic;
          console.log('✅ FFmpeg resolved via ffmpeg-static:', ffmpegPath);

          // Check version to confirm it's modern
          try {
            const { execSync } = require('child_process');
            const versionOutput = execSync(`"${ffmpegStatic}" -version`, {
              encoding: 'utf8',
            });
            const versionMatch = versionOutput.match(
              /ffmpeg version (\d+)\.(\d+)/,
            );
            if (versionMatch) {
              console.log(
                `ℹ️  FFmpeg version ${versionMatch[1]}.${versionMatch[2]} (bundled)`,
              );
            }
          } catch (vErr) {
            console.log(
              'ℹ️  (Could not detect version, but using ffmpeg-static)',
            );
          }
        } else {
          console.log('⚠️ ffmpeg-static returned invalid path:', ffmpegStatic);
        }
      }
    } catch (requireError) {
      console.log('⚠️ ffmpeg-static not available:', requireError.message);
      console.log('ℹ️  Install with: yarn add ffmpeg-static');
    }
  }

  // Method 2: Try ffbinaries as fallback (downloads latest FFmpeg on demand)
  if (!ffmpegPath) {
    try {
      console.log(
        '🔄 Attempting ffbinaries fallback (downloads FFmpeg if needed)...',
      );

      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const ffbinaries = require('ffbinaries');
      // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
      const path = require('path');

      // Directory to store downloaded binaries
      const binDir = path.join(app.getPath('userData'), 'ffmpeg-bin');

      // Check if already downloaded
      const platform = ffbinaries.detectPlatform();
      const expectedPath = path.join(
        binDir,
        platform === 'windows-64' ? 'ffmpeg.exe' : 'ffmpeg',
      );

      if (require('fs').existsSync(expectedPath)) {
        ffmpegPath = expectedPath;
        console.log('✅ FFmpeg already downloaded via ffbinaries:', ffmpegPath);
      } else {
        console.log(
          '📥 Downloading FFmpeg via ffbinaries (first time setup)...',
        );

        // Download FFmpeg (async operation)
        await new Promise((resolve, reject) => {
          ffbinaries.downloadBinaries(
            'ffmpeg',
            { destination: binDir },
            (err: any) => {
              if (err) {
                console.error('❌ Failed to download FFmpeg:', err);
                reject(err);
              } else {
                ffmpegPath = expectedPath;
                console.log('✅ FFmpeg downloaded successfully:', ffmpegPath);
                resolve(null);
              }
            },
          );
        });
      }

      // Check version
      if (ffmpegPath) {
        try {
          const { execSync } = require('child_process');
          const versionOutput = execSync(`"${ffmpegPath}" -version`, {
            encoding: 'utf8',
          });
          const versionMatch = versionOutput.match(
            /ffmpeg version (\d+)\.(\d+)/,
          );
          if (versionMatch) {
            console.log(
              `ℹ️  FFmpeg version ${versionMatch[1]}.${versionMatch[2]} from ffbinaries`,
            );
          }
        } catch (vErr) {
          console.log('ℹ️  (Could not detect version, but FFmpeg is ready)');
        }
      }
    } catch (error) {
      console.log('⚠️ ffbinaries failed:', error.message);
      console.log('ℹ️  Install with: yarn add ffbinaries');
    }
  }

  // Log if no FFmpeg found yet
  if (!ffmpegPath) {
    console.log('⚠️ No FFmpeg binary found in standard locations');
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
        // Try @ffmpeg-installer first (better hardware acceleration)
        path.join(
          resourcesPath,
          'app.asar.unpacked',
          'node_modules',
          '@ffmpeg-installer',
          'ffmpeg',
          ffmpegBinary,
        ),
        path.join(
          appPath,
          '..',
          'app.asar.unpacked',
          'node_modules',
          '@ffmpeg-installer',
          'ffmpeg',
          ffmpegBinary,
        ),
        path.join(
          appPath,
          'node_modules',
          '@ffmpeg-installer',
          'ffmpeg',
          ffmpegBinary,
        ),
        path.join(
          resourcesPath,
          'node_modules',
          '@ffmpeg-installer',
          'ffmpeg',
          ffmpegBinary,
        ),

        // Fallback to ffmpeg-static - try without .exe first (common for ffmpeg-static)
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

if (started) {
  app.quit();
}

// Startup timing logs removed for production cleanliness
const logStartupPerf = (..._args: unknown[]): void => {
  // no-op
};

let deferredInitStarted = false;
const kickoffDeferredInitialization = () => {
  if (deferredInitStarted) return;
  deferredInitStarted = true;

  setTimeout(() => {
    initializeFfmpegPaths()
      .then(() => logStartupPerf())
      .catch((error) => {
        console.error('⚠️ FFmpeg init failed (non-blocking):', error);
      });
  }, 0);
};

const ensurePythonInitialized = async (_reason: string): Promise<void> => {
  if (getPythonWhisperStatus().available) return;

  try {
    await initializePythonWhisper();
  } catch (error) {
    console.error('⚠️ Python Whisper initialization failed:', error);
    throw error;
  }
};

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
    logStartupPerf();
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

// IPC Handler for showing file in folder/explorer
ipcMain.handle('show-item-in-folder', async (event, filePath: string) => {
  try {
    if (!filePath) {
      return { success: false, error: 'No file path provided' };
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { success: false, error: 'File not found' };
    }

    // Show item in folder (works cross-platform)
    shell.showItemInFolder(filePath);

    console.log('📂 Opened file location:', filePath);
    return { success: true };
  } catch (error) {
    console.error('Failed to show file in folder:', error);
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

// IPC Handler for audio extraction from video files
ipcMain.handle(
  'extract-audio-from-video',
  async (event, videoPath: string, outputDir?: string) => {
    console.log('🎵 MAIN PROCESS: extractAudioFromVideo handler called!');
    console.log('🎵 MAIN PROCESS: Video path:', videoPath);

    if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
      return {
        success: false,
        error: 'Another FFmpeg process is already running',
      };
    }

    if (!ffmpegPath) {
      return {
        success: false,
        error:
          'FFmpeg binary not available. Please ensure ffmpeg-static is properly installed.',
      };
    }

    try {
      // Create a unique output directory for extracted audio files
      const audioOutputDir =
        outputDir || path.join(os.tmpdir(), 'dividr-audio-extracts');

      // Use fileIOManager for directory creation with EMFILE protection
      await fileIOManager.mkdir(audioOutputDir, 'normal');
      console.log('📁 Audio extraction directory ready:', audioOutputDir);

      // Generate unique filename for extracted audio
      const videoBaseName = path.basename(videoPath, path.extname(videoPath));
      const timestamp = Date.now();
      const audioFileName = `${videoBaseName}_${timestamp}_extracted.wav`;
      const audioOutputPath = path.join(audioOutputDir, audioFileName);

      console.log('🎵 Extracting audio to:', audioOutputPath);

      // FFmpeg command to extract audio with high quality
      const args = [
        '-i',
        videoPath, // Input video file
        '-vn', // No video (audio only)
        '-acodec',
        'pcm_s16le', // Uncompressed PCM audio codec for quality
        '-ar',
        '44100', // Sample rate: 44.1kHz (CD quality)
        '-ac',
        '2', // Stereo (2 channels)
        '-y', // Overwrite output file if exists
        audioOutputPath, // Output audio file
      ];

      console.log('🎬 AUDIO EXTRACTION FFMPEG COMMAND:');
      console.log(['ffmpeg', ...args].join(' '));

      return new Promise((resolve) => {
        const ffmpeg = spawn(ffmpegPath, args);
        currentFfmpegProcess = ffmpeg;

        let stdout = '';
        let stderr = '';

        ffmpeg.stdout.on('data', (data) => {
          const text = data.toString();
          stdout += text;
          console.log(`[Audio Extract stdout] ${text.trim()}`);
        });

        ffmpeg.stderr.on('data', (data) => {
          const text = data.toString();
          stderr += text;
          console.log(`[Audio Extract stderr] ${text.trim()}`);
        });

        ffmpeg.on('close', async (code) => {
          currentFfmpegProcess = null;
          console.log(`🎵 Audio extraction process exited with code: ${code}`);

          if (code === 0) {
            try {
              // Verify that the audio file was created and has content
              // Use async stat with retry for EMFILE protection
              let stats: fs.Stats | null = null;
              let lastError: Error | null = null;

              for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                  stats = fs.statSync(audioOutputPath);
                  break;
                } catch (statErr) {
                  lastError = statErr as Error;
                  if (isEMFILEError(statErr) && attempt < 3) {
                    console.warn(
                      `⚠️ EMFILE during audio file verification, retry ${attempt}/3`,
                    );
                    await new Promise((r) => setTimeout(r, 500 * attempt));
                  } else {
                    throw statErr;
                  }
                }
              }

              if (stats && stats.size > 0) {
                // Create preview URL for the extracted audio
                // Use the same logic as the create-preview-url handler
                const previewUrl = `http://localhost:${MEDIA_SERVER_PORT}/${encodeURIComponent(audioOutputPath)}`;
                const previewResult = { success: true, url: previewUrl };

                console.log('✅ Audio extraction successful!');
                console.log('📁 Audio file path:', audioOutputPath);
                console.log('📏 Audio file size:', stats.size, 'bytes');

                resolve({
                  success: true,
                  audioPath: audioOutputPath,
                  previewUrl: previewResult.success
                    ? previewResult.url
                    : undefined,
                  size: stats.size,
                  message: 'Audio extracted successfully',
                });
              } else {
                console.error('❌ Audio file was created but is empty');
                resolve({
                  success: false,
                  error: 'Audio extraction failed: output file is empty',
                });
              }
            } catch (statError) {
              const errorMessage =
                statError instanceof Error
                  ? statError.message
                  : 'Unknown error';
              console.error(
                '❌ Failed to verify extracted audio file:',
                errorMessage,
              );

              // Provide helpful EMFILE message
              if (isEMFILEError(statError)) {
                resolve({
                  success: false,
                  error:
                    'System file limit reached during audio verification. Please try again.',
                });
              } else {
                resolve({
                  success: false,
                  error: `Audio extraction failed: ${errorMessage}`,
                });
              }
            }
          } else {
            console.error('❌ Audio extraction failed with exit code:', code);
            console.error('stderr:', stderr);
            resolve({
              success: false,
              error: `Audio extraction failed with exit code ${code}: ${stderr}`,
            });
          }
        });

        ffmpeg.on('error', (error) => {
          currentFfmpegProcess = null;
          console.error('❌ Audio extraction spawn error:', error);
          resolve({
            success: false,
            error: `Audio extraction failed: ${error.message}`,
          });
        });
      });
    } catch (error) {
      console.error('❌ Audio extraction setup error:', error);
      return {
        success: false,
        error: `Audio extraction setup failed: ${error.message}`,
      };
    }
  },
);

// IPC Handler for custom FFmpeg commands (specifically for thumbnail extraction)
ipcMain.handle(
  'run-custom-ffmpeg',
  async (event, args: string[], outputDir: string) => {
    console.log('🎯 MAIN PROCESS: runCustomFFmpeg handler called!');
    console.log('🎯 MAIN PROCESS: FFmpeg args:', args);
    console.log('🎯 MAIN PROCESS: Output directory:', outputDir);

    if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
      return {
        success: false,
        error: 'Another FFmpeg process is already running',
      };
    }

    if (!ffmpegPath) {
      return {
        success: false,
        error:
          'FFmpeg binary not available. Please ensure ffmpeg-static is properly installed.',
      };
    }

    // Ensure output directory exists using fileIOManager for EMFILE protection
    const absoluteOutputDir = path.isAbsolute(outputDir)
      ? outputDir
      : path.resolve(outputDir);

    try {
      await fileIOManager.mkdir(absoluteOutputDir, 'high');
      console.log('📁 Output directory ready:', absoluteOutputDir);
    } catch (dirError) {
      const errorMessage =
        dirError instanceof Error ? dirError.message : 'Unknown error';
      console.error('❌ Failed to create output directory:', errorMessage);

      if (isEMFILEError(dirError)) {
        return {
          success: false,
          error: 'System file limit reached. Please wait and try again.',
        };
      }

      return {
        success: false,
        error: `Failed to create output directory: ${errorMessage}`,
      };
    }

    // Update output path in args to use absolute path
    const finalArgs = args.map((arg) => {
      if (arg.includes(outputDir) && !path.isAbsolute(arg)) {
        return arg.replace(outputDir, absoluteOutputDir);
      }
      return arg;
    });

    console.log('🎬 COMPLETE CUSTOM FFMPEG COMMAND:');
    console.log(['ffmpeg', ...finalArgs].join(' '));

    return new Promise((resolve) => {
      const ffmpeg = spawn(ffmpegPath, finalArgs);
      currentFfmpegProcess = ffmpeg;

      let stdout = '';
      let stderr = '';

      ffmpeg.stdout.on('data', (data) => {
        const text = data.toString();
        stdout += text;
        console.log(`[FFmpeg stdout] ${text.trim()}`);
      });

      ffmpeg.stderr.on('data', (data) => {
        const text = data.toString();
        stderr += text;
        console.log(`[FFmpeg stderr] ${text.trim()}`);
      });

      ffmpeg.on('close', (code) => {
        currentFfmpegProcess = null;
        console.log(`🎬 FFmpeg process exited with code: ${code}`);

        if (code === 0) {
          // List generated files
          try {
            const outputFiles = fs
              .readdirSync(absoluteOutputDir)
              .filter(
                (file) => file.startsWith('thumb_') && file.endsWith('.jpg'),
              )
              .sort();

            console.log(
              `✅ Generated ${outputFiles.length} thumbnail files:`,
              outputFiles,
            );

            resolve({
              success: true,
              output: outputFiles,
            });
          } catch (listError) {
            console.error('❌ Error listing output files:', listError);
            resolve({
              success: false,
              error: `FFmpeg succeeded but failed to list output files: ${listError.message}`,
            });
          }
        } else {
          console.error(`❌ FFmpeg failed with exit code: ${code}`);
          resolve({
            success: false,
            error: `FFmpeg process failed with exit code ${code}. stderr: ${stderr}`,
          });
        }
      });

      ffmpeg.on('error', (error) => {
        currentFfmpegProcess = null;
        console.error('❌ FFmpeg spawn error:', error);
        resolve({
          success: false,
          error: `Failed to spawn FFmpeg process: ${error.message}`,
        });
      });
    });
  },
);

// IPC Handler for background sprite sheet generation
ipcMain.handle(
  'generate-sprite-sheet-background',
  async (
    event,
    options: {
      jobId: string;
      videoPath: string;
      outputDir: string;
      commands: string[][];
    },
  ) => {
    const { jobId, videoPath, outputDir, commands } = options;

    console.log('🎬 Starting background sprite sheet generation:', jobId);
    console.log('📹 Video:', videoPath);
    console.log('📁 Output:', outputDir);
    console.log('🔧 Commands:', commands.length);

    if (!ffmpegPath) {
      return {
        success: false,
        error:
          'FFmpeg binary not available. Please ensure ffmpeg-static is properly installed.',
      };
    }

    // Check if job already exists
    if (activeSpriteSheetJobs.has(jobId)) {
      return {
        success: false,
        error: 'Job already in progress',
      };
    }

    // Create job entry
    const job: SpriteSheetJob = {
      id: jobId,
      videoPath,
      outputDir,
      commands,
      progress: {
        current: 0,
        total: commands.length,
        stage: 'Starting...',
      },
      startTime: Date.now(),
    };

    activeSpriteSheetJobs.set(jobId, job);

    // Process commands sequentially in background
    processSpriteSheetsInBackground(jobId, job);

    return {
      success: true,
      jobId,
      message: 'Sprite sheet generation started in background',
    };
  },
);

// IPC Handler to get sprite sheet job progress
ipcMain.handle('get-sprite-sheet-progress', async (event, jobId: string) => {
  const job = activeSpriteSheetJobs.get(jobId);
  if (!job) {
    return {
      success: false,
      error: 'Job not found',
    };
  }

  return {
    success: true,
    progress: job.progress,
    elapsedTime: Date.now() - job.startTime,
  };
});

// IPC Handler to cancel sprite sheet generation
ipcMain.handle('cancel-sprite-sheet-job', async (event, jobId: string) => {
  const job = activeSpriteSheetJobs.get(jobId);
  if (!job) {
    return {
      success: false,
      error: 'Job not found',
    };
  }

  activeSpriteSheetJobs.delete(jobId);

  console.log('🛑 Cancelled sprite sheet job:', jobId);
  return {
    success: true,
    message: 'Job cancelled',
  };
});

// Background sprite sheet processing function
async function processSpriteSheetsInBackground(
  jobId: string,
  job: SpriteSheetJob,
) {
  try {
    // Ensure output directory exists using fileIOManager for EMFILE protection
    const absoluteOutputDir = path.isAbsolute(job.outputDir)
      ? job.outputDir
      : path.resolve(job.outputDir);

    await fileIOManager.mkdir(absoluteOutputDir, 'normal');
    console.log('📁 Sprite sheet output directory ready:', absoluteOutputDir);

    // Process each command sequentially
    for (let i = 0; i < job.commands.length; i++) {
      const currentJob = activeSpriteSheetJobs.get(jobId);
      if (!currentJob) {
        console.log('🛑 Job cancelled during processing:', jobId);
        return;
      }

      const command = job.commands[i];
      const adjustedCommand = command.map((arg) => {
        if (arg.includes(job.outputDir) && !path.isAbsolute(arg)) {
          return arg.replace(job.outputDir, absoluteOutputDir);
        }
        return arg;
      });

      // Update progress
      currentJob.progress = {
        current: i,
        total: job.commands.length,
        stage: `Generating sprite sheet ${i + 1}/${job.commands.length}`,
      };

      console.log(
        `🎬 Processing sprite sheet ${i + 1}/${job.commands.length} for job ${jobId}`,
      );
      console.log(
        '🔧 FFmpeg command:',
        ['ffmpeg', ...adjustedCommand].join(' '),
      );

      // Execute FFmpeg command with improved error handling and timeout
      const result = await new Promise<{ success: boolean; error?: string }>(
        (resolve) => {
          const ffmpeg = spawn(ffmpegPath as string, adjustedCommand, {
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true, // Hide console window on Windows
          });

          let stderr = '';
          let stdout = '';

          // Set adaptive timeout based on video complexity
          const timeoutMs = Math.min(300000, 60000 + i * 60000); // Max 5 minutes, min 1 minute + 1 minute per sheet
          const processTimeout: NodeJS.Timeout = setTimeout(() => {
            ffmpeg.kill('SIGKILL');
            resolve({
              success: false,
              error: `FFmpeg process timed out after ${timeoutMs / 1000} seconds`,
            });
          }, timeoutMs);

          ffmpeg.stdout.on('data', (data) => {
            stdout += data.toString();
            // Optional: Could parse progress from stdout for more detailed progress
          });

          ffmpeg.stderr.on('data', (data) => {
            const text = data.toString();
            stderr += text;
            // Progress updates could be parsed here if needed
          });

          ffmpeg.on('close', (code) => {
            clearTimeout(processTimeout);
            if (code === 0) {
              console.log(`✅ Sprite sheet ${i + 1} generated successfully`);
              resolve({ success: true });
            } else {
              console.error(
                `❌ Sprite sheet ${i + 1} failed with exit code: ${code}`,
              );
              // Try to extract meaningful error from stderr
              const errorMatch =
                stderr.match(/Error: (.+)/i) || stderr.match(/\[error\] (.+)/i);
              const meaningfulError = errorMatch
                ? errorMatch[1]
                : `Process failed with code ${code}`;
              resolve({
                success: false,
                error: `FFmpeg: ${meaningfulError}`,
              });
            }
          });

          ffmpeg.on('error', (error) => {
            clearTimeout(processTimeout);
            console.error('❌ FFmpeg spawn error:', error);
            resolve({
              success: false,
              error: `Failed to spawn FFmpeg process: ${error.message}`,
            });
          });

          // Handle process being killed
          ffmpeg.on('exit', (code, signal) => {
            clearTimeout(processTimeout);
            if (signal === 'SIGKILL') {
              resolve({
                success: false,
                error: 'Process was terminated due to timeout',
              });
            }
          });
        },
      );

      if (!result.success) {
        console.error(
          `❌ Failed to generate sprite sheet ${i + 1}/${job.commands.length}:`,
          result.error,
        );

        // Update job with error
        currentJob.progress.stage = `Failed at sheet ${i + 1}: ${result.error}`;

        // Notify renderer about error with more context
        if (mainWindow) {
          mainWindow.webContents.send('sprite-sheet-job-error', {
            jobId,
            error: `Sheet ${i + 1}/${job.commands.length}: ${result.error}`,
            sheetIndex: i,
            totalSheets: job.commands.length,
          });
        }

        activeSpriteSheetJobs.delete(jobId);
        return;
      }

      console.log(
        `✅ Successfully generated sprite sheet ${i + 1}/${job.commands.length}`,
      );
    }

    // Job completed successfully
    const finalJob = activeSpriteSheetJobs.get(jobId);
    if (finalJob) {
      finalJob.progress = {
        current: job.commands.length,
        total: job.commands.length,
        stage: 'Completed',
      };

      // List generated files with EMFILE retry
      try {
        let outputFiles: string[] = [];
        let lastError: Error | null = null;

        // Retry logic for EMFILE protection
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            outputFiles = fs
              .readdirSync(absoluteOutputDir)
              .filter(
                (file: string) =>
                  file.startsWith('sprite_') && file.endsWith('.jpg'),
              )
              .sort();
            break;
          } catch (err) {
            lastError = err as Error;
            if (isEMFILEError(err) && attempt < 3) {
              console.warn(
                `⚠️ EMFILE listing sprite sheet files, retry ${attempt}/3`,
              );
              await new Promise((r) => setTimeout(r, 500 * attempt));
            } else {
              throw err;
            }
          }
        }

        console.log(
          `✅ Generated ${outputFiles.length} sprite sheet files for job ${jobId}`,
        );

        // Notify renderer about completion
        if (mainWindow) {
          mainWindow.webContents.send('sprite-sheet-job-completed', {
            jobId,
            outputFiles,
            outputDir: absoluteOutputDir,
          });
        }
      } catch (listError) {
        const errorMessage =
          listError instanceof Error ? listError.message : 'Unknown error';
        console.error(
          '❌ Error listing sprite sheet output files:',
          errorMessage,
        );
      }

      activeSpriteSheetJobs.delete(jobId);
    }
  } catch (error) {
    console.error('❌ Background sprite sheet processing error:', error);

    // Notify renderer about error
    if (mainWindow) {
      mainWindow.webContents.send('sprite-sheet-job-error', {
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    activeSpriteSheetJobs.delete(jobId);
  }
}

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

// Helper function to check for EMFILE errors
function isEMFILEError(error: unknown): boolean {
  if (error instanceof Error) {
    const nodeError = error as NodeJS.ErrnoException;
    return (
      nodeError.code === 'EMFILE' ||
      nodeError.code === 'ENFILE' ||
      error.message.includes('too many open files')
    );
  }
  return false;
}

// Helper function to write file with EMFILE retry
async function writeFileWithRetry(
  filePath: string,
  data: Buffer,
  maxRetries = 3,
): Promise<void> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await fileIOManager.writeFile(filePath, data, {
        priority: 'high',
        createDir: true,
      });
      return;
    } catch (error) {
      lastError = error as Error;
      if (isEMFILEError(error) && attempt < maxRetries) {
        console.warn(
          `⚠️ EMFILE error writing ${filePath}, retry ${attempt}/${maxRetries}`,
        );
        // Exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * Math.pow(2, attempt - 1)),
        );
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error('Write failed after retries');
}

// IPC Handler for processing dropped files by writing them to temp location
// Uses controlled concurrency to prevent EMFILE errors
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
        `🎯 Processing ${fileBuffers.length} dropped files in main process (controlled concurrency)`,
      );

      const tempDir = path.join(os.tmpdir(), 'dividr-uploads');

      // Ensure temp directory exists using the file IO manager
      await fileIOManager.mkdir(tempDir, 'high');

      const processedFiles: Array<{
        name: string;
        originalName: string;
        type: 'video' | 'audio' | 'image';
        size: number;
        extension: string;
        path: string;
        hasPath: boolean;
        isTemporary: boolean;
      }> = [];

      const errors: string[] = [];

      // Process files in batches to prevent EMFILE
      const BATCH_SIZE = 3;
      const totalFiles = fileBuffers.length;

      for (
        let batchStart = 0;
        batchStart < totalFiles;
        batchStart += BATCH_SIZE
      ) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, totalFiles);
        const batch = fileBuffers.slice(batchStart, batchEnd);

        console.log(
          `📁 Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}/${Math.ceil(totalFiles / BATCH_SIZE)} (files ${batchStart + 1}-${batchEnd} of ${totalFiles})`,
        );

        // Process batch in parallel (within concurrency limits)
        const batchPromises = batch.map(async (fileData, batchIndex) => {
          const globalIndex = batchStart + batchIndex;

          try {
            // Create a unique filename to avoid conflicts
            const timestamp = Date.now();
            const random = Math.random().toString(36).substring(2, 8);
            const ext = path.extname(fileData.name);
            const baseName = path.basename(fileData.name, ext);
            const uniqueFileName = `${baseName}_${timestamp}_${random}${ext}`;
            const tempFilePath = path.join(tempDir, uniqueFileName);

            // Write the file buffer using controlled I/O manager
            const buffer = Buffer.from(fileData.buffer);
            await writeFileWithRetry(tempFilePath, buffer);

            // Determine file type based on extension
            const extension = ext.toLowerCase().slice(1);
            let type: 'video' | 'audio' | 'image' = 'video';
            if (
              ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'].includes(extension)
            ) {
              type = 'audio';
            } else if (
              ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp'].includes(
                extension,
              )
            ) {
              type = 'image';
            }

            console.log(
              `✅ [${globalIndex + 1}/${totalFiles}] Wrote: ${fileData.name} -> ${tempFilePath}`,
            );

            return {
              success: true as const,
              file: {
                name: fileData.name,
                originalName: fileData.name,
                type,
                size: fileData.size,
                extension,
                path: tempFilePath,
                hasPath: true,
                isTemporary: true,
              },
            };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            console.error(
              `❌ [${globalIndex + 1}/${totalFiles}] Failed to write: ${fileData.name}:`,
              errorMessage,
            );

            return {
              success: false as const,
              error: `Failed to process ${fileData.name}: ${errorMessage}`,
            };
          }
        });

        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);

        // Collect results
        for (const result of batchResults) {
          if (result.success) {
            processedFiles.push(result.file);
          } else {
            errors.push(result.error);
          }
        }

        // Small delay between batches to allow system to recover
        if (batchEnd < totalFiles) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      // Log file I/O stats
      const stats = fileIOManager.getStats();
      console.log(
        `📊 File I/O Stats - Completed: ${stats.completedOperations}, Failed: ${stats.failedOperations}, EMFILE errors: ${stats.emfileErrors}`,
      );

      if (processedFiles.length === 0 && errors.length > 0) {
        return {
          success: false,
          error: errors.join('; '),
          files: [],
        };
      }

      return {
        success: true,
        files: processedFiles,
        errors: errors.length > 0 ? errors : undefined,
        stats: {
          total: totalFiles,
          processed: processedFiles.length,
          failed: errors.length,
        },
      };
    } catch (error) {
      console.error('Failed to process dropped files:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  },
);

// IPC Handler for cleaning up temporary files with controlled concurrency
ipcMain.handle('cleanup-temp-files', async (event, filePaths: string[]) => {
  try {
    let cleanedCount = 0;
    const errors: string[] = [];

    // Process deletions in batches to avoid EMFILE
    const BATCH_SIZE = 5;

    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async (filePath) => {
        try {
          if (
            fileIOManager.exists(filePath) &&
            filePath.includes('dividr-uploads')
          ) {
            await fileIOManager.deleteFile(filePath, 'low');
            console.log(`🗑️ Cleaned up temporary file: ${filePath}`);
            return true;
          }
          return false;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          console.warn(`⚠️ Failed to cleanup file ${filePath}:`, errorMessage);
          errors.push(`${path.basename(filePath)}: ${errorMessage}`);
          return false;
        }
      });

      const results = await Promise.all(batchPromises);
      cleanedCount += results.filter(Boolean).length;
    }

    return {
      success: true,
      cleanedCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error('Failed to cleanup temporary files:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMessage };
  }
});

// IPC Handler for reading file content with EMFILE protection
ipcMain.handle('read-file', async (event, filePath: string) => {
  try {
    console.log(`📖 Reading file content from: ${filePath}`);

    if (!fileIOManager.exists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file content as UTF-8 text using controlled I/O manager
    const content = await fileIOManager.readFile(filePath, {
      encoding: 'utf-8',
      priority: 'normal',
    });
    console.log(`📄 Successfully read file, content length: ${content.length}`);

    return content;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Failed to read file ${filePath}:`, errorMessage);

    // Provide helpful error message for EMFILE
    if (isEMFILEError(error)) {
      throw new Error(
        `System file limit reached while reading ${path.basename(filePath)}. Please wait and try again.`,
      );
    }

    throw error;
  }
});

// IPC Handler for reading file as ArrayBuffer (for validation) with EMFILE protection
ipcMain.handle('read-file-as-buffer', async (event, filePath: string) => {
  try {
    console.log(`📖 Reading file as buffer from: ${filePath}`);

    if (!fileIOManager.exists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read file as Buffer using controlled I/O manager
    const buffer = await fileIOManager.readFileAsBuffer(filePath, 'normal');
    console.log(
      `📄 Successfully read file buffer, size: ${buffer.length} bytes`,
    );

    // Convert Node Buffer to ArrayBuffer for transfer to renderer
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error(
      `❌ Failed to read file as buffer ${filePath}:`,
      errorMessage,
    );

    // Provide helpful error message for EMFILE
    if (isEMFILEError(error)) {
      throw new Error(
        `System file limit reached while reading ${path.basename(filePath)}. Please wait and try again.`,
      );
    }

    throw error;
  }
});

// IPC Handler for getting file I/O and background task queue status
ipcMain.handle('get-io-status', async () => {
  const fileIOStats = fileIOManager.getStats();
  const taskQueueStats = backgroundTaskQueue.getStats();

  return {
    fileIO: {
      activeReads: fileIOStats.activeReads,
      activeWrites: fileIOStats.activeWrites,
      queuedReads: fileIOStats.queuedReads,
      queuedWrites: fileIOStats.queuedWrites,
      completedOperations: fileIOStats.completedOperations,
      failedOperations: fileIOStats.failedOperations,
      emfileErrors: fileIOStats.emfileErrors,
      isUnderHeavyLoad: fileIOManager.isUnderHeavyLoad(),
    },
    taskQueue: {
      pending: taskQueueStats.pending,
      running: taskQueueStats.running,
      completed: taskQueueStats.completed,
      failed: taskQueueStats.failed,
      cancelled: taskQueueStats.cancelled,
      byType: taskQueueStats.byType,
      isIdle: backgroundTaskQueue.isIdle(),
    },
  };
});

// IPC Handler for cancelling background tasks for a specific media
ipcMain.handle('cancel-media-tasks', async (event, mediaId: string) => {
  const cancelledCount = backgroundTaskQueue.cancelTasksForMedia(mediaId);
  console.log(`🛑 Cancelled ${cancelledCount} tasks for media ${mediaId}`);
  return { success: true, cancelledCount };
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

ipcMain.handle('getVideoDimensions', async (_event, filePath: string) => {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const ffprobe = spawn(ffprobePath.path, [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'json',
      filePath,
    ]);

    let stdout = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        return;
      }

      try {
        const json = JSON.parse(stdout);
        const stream = json.streams?.[0];
        if (!stream?.width || !stream?.height) {
          reject(new Error('Could not read video dimensions'));
          return;
        }
        resolve({ width: stream.width, height: stream.height });
      } catch (err) {
        reject(err);
      }
    });

    ffprobe.on('error', (err) => {
      reject(err);
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
      tempSubtitlePath = path.join(absoluteLocation, 'temp_subtitles.ass');

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
    const baseArgs = await buildFfmpegCommand(
      job,
      absoluteLocation,
      ffmpegPath,
    );
    const args = ['-progress', 'pipe:1', '-y', ...baseArgs];

    console.log('🎬 COMPLETE FFMPEG COMMAND:');
    console.log(['ffmpeg', ...args].join(' '));

    return new Promise((resolve, reject) => {
      //console.log('🚀 Starting FFmpeg with args:', args);

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

      ffmpeg.on('close', (code, signal) => {
        currentFfmpegProcess = null;

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

        // Check if this was a user cancellation:
        // 1. Signal is SIGTERM/SIGKILL (direct signal kill)
        // 2. Code 255 AND logs contain "received signal 15" (FFmpeg caught signal)
        const wasCancelled =
          signal === 'SIGTERM' ||
          signal === 'SIGKILL' ||
          (code === 255 &&
            (logs.includes('received signal 15') ||
              logs.includes('Exiting normally, received signal')));

        if (wasCancelled) {
          console.log('🛑 FFmpeg process was cancelled by user');

          // Delete the incomplete output file
          const outputFilePath = path.join(absoluteLocation, job.output);
          console.log(
            '🔍 Checking for incomplete output file at:',
            outputFilePath,
          );

          if (fs.existsSync(outputFilePath)) {
            try {
              fs.unlinkSync(outputFilePath);
              console.log('🗑️ Deleted incomplete output file:', outputFilePath);
            } catch (deleteError) {
              console.warn(
                '⚠️ Failed to delete incomplete output file:',
                deleteError,
              );
            }
          } else {
            console.log(
              'ℹ️ No output file found to delete (may not have been created yet)',
            );
          }

          resolve({
            success: true,
            cancelled: true,
            logs,
            message: 'Export cancelled by user',
          });
          return;
        }

        console.log(
          `🏁 FFmpeg process finished with code: ${code}, signal: ${signal}`,
        );

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
  if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
    console.log('🛑 Cancelling FFmpeg process...');

    // Send SIGTERM for graceful termination
    currentFfmpegProcess.kill('SIGTERM');

    // Force kill after 2 seconds if still running
    setTimeout(() => {
      if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
        console.log('⚠️ Force killing FFmpeg process...');
        currentFfmpegProcess.kill('SIGKILL');
      }
    }, 2000);

    currentFfmpegProcess = null;
    return { success: true, message: 'Export cancelled' };
  }

  return { success: false, message: 'No export running' };
});

// Keep track of active proxy generation promises to deduplicate requests
const activeProxyGenerations = new Map<string, Promise<any>>();

// Helper function to run FFmpeg proxy generation with a specific encoder config
async function runProxyFFmpeg(
  inputPath: string,
  tempPath: string,
  encoderConfig: ProxyEncoderConfig,
  ffmpegBinaryPath: string,
  eventSender: Electron.WebContents | null,
): Promise<{
  success: boolean;
  code?: number;
  stderr?: string;
}> {
  // Build FFmpeg args based on encoder type
  let args: string[];
  if (encoderConfig.type === 'vaapi') {
    // VAAPI requires special filter chain with hardware upload
    args = buildVaapiProxyFFmpegArgs(inputPath, tempPath);
  } else {
    args = buildProxyFFmpegArgs(inputPath, tempPath, encoderConfig);
  }

  console.log(
    `🎬 FFmpeg proxy command (${encoderConfig.description}):`,
    [ffmpegBinaryPath, ...args].join(' '),
  );

  return new Promise((resolve) => {
    const ffmpeg = spawn(ffmpegBinaryPath, args);

    let stderrOutput = '';
    ffmpeg.stderr.on('data', (data) => {
      const chunk = data.toString();
      stderrOutput += chunk;

      // Send progress updates to renderer
      if (chunk.includes('time=') && eventSender) {
        eventSender.send('proxy-progress', {
          path: inputPath,
          log: chunk,
          encoder: encoderConfig.type,
        });
      }
    });

    ffmpeg.on('close', (code) => {
      resolve({
        success: code === 0,
        code: code ?? undefined,
        stderr: stderrOutput,
      });
    });

    ffmpeg.on('error', (err) => {
      console.error(`❌ FFmpeg spawn error (${encoderConfig.type}):`, err);
      resolve({
        success: false,
        code: -1,
        stderr: err.message,
      });
    });
  });
}

// IPC Handler for generating proxy files for 4K video optimization
// Uses hybrid encoder selection: GPU hardware encoder if available, CPU fallback otherwise
ipcMain.handle('generate-proxy', async (event, inputPath: string) => {
  console.log('🔄 generate-proxy called for:', inputPath);

  // Check if there is already an active generation for this file
  if (activeProxyGenerations.has(inputPath)) {
    console.log('🔄 Joining existing proxy generation for:', inputPath);
    return activeProxyGenerations.get(inputPath);
  }

  const generationPromise = (async () => {
    if (!ffmpegPath) {
      return { success: false, error: 'FFmpeg not available' };
    }

    try {
      const proxiesDir = path.join(app.getPath('userData'), 'proxies');
      if (!fs.existsSync(proxiesDir)) {
        fs.mkdirSync(proxiesDir, { recursive: true });
      }

      // Generate a stable hash for the filename based on input path
      const hash = crypto.createHash('md5').update(inputPath).digest('hex');
      const outputPath = path.join(proxiesDir, `${hash}.mp4`);

      // Check if proxy already exists
      if (fs.existsSync(outputPath)) {
        console.log('✅ Proxy already exists at:', outputPath);
        // Verify it's valid (size > 0)
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) {
          return { success: true, proxyPath: outputPath, cached: true };
        }
        // If invalid, delete and regenerate
        fs.unlinkSync(outputPath);
      }

      // Use a temporary file during generation to prevent incomplete reads
      const tempPath = outputPath + '.tmp';
      console.log(`📝 Writing to temp file: ${tempPath}`);

      // Clean up any stale temp file
      if (fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch (e) {
          console.warn('⚠️ Could not cleanup old temp proxy:', e);
        }
      }

      // Get optimal encoder configuration (hardware if available, software fallback)
      const encoderConfig = await getProxyEncoderConfig(ffmpegPath);

      console.log('🚀 Starting proxy generation to:', outputPath);
      console.log(`🎮 Using encoder: ${encoderConfig.description}`);
      const startTime = Date.now();
      const startTimeString = new Date(startTime).toLocaleTimeString();
      console.log(
        `⏱️ Proxy generation START: ${startTimeString} (${startTime})`,
      );

      // Attempt proxy generation with selected encoder
      let result = await runProxyFFmpeg(
        inputPath,
        tempPath,
        encoderConfig,
        ffmpegPath,
        event.sender,
      );

      let fallbackUsed = false;
      let originalEncoder: string | undefined;

      // If hardware encoder failed, fallback to software encoding
      if (!result.success && encoderConfig.type !== 'software') {
        console.warn(
          `⚠️ Hardware encoder ${encoderConfig.type} failed (code: ${result.code}), falling back to software encoding`,
        );
        console.warn(`   Error: ${result.stderr?.slice(-200)}`);

        // Clean up any partial temp file from failed attempt
        if (fs.existsSync(tempPath)) {
          try {
            fs.unlinkSync(tempPath);
          } catch (e) {
            console.warn('⚠️ Could not cleanup temp file after failure:', e);
          }
        }

        // Retry with software encoder
        const softwareConfig = getSoftwareEncoderConfig();
        console.log(`🔄 Retrying with ${softwareConfig.description}...`);

        result = await runProxyFFmpeg(
          inputPath,
          tempPath,
          softwareConfig,
          ffmpegPath,
          event.sender,
        );

        fallbackUsed = true;
        originalEncoder = encoderConfig.type;
      }

      const endTime = Date.now();
      const endTimeString = new Date(endTime).toLocaleTimeString();
      const durationMs = endTime - startTime;

      console.log(`⏱️ Proxy generation END: ${endTimeString} (${endTime})`);
      console.log(`⏱️ Duration: ${durationMs}ms`);

      if (result.success) {
        try {
          // Wait a small amount of time to ensure file handles are released
          await new Promise((r) => setTimeout(r, 500));

          // Atomic rename: temp -> final
          if (fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, outputPath);
            console.log(
              '✅ Proxy generation complete (renamed temp -> final):',
              outputPath,
            );

            const finalEncoderType = fallbackUsed
              ? 'software'
              : encoderConfig.type;
            const finalEncoderDesc = fallbackUsed
              ? getSoftwareEncoderConfig().description
              : encoderConfig.description;

            return {
              success: true,
              proxyPath: outputPath,
              encoder: {
                type: finalEncoderType,
                description: finalEncoderDesc,
                fallbackUsed,
                originalEncoder,
              },
              benchmark: {
                durationMs,
                startTime,
                endTime,
              },
            };
          } else {
            console.error(
              '❌ Temp proxy file missing after successful FFmpeg exit',
            );
            return { success: false, error: 'Temp proxy file missing' };
          }
        } catch (err) {
          console.error('❌ Failed to rename temp proxy file:', err);
          return {
            success: false,
            error: 'Failed to finalize proxy file',
          };
        }
      } else {
        console.error(`❌ Proxy generation failed with code: ${result.code}`);
        console.error(`❌ FFmpeg stderr:`, result.stderr);

        // Cleanup temp file
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        return {
          success: false,
          error: `FFmpeg exited with code ${result.code}. Error: ${result.stderr?.slice(-200)}`,
        };
      }
    } catch (error) {
      console.error('Failed to generate proxy:', error);
      return { success: false, error: error.message };
    } finally {
      // Remove from active generations map when done
      activeProxyGenerations.delete(inputPath);
    }
  })();

  activeProxyGenerations.set(inputPath, generationPromise);
  return generationPromise;
});

// IPC Handler for getting hardware capabilities (for UI display and low-hardware modal)
ipcMain.handle('get-hardware-capabilities', async () => {
  if (!ffmpegPath) {
    return {
      success: false,
      error: 'FFmpeg not available',
    };
  }

  try {
    const capabilities = await detectHardwareCapabilities(ffmpegPath);

    return {
      success: true,
      capabilities: {
        hasHardwareEncoder: capabilities.hasHardwareEncoder,
        encoderType: capabilities.encoder.primary?.type || 'none',
        encoderDescription:
          capabilities.encoder.primary?.description ||
          'Software encoding (CPU)',
        cpuCores: capabilities.cpuCores,
        totalRamGB: Math.round(
          capabilities.totalRamBytes / (1024 * 1024 * 1024),
        ),
        freeRamGB: Math.round(capabilities.freeRamBytes / (1024 * 1024 * 1024)),
        isLowHardware: capabilities.isLowHardware,
      },
    };
  } catch (error) {
    console.error('Failed to detect hardware capabilities:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
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

// ============================================================================
// Python Faster-Whisper IPC Handlers
// ============================================================================

// IPC Handler for Whisper transcription
ipcMain.handle(
  'whisper:transcribe',
  async (
    event,
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
  ) => {
    console.log('🎤 MAIN PROCESS: whisper:transcribe handler called (Python)');
    console.log('   Audio path:', audioPath);
    console.log('   Options:', options);

    try {
      await ensurePythonInitialized('ipc:whisper:transcribe');

      const result: WhisperResult = await transcribeAudio(audioPath, {
        ...options,
        onProgress: (progress: WhisperProgress) => {
          // Send progress updates to renderer process
          event.sender.send('whisper:progress', progress);
        },
      });

      console.log('✅ Transcription successful');
      return { success: true, result };
    } catch (error) {
      console.error('❌ Whisper transcription failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// IPC Handler to cancel transcription
ipcMain.handle('whisper:cancel', async () => {
  console.log('🛑 MAIN PROCESS: whisper:cancel handler called');

  const cancelled = cancelTranscription();
  return {
    success: cancelled,
    message: cancelled
      ? 'Transcription cancelled successfully'
      : 'No active transcription to cancel',
  };
});

// IPC Handler to check Whisper status
ipcMain.handle('whisper:status', async () => {
  console.log('📊 MAIN PROCESS: whisper:status handler called');

  // Try to initialize if not already initialized (but don't fail if it doesn't work)
  if (!getPythonWhisperStatus().available) {
    try {
      await ensurePythonInitialized('ipc:whisper:status');
    } catch (error) {
      console.log(
        '⚠️ Python initialization failed during status check:',
        error,
      );
      // Continue to return status even if initialization failed
    }
  }

  const status = getPythonWhisperStatus();
  console.log('   Status:', status);

  return status;
});

// ============================================================================
// Media Tools IPC Handlers (Noise Reduction)
// ============================================================================

// IPC Handler for noise reduction
ipcMain.handle(
  'media-tools:noise-reduce',
  async (
    event,
    inputPath: string,
    outputPath: string,
    options?: {
      stationary?: boolean;
      propDecrease?: number;
      nFft?: number;
      engine?: 'ffmpeg' | 'deepfilter';
    },
  ) => {
    console.log('🔇 MAIN PROCESS: media-tools:noise-reduce handler called');
    console.log('   Input path:', inputPath);
    console.log('   Output path:', outputPath);
    console.log('   Options:', options);

    const engine = options?.engine || 'ffmpeg'; // Default to FFmpeg for safety/speed

    try {
      if (engine === 'deepfilter') {
        // --- DeepFilterNet2 (Python) ---
        await ensurePythonInitialized('ipc:media-tools:noise-reduce');

        const result: NoiseReductionResult = await reduceNoise(
          inputPath,
          outputPath,
          {
            ...options,
            onProgress: (progress: MediaToolsProgress) => {
              // Send progress updates to renderer process
              event.sender.send('media-tools:progress', progress);
            },
          },
        );

        console.log('✅ DeepFilter noise reduction successful');
        return { success: true, result };
      } else {
        // --- FFmpeg (Native) ---
        console.log('⚡ Using FFmpeg for noise reduction');

        if (!ffmpegPath) {
          throw new Error('FFmpeg binary not available');
        }

        // Build command
        // Note: buildArnnDenCommand returns args for "ffmpeg -i input -af arnndn..."
        const args = buildArnnDenCommand(inputPath, outputPath);
        // We need to add -y to overwrite output if it exists (standard behavior)
        args.unshift('-y');

        console.log('   Command:', `ffmpeg ${args.join(' ')}`);

        return new Promise((resolve) => {
          const ffmpeg = spawn(ffmpegPath!, args);
          let durationSec = 0;
          let stderrLog = '';

          // Send initial loading state
          event.sender.send('media-tools:progress', {
            stage: 'loading',
            progress: 0,
            message: 'Initializing FFmpeg...',
          });

          ffmpeg.stderr.on('data', (data) => {
            const text = data.toString();
            stderrLog += text;

            // 1. Parse Duration: Duration: 00:00:10.50,
            if (durationSec === 0) {
              const durationMatch = text.match(
                /Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/,
              );
              if (durationMatch) {
                const h = parseFloat(durationMatch[1]);
                const m = parseFloat(durationMatch[2]);
                const s = parseFloat(durationMatch[3]);
                durationSec = h * 3600 + m * 60 + s;
              }
            }

            // 2. Parse Time: time=00:00:05.20
            if (durationSec > 0) {
              const timeMatch = text.match(
                /time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/,
              );
              if (timeMatch) {
                const h = parseFloat(timeMatch[1]);
                const m = parseFloat(timeMatch[2]);
                const s = parseFloat(timeMatch[3]);
                const timeSec = h * 3600 + m * 60 + s;
                const percent = Math.min(
                  99,
                  Math.round((timeSec / durationSec) * 100),
                );

                event.sender.send('media-tools:progress', {
                  stage: 'processing',
                  progress: percent,
                  message: `Filtering... ${percent}%`,
                });
              }
            }
          });

          ffmpeg.on('close', (code) => {
            if (code === 0) {
              console.log('✅ FFmpeg noise reduction successful');
              event.sender.send('media-tools:progress', {
                stage: 'complete',
                progress: 100,
                message: 'Noise reduction complete!',
              });
              resolve({
                success: true,
                result: {
                  success: true,
                  outputPath,
                  message: 'FFmpeg denoising complete',
                },
              });
            } else {
              console.error('❌ FFmpeg noise reduction failed. Code:', code);
              // Check for common errors in stderr
              let errorMsg = `FFmpeg exited with code ${code}`;
              if (stderrLog.includes('Permission denied'))
                errorMsg = 'Permission denied';
              if (stderrLog.includes('No such file'))
                errorMsg = 'File not found';

              // Include the last 5 lines of stderr for context
              const stderrTail = stderrLog.split('\n').slice(-5).join('\n');
              if (stderrTail.trim()) {
                errorMsg += `\nStderr: ${stderrTail}`;
              }

              resolve({
                success: false,
                error: errorMsg,
              });
            }
          });

          ffmpeg.on('error', (err) => {
            console.error('❌ FFmpeg spawn error:', err);
            resolve({
              success: false,
              error: err.message,
            });
          });
        });
      }
    } catch (error) {
      console.error('❌ Noise reduction failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// IPC Handler to get system memory info
ipcMain.handle('get-system-memory', () => {
  return {
    total: os.totalmem(),
    free: os.freemem(),
  };
});

// IPC Handler to cancel media-tools operation
ipcMain.handle('media-tools:cancel', async () => {
  console.log('🛑 MAIN PROCESS: media-tools:cancel handler called');

  const cancelled = cancelCurrentOperation();
  return {
    success: cancelled,
    message: cancelled
      ? 'Operation cancelled'
      : 'No active operation to cancel',
  };
});

// IPC Handler to check media-tools status
ipcMain.handle('media-tools:status', async () => {
  console.log('📊 MAIN PROCESS: media-tools:status handler called');

  // Try to initialize if not already initialized
  if (!getMediaToolsStatus().available) {
    try {
      await ensurePythonInitialized('ipc:media-tools:status');
    } catch (error) {
      console.log(
        '⚠️ Media tools initialization failed during status check:',
        error,
      );
    }
  }

  const status = getMediaToolsStatus();
  console.log('   Status:', status);

  return status;
});

// ============================================================================
// Noise Reduction Cache IPC Handlers
// ============================================================================

// Noise reduction temp directory
const NOISE_REDUCTION_TEMP_DIR = path.join(
  os.tmpdir(),
  'dividr-noise-reduction',
);

// IPC Handler to get a unique output path for noise reduction
ipcMain.handle(
  'noise-reduction:get-output-path',
  async (_event, inputPath: string) => {
    console.log(
      '📁 MAIN PROCESS: noise-reduction:get-output-path handler called',
    );
    console.log('   Input path:', inputPath);

    try {
      // Ensure directory exists
      if (!fs.existsSync(NOISE_REDUCTION_TEMP_DIR)) {
        fs.mkdirSync(NOISE_REDUCTION_TEMP_DIR, { recursive: true });
        console.log(
          '   Created noise reduction temp directory:',
          NOISE_REDUCTION_TEMP_DIR,
        );
      }

      // Generate unique filename based on input path hash and timestamp
      const hash = crypto
        .createHash('md5')
        .update(inputPath)
        .digest('hex')
        .slice(0, 12);
      const timestamp = Date.now();
      const outputPath = path.join(
        NOISE_REDUCTION_TEMP_DIR,
        `nr_${hash}_${timestamp}.wav`,
      );

      console.log('   Generated output path:', outputPath);
      return { success: true, outputPath };
    } catch (error) {
      console.error('❌ Failed to generate output path:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// IPC Handler to cleanup noise reduction temp files
ipcMain.handle(
  'noise-reduction:cleanup-files',
  async (_event, filePaths: string[]) => {
    console.log(
      '🗑️ MAIN PROCESS: noise-reduction:cleanup-files handler called',
    );
    console.log('   Files to clean:', filePaths.length);

    try {
      let cleanedCount = 0;

      for (const filePath of filePaths) {
        try {
          // Security: only delete files in our noise reduction directory
          if (
            filePath.startsWith(NOISE_REDUCTION_TEMP_DIR) &&
            fs.existsSync(filePath)
          ) {
            fs.unlinkSync(filePath);
            cleanedCount++;
            console.log('   Cleaned up:', filePath);
          } else {
            console.warn('   Skipped (not in temp dir):', filePath);
          }
        } catch (error) {
          console.warn(`   Failed to cleanup ${filePath}:`, error);
        }
      }

      console.log(`✅ Cleaned up ${cleanedCount} noise reduction files`);
      return { success: true, cleanedCount };
    } catch (error) {
      console.error('❌ Failed to cleanup noise reduction files:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// IPC Handler to create a blob URL for a file
ipcMain.handle(
  'noise-reduction:create-preview-url',
  async (_event, filePath: string) => {
    console.log(
      '🔗 MAIN PROCESS: noise-reduction:create-preview-url handler called',
    );
    console.log('   File path:', filePath);

    try {
      // Read the file and return base64 data for creating blob URL in renderer
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const mimeType = 'audio/wav';

      console.log('✅ Created preview URL data, size:', buffer.length);
      return { success: true, base64, mimeType };
    } catch (error) {
      console.error('❌ Failed to create preview URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  },
);

// ============================================================================
// Runtime Download IPC Handlers
// ============================================================================

// IPC Handler to check runtime status
ipcMain.handle('runtime:status', async () => {
  console.log('📊 MAIN PROCESS: runtime:status handler called');

  const status = await checkRuntimeStatus();
  console.log('   Runtime status:', status);

  return status;
});

// IPC Handler to start runtime download
ipcMain.handle('runtime:download', async (event) => {
  console.log('📥 MAIN PROCESS: runtime:download handler called');

  try {
    const result = await downloadRuntime((progress) => {
      // Send progress updates to renderer process
      event.sender.send('runtime:download-progress', progress);
    });

    console.log('   Download result:', result);
    return result;
  } catch (error) {
    console.error('❌ Runtime download failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// IPC Handler to cancel runtime download
ipcMain.handle('runtime:cancel-download', async () => {
  console.log('🛑 MAIN PROCESS: runtime:cancel-download handler called');

  const result = await cancelDownload();
  return result;
});

// IPC Handler to verify runtime installation
ipcMain.handle('runtime:verify', async () => {
  console.log('🔍 MAIN PROCESS: runtime:verify handler called');

  const isValid = await verifyInstallation();
  return { valid: isValid };
});

// IPC Handler to remove runtime
ipcMain.handle('runtime:remove', async () => {
  console.log('🗑️ MAIN PROCESS: runtime:remove handler called');

  const result = await removeRuntime();
  return result;
});

// IPC Handler to check if a media file has audio
ipcMain.handle('media:has-audio', async (event, filePath: string) => {
  console.log('🔊 MAIN PROCESS: media:has-audio handler called');
  console.log('   File path:', filePath);

  if (!ffmpegPath) {
    return {
      success: false,
      hasAudio: false,
      error: 'FFmpeg binary not available',
    };
  }

  try {
    return new Promise((resolve) => {
      const ffprobe = spawn(ffmpegPath, [
        '-i',
        filePath,
        '-show_streams',
        '-select_streams',
        'a',
        '-loglevel',
        'error',
      ]);

      let stdout = '';
      let stderr = '';

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
        // If there's audio stream info in stdout, the file has audio
        const hasAudio = stdout.includes('[STREAM]');

        console.log(`   Has audio: ${hasAudio} (exit code: ${code})`);

        resolve({
          success: true,
          hasAudio,
        });
      });

      ffprobe.on('error', (error) => {
        console.error('   FFprobe error:', error);
        resolve({
          success: false,
          hasAudio: false,
          error: error.message,
        });
      });
    });
  } catch (error) {
    console.error('❌ Error checking audio:', error);
    return {
      success: false,
      hasAudio: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
});

// =============================================================================
// TRANSCODE SERVICE - AVI to MP4 background transcoding
// =============================================================================

// Formats that need transcoding for browser playback
const FORMATS_REQUIRING_TRANSCODE = [
  '.avi',
  '.wmv',
  '.flv',
  '.divx',
  '.xvid',
  '.asf',
  '.rm',
  '.rmvb',
  '.3gp',
  '.3g2',
];

// Codecs that browsers can't decode
const UNSUPPORTED_CODECS = [
  'xvid',
  'divx',
  'mpeg4',
  'msmpeg4',
  'wmv1',
  'wmv2',
  'wmv3',
  'vc1',
  'rv10',
  'rv20',
  'rv30',
  'rv40',
];

// Active transcode jobs
interface TranscodeJob {
  id: string;
  mediaId: string;
  inputPath: string;
  outputPath: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  duration: number;
  currentTime: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  process?: ReturnType<typeof spawn>;
}

const activeTranscodeJobs = new Map<string, TranscodeJob>();
const transcodeOutputDir = path.join(os.tmpdir(), 'dividr-transcode');

// Ensure transcode output directory exists
if (!fs.existsSync(transcodeOutputDir)) {
  fs.mkdirSync(transcodeOutputDir, { recursive: true });
}
console.log(`📁 Transcode output directory: ${transcodeOutputDir}`);

// IPC Handler to check if a file requires transcoding
ipcMain.handle(
  'transcode:requires-transcoding',
  async (event, filePath: string) => {
    console.log(
      '🔍 MAIN PROCESS: transcode:requires-transcoding handler called',
    );
    console.log('   File path:', filePath);

    const ext = path.extname(filePath).toLowerCase();

    // Check if extension requires transcoding
    if (FORMATS_REQUIRING_TRANSCODE.includes(ext)) {
      console.log(`   ✅ File requires transcoding (${ext} format)`);
      return { requiresTranscoding: true, reason: `${ext} format` };
    }

    // For other formats, check the actual codec
    if (!ffprobePath?.path) {
      console.log('   ⚠️ FFprobe not available, cannot check codec');
      return { requiresTranscoding: false, reason: 'Cannot detect codec' };
    }

    try {
      const codecResult = await new Promise<string | null>((resolve) => {
        const ffprobe = spawn(ffprobePath.path, [
          '-v',
          'quiet',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=codec_name',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
          filePath,
        ]);

        let output = '';
        ffprobe.stdout.on('data', (data) => {
          output += data.toString();
        });

        ffprobe.on('close', (code) => {
          if (code === 0 && output.trim()) {
            resolve(output.trim().toLowerCase());
          } else {
            resolve(null);
          }
        });

        ffprobe.on('error', () => resolve(null));
      });

      if (
        codecResult &&
        UNSUPPORTED_CODECS.some((c) => codecResult.includes(c))
      ) {
        console.log(`   ✅ File requires transcoding (${codecResult} codec)`);
        return { requiresTranscoding: true, reason: `${codecResult} codec` };
      }

      console.log(
        `   ❌ File does not require transcoding (codec: ${codecResult || 'unknown'})`,
      );
      return { requiresTranscoding: false, reason: 'Supported format' };
    } catch (error) {
      console.warn('   ⚠️ Could not detect codec:', error);
      return { requiresTranscoding: false, reason: 'Cannot detect codec' };
    }
  },
);

// IPC Handler to start transcoding
ipcMain.handle(
  'transcode:start',
  async (
    event,
    options: {
      mediaId: string;
      inputPath: string;
      videoBitrate?: string;
      audioBitrate?: string;
      crf?: number;
    },
  ) => {
    console.log('🎬 MAIN PROCESS: transcode:start handler called');
    console.log('   Media ID:', options.mediaId);
    console.log('   Input path:', options.inputPath);

    if (!ffmpegPath) {
      return { success: false, error: 'FFmpeg not available' };
    }

    // Generate job ID and output path
    const jobId = crypto.randomUUID();
    const outputFileName = `${jobId}.mp4`;
    const outputPath = path.join(transcodeOutputDir, outputFileName);

    // Get video metadata first
    let duration = 0;
    if (ffprobePath?.path) {
      try {
        duration = await new Promise<number>((resolve) => {
          const ffprobe = spawn(ffprobePath.path, [
            '-v',
            'quiet',
            '-print_format',
            'json',
            '-show_format',
            options.inputPath,
          ]);

          let output = '';
          ffprobe.stdout.on('data', (data) => {
            output += data.toString();
          });

          ffprobe.on('close', () => {
            try {
              const metadata = JSON.parse(output);
              resolve(parseFloat(metadata.format?.duration || '0'));
            } catch {
              resolve(0);
            }
          });

          ffprobe.on('error', () => resolve(0));
        });
      } catch {
        duration = 0;
      }
    }

    // Create job
    const job: TranscodeJob = {
      id: jobId,
      mediaId: options.mediaId,
      inputPath: options.inputPath,
      outputPath,
      status: 'processing',
      progress: 0,
      duration,
      currentTime: 0,
      startedAt: Date.now(),
    };

    activeTranscodeJobs.set(jobId, job);

    console.log(`   Job ID: ${jobId}`);
    console.log(`   Output path: ${outputPath}`);
    console.log(`   Duration: ${duration.toFixed(2)}s`);

    // Build FFmpeg arguments
    const args = [
      '-i',
      options.inputPath,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      String(options.crf || 23),
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      options.audioBitrate || '192k',
      '-ac',
      '2',
      '-movflags',
      '+faststart',
      '-progress',
      'pipe:1',
      '-y',
      outputPath,
    ];

    console.log(`   FFmpeg command: ffmpeg ${args.join(' ')}`);

    // Start FFmpeg process
    const ffmpegProcess = spawn(ffmpegPath, args);
    job.process = ffmpegProcess;

    let stderrOutput = '';

    ffmpegProcess.stdout.on('data', (data) => {
      const output = data.toString();

      // Parse progress
      const timeMatch = output.match(/out_time_ms=(\d+)/);
      if (timeMatch) {
        const currentTimeMs = parseInt(timeMatch[1], 10);
        job.currentTime = currentTimeMs / 1000000;

        if (job.duration > 0) {
          job.progress = Math.min(100, (job.currentTime / job.duration) * 100);
        }

        // Send progress to renderer
        mainWindow?.webContents.send('transcode:progress', {
          jobId: job.id,
          mediaId: job.mediaId,
          status: job.status,
          progress: job.progress,
          currentTime: job.currentTime,
          duration: job.duration,
        });
      }
    });

    ffmpegProcess.stderr.on('data', (data) => {
      stderrOutput += data.toString();
    });

    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        job.status = 'completed';
        job.progress = 100;
        job.completedAt = Date.now();

        const processingTime =
          job.completedAt - (job.startedAt || job.completedAt);
        console.log(
          `✅ Transcode completed: ${jobId} in ${(processingTime / 1000).toFixed(1)}s`,
        );

        // Create preview URL for the transcoded file
        const previewUrl = `http://localhost:${MEDIA_SERVER_PORT}/${encodeURIComponent(outputPath)}`;

        mainWindow?.webContents.send('transcode:completed', {
          jobId: job.id,
          mediaId: job.mediaId,
          success: true,
          outputPath,
          previewUrl,
        });
      } else if (job.status === 'cancelled') {
        console.log(`🚫 Transcode cancelled: ${jobId}`);

        // Clean up output file
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch (e) {
            console.warn('   Could not delete incomplete transcode file');
          }
        }

        mainWindow?.webContents.send('transcode:completed', {
          jobId: job.id,
          mediaId: job.mediaId,
          success: false,
          error: 'Cancelled',
        });
      } else {
        job.status = 'failed';
        job.error =
          stderrOutput.slice(-500) || `FFmpeg exited with code ${code}`;

        console.error(`❌ Transcode failed: ${jobId}`);
        console.error(`   Error: ${job.error}`);

        mainWindow?.webContents.send('transcode:completed', {
          jobId: job.id,
          mediaId: job.mediaId,
          success: false,
          error: job.error,
        });
      }

      // Clean up process reference
      delete job.process;
    });

    ffmpegProcess.on('error', (error) => {
      job.status = 'failed';
      job.error = error.message;

      console.error(`❌ Transcode process error: ${jobId}`);
      console.error(`   Error: ${error.message}`);

      mainWindow?.webContents.send('transcode:completed', {
        jobId: job.id,
        mediaId: job.mediaId,
        success: false,
        error: error.message,
      });
    });

    return {
      success: true,
      jobId,
      outputPath,
    };
  },
);

// IPC Handler to get transcode job status
ipcMain.handle('transcode:status', async (event, jobId: string) => {
  const job = activeTranscodeJobs.get(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  return {
    success: true,
    job: {
      id: job.id,
      mediaId: job.mediaId,
      status: job.status,
      progress: job.progress,
      duration: job.duration,
      currentTime: job.currentTime,
      error: job.error,
    },
  };
});

// IPC Handler to cancel transcode job
ipcMain.handle('transcode:cancel', async (event, jobId: string) => {
  console.log('🛑 MAIN PROCESS: transcode:cancel handler called');
  console.log('   Job ID:', jobId);

  const job = activeTranscodeJobs.get(jobId);
  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  if (job.process && !job.process.killed) {
    job.status = 'cancelled';
    job.process.kill('SIGTERM');
    console.log(`   Cancelled job: ${jobId}`);
    return { success: true };
  }

  return { success: false, error: 'Job not running' };
});

// IPC Handler to cancel all transcode jobs for a media ID
ipcMain.handle('transcode:cancel-for-media', async (event, mediaId: string) => {
  console.log('🛑 MAIN PROCESS: transcode:cancel-for-media handler called');
  console.log('   Media ID:', mediaId);

  let cancelled = 0;
  for (const [jobId, job] of activeTranscodeJobs.entries()) {
    if (
      job.mediaId === mediaId &&
      (job.status === 'queued' || job.status === 'processing')
    ) {
      if (job.process && !job.process.killed) {
        job.status = 'cancelled';
        job.process.kill('SIGTERM');
        cancelled++;
      }
    }
  }

  console.log(`   Cancelled ${cancelled} jobs`);
  return { success: true, cancelled };
});

// IPC Handler to get all active transcode jobs
ipcMain.handle('transcode:get-active-jobs', async () => {
  const jobs = Array.from(activeTranscodeJobs.values())
    .filter((job) => job.status === 'queued' || job.status === 'processing')
    .map((job) => ({
      id: job.id,
      mediaId: job.mediaId,
      status: job.status,
      progress: job.progress,
      duration: job.duration,
      currentTime: job.currentTime,
    }));

  return { success: true, jobs };
});

// IPC Handler to cleanup old transcode files with EMFILE protection
ipcMain.handle(
  'transcode:cleanup',
  async (event, maxAgeMs: number = 24 * 60 * 60 * 1000) => {
    console.log('🧹 MAIN PROCESS: transcode:cleanup handler called');

    try {
      // Read directory with retry for EMFILE protection
      let files: string[] = [];
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          files = fs.readdirSync(transcodeOutputDir);
          break;
        } catch (err) {
          if (isEMFILEError(err) && attempt < 3) {
            console.warn(`⚠️ EMFILE reading transcode dir, retry ${attempt}/3`);
            await new Promise((r) => setTimeout(r, 500 * attempt));
          } else {
            throw err;
          }
        }
      }

      const now = Date.now();
      let cleaned = 0;
      const errors: string[] = [];

      // Process deletions in batches to prevent EMFILE
      const BATCH_SIZE = 5;
      const filesToDelete: string[] = [];

      // First pass: identify files to delete
      for (const file of files) {
        const filePath = path.join(transcodeOutputDir, file);
        try {
          const stats = fs.statSync(filePath);
          const age = now - stats.mtimeMs;
          if (age > maxAgeMs) {
            filesToDelete.push(filePath);
          }
        } catch (statErr) {
          // Skip files we can't stat
          console.warn(`⚠️ Could not stat ${file}:`, statErr);
        }
      }

      // Second pass: delete in batches
      for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
        const batch = filesToDelete.slice(i, i + BATCH_SIZE);
        const batchPromises = batch.map(async (filePath) => {
          try {
            await fileIOManager.deleteFile(filePath, 'low');
            return true;
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown';
            errors.push(`${path.basename(filePath)}: ${errorMessage}`);
            return false;
          }
        });

        const results = await Promise.all(batchPromises);
        cleaned += results.filter(Boolean).length;
      }

      console.log(`   Cleaned ${cleaned} old transcode files`);
      return {
        success: true,
        cleaned,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      console.error('   Error cleaning up:', errorMessage);

      if (isEMFILEError(error)) {
        return {
          success: false,
          error:
            'System file limit reached during cleanup. Please try again later.',
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  },
);

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    frame: false,
    autoHideMenuBar: true,
    minWidth: 1280,
    minHeight: 520,
    show: false, // Don't show immediately - wait for ready-to-show
    backgroundColor: '#09090b', // Match loader background to prevent flash
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: true,
      nodeIntegration: true,
      // devTools: false,
    },
  });

  logStartupPerf();

  if (mainWindow) {
    const fallbackShow = setTimeout(() => {
      if (!mainWindow) return;
      if (!mainWindow.isVisible()) {
        logStartupPerf();
        mainWindow.show();
      }
      kickoffDeferredInitialization();
    }, 1200);

    mainWindow.webContents.once('did-start-loading', () => {
      logStartupPerf();
    });

    mainWindow.webContents.once('dom-ready', () => {
      logStartupPerf();
      // DOM is ready, loader HTML is already visible from index.html
      // Show window immediately since loader is in HTML
      if (mainWindow && !mainWindow.isVisible()) {
        clearTimeout(fallbackShow);
        mainWindow.show();
        kickoffDeferredInitialization();
      }
    });

    mainWindow.webContents.once('did-finish-load', () => {
      logStartupPerf();

      // Send pending file path to renderer if app was opened with a .dividr file
      if (pendingFilePath && mainWindow) {
        mainWindow.webContents.send('open-project-file', pendingFilePath);
        pendingFilePath = null;
      }
    });

    // Show window when ready (fallback)
    mainWindow.once('ready-to-show', () => {
      clearTimeout(fallbackShow);
      logStartupPerf();
      if (!mainWindow?.isVisible()) {
        mainWindow?.show();
        kickoffDeferredInitialization();
      }
    });

    if (
      process.env.NODE_ENV === 'development' &&
      MAIN_WINDOW_VITE_DEV_SERVER_URL
    ) {
      mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
      mainWindow.webContents.openDevTools();
    } else {
      mainWindow.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      );

      // 🚫 Remove all default menus so "View → Toggle Developer Tools" disappears
      // Menu.setApplicationMenu(null);

      // 🚫 Block keyboard shortcuts
      mainWindow.webContents.on('before-input-event', (event, input) => {
        if (
          (input.control && input.shift && input.key.toLowerCase() === 'i') || // Ctrl+Shift+I
          input.key === 'F12' || // F12
          (process.platform === 'darwin' &&
            input.meta &&
            input.alt &&
            input.key.toLowerCase() === 'i') // Cmd+Opt+I
        ) {
          event.preventDefault();
        }
      });

      // 🚫 If DevTools somehow open, force-close them
      mainWindow.webContents.on('devtools-opened', () => {
        mainWindow?.webContents.closeDevTools();
      });

      // 🚫 Disable right-click → Inspect Element
      mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault();
      });
    }

    // Handle window close events - hide instead of close
    mainWindow.on('close', async (event) => {
      if (!forceQuit) {
        // Get the real-time setting
        const shouldRunInBackground = await getRunInBackgroundSetting();
        console.log('Window closing, checking setting:', shouldRunInBackground);

        if (shouldRunInBackground) {
          event.preventDefault();
          mainWindow?.hide();
          return false;
        }
      }
    });

    // Focus tracking for clipboard monitoring
    mainWindow.on('focus', () => {
      isWindowFocused = true;
      // console.log('Window focused - clipboard monitoring paused');
    });

    mainWindow.on('blur', () => {
      isWindowFocused = false;
      // console.log('Window unfocused - clipboard monitoring resumed');
    });

    // Maximize state change events
    mainWindow.on('maximize', () => {
      mainWindow?.webContents.send('window-maximize-changed', true);
    });

    mainWindow.on('unmaximize', () => {
      mainWindow?.webContents.send('window-maximize-changed', false);
    });

    // Prevent navigation to external URLs
    mainWindow.webContents.on('will-navigate', (event) => {
      event.preventDefault();
    });
  }
};

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

// Get current maximize state
ipcMain.handle('get-maximize-state', () => {
  if (!mainWindow) return false;
  return mainWindow.isMaximized();
});

// Helper function to get run in background setting
async function getRunInBackgroundSetting(): Promise<boolean> {
  // This would typically read from a settings file or store
  // For now, return false as default
  return false;
}

app.on('ready', async () => {
  // Create window first to show loader immediately
  logStartupPerf();
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

  // Cleanup noise reduction temp directory
  if (fs.existsSync(NOISE_REDUCTION_TEMP_DIR)) {
    try {
      fs.rmSync(NOISE_REDUCTION_TEMP_DIR, { recursive: true, force: true });
      console.log('🗑️ Cleaned up noise reduction temp directory');
    } catch (error) {
      console.warn(
        '⚠️ Failed to cleanup noise reduction temp directory:',
        error,
      );
    }
  }
});
