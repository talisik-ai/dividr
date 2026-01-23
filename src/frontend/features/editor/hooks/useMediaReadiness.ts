import { useVideoEditorStore } from '../stores/videoEditor';

/**
 * Hook to check if a media item is fully ready for timeline display.
 * Implementing "Snap" behavior:
 * - Video: Waits for Transcoding + Sprites + Waveform
 * - Audio: Waits for Waveform
 * - Others: Ready immediately
 */
export const useMediaReadiness = (mediaId?: string): boolean => {
  const mediaItem = useVideoEditorStore((state) =>
    mediaId ? state.mediaLibrary.find((m) => m.id === mediaId) : undefined
  );

  if (!mediaId || !mediaItem) return true; // Non-media tracks or not found are treated as ready (or handled elsewhere)

  // Audio Readiness: Immediate once waveform is ready
  if (mediaItem.type === 'audio') {
    // Ready when waveform is calculated (success or fail)
    return !!mediaItem.waveform;
  }

  // Video Readiness: Coordinated "Snap"
  if (mediaItem.type === 'video') {
    // Check transcoding status
    // Note: If transcoding is undefined, we assume not required (or check hasn't run, but sprites protect us)
    const isTranscoding = 
      mediaItem.transcoding?.status === 'processing' || 
      mediaItem.transcoding?.status === 'pending';
      
    const isWaveformReady = !!mediaItem.waveform;
    const isSpritesReady = !!mediaItem.spriteSheets;

    // Requirement: "Wait until both [sprites and waveform] are ready." and "Transcoding is complete"
    return !isTranscoding && isWaveformReady && isSpritesReady;
  }

  // Image/Subtitle Readiness
  return true;
};
