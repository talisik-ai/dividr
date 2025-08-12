import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import { VideoEditJob } from '../Schema/ffmpegConfig';
import { buildFfmpegCommand } from "./commandBuilder";

// Global process tracking for cancellation
let currentFfmpegProcess: any = null;

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

// Optional helper for ffprobe path
export function getFfprobePath() {
  return ffprobePath.path;
}

// Detect video frame rate using ffprobe
export async function detectVideoFrameRate(videoPath: string): Promise<number> {
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
            // Parse frame rate (e.g., "30/1" or "30000/1001")
            const [num, den] = videoStream.r_frame_rate.split('/').map(Number);
            const frameRate = Math.round((num / den) * 100) / 100;
            resolve(frameRate);
          } else {
            resolve(30); // Default fallback
          }
        } catch (err) {
          console.error('Failed to parse ffprobe output:', err);
          resolve(30); // Default fallback
        }
      } else {
        reject(new Error(`ffprobe failed with code ${code}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`ffprobe error: ${err.message}`));
    });
  });
}

// Detect frame rates for multiple videos and suggest target
export async function suggestConcatFrameRate(videoPaths: string[]): Promise<number> {
  try {
    const frameRates = await Promise.all(
      videoPaths.map(path => detectVideoFrameRate(path))
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

// Cancel current FFmpeg process
export function cancelCurrentFfmpeg(): boolean {
  if (currentFfmpegProcess) {
    try {
      currentFfmpegProcess.kill('SIGTERM'); // Graceful termination
      setTimeout(() => {
        if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
          currentFfmpegProcess.kill('SIGKILL'); // Force kill if needed
        }
      }, 5000); // 5 second grace period
      
      console.log('🛑 FFmpeg process cancelled');
      return true;
    } catch (err) {
      console.error('❌ Failed to cancel FFmpeg process:', err);
      return false;
    }
  }
  console.warn('⚠️ No active FFmpeg process to cancel');
  return false;
}

// Check if FFmpeg is currently running
export function isFfmpegRunning(): boolean {
  return currentFfmpegProcess !== null && !currentFfmpegProcess.killed;
}

// Parse FFmpeg progress output
export function parseFfmpegProgress(progressLine: string): Partial<FfmpegProgress> {
  const progress: any = {};
  
  const patterns = {
    frame: /frame=\s*(\d+)/,
    fps: /fps=\s*([\d.]+)/,
    bitrate: /bitrate=\s*([\d.]+\w+)/,
    outTime: /time=(\d{2}:\d{2}:\d{2}\.\d{2})/,
    totalSize: /size=\s*(\d+\w+)/,
    speed: /speed=\s*([\d.]+x)/,
    progress: /progress=(\w+)/
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    const match = progressLine.match(pattern);
    if (match) {
      progress[key] = (key === 'frame' || key === 'fps') ? Number(match[1]) : match[1];
    }
  }

  return progress;
}

// Enhanced FFmpeg runner with progress callbacks
export async function runFfmpegWithProgress(
  job: VideoEditJob,
  callbacks?: FfmpegCallbacks
): Promise<{ command: string; logs: string }> {
  return new Promise((resolve, reject) => {
    // Check if another process is already running
    if (currentFfmpegProcess && !currentFfmpegProcess.killed) {
      reject(new Error('Another FFmpeg process is already running. Please cancel it first.'));
      return;
    }

    const location = "public/output/"

    // Add progress reporting to FFmpeg args
    const baseArgs = buildFfmpegCommand(job, location);
    const args = ['-progress', 'pipe:1', '-y', ...baseArgs];

    // Command string for manual debugging
    const commandString = `"${ffmpegPath}" ${args.join(" ")}`;
    console.log("Running FFmpeg with progress:", commandString);

    let logs = "";
    let progressBuffer = "";

    callbacks?.onStatus?.("Starting FFmpeg process...");

    const ffmpeg = spawn(ffmpegPath as string, args, {
      stdio: ["ignore", "pipe", "pipe"], // stdin, stdout, stderr
    });

    // Store process reference for cancellation
    currentFfmpegProcess = ffmpeg;

    ffmpeg.stdout.on("data", data => {
      const text = data.toString();
      logs += `[stdout] ${text}\n`;
      
      // Handle progress data
      progressBuffer += text;
      const lines = progressBuffer.split('\n');
      progressBuffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim()) {
          callbacks?.onLog?.(line, 'stdout');
          
          // Parse progress information
          const progress = parseFfmpegProgress(line);
          if (Object.keys(progress).length > 0) {
            callbacks?.onProgress?.(progress as FfmpegProgress);
          }
          
          // Check for status updates
          if (line.includes('progress=')) {
            const status = line.match(/progress=(\w+)/)?.[1];
            if (status) {
              callbacks?.onStatus?.(status === 'end' ? 'Processing complete' : `Processing: ${status}`);
            }
          }
        }
      }
    });

    ffmpeg.stderr.on("data", data => {
      const text = data.toString();
      logs += `[stderr] ${text}\n`;
      callbacks?.onLog?.(text, 'stderr');
      console.error(`[ffmpeg stderr]: ${text}`);
    });

    ffmpeg.on("error", err => {
      logs += `[error] ${err.message}\n`;
      callbacks?.onStatus?.(`Error: ${err.message}`);
      currentFfmpegProcess = null; // Clear reference
      reject(new Error(`FFmpeg process error: ${err.message}\nLogs:\n${logs}`));
    });

    ffmpeg.on("close", code => {
      currentFfmpegProcess = null; // Clear reference
      
      if (code === 0) {
        callbacks?.onStatus?.("FFmpeg process completed successfully");
        resolve({ command: commandString, logs });
      } else if (code === null || code === 130 || code === 143) {
        // Process was killed/cancelled (SIGTERM = 143, SIGINT = 130)
        callbacks?.onStatus?.("FFmpeg process was cancelled");
        reject(new Error(`FFmpeg process was cancelled\nCommand: ${commandString}\nLogs:\n${logs}`));
      } else {
        callbacks?.onStatus?.(`FFmpeg process failed with code ${code}`);
        reject(new Error(`FFmpeg exited with code ${code}\nCommand: ${commandString}\nLogs:\n${logs}`));
      }
    });
  });
}

// Keep original function for backward compatibility
export async function runFfmpeg(
  job: VideoEditJob
): Promise<{ command: string; logs: string }> {
  return runFfmpegWithProgress(job);
}
