export interface MediaLibraryItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'subtitle';
  source: string;
  previewUrl?: string;
  originalFile?: File;
  tempFilePath?: string;
  duration: number;
  size: number;
  mimeType: string;
  thumbnail?: string;
  metadata?: {
    width?: number;
    height?: number;
    fps?: number;
    channels?: number;
    sampleRate?: number;
  };
  extractedAudio?: {
    audioPath: string;
    previewUrl?: string;
    size: number;
    extractedAt: number;
  };
  waveform?: {
    success: boolean;
    peaks: number[];
    duration: number;
    sampleRate: number;
    cacheKey: string;
    generatedAt?: number;
  };
  spriteSheets?: {
    success: boolean;
    spriteSheets: Array<{
      id: string;
      url: string;
      width: number;
      height: number;
      thumbnailsPerRow: number;
      thumbnailsPerColumn: number;
      thumbnailWidth: number;
      thumbnailHeight: number;
      thumbnails: Array<{
        id: string;
        timestamp: number;
        frameNumber: number;
        sheetIndex: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    }>;
    cacheKey: string;
    generatedAt?: number;
  };
}
