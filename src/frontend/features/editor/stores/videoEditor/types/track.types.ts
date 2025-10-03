export interface VideoTrack {
  id: string;
  type: 'video' | 'audio' | 'image' | 'subtitle';
  name: string;
  source: string;
  previewUrl?: string;
  originalFile?: File;
  tempFilePath?: string;
  duration: number;
  startFrame: number;
  endFrame: number;
  sourceStartTime?: number;
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
