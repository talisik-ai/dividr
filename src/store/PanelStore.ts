import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// Define the different panel types that can be shown
export type PanelType =
  | 'media-import' // Import/download panel
  | 'text-tools' // Text editing tools
  | 'video-effects' // Video effects and filters
  | 'images' // Image tools and adjustments
  | 'audio-tools' // Audio editing tools
  | 'settings' // Project settings
  | null; // No panel shown

// Content structure for each panel type
export interface PanelContent {
  title: string;
  description?: string;
  sections: PanelSection[];
}

export interface PanelSection {
  id: string;
  title: string;
  type: 'controls' | 'info' | 'settings' | 'tools';
  items: PanelItem[];
}

export interface PanelItem {
  id: string;
  type: 'button' | 'slider' | 'input' | 'toggle' | 'select' | 'color' | 'info';
  label: string;
  value?: string | number | boolean;
  options?: (string | number)[];
  min?: number;
  max?: number;
  step?: number;
  action?: () => void;
}

// UI State interface
interface PanelState {
  // Panel Management
  activePanelType: PanelType;
  isPanelVisible: boolean;
  panelContent: PanelContent | null;

  // Panel History (for back/forward navigation)
  panelHistory: PanelType[];
  currentHistoryIndex: number;

  // Panel Actions
  showPanel: (panelType: PanelType) => void;
  hidePanel: () => void;
  togglePanel: (panelType: PanelType) => void;
  setPanelContent: (content: PanelContent) => void;
  updatePanelItem: (
    sectionId: string,
    itemId: string,
    value: string | number | boolean,
  ) => void;

  // Navigation
  goBackInHistory: () => void;
  goForwardInHistory: () => void;
  clearPanelHistory: () => void;

  // Utility
  reset: () => void;
}

// Default panel content configurations
const defaultPanelConfigs: Record<Exclude<PanelType, null>, PanelContent> = {
  'media-import': {
    title: 'Media Import',
    description: 'Import and manage media files',
    sections: [
      {
        id: 'import-options',
        title: 'Import Options',
        type: 'tools',
        items: [
          {
            id: 'import-files',
            type: 'button',
            label: 'Import Media Files',
            action: () => {
              /* Will be overridden by components */
            },
          },
          {
            id: 'import-folder',
            type: 'button',
            label: 'Import Folder',
          },
          {
            id: 'url-import',
            type: 'input',
            label: 'Import from URL',
            value: '',
          },
        ],
      },
      {
        id: 'recent-files',
        title: 'Recent Files',
        type: 'info',
        items: [
          {
            id: 'recent-info',
            type: 'info',
            label: 'No recent files',
          },
        ],
      },
    ],
  },

  'text-tools': {
    title: 'Text Tools',
    description: 'Add and edit text elements',
    sections: [
      {
        id: 'text-creation',
        title: 'Create Text',
        type: 'tools',
        items: [
          {
            id: 'add-title',
            type: 'button',
            label: 'Add Title',
          },
          {
            id: 'add-subtitle',
            type: 'button',
            label: 'Add Subtitle',
          },
          {
            id: 'add-text-block',
            type: 'button',
            label: 'Add Text Block',
          },
        ],
      },
      {
        id: 'text-formatting',
        title: 'Formatting',
        type: 'controls',
        items: [
          {
            id: 'font-size',
            type: 'slider',
            label: 'Font Size',
            value: 24,
            min: 8,
            max: 200,
            step: 1,
          },
          {
            id: 'text-color',
            type: 'color',
            label: 'Text Color',
            value: '#ffffff',
          },
          {
            id: 'font-family',
            type: 'select',
            label: 'Font Family',
            value: 'Arial',
            options: ['Arial', 'Helvetica', 'Times New Roman', 'Courier'],
          },
        ],
      },
    ],
  },

  'video-effects': {
    title: 'Video Effects',
    description: 'Apply effects and filters to video',
    sections: [
      {
        id: 'basic-effects',
        title: 'Basic Effects',
        type: 'controls',
        items: [
          {
            id: 'brightness',
            type: 'slider',
            label: 'Brightness',
            value: 0,
            min: -100,
            max: 100,
            step: 1,
          },
          {
            id: 'contrast',
            type: 'slider',
            label: 'Contrast',
            value: 0,
            min: -100,
            max: 100,
            step: 1,
          },
          {
            id: 'saturation',
            type: 'slider',
            label: 'Saturation',
            value: 0,
            min: -100,
            max: 100,
            step: 1,
          },
        ],
      },
      {
        id: 'filters',
        title: 'Filters',
        type: 'tools',
        items: [
          {
            id: 'blur',
            type: 'toggle',
            label: 'Blur Effect',
            value: false,
          },
          {
            id: 'sepia',
            type: 'toggle',
            label: 'Sepia Filter',
            value: false,
          },
          {
            id: 'grayscale',
            type: 'toggle',
            label: 'Grayscale',
            value: false,
          },
        ],
      },
    ],
  },

  images: {
    title: 'Image Tools',
    description: 'Edit and adjust images',
    sections: [
      {
        id: 'image-adjustments',
        title: 'Adjustments',
        type: 'controls',
        items: [
          {
            id: 'opacity',
            type: 'slider',
            label: 'Opacity',
            value: 100,
            min: 0,
            max: 100,
            step: 1,
          },
          {
            id: 'rotation',
            type: 'slider',
            label: 'Rotation',
            value: 0,
            min: -180,
            max: 180,
            step: 1,
          },
          {
            id: 'scale',
            type: 'slider',
            label: 'Scale',
            value: 100,
            min: 10,
            max: 500,
            step: 1,
          },
        ],
      },
      {
        id: 'image-effects',
        title: 'Effects',
        type: 'tools',
        items: [
          {
            id: 'drop-shadow',
            type: 'toggle',
            label: 'Drop Shadow',
            value: false,
          },
          {
            id: 'border',
            type: 'toggle',
            label: 'Border',
            value: false,
          },
        ],
      },
    ],
  },

  'audio-tools': {
    title: 'Audio Tools',
    description: 'Edit and enhance audio',
    sections: [
      {
        id: 'audio-controls',
        title: 'Audio Controls',
        type: 'controls',
        items: [
          {
            id: 'volume',
            type: 'slider',
            label: 'Volume',
            value: 100,
            min: 0,
            max: 200,
            step: 1,
          },
          {
            id: 'fade-in',
            type: 'slider',
            label: 'Fade In (s)',
            value: 0,
            min: 0,
            max: 10,
            step: 0.1,
          },
          {
            id: 'fade-out',
            type: 'slider',
            label: 'Fade Out (s)',
            value: 0,
            min: 0,
            max: 10,
            step: 0.1,
          },
        ],
      },
      {
        id: 'audio-effects',
        title: 'Audio Effects',
        type: 'tools',
        items: [
          {
            id: 'normalize',
            type: 'button',
            label: 'Normalize Audio',
          },
          {
            id: 'noise-reduction',
            type: 'toggle',
            label: 'Noise Reduction',
            value: false,
          },
        ],
      },
    ],
  },

  settings: {
    title: 'Project Settings',
    description: 'Configure project and export settings',
    sections: [
      {
        id: 'project-settings',
        title: 'Project Settings',
        type: 'settings',
        items: [
          {
            id: 'project-name',
            type: 'input',
            label: 'Project Name',
            value: 'Untitled Project',
          },
          {
            id: 'auto-save',
            type: 'toggle',
            label: 'Auto Save',
            value: true,
          },
        ],
      },
      {
        id: 'export-settings',
        title: 'Export Settings',
        type: 'settings',
        items: [
          {
            id: 'export-format',
            type: 'select',
            label: 'Export Format',
            value: 'mp4',
            options: ['mp4', 'mov', 'avi', 'mkv'],
          },
          {
            id: 'export-quality',
            type: 'select',
            label: 'Quality',
            value: 'high',
            options: ['low', 'medium', 'high', 'ultra'],
          },
        ],
      },
    ],
  },
};

export const usePanelStore = create<PanelState>()(
  subscribeWithSelector((set, get) => ({
    // Initial State
    activePanelType: null as PanelType,
    isPanelVisible: false,
    panelContent: null as PanelContent | null,
    panelHistory: [] as PanelType[],
    currentHistoryIndex: -1,

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
        panelContent: panelType ? defaultPanelConfigs[panelType] : null,
        panelHistory: newHistory,
        currentHistoryIndex: newIndex,
      });
    },

    hidePanel: () => {
      set({
        activePanelType: null,
        isPanelVisible: false,
        panelContent: null,
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

    setPanelContent: (content) => {
      set({ panelContent: content });
    },

    updatePanelItem: (sectionId, itemId, value) => {
      const current = get();
      if (!current.panelContent) return;

      const updatedContent = {
        ...current.panelContent,
        sections: current.panelContent.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                items: section.items.map((item) =>
                  item.id === itemId ? { ...item, value } : item,
                ),
              }
            : section,
        ),
      };

      set({ panelContent: updatedContent });
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
          panelContent: panelType ? defaultPanelConfigs[panelType] : null,
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
          panelContent: panelType ? defaultPanelConfigs[panelType] : null,
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
        activePanelType: null,
        isPanelVisible: false,
        panelContent: null,
        panelHistory: [],
        currentHistoryIndex: -1,
      });
    },
  })),
);

// Selector hooks for common use cases
export const useActivePanelType = () =>
  usePanelStore((state) => state.activePanelType);
export const useIsPanelVisible = () =>
  usePanelStore((state) => state.isPanelVisible);
export const usePanelContent = () =>
  usePanelStore((state) => state.panelContent);
export const usePanelActions = () =>
  usePanelStore((state) => ({
    showPanel: state.showPanel,
    hidePanel: state.hidePanel,
    togglePanel: state.togglePanel,
    updatePanelItem: state.updatePanelItem,
  }));
