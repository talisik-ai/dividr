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
  // Global style controls (affect all subtitles)
  globalControls: {
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
}

export interface TextStyleSlice {
  textStyle: TextStyleState;

  // Text Style Actions
  setActiveTextStyle: (styleId: string) => void;
  getTextStyleForSubtitle: (styleId: string) => React.CSSProperties;

  // Global style controls
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
}
