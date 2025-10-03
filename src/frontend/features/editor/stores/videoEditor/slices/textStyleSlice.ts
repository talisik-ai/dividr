import { StateCreator } from 'zustand';
import { TextStyleSlice } from '../types';

export const createTextStyleSlice: StateCreator<
  TextStyleSlice,
  [],
  [],
  TextStyleSlice
> = (set, get) => ({
  textStyle: {
    activeStyle: 'regular',
    styles: {
      regular: {
        fontWeight: '400',
      },
      semibold: {
        fontWeight: '600',
      },
      bold: {
        fontWeight: '900',
      },
      italic: {
        fontWeight: '400',
        fontStyle: 'italic',
      },
      uppercase: {
        fontWeight: '800',
        textTransform: 'uppercase',
      },
      script: {
        fontFamily: '"Segoe Script", cursive',
        fontWeight: '400',
      },
    },
  },

  // Text Style Actions
  setActiveTextStyle: (styleId: string) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        activeStyle: styleId,
      },
    })),

  getTextStyleForSubtitle: (styleId: string) => {
    const state = get();
    const style =
      state.textStyle.styles[styleId] || state.textStyle.styles.regular;
    return {
      fontFamily: style.fontFamily || '"Arial", sans-serif',
      fontWeight: style.fontWeight || '400',
      fontStyle: style.fontStyle || 'normal',
      textTransform:
        (style.textTransform as
          | 'none'
          | 'uppercase'
          | 'lowercase'
          | 'capitalize') || 'none',
    };
  },
});

export type { TextStyleSlice };
