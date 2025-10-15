import { StateCreator } from 'zustand';
import { TextStyleSlice } from '../types';

const DEFAULT_GLOBAL_CONTROLS = {
  isBold: false,
  isItalic: false,
  isUnderline: false,
  textTransform: 'none' as const,
  textAlign: 'center' as const,
  fontSize: 18,
  fillColor: '#FFFFFF',
  strokeColor: '#000000',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  hasShadow: false,
  letterSpacing: 0,
  lineSpacing: 1.2,
  hasGlow: false,
  opacity: 100,
};

export const createTextStyleSlice: StateCreator<
  TextStyleSlice,
  [],
  [],
  TextStyleSlice
> = (set, get) => ({
  textStyle: {
    activeStyle: 'default',
    styles: {
      default: {
        fontWeight: '400',
      },
      semibold: {
        fontWeight: '600',
      },
      script: {
        fontFamily: '"Segoe Script", cursive',
        fontWeight: '400',
      },
    },
    globalControls: DEFAULT_GLOBAL_CONTROLS,
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
      state.textStyle.styles[styleId] || state.textStyle.styles.default;
    const controls = state.textStyle.globalControls;

    // Merge font style with global controls
    let fontWeight = style.fontWeight || '400';
    let fontStyle = style.fontStyle || 'normal';

    // Apply global bold toggle (overrides style font weight)
    if (controls.isBold) {
      // If semibold is selected and bold is toggled, make it extra bold
      if (styleId === 'semibold') {
        fontWeight = '800';
      } else if (styleId === 'script') {
        // Script fonts look better with a slightly lighter bold weight
        fontWeight = '600';
      } else {
        fontWeight = '700';
      }
    }

    // Apply global italic toggle (overrides style font style)
    if (controls.isItalic) {
      fontStyle = 'italic';
    }

    return {
      fontFamily: style.fontFamily || '"Arial", sans-serif',
      fontWeight,
      fontStyle,
      textTransform: controls.textTransform,
      textAlign: controls.textAlign,
      fontSize: `${controls.fontSize}px`,
      color: controls.fillColor,
      backgroundColor: controls.backgroundColor,
      textDecoration: controls.isUnderline ? 'underline' : 'none',
      textShadow: controls.hasShadow
        ? `2px 2px 4px ${controls.strokeColor}`
        : 'none',
      letterSpacing: `${controls.letterSpacing}px`,
      lineHeight: controls.lineSpacing,
    };
  },

  // Global style control actions
  toggleBold: () =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          isBold: !state.textStyle.globalControls.isBold,
        },
      },
    })),

  toggleItalic: () =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          isItalic: !state.textStyle.globalControls.isItalic,
        },
      },
    })),

  toggleUnderline: () =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          isUnderline: !state.textStyle.globalControls.isUnderline,
        },
      },
    })),

  setTextTransform: (
    transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize',
  ) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          textTransform: transform,
        },
      },
    })),

  setTextAlign: (align: 'left' | 'center' | 'right' | 'justify') =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          textAlign: align,
        },
      },
    })),

  setFontSize: (size: number) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          fontSize: size,
        },
      },
    })),

  setFillColor: (color: string) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          fillColor: color,
        },
      },
    })),

  setStrokeColor: (color: string) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          strokeColor: color,
        },
      },
    })),

  setBackgroundColor: (color: string) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          backgroundColor: color,
        },
      },
    })),

  toggleShadow: () =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          hasShadow: !state.textStyle.globalControls.hasShadow,
        },
      },
    })),

  setLetterSpacing: (spacing: number) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          letterSpacing: spacing,
        },
      },
    })),

  setLineSpacing: (spacing: number) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          lineSpacing: spacing,
        },
      },
    })),

  toggleGlow: () =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          hasGlow: !state.textStyle.globalControls.hasGlow,
        },
      },
    })),

  setOpacity: (opacity: number) =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          opacity: Math.max(0, Math.min(100, opacity)),
        },
      },
    })),

  resetTextStyles: () =>
    set((state) => ({
      textStyle: {
        ...state.textStyle,
        activeStyle: 'default',
        globalControls: DEFAULT_GLOBAL_CONTROLS,
      },
    })),
});

export type { TextStyleSlice };
