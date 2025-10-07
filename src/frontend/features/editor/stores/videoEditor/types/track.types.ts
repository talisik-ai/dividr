export interface VideoTrack {
  id: string;
  type: 'video' | 'audio' | 'image' | 'subtitle';
  name: string;
  source: string;
  previewUrl?: string;
  originalFile?: File;
  tempFilePath?: string;
  duration: number; // Current visible duration in frames (timeline length)
  sourceDuration?: number; // Original source media duration in frames (for trimming boundaries)
  startFrame: number;
  endFrame: number;
  sourceStartTime?: number; // in seconds - where in the source file this track segment starts (trim in-point)
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
  volume?: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  color: string;
  subtitleText?: string;
  linkedTrackId?: string;
  isLinked?: boolean;
}
