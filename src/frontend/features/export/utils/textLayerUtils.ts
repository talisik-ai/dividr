/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Text Layer Utilities
 * Handles text layer data extraction for export
 * Text layers are processed as FFmpeg drawtext filters in the filter complex
 */
import { TextSegment } from '@/backend/ffmpeg/subtitles/textLayers';
import {
  useVideoEditorStore,
  VideoTrack,
} from '../../editor/stores/videoEditor/index';

interface TextLayerGenerationResult {
  textSegments: TextSegment[];
  currentTextStyle: any;
}

/**
 * Generate text segments from text tracks
 * Text segments will be converted to FFmpeg drawtext filters in the backend
 * @param timelineStartFrame - Optional start frame of the export range (for offsetting timestamps)
 */
export function generateTextLayerSegments(
  textTracks: VideoTrack[],
  textStyle: any,
  getTextStyleForSubtitle: (styleId: string) => any,
  videoDimensions?: { width: number; height: number },
  timelineStartFrame?: number,
): TextLayerGenerationResult {
  // Get timeline data non-reactively
  const { timeline } = useVideoEditorStore.getState();

  // Calculate time offset if export starts at a specific frame
  const timeOffset =
    timelineStartFrame !== undefined ? timelineStartFrame / timeline.fps : 0;

  if (timeOffset > 0) {
    console.log(
      `📝 [TextLayers] Export starts at frame ${timelineStartFrame} (${timeOffset.toFixed(3)}s)`,
    );
  }

  // Extract text segments from text tracks with frame-based timing
  const textSegments: TextSegment[] =
    textTracks.length > 0
      ? textTracks.map((track, index) => {
          // Calculate timing relative to export start frame
          const relativeStartFrame = Math.max(
            0,
            track.startFrame - (timelineStartFrame || 0),
          );
          const relativeEndFrame = Math.max(
            0,
            track.endFrame - (timelineStartFrame || 0),
          );

          const startTime = relativeStartFrame / timeline.fps;
          const endTime = relativeEndFrame / timeline.fps;

          console.log(
            `[TextLayers] "${track.textContent?.substring(0, 30)}" - frames ${track.startFrame}-${track.endFrame} -> relative ${relativeStartFrame}-${relativeEndFrame} -> ${startTime.toFixed(3)}s-${endTime.toFixed(3)}s`,
          );

          // Convert track textStyle to text layer style format
          const style = {
            fontFamily: track.textStyle?.fontFamily,
            fontWeight: track.textStyle?.isBold
              ? '700'
              : track.textStyle?.fontWeight || '400',
            fontStyle: track.textStyle?.isItalic
              ? 'italic'
              : track.textStyle?.fontStyle || 'normal',
            isUnderline: track.textStyle?.isUnderline,
            textTransform: track.textStyle?.textTransform,
            fontSize: track.textStyle?.fontSize
              ? `${track.textStyle.fontSize}px`
              : undefined,
            color: track.textStyle?.fillColor,
            strokeColor: track.textStyle?.strokeColor,
            backgroundColor: track.textStyle?.backgroundColor,
            hasShadow: track.textStyle?.hasShadow,
            hasGlow: track.textStyle?.hasGlow,
            opacity: track.textStyle?.opacity,
            letterSpacing: track.textStyle?.letterSpacing
              ? `${track.textStyle.letterSpacing}px`
              : undefined,
            lineHeight: track.textStyle?.lineSpacing,
            textAlign: track.textStyle?.textAlign,
          };

          // Convert transform to position (normalized coordinates)
          const position = track.textTransform
            ? {
                x: (track.textTransform.x + 1) / 2, // Convert from [-1,1] to [0,1]
                y: (track.textTransform.y + 1) / 2, // Convert from [-1,1] to [0,1]
                scale: track.textTransform.scale || 1,
                rotation: track.textTransform.rotation || 0,
              }
            : undefined;

          // Clean up text
          const cleanText = (track.textContent || '')
            .replace(/\n\s*$/, '')
            .trim();

          return {
            startTime,
            endTime,
            text: cleanText,
            index: index + 1,
            layer: track.layer ?? 0, // Layer index for proper overlay ordering
            style,
            position,
          };
        })
      : [];

  if (textSegments.length === 0) {
    console.log('📝 [TextLayers] No text segments to process');
    return {
      textSegments: [],
      currentTextStyle: undefined,
    };
  }

  // Filter out segments that have invalid timing
  const validSegments = textSegments.filter(
    (segment) => segment.endTime > 0 && segment.startTime < segment.endTime,
  );

  if (validSegments.length === 0) {
    console.log('⚠️ [TextLayers] No valid text segments after filtering');
    return {
      textSegments: [],
      currentTextStyle: undefined,
    };
  }

  // Sort by start time and re-index
  validSegments.sort((a, b) => a.startTime - b.startTime);
  validSegments.forEach((segment, index) => {
    segment.index = index + 1;
  });

  console.log(`📝 [TextLayers] Final text segment count: ${validSegments.length} segments`);

  // Get current text style
  const currentTextStyle = getTextStyleForSubtitle(textStyle.activeStyle);

  return {
    textSegments: validSegments,
    currentTextStyle,
  };
}
