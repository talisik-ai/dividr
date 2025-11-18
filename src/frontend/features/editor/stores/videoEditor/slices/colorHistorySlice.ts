import { StateCreator } from 'zustand';

export interface ColorHistoryState {
  recentColors: string[];
}

export interface ColorHistorySlice {
  colorHistory: ColorHistoryState;
  addRecentColor: (color: string) => void;
  clearRecentColors: () => void;
}

export const createColorHistorySlice: StateCreator<
  ColorHistorySlice,
  [],
  [],
  ColorHistorySlice
> = (set, get) => ({
  colorHistory: {
    recentColors: [],
  },

  addRecentColor: (color: string) => {
    const currentColors = get().colorHistory.recentColors;

    // Don't add if it's already the most recent
    if (currentColors[0] === color) return;

    // Remove color if it exists elsewhere in the list
    const filteredColors = currentColors.filter((c) => c !== color);

    // Add to beginning and keep only last 16 colors
    const newColors = [color, ...filteredColors].slice(0, 16);

    set({
      colorHistory: {
        recentColors: newColors,
      },
    });
  },

  clearRecentColors: () => {
    set({
      colorHistory: {
        recentColors: [],
      },
    });
  },
});
