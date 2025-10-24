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
  fontFamilies: string[];
}

/**
 * Generate subtitle content from subtitle tracks
 */
export function generateSubtitleContent(
  subtitleTracks: VideoTrack[],
  textStyle: any,
  getTextStyleForSubtitle: (styleId: string) => any,
  videoDimensions?: { width: number; height: number },
): SubtitleGenerationResult {
  if (subtitleTracks.length === 0) {
    return {
      subtitleContent: '',
      currentTextStyle: undefined,
      fontFamilies: [],
    };
  }

  // Get timeline data non-reactively
  const { timeline } = useVideoEditorStore.getState();

  // Extract subtitle segments from tracks
  const segments = extractSubtitleSegments(subtitleTracks, timeline);

  // Get current text style
  const currentTextStyle = getTextStyleForSubtitle(textStyle.activeStyle);

  // Generate ASS content with styling and video dimensions
  const assResult = generateASSContent(segments, currentTextStyle, videoDimensions);

  console.log(
    '📝 Generated subtitle content for export with text style:',
    textStyle.activeStyle,
    'and video dimensions:',
    videoDimensions,
  );
  console.log('📝 Fonts used in subtitles:', assResult.fontFamilies.join(', '));

  return {
    subtitleContent: assResult.content,
    currentTextStyle,
    fontFamilies: assResult.fontFamilies,
  };
}
