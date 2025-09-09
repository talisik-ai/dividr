import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Project metadata schema
export interface ProjectMetadata {
  title: string;
  description: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

interface ProjectStore {
  metadata: ProjectMetadata;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  updateTimestamps: () => void;
  reset: () => void;
}

const getDefaultMetadata = (): ProjectMetadata => {
  const now = new Date().toISOString();
  return {
    title: '',
    description: '',
    createdAt: now,
    updatedAt: now,
  };
};

export const useProjectStore = create<ProjectStore>()(
  subscribeWithSelector((set, get) => ({
    metadata: getDefaultMetadata(),
    setTitle: (title) =>
      set((state) => ({
        metadata: {
          ...state.metadata,
          title,
          updatedAt: new Date().toISOString(),
        },
      })),
    setDescription: (description) =>
      set((state) => ({
        metadata: {
          ...state.metadata,
          description,
          updatedAt: new Date().toISOString(),
        },
      })),
    updateTimestamps: () =>
      set((state) => ({
        metadata: {
          ...state.metadata,
          updatedAt: new Date().toISOString(),
        },
      })),
    reset: () => set({ metadata: getDefaultMetadata() }),
  })),
);
