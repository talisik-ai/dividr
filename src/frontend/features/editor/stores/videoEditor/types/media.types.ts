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
  /** Content signature for duplicate detection (partial hash) */
  contentSignature?: {
    partialHash: string;
    fileSize: number;
    fileName: string;
    generatedAt: number;
  };
  metadata?: {
    width?: number;
    height?: number;
    fps?: number;
    channels?: number;
    sampleRate?: number;
    aspectRatio?: number; // Calculated aspect ratio (width/height)
    aspectRatioLabel?: string | null; // Detected preset label (e.g., "16:9", "9:16")
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
  hasGeneratedKaraoke?: boolean;
  cachedKaraokeSubtitles?: {
    transcriptionResult: {
      segments: Array<{
        start: number;
        end: number;
        text: string;
        words?: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
        }>;
      }>;
      language: string;
      language_probability: number;
      duration: number;
      text: string;
      processing_time: number;
      model: string;
      device: string;
      segment_count: number;
      real_time_factor?: number;
      faster_than_realtime?: boolean;
    };
    generatedAt: number;
  };
  /**
   * Transcoding state for browser-incompatible formats (AVI, etc.)
   * When a file requires transcoding, this tracks the conversion progress
   */
  transcoding?: {
    /** Whether the file requires transcoding for browser playback */
    required: boolean;
    /** Current transcoding status */
    status: 'pending' | 'processing' | 'completed' | 'failed';
    /** Transcode job ID */
    jobId?: string;
    /** Progress percentage (0-100) */
    progress: number;
    /** Path to the transcoded file (available when completed) */
    transcodedPath?: string;
    /** Preview URL for the transcoded file */
    transcodedPreviewUrl?: string;
    /** Error message if transcoding failed */
    error?: string;
    /** Timestamp when transcoding started */
    startedAt?: number;
    /** Timestamp when transcoding completed */
    completedAt?: number;
  };
}
