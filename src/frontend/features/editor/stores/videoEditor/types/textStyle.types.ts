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
}

export interface TextStyleSlice {
  textStyle: TextStyleState;

  // Text Style Actions
  setActiveTextStyle: (styleId: string) => void;
  getTextStyleForSubtitle: (styleId: string) => React.CSSProperties;
}
