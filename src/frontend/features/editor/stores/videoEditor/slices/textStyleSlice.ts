/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { TextStyleSlice, TextStyleState } from '../types';

/**
 * Helper function to apply style changes based on application mode
 * @param state - Current state
 * @param updateKey - The style property to update (e.g., 'isBold', 'fontSize')
 * @param newValue - The new value for the property
 * @returns Updated state object
 */
const applyStyleUpdate = (state: any, updateKey: string, newValue: any) => {
  const mode = state.textStyle.styleApplicationMode;
  const selectedTrackIds = state.timeline?.selectedTrackIds || [];

  // If 'all' mode or no selection, update globally
  if (mode === 'all' || selectedTrackIds.length === 0) {
    return {
      textStyle: {
        ...state.textStyle,
        globalControls: {
          ...state.textStyle.globalControls,
          [updateKey]: newValue,
        },
      },
    };
  }

  // 'selected' mode: update only selected subtitle tracks
  // Record action for undo/redo when modifying tracks
  state.recordAction?.(`Update Subtitle Style: ${updateKey}`);

  const updatedTracks = state.tracks.map((track: any) => {
    if (track.type === 'subtitle' && selectedTrackIds.includes(track.id)) {
      return {
        ...track,
        subtitleStyle: {
          ...(track.subtitleStyle || {}),
          [updateKey]: newValue,
        },
      };
    }
    return track;
  });

  return {
    tracks: updatedTracks,
  };
};

const DEFAULT_GLOBAL_CONTROLS = {
  fontFamily: 'Inter',
  isBold: false,
  isItalic: false,
  isUnderline: false,
  textTransform: 'none' as const,
  textAlign: 'center' as const,
  fontSize: 40,
  fillColor: '#FFFFFF',
  strokeColor: '#000000',
  backgroundColor: 'rgba(0, 0, 0, 0.0)',
  hasShadow: false,
  letterSpacing: 0,
  lineSpacing: 1.2,
  hasGlow: false,
  opacity: 100,
};

const DEFAULT_GLOBAL_SUBTITLE_POSITION = {
  x: 0, // Centered horizontally
  y: 0.7, // Bottom-aligned (70% down from center)
};

// Export default text style state for project creation/reset
export const getDefaultTextStyleState = (): TextStyleState => ({
  activeStyle: 'default',
  styleApplicationMode: 'all', // Default to global mode
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
  globalControls: { ...DEFAULT_GLOBAL_CONTROLS },
  globalSubtitlePosition: { ...DEFAULT_GLOBAL_SUBTITLE_POSITION },
});

export const createTextStyleSlice: StateCreator<
  TextStyleSlice,
  [],
  [],
  TextStyleSlice
> = (set, get) => ({
  textStyle: getDefaultTextStyleState(),

  // Text Style Actions
  setActiveTextStyle: (styleId: string) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return {
        textStyle: {
          ...state.textStyle,
          activeStyle: styleId,
        },
      };
    }),

  // Style application mode setter
  setStyleApplicationMode: (mode: 'all' | 'selected') =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return {
        textStyle: {
          ...state.textStyle,
          styleApplicationMode: mode,
        },
      };
    }),

  getTextStyleForSubtitle: (styleId: string, segmentStyle?: any) => {
    const state = get();
    const style =
      state.textStyle.styles[styleId] || state.textStyle.styles.default;
    const controls = state.textStyle.globalControls;

    // Merge global controls with per-segment overrides (if provided)
    const mergedControls = segmentStyle
      ? { ...controls, ...segmentStyle }
      : controls;

    // Merge font style with merged controls
    let fontWeight = style.fontWeight || '400';
    let fontStyle = style.fontStyle || 'normal';

    // Apply bold toggle (from merged controls)
    if (mergedControls.isBold) {
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

    // Apply italic toggle (from merged controls)
    if (mergedControls.isItalic) {
      fontStyle = 'italic';
    }

    // Build text shadow for stroke outline (professional video editor style)
    const strokeShadows: string[] = [];
    const strokeColor = mergedControls.strokeColor;
    const strokeWidth = 2; // Standard outline width

    // Create 8-direction outline for smooth stroke effect
    for (let angle = 0; angle < 360; angle += 45) {
      const radian = (angle * Math.PI) / 180;
      const x = Math.cos(radian) * strokeWidth;
      const y = Math.sin(radian) * strokeWidth;
      strokeShadows.push(
        `${x.toFixed(1)}px ${y.toFixed(1)}px 0 ${strokeColor}`,
      );
    }

    // Add shadow if enabled
    const shadowEffects: string[] = [...strokeShadows];
    if (mergedControls.hasShadow) {
      shadowEffects.push(`2px 2px 4px rgba(0, 0, 0, 0.8)`);
    }

    return {
      fontFamily:
        mergedControls.fontFamily || style.fontFamily || '"Arial", sans-serif',
      fontWeight,
      fontStyle,
      textTransform: mergedControls.textTransform,
      textAlign: mergedControls.textAlign,
      fontSize: `${mergedControls.fontSize}px`,
      color: mergedControls.fillColor,
      backgroundColor: mergedControls.backgroundColor,
      textDecoration: mergedControls.isUnderline ? 'underline' : 'none',
      textShadow: shadowEffects.join(', '),
      letterSpacing: `${mergedControls.letterSpacing}px`,
      lineHeight: mergedControls.lineSpacing,
      opacity: mergedControls.opacity / 100,
      hasGlow: mergedControls.hasGlow,
      strokeColor: mergedControls.strokeColor,
      hasShadow: mergedControls.hasShadow,
    };
  },

  // Global style control actions
  toggleBold: () =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      const newValue = !state.textStyle.globalControls.isBold;
      return applyStyleUpdate(state, 'isBold', newValue);
    }),

  toggleItalic: () =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      const newValue = !state.textStyle.globalControls.isItalic;
      return applyStyleUpdate(state, 'isItalic', newValue);
    }),

  toggleUnderline: () =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      const newValue = !state.textStyle.globalControls.isUnderline;
      return applyStyleUpdate(state, 'isUnderline', newValue);
    }),

  setTextTransform: (
    transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize',
  ) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'textTransform', transform);
    }),

  setTextAlign: (align: 'left' | 'center' | 'right' | 'justify') =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'textAlign', align);
    }),

  setFontFamily: (fontFamily: string) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'fontFamily', fontFamily);
    }),

  setFontSize: (size: number) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'fontSize', size);
    }),

  setFillColor: (color: string) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'fillColor', color);
    }),

  setStrokeColor: (color: string) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'strokeColor', color);
    }),

  setBackgroundColor: (color: string) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'backgroundColor', color);
    }),

  toggleShadow: () =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      const newValue = !state.textStyle.globalControls.hasShadow;
      return applyStyleUpdate(state, 'hasShadow', newValue);
    }),

  setLetterSpacing: (spacing: number) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'letterSpacing', spacing);
    }),

  setLineSpacing: (spacing: number) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return applyStyleUpdate(state, 'lineSpacing', spacing);
    }),

  toggleGlow: () =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      const newValue = !state.textStyle.globalControls.hasGlow;
      return applyStyleUpdate(state, 'hasGlow', newValue);
    }),

  setOpacity: (opacity: number) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      const clampedOpacity = Math.max(0, Math.min(100, opacity));
      return applyStyleUpdate(state, 'opacity', clampedOpacity);
    }),

  resetTextStyles: () =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return {
        textStyle: {
          ...state.textStyle,
          activeStyle: 'default',
          globalControls: DEFAULT_GLOBAL_CONTROLS,
        },
      };
    }),

  // Global subtitle position
  setGlobalSubtitlePosition: (position: { x: number; y: number }) =>
    set((state: any) => {
      state.markUnsavedChanges?.();
      return {
        textStyle: {
          ...state.textStyle,
          globalSubtitlePosition: position,
        },
      };
    }),
});

export type { TextStyleSlice };
