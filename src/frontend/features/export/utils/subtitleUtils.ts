/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Subtitle Utilities
 * Handles subtitle content generation for export
 * Now also handles text clips bundled with subtitles
 */
import {
  extractSubtitleSegments,
  generateASSContent,
  convertTextClipsToSubtitleSegments,
} from '@/backend/ffmpeg/subtitles/subtitleExporter';
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
 * Generate subtitle content from subtitle tracks and text clips
 * Text clips are now bundled with subtitles and processed together
 * @param timelineStartFrame - Optional start frame of the export range (for offsetting subtitle timestamps)
 */
export function generateSubtitleContent(
  subtitleTracks: VideoTrack[],
  textTracks: VideoTrack[],
  textStyle: any,
  getTextStyleForSubtitle: (styleId: string) => any,
  videoDimensions?: { width: number; height: number },
  timelineStartFrame?: number,
): SubtitleGenerationResult {
  // Get timeline data non-reactively
  const { timeline } = useVideoEditorStore.getState();

  // Calculate time offset if export starts at a specific frame
  const timeOffset = timelineStartFrame !== undefined ? timelineStartFrame / timeline.fps : 0;
  
  if (timeOffset > 0) {
    console.log(`📝 Export starts at frame ${timelineStartFrame} (${timeOffset.toFixed(3)}s)`);
  }

  // Extract subtitle segments from subtitle tracks with frame-based timing
  const subtitleSegments = subtitleTracks.length > 0 
    ? subtitleTracks.map((track, index) => {
        // Calculate timing relative to export start frame
        const relativeStartFrame = Math.max(0, track.startFrame - (timelineStartFrame || 0));
        const relativeEndFrame = Math.max(0, track.endFrame - (timelineStartFrame || 0));
        
        const startTime = relativeStartFrame / timeline.fps;
        const endTime = relativeEndFrame / timeline.fps;
        
        console.log(
          `[Subtitle] "${track.subtitleText?.substring(0, 30)}" - frames ${track.startFrame}-${track.endFrame} -> relative ${relativeStartFrame}-${relativeEndFrame} -> ${startTime.toFixed(3)}s-${endTime.toFixed(3)}s`,
        );
        
        // Extract per-track styling if available
        const style = track.textStyle ? {
          fontFamily: track.textStyle.fontFamily,
          fontWeight: track.textStyle.isBold ? '700' : (track.textStyle.fontWeight || '400'),
          fontStyle: track.textStyle.isItalic ? 'italic' : (track.textStyle.fontStyle || 'normal'),
          isUnderline: track.textStyle.isUnderline,
          textTransform: track.textStyle.textTransform,
          textDecoration: track.textStyle.isUnderline ? 'underline' : undefined,
          fontSize: track.textStyle.fontSize ? `${track.textStyle.fontSize}px` : undefined,
          color: track.textStyle.fillColor,
          strokeColor: track.textStyle.strokeColor,
          backgroundColor: track.textStyle.backgroundColor,
          hasShadow: track.textStyle.hasShadow,
          hasGlow: track.textStyle.hasGlow,
          opacity: track.textStyle.opacity,
          letterSpacing: track.textStyle.letterSpacing ? `${track.textStyle.letterSpacing}px` : undefined,
          lineHeight: track.textStyle.lineSpacing,
          textAlign: track.textStyle.textAlign,
        } : undefined;
        
        // Clean up text: remove trailing newlines and extra whitespace
        const cleanText = (track.subtitleText || '').replace(/\n\s*$/, '').trim();
        
        return {
          startTime,
          endTime,
          text: cleanText,
          index: index + 1,
          style,
          isTextClip: false,
        };
      })
    : [];

  // Convert text tracks to subtitle segments with frame-based timing
  const textClipSegments = textTracks.length > 0
    ? textTracks.map((track, index) => {
        // Calculate timing relative to export start frame
        const relativeStartFrame = Math.max(0, track.startFrame - (timelineStartFrame || 0));
        const relativeEndFrame = Math.max(0, track.endFrame - (timelineStartFrame || 0));
        
        const startTime = relativeStartFrame / timeline.fps;
        const endTime = relativeEndFrame / timeline.fps;
        
        console.log(
          `[TextClip] "${track.textContent?.substring(0, 30)}" - frames ${track.startFrame}-${track.endFrame} -> relative ${relativeStartFrame}-${relativeEndFrame} -> ${startTime.toFixed(3)}s-${endTime.toFixed(3)}s`,
        );
        
        // Convert track textStyle to subtitle style format
        const style = {
          fontFamily: track.textStyle?.fontFamily,
          fontWeight: track.textStyle?.isBold ? '700' : (track.textStyle?.fontWeight || '400'),
          fontStyle: track.textStyle?.isItalic ? 'italic' : (track.textStyle?.fontStyle || 'normal'),
          isUnderline: track.textStyle?.isUnderline,
          textTransform: track.textStyle?.textTransform,
          textDecoration: track.textStyle?.isUnderline ? 'underline' : undefined,
          fontSize: track.textStyle?.fontSize ? `${track.textStyle.fontSize}px` : undefined,
          color: track.textStyle?.fillColor,
          strokeColor: track.textStyle?.strokeColor,
          backgroundColor: track.textStyle?.backgroundColor,
          hasShadow: track.textStyle?.hasShadow,
          hasGlow: track.textStyle?.hasGlow,
          opacity: track.textStyle?.opacity,
          letterSpacing: track.textStyle?.letterSpacing ? `${track.textStyle.letterSpacing}px` : undefined,
          lineHeight: track.textStyle?.lineSpacing,
          textAlign: track.textStyle?.textAlign,
        };

        // Convert transform to position (normalized coordinates)
        // Position: [-1,1] (center=0) -> [0,1] (center=0.5)
        // Rotation: degrees, clockwise (same as CSS transform rotate)
        const position = track.textTransform ? {
          x: (track.textTransform.x + 1) / 2, // Convert from [-1,1] to [0,1]
          y: (track.textTransform.y + 1) / 2, // Convert from [-1,1] to [0,1]
          rotation: track.textTransform.rotation || 0, // Degrees, clockwise
        } : undefined;

        // Clean up text: remove trailing newlines and extra whitespace
        const cleanText = (track.textContent || '').replace(/\n\s*$/, '').trim();

        return {
          startTime,
          endTime,
          text: cleanText,
          index: index + 1,
          style,
          position,
          isTextClip: true,
        };
      })
    : [];

  // Combine subtitle and text clip segments
  const allSegments = [...subtitleSegments, ...textClipSegments];

  if (allSegments.length === 0) {
    return {
      subtitleContent: '',
      currentTextStyle: undefined,
      fontFamilies: [],
    };
  }

  // Filter out segments that have invalid timing (end time <= 0 or start >= end)
  const validSegments = allSegments.filter((segment) => 
    segment.endTime > 0 && segment.startTime < segment.endTime
  );

  if (validSegments.length === 0) {
    console.log('⚠️ No valid subtitle segments after filtering');
    return {
      subtitleContent: '',
      currentTextStyle: undefined,
      fontFamilies: [],
    };
  }

  // Sort by start time and re-index
  validSegments.sort((a, b) => a.startTime - b.startTime);
  validSegments.forEach((segment, index) => {
    segment.index = index + 1;
  });
  
  console.log(`📝 Final subtitle count: ${validSegments.length} segments`);

  // Get current text style (for subtitles that don't have per-segment styling)
  const currentTextStyle = getTextStyleForSubtitle(textStyle.activeStyle);

  // Generate ASS content with styling and video dimensions
  const assResult = generateASSContent(validSegments, currentTextStyle, videoDimensions);

  console.log(
    `📝 Generated combined subtitle/textclip content: ${validSegments.length} segments (${subtitleSegments.length} subtitles + ${textClipSegments.length} text clips)`,
  );
  console.log('📝 Fonts used:', assResult.fontFamilies.join(', '));

  return {
    subtitleContent: assResult.content,
    currentTextStyle,
    fontFamilies: assResult.fontFamilies,
  };
}
