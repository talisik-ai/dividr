export interface VideoEditJob {
    inputs: string[];
    output: string;
    operations: {
      concat?: boolean;
      trim?: { start?: string; duration?: string; end?: string };
      crop?: { width: number; height: number; x: number; y: number };
      subtitles?: string;
      aspect?: string;
      replaceAudio?: string;
      normalizeFrameRate?: boolean;
      targetFrameRate?: number;
    };
  }