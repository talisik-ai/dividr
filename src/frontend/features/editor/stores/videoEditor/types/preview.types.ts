export interface PreviewState {
  canvasWidth: number;
  canvasHeight: number;
  previewScale: number;
  panX: number;
  panY: number;
  interactionMode: 'select' | 'pan' | 'text-edit';
  showGrid: boolean;
  showSafeZones: boolean;
  backgroundColor: string;
  isFullscreen: boolean;
}
