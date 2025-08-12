import { VideoEditJob } from './Schema/ffmpegConfig';
import { FfmpegEventHandlers } from './preload';

// Type definitions for the exposed API
declare global {
    interface Window {
      electronAPI: {
        runFfmpeg: (job: VideoEditJob) => Promise<{
          success: boolean;
          result?: { command: string; logs: string };
          error?: string;
        }>;
        runFfmpegWithProgress: (
          job: VideoEditJob, 
          handlers?: FfmpegEventHandlers
        ) => Promise<{
          success: boolean;
          result?: { command: string; logs: string };
          error?: string;
        }>;
        cancelFfmpeg: () => Promise<{
          success: boolean;
          message?: string;
        }>;
      };
    }
  }

export { };
  