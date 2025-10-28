/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { VideoTrack } from '../types/track.types';

const TRACK_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#6366f1',
  '#f97316',
  '#14b8a6',
  '#a855f7',
];

const getTrackColor = (index: number) =>
  TRACK_COLORS[index % TRACK_COLORS.length];

export interface TranscriptionSlice {
  // State
  isTranscribing: boolean;
  transcriptionProgress: {
    stage: 'loading' | 'processing' | 'complete' | 'error';
    progress: number;
    message?: string;
  } | null;

  // Actions
  generateKaraokeSubtitles: (
    mediaId: string,
    options?: {
      model?: 'tiny' | 'base' | 'small' | 'medium' | 'large' | 'large-v3';
      language?: string;
      onProgress?: (progress: {
        stage: 'loading' | 'processing' | 'complete' | 'error';
        progress: number;
        message?: string;
      }) => void;
    },
  ) => Promise<{
    success: boolean;
    trackIds?: string[];
    error?: string;
  }>;

  setTranscriptionProgress: (
    progress: {
      stage: 'loading' | 'processing' | 'complete' | 'error';
      progress: number;
      message?: string;
    } | null,
  ) => void;

  cancelTranscription: () => Promise<void>;
}

export const createTranscriptionSlice: StateCreator<
  TranscriptionSlice,
  [],
  [],
  TranscriptionSlice
> = (set, get) => ({
  isTranscribing: false,
  transcriptionProgress: null,

  setTranscriptionProgress: (progress) => {
    set({ transcriptionProgress: progress });
  },

  generateKaraokeSubtitles: async (mediaId, options = {}) => {
    const state = get() as any;

    // Find media item
    const mediaItem = state.mediaLibrary?.find(
      (item: any) => item.id === mediaId,
    );

    if (!mediaItem) {
      return {
        success: false,
        error: 'Media item not found',
      };
    }

    // Validate that media has audio
    let audioPath: string | null = null;

    if (mediaItem.type === 'audio') {
      // Audio file - use directly
      audioPath = mediaItem.source;
    } else if (mediaItem.type === 'video') {
      // Video file - check if audio has been extracted
      if (mediaItem.extractedAudio?.audioPath) {
        audioPath = mediaItem.extractedAudio.audioPath;
      } else {
        // Check if video has audio stream
        try {
          const hasAudioResult = await window.electronAPI.mediaHasAudio(
            mediaItem.source,
          );

          if (!hasAudioResult.success) {
            return {
              success: false,
              error: hasAudioResult.error || 'Failed to check audio stream',
            };
          }

          if (!hasAudioResult.hasAudio) {
            return {
              success: false,
              error:
                'This video file does not contain an audio track. Please select a file with audio.',
            };
          }

          // Video has audio but not extracted yet - extract it first
          console.log('🎵 Extracting audio from video for transcription...');
          const extractResult = await window.electronAPI.extractAudioFromVideo(
            mediaItem.source,
          );

          if (!extractResult.success || !extractResult.audioPath) {
            return {
              success: false,
              error:
                extractResult.error ||
                'Failed to extract audio from video. Please try again.',
            };
          }

          audioPath = extractResult.audioPath;

          // Update media library with extracted audio
          if (state.updateMediaLibraryItem) {
            state.updateMediaLibraryItem(mediaId, {
              extractedAudio: {
                audioPath: extractResult.audioPath,
                previewUrl: extractResult.previewUrl,
                size: extractResult.size || 0,
                extractedAt: Date.now(),
              },
            });
          }
        } catch (error) {
          console.error('Error checking/extracting audio:', error);
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to process audio',
          };
        }
      }
    } else {
      return {
        success: false,
        error:
          'Invalid media type. Only audio and video files can be transcribed.',
      };
    }

    if (!audioPath) {
      return {
        success: false,
        error: 'Could not determine audio source for transcription',
      };
    }

    // Start transcription
    set({ isTranscribing: true, transcriptionProgress: null });

    try {
      console.log('🎤 Starting Whisper transcription...');
      console.log('   Audio path:', audioPath);
      console.log('   Model:', options.model);

      // Setup progress listener
      const progressListener = (progress: {
        stage: 'loading' | 'processing' | 'complete' | 'error';
        progress: number;
        message?: string;
      }) => {
        set({ transcriptionProgress: progress });
        if (options.onProgress) {
          options.onProgress(progress);
        }
      };

      window.electronAPI.onWhisperProgress(progressListener);

      // Call Whisper transcription
      const result = await window.electronAPI.whisperTranscribe(audioPath, {
        model: options.model || 'base',
        language: options.language,
        wordTimestamps: true, // Enable word-level timestamps for karaoke
      });

      // Remove progress listener
      window.electronAPI.removeWhisperProgressListener();

      if (!result.success || !result.result) {
        set({ isTranscribing: false, transcriptionProgress: null });
        return {
          success: false,
          error: result.error || 'Transcription failed',
        };
      }

      console.log('✅ Transcription successful');
      console.log('   Segments:', result.result.segments.length);
      console.log('   Language:', result.result.language);
      console.log('   Duration:', result.result.duration);

      // Convert Whisper segments to subtitle tracks (word-level karaoke)
      const fps = state.timeline?.fps || 30;
      const currentTrackCount = state.tracks?.length || 0;

      const subtitleTracks: Omit<VideoTrack, 'id'>[] = [];

      // Process each segment and create word-level subtitle tracks
      result.result.segments.forEach((segment) => {
        if (segment.words && segment.words.length > 0) {
          // Create a track for each word (karaoke style)
          segment.words.forEach((word) => {
            const startFrame = Math.floor(word.start * fps);
            const endFrame = Math.ceil(word.end * fps);

            subtitleTracks.push({
              type: 'subtitle',
              name: word.word,
              source: audioPath || mediaItem.source,
              previewUrl: mediaItem.previewUrl,
              duration: endFrame - startFrame,
              startFrame,
              endFrame,
              visible: true,
              locked: false,
              color: getTrackColor(currentTrackCount + subtitleTracks.length),
              subtitleText: word.word,
              subtitleStartTime: word.start,
              subtitleEndTime: word.end,
            });
          });
        } else {
          // Fallback: create segment-level track if no word timestamps
          const startFrame = Math.floor(segment.start * fps);
          const endFrame = Math.ceil(segment.end * fps);

          subtitleTracks.push({
            type: 'subtitle',
            name:
              segment.text.length > 30
                ? segment.text.substring(0, 30) + '...'
                : segment.text,
            source: audioPath || mediaItem.source,
            previewUrl: mediaItem.previewUrl,
            duration: endFrame - startFrame,
            startFrame,
            endFrame,
            visible: true,
            locked: false,
            color: getTrackColor(currentTrackCount + subtitleTracks.length),
            subtitleText: segment.text,
            subtitleStartTime: segment.start,
            subtitleEndTime: segment.end,
          });
        }
      });

      console.log(
        `📝 Created ${subtitleTracks.length} karaoke subtitle tracks`,
      );

      // Add tracks to timeline using batch operation for better performance
      console.log(
        `🚀 Adding ${subtitleTracks.length} karaoke subtitle tracks in batch...`,
      );
      const trackIds = await state.addTracks(subtitleTracks);

      console.log(
        `✅ Added ${trackIds.length} karaoke subtitle tracks to timeline`,
      );

      set({ isTranscribing: false, transcriptionProgress: null });

      return {
        success: true,
        trackIds,
      };
    } catch (error) {
      console.error('❌ Karaoke subtitle generation failed:', error);
      window.electronAPI.removeWhisperProgressListener();
      set({ isTranscribing: false, transcriptionProgress: null });

      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate karaoke subtitles',
      };
    }
  },

  cancelTranscription: async () => {
    try {
      await window.electronAPI.whisperCancel();
      window.electronAPI.removeWhisperProgressListener();
      set({ isTranscribing: false, transcriptionProgress: null });
    } catch (error) {
      console.error('Failed to cancel transcription:', error);
    }
  },
});
