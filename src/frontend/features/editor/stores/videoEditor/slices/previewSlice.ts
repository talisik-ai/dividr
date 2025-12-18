/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { PreviewState } from '../types';
import { DEFAULT_PREVIEW_CONFIG } from '../utils/constants';

export interface PreviewSlice {
  preview: PreviewState;
  setCanvasSize: (
    width: number,
    height: number,
    storeAsOriginal?: boolean,
  ) => void;
  resetCanvasSize: () => void;
  setPreviewScale: (scale: number) => void;
  setPreviewPan: (panX: number, panY: number) => void;
  resetPreviewPan: () => void;
  setPreviewInteractionMode: (mode: 'select' | 'pan' | 'text-edit') => void;
  toggleGrid: () => void;
  toggleSafeZones: () => void;
  setBackgroundColor: (color: string) => void;
  toggleFullscreen: () => void;
  setFullscreen: (isFullscreen: boolean) => void;

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
    isFullscreen: false,
  },

  setCanvasSize: (width, height, storeAsOriginal = false) => {
    set((state: any) => {
      const updates: Partial<PreviewState> = {
        canvasWidth: width,
        canvasHeight: height,
      };

      // Store original dimensions if requested (typically on first video import)
      // or if original dimensions haven't been set yet
      if (
        storeAsOriginal ||
        (!state.preview.originalCanvasWidth &&
          !state.preview.originalCanvasHeight)
      ) {
        updates.originalCanvasWidth = width;
        updates.originalCanvasHeight = height;
      }

      return {
        preview: { ...state.preview, ...updates },
      };
    });
    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  resetCanvasSize: () => {
    const state = get() as any;
    const { originalCanvasWidth, originalCanvasHeight } = state.preview;

    // Only reset if we have original dimensions stored
    if (originalCanvasWidth && originalCanvasHeight) {
      set((state: any) => ({
        preview: {
          ...state.preview,
          canvasWidth: originalCanvasWidth,
          canvasHeight: originalCanvasHeight,
        },
      }));
      state.markUnsavedChanges?.();
    }
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

  toggleFullscreen: () =>
    set((state: any) => ({
      preview: { ...state.preview, isFullscreen: !state.preview.isFullscreen },
    })),

  setFullscreen: (isFullscreen) =>
    set((state: any) => ({
      preview: { ...state.preview, isFullscreen },
    })),
});
