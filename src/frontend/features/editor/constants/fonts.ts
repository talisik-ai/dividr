/**
 * Font Constants
 * Available font families for text and subtitle styling
 */

export interface FontOption {
  label: string;
  value: string;
  category: 'serif' | 'sans-serif';
}

export const AVAILABLE_FONTS: FontOption[] = [
  // Serif Fonts
  {
    label: 'Cormorant',
    value: 'Cormorant',
    category: 'serif',
  },
  {
    label: 'Libre Baskerville',
    value: 'Libre Baskerville',
    category: 'serif',
  },
  {
    label: 'Lora',
    value: 'Lora',
    category: 'serif',
  },
  {
    label: 'Playfair Display',
    value: 'Playfair Display',
    category: 'serif',
  },

  // Sans-Serif Fonts
  {
    label: 'Inter',
    value: 'Inter',
    category: 'sans-serif',
  },
  {
    label: 'Lato',
    value: 'Lato',
    category: 'sans-serif',
  },
  {
    label: 'Montserrat',
    value: 'Montserrat',
    category: 'sans-serif',
  },
  {
    label: 'Poppins',
    value: 'Poppins',
    category: 'sans-serif',
  },
  {
    label: 'Roboto',
    value: 'Roboto',
    category: 'sans-serif',
  },

  // System Fallback
  {
    label: 'Arial',
    value: 'Arial',
    category: 'sans-serif',
  },
];

export const SERIF_FONTS = AVAILABLE_FONTS.filter(
  (f) => f.category === 'serif',
);
export const SANS_SERIF_FONTS = AVAILABLE_FONTS.filter(
  (f) => f.category === 'sans-serif',
);

export const DEFAULT_FONT = 'Inter';
