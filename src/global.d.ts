import { VideoEditJob } from './Schema/ffmpegConfig';
import { FfmpegEventHandlers } from './preload';

// Type definitions for the exposed API
declare global {
    interface Window {
      electronAPI: {
        // General IPC methods
        invoke: (channel: string, ...args: any[]) => Promise<any>;
        on: (channel: string, listener: (...args: any[]) => void) => void;
        removeListener: (channel: string, listener: (...args: any[]) => void) => void;
        
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
  