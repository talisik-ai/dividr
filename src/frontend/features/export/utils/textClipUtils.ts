/**
 * Text Clip Utilities
 * Handles text clip data extraction and formatting for export
 */
import { TextClipData } from '@/backend/ffmpeg/schema/ffmpegConfig';
import { VideoTrack } from '../../editor/stores/videoEditor/index';

/**
 * Extract text clip data from text tracks for FFmpeg rendering
 */
export function extractTextClips(
  textTracks: VideoTrack[],
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  fps: number,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  videoDimensions: { width: number; height: number },
): TextClipData[] {
  if (textTracks.length === 0) {
    return [];
  }

  const textClips: TextClipData[] = textTracks.map((track) => {
    // Extract style with defaults
    const style = {
      fontFamily: track.textStyle?.fontFamily || '"Arial", sans-serif',
      fontWeight: track.textStyle?.fontWeight || '400',
      fontStyle: track.textStyle?.fontStyle || 'normal',
      isBold: track.textStyle?.isBold || false,
      isItalic: track.textStyle?.isItalic || false,
      isUnderline: track.textStyle?.isUnderline || false,
      textTransform: track.textStyle?.textTransform || ('none' as const),
      textAlign: track.textStyle?.textAlign || ('center' as const),
      fontSize: track.textStyle?.fontSize || 18,
      fillColor: track.textStyle?.fillColor || '#FFFFFF',
      strokeColor: track.textStyle?.strokeColor || '#000000',
      backgroundColor: track.textStyle?.backgroundColor || 'rgba(0, 0, 0, 0.5)',
      hasShadow: track.textStyle?.hasShadow || false,
      letterSpacing: track.textStyle?.letterSpacing || 0,
      lineSpacing: track.textStyle?.lineSpacing || 1.2,
      hasGlow: track.textStyle?.hasGlow || false,
      opacity: track.textStyle?.opacity || 100,
    };

    // Extract transform with defaults (normalized coordinates)
    const transform = {
      x: track.textTransform?.x || 0,
      y: track.textTransform?.y || 0,
      scale: track.textTransform?.scale || 1,
      rotation: track.textTransform?.rotation || 0,
    };

    // Calculate duration in frames
    const duration = track.endFrame - track.startFrame;

    // Note: fontFile will be resolved by the backend during export
    // We just pass the font family name here
    const fontFile = style.fontFamily; // Backend will resolve to actual path

    return {
      id: track.id,
      content: track.textContent || '',
      type: track.textType || 'body',
      startFrame: track.startFrame,
      endFrame: track.endFrame,
      duration,
      style,
      transform,
      fontFile, // Font family name (backend resolves to path)
    };
  });

  console.log(
    `📝 Extracted ${textClips.length} text clips for export`,
    textClips,
  );

  return textClips;
}

/**
 * Generate text clip content result
 */
export interface TextClipGenerationResult {
  textClips: TextClipData[];
  textClipsContent?: string; // Reserved for future ASS generation
}

/**
 * Generate text clip data for export
 */
export function generateTextClipContent(
  textTracks: VideoTrack[],
  fps: number,
  videoDimensions: { width: number; height: number },
): TextClipGenerationResult {
  const textClips = extractTextClips(textTracks, fps, videoDimensions);

  return {
    textClips,
    textClipsContent: undefined, // Backend will generate ASS content
  };
}
