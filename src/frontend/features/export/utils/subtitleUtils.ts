/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Subtitle Utilities
 * Handles subtitle content generation for export
 */
import {
  extractSubtitleSegments,
  generateASSContent,
} from '@/backend/ffmpeg/subtitleExporter';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../editor/stores/videoEditor/index';

interface SubtitleGenerationResult {
  subtitleContent: string;
  currentTextStyle: any;
}

/**
 * Generate subtitle content from subtitle tracks
 */
export function generateSubtitleContent(
  subtitleTracks: VideoTrack[],
  textStyle: any,
  getTextStyleForSubtitle: (styleId: string) => any,
): SubtitleGenerationResult {
  if (subtitleTracks.length === 0) {
    return {
      subtitleContent: '',
      currentTextStyle: undefined,
    };
  }

  // Get timeline data non-reactively
  const { timeline } = useVideoEditorStore.getState();

  // Extract subtitle segments from tracks
  const segments = extractSubtitleSegments(subtitleTracks, timeline);

  // Get current text style
  const currentTextStyle = getTextStyleForSubtitle(textStyle.activeStyle);

  // Generate ASS content with styling
  const subtitleContent = generateASSContent(segments, currentTextStyle);

  console.log(
    '📝 Generated subtitle content for export with text style:',
    textStyle.activeStyle,
  );

  return {
    subtitleContent,
    currentTextStyle,
  };
}
