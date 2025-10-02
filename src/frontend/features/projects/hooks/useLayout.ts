import { useLayoutStore } from '../store/layoutStore';

/**
 * Custom hook for layout state management
 * Provides convenient access to layout store functionality
 */
export const useLayout = () => {
  const { viewMode, setViewMode, toggleViewMode, reset } = useLayoutStore();

  return {
    // Current state
    viewMode,
    isGridView: viewMode === 'grid',
    isListView: viewMode === 'list',

    // Actions
    setViewMode,
    toggleViewMode,
    reset,

    // Convenience methods
    switchToGrid: () => setViewMode('grid'),
    switchToList: () => setViewMode('list'),
  };
};
