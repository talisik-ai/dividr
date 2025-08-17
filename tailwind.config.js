/** @type {import('tailwindcss').Config} */
import defaultTheme, { colors } from 'tailwindcss/defaultTheme';

module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: '',
  theme: {
    screens: {
      ...defaultTheme.screens,

      // Height-based breakpoints
      'h-sm1': { raw: '(max-height: 630px)' },
      'h-md1': { raw: '(max-height: 800px)' },
      'h-lg1': { raw: '(max-height: 850px)' },
      'h-xl1': { raw: '(max-height: 900px)' },
    },
    container: {
      center: true,
      padding: '2rem',
      screens: {
        xs: '475px',
        sm: '640px',
        md: '900px',
        lg: '950px',
        '2xl': '1400px',
      },
    },
    extend: {
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
      colors: {
        ...colors, // Spread the default colors
        titleBar: {
          DEFAULT: '#000000',
          dark: '#09090B',
        },
        body: {
          DEFAULT: '#000000',
          dark: '#09090B',
        },
        controls: '#2d2d2d',
        primary: '#1ED760',
        secondary: '#121212',
        toolbarIcon: '#9CA3AF',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
