import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
// Define the different panel types that can be shown
export type PanelType =
  | 'media-import' // Import/download panel (custom component)
  | 'text-tools' // Text editing tools (custom component)
  | 'video-effects' // Video effects and filters (custom component)
  | 'images' // Image tools and adjustments (custom component)
  | 'audio-tools' // Audio editing tools (custom component)
  | 'settings' // Project settings (custom component)
  | 'captions' // Captions (custom component)
  | null; // No panel shown

// Metadata for panels
export interface PanelMetadata {
  title: string;
  description?: string;
  icon?: string;
  hasCustomComponent: boolean;
  width?: string; // Default width for the panel
}

// Simplified interfaces - config-based panels removed in favor of custom components

// Simplified UI State interface
interface PanelState {
  // Panel Management
  activePanelType: PanelType;
  isPanelVisible: boolean;

  // Panel History (for back/forward navigation)
  panelHistory: PanelType[];
  currentHistoryIndex: number;

  // Panel Actions
  showPanel: (panelType: PanelType) => void;
  hidePanel: () => void;
  togglePanel: (panelType: PanelType) => void;

  // Metadata
  getPanelMetadata: (panelType: PanelType) => PanelMetadata | null;

  // Navigation
  goBackInHistory: () => void;
  goForwardInHistory: () => void;
  clearPanelHistory: () => void;

  // Utility
  reset: () => void;
}

// Panel metadata configurations - all panels use consistent 320px width
const panelMetadata: Record<Exclude<PanelType, null>, PanelMetadata> = {
  'media-import': {
    title: 'Media Import',
    description: 'Import and manage media files',
    icon: '📁',
    hasCustomComponent: true,
    width: 'w-80', // 320px
  },
  'text-tools': {
    title: 'Text Tools',
    description: 'Add and edit text elements',
    icon: '📝',
    hasCustomComponent: true,
    width: 'w-80',
  },
  'video-effects': {
    title: 'Video Effects',
    description: 'Apply effects and filters',
    icon: '🎨',
    hasCustomComponent: true,
    width: 'w-80',
  },
  images: {
    title: 'Image Tools',
    description: 'Edit and adjust images',
    icon: '🖼️',
    hasCustomComponent: true,
    width: 'w-80',
  },
  'audio-tools': {
    title: 'Audio Tools',
    description: 'Edit and enhance audio',
    icon: '🎵',
    hasCustomComponent: true,
    width: 'w-80',
  },
  settings: {
    title: 'Project Settings',
    description: 'Configure project and export',
    icon: '⚙️',
    hasCustomComponent: true,
    width: 'w-80',
  },
  captions: {
    title: 'Captions',
    description: 'Add and edit captions',
    icon: '🎤',
    hasCustomComponent: true,
    width: 'w-80',
  },
};

// All panels now use custom components - config-based panel system removed

export const usePanelStore = create<PanelState>()(
  subscribeWithSelector((set, get) => ({
    // Initial State - start with media-import panel open by default
    activePanelType: 'media-import' as PanelType,
    isPanelVisible: true,
    panelHistory: ['media-import'] as PanelType[],
    currentHistoryIndex: 0,

    // Panel Actions
    showPanel: (panelType) => {
      const current = get();

      // Don't show if already showing the same panel
      if (current.activePanelType === panelType && current.isPanelVisible) {
        return;
      }

      // Add to history if not the same as current
      let newHistory = [...current.panelHistory];
      let newIndex = current.currentHistoryIndex;

      if (panelType !== current.activePanelType) {
        // Remove any items after current index (when going back and then to a new panel)
        newHistory = newHistory.slice(0, current.currentHistoryIndex + 1);
        newHistory.push(panelType);
        newIndex = newHistory.length - 1;
      }

      set({
        activePanelType: panelType,
        isPanelVisible: true,
        panelHistory: newHistory,
        currentHistoryIndex: newIndex,
      });
    },

    hidePanel: () => {
      set({
        activePanelType: null,
        isPanelVisible: false,
      });
    },

    togglePanel: (panelType) => {
      const current = get();

      if (current.activePanelType === panelType && current.isPanelVisible) {
        current.hidePanel();
      } else {
        current.showPanel(panelType);
      }
    },

    getPanelMetadata: (panelType) => {
      if (panelType === null) return null;
      return panelMetadata[panelType];
    },

    // Navigation
    goBackInHistory: () => {
      const current = get();
      if (current.currentHistoryIndex > 0) {
        const newIndex = current.currentHistoryIndex - 1;
        const panelType = current.panelHistory[newIndex];

        set({
          activePanelType: panelType,
          isPanelVisible: true,
          currentHistoryIndex: newIndex,
        });
      }
    },

    goForwardInHistory: () => {
      const current = get();
      if (current.currentHistoryIndex < current.panelHistory.length - 1) {
        const newIndex = current.currentHistoryIndex + 1;
        const panelType = current.panelHistory[newIndex];

        set({
          activePanelType: panelType,
          isPanelVisible: true,
          currentHistoryIndex: newIndex,
        });
      }
    },

    clearPanelHistory: () => {
      set({
        panelHistory: [],
        currentHistoryIndex: -1,
      });
    },

    // Utility
    reset: () => {
      set({
        activePanelType: 'media-import',
        isPanelVisible: true,
        panelHistory: ['media-import'],
        currentHistoryIndex: 0,
      });
    },
  })),
);

// Simplified selector hooks
export const useActivePanelType = () =>
  usePanelStore((state) => state.activePanelType);
export const useIsPanelVisible = () =>
  usePanelStore((state) => state.isPanelVisible);
export const usePanelMetadata = () =>
  usePanelStore((state) => state.getPanelMetadata);
export const usePanelActions = () =>
  usePanelStore((state) => ({
    showPanel: state.showPanel,
    hidePanel: state.hidePanel,
    togglePanel: state.togglePanel,
    getPanelMetadata: state.getPanelMetadata,
  }));
