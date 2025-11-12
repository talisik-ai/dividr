export interface PreviewState {
  canvasWidth: number;
  canvasHeight: number;
  originalCanvasWidth?: number; // Store original dimensions for reset functionality
  originalCanvasHeight?: number; // Store original dimensions for reset functionality
  previewScale: number;
  panX: number;
  panY: number;
  interactionMode: 'select' | 'pan' | 'text-edit';
  showGrid: boolean;
  showSafeZones: boolean;
  backgroundColor: string;
  isFullscreen: boolean;
}
