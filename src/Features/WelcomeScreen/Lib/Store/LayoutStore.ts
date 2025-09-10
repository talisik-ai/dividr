import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'grid' | 'list';

interface LayoutStore {
  // Current view mode
  viewMode: ViewMode;

  // Actions
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;

  // Reset to defaults
  reset: () => void;
}

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set, get) => ({
      // Initial state
      viewMode: 'grid',

      // Actions
      setViewMode: (mode: ViewMode) => {
        set({ viewMode: mode });
      },

      toggleViewMode: () => {
        const currentMode = get().viewMode;
        set({ viewMode: currentMode === 'grid' ? 'list' : 'grid' });
      },

      reset: () => {
        set({ viewMode: 'grid' });
      },
    }),
    {
      name: 'dividr-layout-store', // Storage key
      version: 1, // Version for migration purposes
      // Only persist the viewMode, not the actions
      partialize: (state) => ({ viewMode: state.viewMode }),
    },
  ),
);
