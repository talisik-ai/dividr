export interface PreviewState {
  canvasWidth: number;
  canvasHeight: number;
  previewScale: number;
  panX: number;
  panY: number;
  interactionMode: 'select' | 'pan';
  showGrid: boolean;
  showSafeZones: boolean;
  backgroundColor: string;
}
