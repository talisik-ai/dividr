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
      model?:
        | 'tiny'
        | 'base'
        | 'small'
        | 'medium'
        | 'large'
        | 'large-v2'
        | 'large-v3';
      language?: string;
      device?: 'cpu' | 'cuda';
      computeType?: 'int8' | 'int16' | 'float16' | 'float32';
      beamSize?: number;
      vad?: boolean;
      onProgress?: (progress: {
        stage: 'loading' | 'processing' | 'complete' | 'error';
        progress: number;
        message?: string;
      }) => void;
    },
  ) => Promise<{
    success: boolean;
    trackIds?: string[];
    transcriptionResult?: {
      segments: Array<{
        start: number;
        end: number;
        text: string;
        words?: Array<{
          word: string;
          start: number;
          end: number;
          confidence: number;
        }>;
      }>;
      language: string;
      language_probability: number;
      duration: number;
      text: string;
      processing_time: number;
      model: string;
      device: string;
      segment_count: number;
      real_time_factor?: number;
      faster_than_realtime?: boolean;
    };
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

      // Call Python Faster-Whisper transcription
      const result = await window.electronAPI.whisperTranscribe(audioPath, {
        model: options.model || 'base',
        language: options.language, // Omit for auto-detect
        device: options.device || 'cpu',
        computeType: options.computeType || 'int8',
        beamSize: options.beamSize || 5,
        vad: options.vad !== false, // Enable VAD by default
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
      console.log(
        '   Language Confidence:',
        result.result.language_probability,
      );
      console.log('   Duration:', result.result.duration);
      console.log('   Processing Time:', result.result.processing_time);
      console.log('   Model:', result.result.model);
      console.log('   Device:', result.result.device);
      if (result.result.real_time_factor) {
        console.log(
          '   Speed:',
          result.result.real_time_factor.toFixed(2) + 'x',
          result.result.faster_than_realtime ? '🚀' : '',
        );
      }
      console.log('\n📝 Full Transcription Result:');
      console.log(JSON.stringify(result.result, null, 2));

      // Convert Whisper segments to subtitle tracks (word-level karaoke)
      const fps = state.timeline?.fps || 30;
      const currentTrackCount = state.tracks?.length || 0;

      const subtitleTracks: Omit<VideoTrack, 'id'>[] = [];

      // Process each segment and create word-level subtitle tracks
      result.result.segments.forEach((segment) => {
        if (segment.words && segment.words.length > 0) {
          // Create a track for each word (karaoke style)
          segment.words.forEach((word) => {
            // Use Math.round for both to prevent overlaps at exact boundaries (e.g., 9.24 → 9.24)
            // This ensures exclusive end frames: [start, end) interval
            const startFrame = Math.round(word.start * fps);
            const endFrame = Math.round(word.end * fps);

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
        transcriptionResult: result.result, // Include full transcription result
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
