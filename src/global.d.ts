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
        
        // File dialog methods
        openFileDialog: (options?: {
          title?: string;
          filters?: Array<{ name: string; extensions: string[] }>;
          properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
        }) => Promise<{
          success: boolean;
          files?: Array<{
            path: string;
            name: string;
            size: number;
            type: 'video' | 'audio' | 'image';
            extension: string;
          }>;
          canceled?: boolean;
          error?: string;
        }>;
        
        // File preview methods
        createPreviewUrl: (filePath: string) => Promise<{
          success: boolean;
          url?: string;
          error?: string;
        }>;
        getFileStream: (filePath: string, start?: number, end?: number) => Promise<{
          success: boolean;
          data?: string;
          start?: number;
          end?: number;
          total?: number;
          error?: string;
        }>;
        
        ffmpegRun: (job: VideoEditJob) => Promise<{
          success: boolean;
          result?: { command: string; logs: string };
          error?: string;
        }>;
        runFfmpeg: (job: VideoEditJob) => Promise<{
          success: boolean;
          result?: { command: string; logs: string };
          error?: string;
        }>;
        getDuration: (filePath: string) => Promise<number>;
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
      appControl: {
        showWindow: () => Promise<boolean>;
        hideWindow: () => Promise<boolean>;
        quitApp: () => Promise<void>;
        closeApp: () => void;
        minimizeApp: () => void;
        maximizeApp: () => void;
        openExternalLink: (link: string) => Promise<void>;

      };
    }
  }

export { };
  