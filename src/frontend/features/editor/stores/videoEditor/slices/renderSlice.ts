/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { RenderState } from '../types/render.types';

export interface RenderSlice {
  render: RenderState;
  startRender: (job: {
    outputPath: string;
    format: string;
    quality: string;
  }) => void;
  updateRenderProgress: (
    progress: number,
    status: string,
    currentTime?: string,
  ) => void;
  finishRender: () => void;
  cancelRender: () => void;
}

export const createRenderSlice: StateCreator<
  RenderSlice,
  [],
  [],
  RenderSlice
> = (set) => ({
  render: {
    isRendering: false,
    progress: 0,
    status: 'ready',
    currentTime: undefined,
    currentJob: undefined,
  },

  startRender: (job) =>
    set((state: any) => ({
      render: {
        ...state.render,
        isRendering: true,
        progress: 0,
        status: 'Starting render...',
        currentJob: job,
      },
    })),

  updateRenderProgress: (progress, status, currentTime) =>
    set((state: any) => ({
      render: { ...state.render, progress, status, currentTime },
    })),

  finishRender: () =>
    set((state: any) => ({
      render: {
        ...state.render,
        isRendering: false,
        progress: 100,
        status: 'Render complete',
        currentTime: undefined,
        currentJob: undefined,
      },
    })),

  cancelRender: () =>
    set((state: any) => ({
      render: {
        ...state.render,
        isRendering: false,
        progress: 0,
        status: 'Render cancelled',
        currentTime: undefined,
        currentJob: undefined,
      },
    })),
});
