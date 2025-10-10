export const TRACK_COLORS = [
  '#8e44ad',
  '#3498db',
  '#e74c3c',
  '#f39c12',
  '#27ae60',
  '#e67e22',
  '#9b59b6',
  '#34495e',
] as const;

export const SNAP_THRESHOLD = 5; // frames

export const SUBTITLE_EXTENSIONS = [
  '.srt',
  '.vtt',
  '.ass',
  '.ssa',
  '.sub',
  '.sbv',
  '.lrc',
] as const;

export const MEDIA_FILE_FILTERS = [
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
      'srt',
      'vtt',
      'ass',
      'ssa',
      'sub',
      'sbv',
      'lrc',
    ],
  },
  { name: 'All Files', extensions: ['*'] },
] as const;

export const DEFAULT_TIMELINE_CONFIG = {
  totalFrames: 3000,
  fps: 30,
  zoom: 1,
  scrollX: 0,
} as const;

export const DEFAULT_PREVIEW_CONFIG = {
  canvasWidth: 800,
  canvasHeight: 540,
  previewScale: 1,
  panX: 0,
  panY: 0,
  backgroundColor: '#000000',
} as const;

export const DEFAULT_PLAYBACK_CONFIG = {
  playbackRate: 1,
  volume: 1,
  muted: false,
} as const;
