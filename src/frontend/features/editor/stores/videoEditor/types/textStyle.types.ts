export interface TextStyleState {
  activeStyle: string;
  styles: {
    [key: string]: {
      fontFamily?: string;
      fontWeight?: string;
      fontStyle?: string;
      textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    };
  };
  // Style application mode
  styleApplicationMode: 'all' | 'selected'; // 'all' = global, 'selected' = per-segment
  // Global style controls (affect all subtitles when mode is 'all')
  globalControls: {
    fontFamily: string;
    isBold: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
    textAlign: 'left' | 'center' | 'right' | 'justify';
    fontSize: number;
    fillColor: string;
    strokeColor: string;
    backgroundColor: string;
    hasShadow: boolean;
    letterSpacing: number;
    lineSpacing: number;
    hasGlow: boolean;
    opacity: number;
  };
  // Global subtitle position (affects all subtitle tracks)
  globalSubtitlePosition: {
    x: number; // Normalized X position (-1 to 1, 0 = center)
    y: number; // Normalized Y position (-1 to 1, default 0.7 = bottom-aligned)
  };
}

export interface TextStyleSlice {
  textStyle: TextStyleState;

  // Text Style Actions
  setActiveTextStyle: (styleId: string) => void;
  getTextStyleForSubtitle: (
    styleId: string,
    segmentStyle?: any,
  ) => React.CSSProperties;

  // Style application mode
  setStyleApplicationMode: (mode: 'all' | 'selected') => void;

  // Global style controls
  setFontFamily: (fontFamily: string) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  setTextTransform: (
    transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize',
  ) => void;
  setTextAlign: (align: 'left' | 'center' | 'right' | 'justify') => void;
  setFontSize: (size: number) => void;
  setFillColor: (color: string) => void;
  setStrokeColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  toggleShadow: () => void;
  setLetterSpacing: (spacing: number) => void;
  setLineSpacing: (spacing: number) => void;
  toggleGlow: () => void;
  setOpacity: (opacity: number) => void;
  resetTextStyles: () => void;

  // Global subtitle position
  setGlobalSubtitlePosition: (position: { x: number; y: number }) => void;

  // Cross-slice helpers (accessed by projectSlice for auto-save)
  markUnsavedChanges?: () => void;
}
