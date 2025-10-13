/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { PreviewState } from '../types';
import { DEFAULT_PREVIEW_CONFIG } from '../utils/constants';

export interface PreviewSlice {
  preview: PreviewState;
  setCanvasSize: (width: number, height: number) => void;
  setPreviewScale: (scale: number) => void;
  setPreviewPan: (panX: number, panY: number) => void;
  resetPreviewPan: () => void;
  setPreviewInteractionMode: (mode: 'select' | 'pan') => void;
  toggleGrid: () => void;
  toggleSafeZones: () => void;
  setBackgroundColor: (color: string) => void;

  // State management helpers
  markUnsavedChanges?: () => void;
}

export const createPreviewSlice: StateCreator<
  PreviewSlice,
  [],
  [],
  PreviewSlice
> = (set, get) => ({
  preview: {
    ...DEFAULT_PREVIEW_CONFIG,
    showGrid: false,
    showSafeZones: false,
  },

  setCanvasSize: (width, height) => {
    set((state: any) => ({
      preview: { ...state.preview, canvasWidth: width, canvasHeight: height },
    }));
    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  setPreviewScale: (scale) =>
    set((state: any) => ({
      preview: {
        ...state.preview,
        previewScale: Math.max(0.1, Math.min(scale, 8)),
      },
    })),

  setPreviewPan: (panX, panY) =>
    set((state: any) => ({
      preview: {
        ...state.preview,
        panX,
        panY,
      },
    })),

  resetPreviewPan: () =>
    set((state: any) => ({
      preview: {
        ...state.preview,
        panX: 0,
        panY: 0,
      },
    })),

  setPreviewInteractionMode: (mode) =>
    set((state: any) => ({
      preview: {
        ...state.preview,
        interactionMode: mode,
      },
    })),

  toggleGrid: () =>
    set((state: any) => ({
      preview: { ...state.preview, showGrid: !state.preview.showGrid },
    })),

  toggleSafeZones: () =>
    set((state: any) => ({
      preview: {
        ...state.preview,
        showSafeZones: !state.preview.showSafeZones,
      },
    })),

  setBackgroundColor: (color) =>
    set((state: any) => ({
      preview: { ...state.preview, backgroundColor: color },
    })),
});
