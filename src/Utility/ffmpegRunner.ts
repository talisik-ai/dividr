// Renderer-side FFmpeg wrapper using IPC to main process
import { VideoEditJob } from '../Schema/ffmpegConfig';

// Progress interface for FFmpeg output
export interface FfmpegProgress {
  frame: number;
  fps: number;
  bitrate: string;
  totalSize: string;
  outTime: string;
  speed: string;
  progress: string;
  percentage?: number;
}

export interface FfmpegCallbacks {
  onProgress?: (progress: FfmpegProgress) => void;
  onStatus?: (status: string) => void;
  onLog?: (log: string, type: 'stdout' | 'stderr') => void;
}

// Check if we're in Electron renderer
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI;
};

// Detect video frame rate using IPC
export async function detectVideoFrameRate(videoPath: string): Promise<number> {
  if (!isElectron()) {
    console.warn('FFmpeg operations require Electron main process');
    return 30; // Fallback
  }

  try {
    return await window.electronAPI.invoke(
      'ffmpeg:detect-frame-rate',
      videoPath,
    );
  } catch (error) {
    console.error('Failed to detect video frame rate:', error);
    return 30; // Fallback
  }
}

// Detect frame rates for multiple videos and suggest target
export async function suggestConcatFrameRate(
  videoPaths: string[],
): Promise<number> {
  try {
    const frameRates = await Promise.all(
      videoPaths.map((path) => detectVideoFrameRate(path)),
    );

    console.log('Detected frame rates:', frameRates);

    // Use the highest frame rate to avoid quality loss
    const maxFrameRate = Math.max(...frameRates);

    // Round to common frame rates
    if (maxFrameRate <= 24.5) return 24;
    if (maxFrameRate <= 25.5) return 25;
    if (maxFrameRate <= 30.5) return 30;
    if (maxFrameRate <= 60.5) return 60;

    return Math.round(maxFrameRate);
  } catch (err) {
    console.warn('Failed to detect frame rates, using default 30fps:', err);
    return 30;
  }
}

// Cancel current FFmpeg process via IPC
export function cancelCurrentFfmpeg(): Promise<boolean> {
  if (!isElectron()) {
    console.warn('FFmpeg operations require Electron main process');
    return Promise.resolve(false);
  }

  return window.electronAPI.invoke('ffmpeg:cancel');
}

// Check if FFmpeg is currently running
export function isFfmpegRunning(): boolean {
  // This would need to be tracked via IPC or state management
  console.warn('isFfmpegRunning not implemented for IPC version');
  return false;
}

// Parse FFmpeg progress output
export function parseFfmpegProgress(
  progressLine: string,
): Partial<FfmpegProgress> {
  const progress: any = {};

  const patterns = {
    frame: /frame=\s*(\d+)/,
    fps: /fps=\s*([\d.]+)/,
    bitrate: /bitrate=\s*([\d.]+\w+)/,
    outTime: /time=(\d{2}:\d{2}:\d{2}\.\d{2})/,
    totalSize: /size=\s*(\d+\w+)/,
    speed: /speed=\s*([\d.]+x)/,
    progress: /progress=(\w+)/,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = progressLine.match(pattern);
    if (match) {
      progress[key] =
        key === 'frame' || key === 'fps' ? Number(match[1]) : match[1];
    }
  }

  return progress;
}

// Enhanced FFmpeg runner with progress callbacks via IPC
export async function runFfmpegWithProgress(
  job: VideoEditJob,
  callbacks?: FfmpegCallbacks,
): Promise<{ command: string; logs: string }> {
  console.log('🔍 runFfmpegWithProgress called with job:', job);

  if (!isElectron()) {
    console.error('❌ Not in Electron environment!');
    throw new Error('FFmpeg operations require Electron main process');
  }
  console.log('✅ Electron environment confirmed');

  return new Promise((resolve, reject) => {
    console.log('📡 Setting up IPC communication...');
    // Set up progress listener
    const handleProgress = (
      event: any,
      data: { type: string; data: string },
    ) => {
      if (data.type === 'stdout') {
        callbacks?.onLog?.(data.data, 'stdout');

        // Parse progress information
        const progress = parseFfmpegProgress(data.data);
        if (Object.keys(progress).length > 0) {
          callbacks?.onProgress?.(progress as FfmpegProgress);
        }

        // Check for status updates
        if (data.data.includes('progress=')) {
          const status = data.data.match(/progress=(\w+)/)?.[1];
          if (status) {
            callbacks?.onStatus?.(
              status === 'end'
                ? 'Processing complete'
                : `Processing: ${status}`,
            );
          }
        }
      } else if (data.type === 'stderr') {
        callbacks?.onLog?.(data.data, 'stderr');
      }
    };

    // Register progress listener
    console.log('👂 Registering progress listener...');
    window.electronAPI.on('ffmpeg:progress', handleProgress);

    // Start FFmpeg process
    console.log('🚀 Invoking ffmpegRun in main process...');
    window.electronAPI
      .invoke('ffmpegRun', job)
      .then((result: any) => {
        console.log('✅ FFmpeg process completed successfully:', result);
        // Clean up listener
        window.electronAPI.removeListener('ffmpeg:progress', handleProgress);
        resolve({ command: 'ffmpeg-via-ipc', logs: result.logs });
      })
      .catch((error: any) => {
        console.error('❌ FFmpeg process failed:', error);
        // Clean up listener
        window.electronAPI.removeListener('ffmpeg:progress', handleProgress);
        reject(error);
      });
  });
}

// Keep original function for backward compatibility
export async function runFfmpeg(
  job: VideoEditJob,
): Promise<{ command: string; logs: string }> {
  const result = await window.electronAPI.ffmpegRun(job);

  if (result.success) {
    return result.result!;
  } else {
    throw new Error(result.error || 'FFmpeg execution failed');
  }
}
