export interface RenderState {
  isRendering: boolean;
  progress: number;
  status: string;
  currentTime?: string; // Current render time in HH:MM:SS.FF format from FFmpeg outTime
  currentJob?: {
    outputPath: string;
    format: string;
    quality: string;
  };
}
