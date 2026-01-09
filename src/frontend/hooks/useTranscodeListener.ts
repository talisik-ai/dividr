/**
 * Hook to listen for transcode progress and completion events
 * Updates the media library when transcoding status changes
 */
import { useVideoEditorStore } from '@/frontend/features/editor/stores/videoEditor/index';
import { useCallback, useEffect } from 'react';

interface TranscodeProgressEvent {
  jobId: string;
  mediaId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentTime: number;
  duration: number;
}

interface TranscodeCompletedEvent {
  jobId: string;
  mediaId: string;
  success: boolean;
  outputPath?: string;
  previewUrl?: string;
  error?: string;
}

export function useTranscodeListener() {
  const updateMediaLibraryItem = useVideoEditorStore(
    (state) => state.updateMediaLibraryItem,
  );
  const getMediaLibraryItem = useVideoEditorStore(
    (state) => state.getMediaLibraryItem,
  );
  const tracks = useVideoEditorStore((state) => state.tracks);
  const updateTrack = useVideoEditorStore((state) => state.updateTrack);

  // Handle progress updates
  const handleProgress = useCallback(
    (event: TranscodeProgressEvent) => {
      const mediaItem = getMediaLibraryItem(event.mediaId);
      if (!mediaItem) return;

      // Only update if transcoding is in progress
      if (
        mediaItem.transcoding?.status === 'pending' ||
        mediaItem.transcoding?.status === 'processing'
      ) {
        updateMediaLibraryItem(event.mediaId, {
          transcoding: {
            ...mediaItem.transcoding,
            status: event.status as
              | 'pending'
              | 'processing'
              | 'completed'
              | 'failed',
            progress: event.progress,
            jobId: event.jobId,
          },
        });
      }
    },
    [getMediaLibraryItem, updateMediaLibraryItem],
  );

  // Handle completion
  const handleCompleted = useCallback(
    (event: TranscodeCompletedEvent) => {
      const mediaItem = getMediaLibraryItem(event.mediaId);
      if (!mediaItem) return;

      if (event.success && event.previewUrl) {
        console.log(
          `✅ Transcode completed for ${mediaItem.name}: ${event.previewUrl}`,
        );

        // Update media with transcoded source
        updateMediaLibraryItem(event.mediaId, {
          transcoding: {
            required: true,
            status: 'completed',
            progress: 100,
            jobId: event.jobId,
            transcodedPath: event.outputPath,
            transcodedPreviewUrl: event.previewUrl,
            completedAt: Date.now(),
          },
          // Update the preview URL to use the transcoded file
          previewUrl: event.previewUrl,
        });

        // Also update any existing tracks that use this media
        // This ensures the preview updates for tracks already on the timeline
        const tracksUsingMedia = tracks.filter(
          (track) =>
            track.mediaId === event.mediaId ||
            track.source === mediaItem.source ||
            track.source === mediaItem.tempFilePath,
        );

        tracksUsingMedia.forEach((track) => {
          console.log(
            `🔄 Updating track ${track.name} with transcoded preview URL`,
          );
          updateTrack(track.id, {
            previewUrl: event.previewUrl,
          });
        });
      } else {
        console.error(
          `❌ Transcode failed for ${mediaItem.name}: ${event.error}`,
        );

        updateMediaLibraryItem(event.mediaId, {
          transcoding: {
            required: true,
            status: 'failed',
            progress: 0,
            jobId: event.jobId,
            error: event.error || 'Unknown error',
          },
        });
      }
    },
    [getMediaLibraryItem, updateMediaLibraryItem, tracks, updateTrack],
  );

  useEffect(() => {
    // Check if electronAPI is available
    if (typeof window === 'undefined' || !window.electronAPI) {
      return;
    }

    // Set up listeners
    window.electronAPI.onTranscodeProgress(handleProgress);
    window.electronAPI.onTranscodeCompleted(handleCompleted);

    // Cleanup on unmount
    return () => {
      window.electronAPI.removeTranscodeListeners();
    };
  }, [handleProgress, handleCompleted]);
}

export default useTranscodeListener;
