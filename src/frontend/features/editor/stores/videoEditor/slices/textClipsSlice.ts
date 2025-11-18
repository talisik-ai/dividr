/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { VideoTrack } from '../types';

export interface TextClipsSlice {
  // Recent fonts tracking (for text clips only)
  recentFonts: string[];
  addRecentFont: (fontFamily: string) => void;

  // Actions for text clips
  addTextClip: (
    textType: 'heading' | 'body',
    startFrame?: number,
  ) => Promise<string>;
  updateTextClipContent: (trackId: string, content: string) => void;
}

const getTrackColor = (index: number): string => {
  const colors = [
    '#3498db',
    '#2ecc71',
    '#e74c3c',
    '#f39c12',
    '#9b59b6',
    '#1abc9c',
    '#34495e',
    '#e67e22',
  ];
  return colors[index % colors.length];
};

const DEFAULT_TEXT_STYLE = {
  fontFamily: '"Arial", sans-serif',
  fontWeight: '400',
  fontStyle: 'normal',
  isBold: false,
  isItalic: false,
  isUnderline: false,
  textTransform: 'none' as const,
  textAlign: 'center' as const,
  fontSize: 40,
  fillColor: '#FFFFFF',
  strokeColor: '#000000',
  backgroundColor: 'transparent',
  hasShadow: false,
  letterSpacing: 0,
  lineSpacing: 1.2,
  hasGlow: false,
  opacity: 100,
};

export const createTextClipsSlice: StateCreator<
  TextClipsSlice,
  [],
  [],
  TextClipsSlice
> = (set, get) => ({
  // Recent fonts state
  recentFonts: [],

  // Add a font to recent fonts (max 10, most recent first)
  addRecentFont: (fontFamily: string) => {
    set((state: any) => {
      const currentRecent = state.recentFonts || [];
      // Remove if already exists
      const filtered = currentRecent.filter((f: string) => f !== fontFamily);
      // Add to front, limit to 10
      const newRecent = [fontFamily, ...filtered].slice(0, 10);
      return { recentFonts: newRecent };
    });
  },

  addTextClip: async (textType: 'heading' | 'body', startFrame = 0) => {
    const state = get() as any;
    const fps = state.timeline?.fps || 30;

    // Ensure the text track row is visible before adding the clip
    if (state.ensureTrackRowVisible) {
      state.ensureTrackRowVisible('text');
    }

    // Default duration: 5 seconds
    const defaultDuration = fps * 5;

    // Create a new text track with per-clip styling and transform
    const textTrack: Omit<VideoTrack, 'id'> = {
      type: 'text',
      name: textType === 'heading' ? 'Text Heading' : 'Text Body',
      source: '', // Text clips don't have a file source
      duration: defaultDuration,
      startFrame,
      endFrame: startFrame + defaultDuration,
      visible: true,
      locked: false,
      color: getTrackColor(state.tracks?.length || 0),
      textContent: textType === 'heading' ? 'Heading Text' : 'Body Text',
      textType,
      textStyle: { ...DEFAULT_TEXT_STYLE },
      textTransform: {
        x: 0, // Centered horizontally (normalized: 0 = center)
        y: textType === 'heading' ? -0.3 : 0, // Heading slightly above center, body at center (normalized: -1 to 1)
        scale: 1, // 100% scale
        rotation: 0, // No rotation
        width: 800, // Default width in pixels
        height: 100, // Default height in pixels
      },
    };

    // Use the existing addTrack function from tracksSlice
    if (state.addTrack) {
      const trackId = await state.addTrack(textTrack);
      console.log(`✅ Added ${textType} text clip with ID: ${trackId}`);
      return trackId;
    }

    // Fallback: shouldn't happen in normal flow, but return empty string
    console.error('❌ addTrack function not available in state');
    return '';
  },

  updateTextClipContent: (trackId: string, content: string) => {
    const state = get() as any;

    if (state.updateTrack) {
      state.updateTrack(trackId, { textContent: content });
    } else {
      console.error('❌ updateTrack function not available in state');
    }
  },
});
