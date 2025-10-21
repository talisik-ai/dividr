/**
 * Font Mapper for FFmpeg
 * Maps font family names to their file paths for FFmpeg rendering
 */
import { app } from 'electron';
import path from 'path';

export interface FontVariant {
  regular: string;
  bold?: string;
  italic?: string;
  boldItalic?: string;
  light?: string;
  medium?: string;
  semibold?: string;
  black?: string;
}

export interface FontMapping {
  family: string;
  variants: FontVariant;
}

/**
 * Font mappings for all available fonts
 */
export const FONT_MAPPINGS: Record<string, FontMapping> = {
  Cormorant: {
    family: 'Cormorant',
    variants: {
      light: 'Cormorant/Cormorant-Light.ttf',
      regular: 'Cormorant/Cormorant-Regular.ttf',
      medium: 'Cormorant/Cormorant-Medium.ttf',
      semibold: 'Cormorant/Cormorant-SemiBold.ttf',
      bold: 'Cormorant/Cormorant-Bold.ttf',
      italic: 'Cormorant/Cormorant-Italic.ttf',
      boldItalic: 'Cormorant/Cormorant-BoldItalic.ttf',
    },
  },
  Inter: {
    family: 'Inter',
    variants: {
      light: 'Inter/Inter_18pt-Light.ttf',
      regular: 'Inter/Inter_18pt-Regular.ttf',
      medium: 'Inter/Inter_18pt-Medium.ttf',
      semibold: 'Inter/Inter_18pt-SemiBold.ttf',
      bold: 'Inter/Inter_18pt-Bold.ttf',
      black: 'Inter/Inter_18pt-Black.ttf',
      italic: 'Inter/Inter_18pt-Italic.ttf',
      boldItalic: 'Inter/Inter_18pt-BoldItalic.ttf',
    },
  },
  Lato: {
    family: 'Lato',
    variants: {
      light: 'Lato/Lato-Light.ttf',
      regular: 'Lato/Lato-Regular.ttf',
      bold: 'Lato/Lato-Bold.ttf',
      black: 'Lato/Lato-Black.ttf',
      italic: 'Lato/Lato-Italic.ttf',
      boldItalic: 'Lato/Lato-BoldItalic.ttf',
    },
  },
  'Libre Baskerville': {
    family: 'Libre Baskerville',
    variants: {
      regular: 'Libre_Baskerville/LibreBaskerville-Regular.ttf',
      bold: 'Libre_Baskerville/LibreBaskerville-Bold.ttf',
      italic: 'Libre_Baskerville/LibreBaskerville-Italic.ttf',
    },
  },
  Lora: {
    family: 'Lora',
    variants: {
      regular: 'Lora/Lora-Regular.ttf',
      medium: 'Lora/Lora-Medium.ttf',
      semibold: 'Lora/Lora-SemiBold.ttf',
      bold: 'Lora/Lora-Bold.ttf',
      italic: 'Lora/Lora-Italic.ttf',
      boldItalic: 'Lora/Lora-BoldItalic.ttf',
    },
  },
  Montserrat: {
    family: 'Montserrat',
    variants: {
      light: 'Montserrat/Montserrat-Light.ttf',
      regular: 'Montserrat/Montserrat-Regular.ttf',
      medium: 'Montserrat/Montserrat-Medium.ttf',
      semibold: 'Montserrat/Montserrat-SemiBold.ttf',
      bold: 'Montserrat/Montserrat-Bold.ttf',
      black: 'Montserrat/Montserrat-Black.ttf',
      italic: 'Montserrat/Montserrat-Italic.ttf',
      boldItalic: 'Montserrat/Montserrat-BoldItalic.ttf',
    },
  },
  'Playfair Display': {
    family: 'Playfair Display',
    variants: {
      regular: 'Playfair_Display/PlayfairDisplay-Regular.ttf',
      medium: 'Playfair_Display/PlayfairDisplay-Medium.ttf',
      semibold: 'Playfair_Display/PlayfairDisplay-SemiBold.ttf',
      bold: 'Playfair_Display/PlayfairDisplay-Bold.ttf',
      black: 'Playfair_Display/PlayfairDisplay-Black.ttf',
      italic: 'Playfair_Display/PlayfairDisplay-Italic.ttf',
      boldItalic: 'Playfair_Display/PlayfairDisplay-BoldItalic.ttf',
    },
  },
  Poppins: {
    family: 'Poppins',
    variants: {
      light: 'Poppins/Poppins-Light.ttf',
      regular: 'Poppins/Poppins-Regular.ttf',
      medium: 'Poppins/Poppins-Medium.ttf',
      semibold: 'Poppins/Poppins-SemiBold.ttf',
      bold: 'Poppins/Poppins-Bold.ttf',
      black: 'Poppins/Poppins-Black.ttf',
      italic: 'Poppins/Poppins-Italic.ttf',
      boldItalic: 'Poppins/Poppins-BoldItalic.ttf',
    },
  },
  Roboto: {
    family: 'Roboto',
    variants: {
      light: 'Roboto/Roboto-Light.ttf',
      regular: 'Roboto/Roboto-Regular.ttf',
      medium: 'Roboto/Roboto-Medium.ttf',
      bold: 'Roboto/Roboto-Bold.ttf',
      black: 'Roboto/Roboto-Black.ttf',
      italic: 'Roboto/Roboto-Italic.ttf',
      boldItalic: 'Roboto/Roboto-BoldItalic.ttf',
    },
  },
  // Fallback to Arial (system font)
  Arial: {
    family: 'Arial',
    variants: {
      regular: 'Arial', // System font, no file path needed
      bold: 'Arial Bold',
      italic: 'Arial Italic',
      boldItalic: 'Arial Bold Italic',
    },
  },
};

/**
 * Get the fonts directory path
 * In production: app.asar.unpacked/fonts or resources/fonts
 * In development: src/frontend/assets/fonts
 */
export function getFontsDirectory(): string {
  if (process.env.NODE_ENV === 'production') {
    // In production, fonts are in resources/fonts
    return path.join(process.resourcesPath, 'fonts');
  } else {
    // In development, fonts are in src/frontend/assets/fonts
    return path.join(app.getAppPath(), 'src', 'frontend', 'assets', 'fonts');
  }
}

/**
 * Get font file path for FFmpeg
 * @param fontFamily - Font family name (e.g., 'Roboto', 'Montserrat')
 * @param fontWeight - Font weight (e.g., '400', '700')
 * @param isItalic - Whether the font is italic
 * @returns Absolute path to the font file
 */
export function getFontPath(
  fontFamily = 'Inter',
  fontWeight = '400',
  isItalic = false,
): string {
  // Clean font family name (remove quotes and extra spaces)
  const cleanFamily = fontFamily.replace(/['"]/g, '').trim();

  // Get font mapping or fallback to Inter
  const mapping = FONT_MAPPINGS[cleanFamily] || FONT_MAPPINGS['Inter'];

  // Determine variant based on weight and italic
  let variant: keyof FontVariant = 'regular';

  const weight = parseInt(fontWeight);

  if (isItalic) {
    if (weight >= 700) {
      variant = 'boldItalic';
    } else {
      variant = 'italic';
    }
  } else {
    if (weight >= 900) {
      variant = 'black';
    } else if (weight >= 700) {
      variant = 'bold';
    } else if (weight >= 600) {
      variant = 'semibold';
    } else if (weight >= 500) {
      variant = 'medium';
    } else if (weight < 400) {
      variant = 'light';
    } else {
      variant = 'regular';
    }
  }

  // Get font file path
  const fontFile =
    mapping.variants[variant] ||
    mapping.variants.regular ||
    'Inter/Inter_18pt-Regular.ttf'; // Fallback to Inter regular

  // If it's a system font (like Arial), return the font name
  if (!fontFile.includes('/') && !fontFile.includes('.ttf')) {
    return fontFile;
  }

  // Return absolute path
  const fontsDir = getFontsDirectory();
  return path.join(fontsDir, fontFile);
}

/**
 * Get font path with explicit style flags (for text clips)
 * @param fontFamily - Font family name
 * @param isBold - Whether the font should be bold
 * @param isItalic - Whether the font should be italic
 * @returns Absolute path to the font file
 */
export function getFontPathByStyle(
  fontFamily = 'Inter',
  isBold = false,
  isItalic = false,
): string {
  const fontWeight = isBold ? '700' : '400';
  return getFontPath(fontFamily, fontWeight, isItalic);
}

/**
 * Get all available font families
 */
export function getAvailableFonts(): string[] {
  return Object.keys(FONT_MAPPINGS).filter((key) => key !== 'Arial');
}

/**
 * Check if a font family is available
 */
export function isFontAvailable(fontFamily: string): boolean {
  const cleanFamily = fontFamily.replace(/['"]/g, '').trim();
  return cleanFamily in FONT_MAPPINGS;
}
