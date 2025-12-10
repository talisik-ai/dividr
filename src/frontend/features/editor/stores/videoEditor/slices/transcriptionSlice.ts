/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { getNextAvailableRowIndex } from '../../../timeline/utils/dynamicTrackRows';
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

const resolveSubtitleRowIndex = (
  tracks: VideoTrack[],
  providedRowIndex?: number,
  preferNewRow = false,
): number => {
  if (providedRowIndex !== undefined) {
    return providedRowIndex;
  }

  const subtitleIndices = tracks
    .filter((t) => t.type === 'subtitle')
    .map((t) => t.trackRowIndex ?? 0);

  if (subtitleIndices.length > 0) {
    if (preferNewRow) {
      return Math.max(...subtitleIndices) + 1;
    }
    return subtitleIndices[0];
  }

  // Default to overlay positioning above video (minimum index 1)
  return Math.max(1, getNextAvailableRowIndex(tracks, 'subtitle'));
};

export interface TranscriptionSlice {
  // State
  isTranscribing: boolean;
  currentTranscribingMediaId: string | null;
  currentTranscribingTrackId: string | null;
  transcriptionProgress: {
    stage: 'loading' | 'processing' | 'complete' | 'error';
    progress: number;
    message?: string;
  } | null;

  // Actions
  generateKaraokeSubtitlesFromTrack: (
    trackId: string,
    options?: {
      keepExistingSubtitles?: boolean;
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
      processOnlyThisSegment?: boolean; // If true, only process this specific track/segment; if false/undefined, process all clips from source
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
  generateKaraokeSubtitles: (
    mediaId: string,
    options?: {
      keepExistingSubtitles?: boolean;
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
      sourceTrack?: VideoTrack; // Optional source track for timeline-aware positioning
      specificTrackId?: string; // Optional: only process this specific track/segment (for sliced clips)
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
  currentTranscribingMediaId: null,
  currentTranscribingTrackId: null,
  transcriptionProgress: null,

  setTranscriptionProgress: (progress) => {
    set({ transcriptionProgress: progress });
  },

  generateKaraokeSubtitlesFromTrack: async (trackId, options = {}) => {
    const state = get() as any;

    // Find the track
    const track = state.tracks?.find((t: any) => t.id === trackId);
    if (!track) {
      return {
        success: false,
        error: 'Track not found',
      };
    }

    // Only video and audio tracks can generate subtitles
    if (track.type !== 'video' && track.type !== 'audio') {
      return {
        success: false,
        error: 'Only video and audio tracks can generate karaoke subtitles',
      };
    }

    // Find the corresponding media library item
    const mediaItem = state.mediaLibrary?.find(
      (item: any) => item.source === track.source,
    );

    if (!mediaItem) {
      return {
        success: false,
        error: 'Media item not found in library',
      };
    }

    // Ensure subtitle track row is visible before starting transcription
    if (state.ensureTrackRowVisible) {
      state.ensureTrackRowVisible('subtitle');
    }

    // Use the existing generateKaraokeSubtitles method with the media ID
    // But track that this is from a track and pass track context
    set({ currentTranscribingTrackId: trackId });

    const result = await state.generateKaraokeSubtitles(mediaItem.id, {
      ...options,
      sourceTrack: track, // Pass track context for timeline-aware positioning
      // Only pass specificTrackId if explicitly requested via options
      // This allows Track Controllers to process ALL clips (don't pass it)
      // while Timeline Controllers can process specific selected segments (pass it)
      specificTrackId: options.processOnlyThisSegment ? trackId : undefined,
    });

    // Clear the track ID after completion
    set({ currentTranscribingTrackId: null });

    return result;
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
    set({
      isTranscribing: true,
      currentTranscribingMediaId: mediaId,
      transcriptionProgress: null,
    });

    try {
      let transcriptionResult;

      // Check if we have cached karaoke subtitles
      if (mediaItem.cachedKaraokeSubtitles) {
        console.log('✨ Using cached karaoke subtitles for:', mediaItem.name);
        transcriptionResult =
          mediaItem.cachedKaraokeSubtitles.transcriptionResult;

        // Simulate progress for UX consistency
        set({
          transcriptionProgress: {
            stage: 'loading',
            progress: 100,
            message: 'Loading from cache...',
          },
        });
      } else {
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
          set({
            isTranscribing: false,
            currentTranscribingMediaId: null,
            transcriptionProgress: null,
          });
          return {
            success: false,
            error: result.error || 'Transcription failed',
          };
        }

        transcriptionResult = result.result;

        console.log('✅ Transcription successful');
        console.log('   Segments:', transcriptionResult.segments.length);
        console.log('   Language:', transcriptionResult.language);
        console.log(
          '   Language Confidence:',
          transcriptionResult.language_probability,
        );
        console.log('   Duration:', transcriptionResult.duration);
        console.log('   Processing Time:', transcriptionResult.processing_time);
        console.log('   Model:', transcriptionResult.model);
        console.log('   Device:', transcriptionResult.device);
        if (transcriptionResult.real_time_factor) {
          console.log(
            '   Speed:',
            transcriptionResult.real_time_factor.toFixed(2) + 'x',
            transcriptionResult.faster_than_realtime ? '🚀' : '',
          );
        }
        console.log('\n📝 Full Transcription Result:');
        console.log(JSON.stringify(transcriptionResult, null, 2));

        // Cache the transcription result
        if (state.updateMediaLibraryItem) {
          state.updateMediaLibraryItem(mediaId, {
            cachedKaraokeSubtitles: {
              transcriptionResult,
              generatedAt: Date.now(),
            },
          });
        }
      }

      // Convert Whisper segments to subtitle tracks (word-level karaoke)
      const fps = state.timeline?.fps || 30;
      const currentTrackCount = state.tracks?.length || 0;
      const subtitleRowIndex = resolveSubtitleRowIndex(
        state.tracks || [],
        undefined,
        Boolean(options.keepExistingSubtitles),
      );

      // Timeline-aware positioning: Calculate offset based on source track
      const sourceTrack = options.sourceTrack; // Track context passed from generateKaraokeSubtitlesFromTrack
      const specificTrackId = options.specificTrackId; // Optional: only process this specific track/segment

      // Determine which clips to process
      let clipsToProcess: any[] = [];

      if (sourceTrack) {
        if (specificTrackId) {
          // SPECIFIC SEGMENT MODE: Only process the selected track/segment
          // This is used when generating from a specific selected clip (including sliced segments)
          const specificTrack = state.tracks.find(
            (t: any) => t.id === specificTrackId,
          );
          if (specificTrack) {
            clipsToProcess = [specificTrack];
            console.log('🎯 Specific segment subtitle generation:', {
              trackId: specificTrack.id,
              trackName: specificTrack.name,
              startFrame: specificTrack.startFrame,
              endFrame: specificTrack.endFrame,
              sourceStartTime: specificTrack.sourceStartTime || 0,
            });
          }
        } else {
          // ALL CLIPS MODE: Find all clips from the same source (for multi-track selection)
          clipsToProcess = state.tracks.filter(
            (t: any) =>
              t.source === sourceTrack.source &&
              t.type === sourceTrack.type &&
              (t.type === 'video' || t.type === 'audio') &&
              !t.muted,
          );
          console.log('🎯 Multi-clip subtitle generation:', {
            sourceTrackName: sourceTrack.name,
            totalClipsFromSource: clipsToProcess.length,
            clips: clipsToProcess.map((c: any) => ({
              id: c.id,
              startFrame: c.startFrame,
              endFrame: c.endFrame,
              sourceStartTime: c.sourceStartTime || 0,
            })),
          });
        }
      }

      if (clipsToProcess.length === 0 && !sourceTrack) {
        // LEGACY MODE: Media Library workflow - place at timeline start
        console.log(
          '📚 Media Library workflow - placing subtitles at timeline start',
        );
      }

      const subtitleTracks: Omit<VideoTrack, 'id'>[] = [];

      // Process each segment and create word-level subtitle tracks
      transcriptionResult.segments.forEach((segment: any) => {
        if (segment.words && segment.words.length > 0) {
          // Create a track for each word (karaoke style)
          segment.words.forEach((word: any) => {
            // Calculate absolute timestamp in source media
            const wordStartInSource = word.start; // Absolute time in source media
            const wordEndInSource = word.end;

            // Find which clip(s) this word belongs to (handles sliced clips)
            if (sourceTrack && clipsToProcess.length > 0) {
              // Check each clip to process (either specific segment or all clips from source)
              clipsToProcess.forEach((clip: any) => {
                const clipSourceStart = clip.sourceStartTime || 0;
                const clipDuration = (clip.endFrame - clip.startFrame) / fps;
                const clipSourceEnd = clipSourceStart + clipDuration;

                // Check if word falls within this clip's source range
                if (
                  wordStartInSource >= clipSourceStart &&
                  wordStartInSource < clipSourceEnd
                ) {
                  // Calculate timeline position for this clip
                  const relativeStartTime = wordStartInSource - clipSourceStart;
                  const relativeEndTime = wordEndInSource - clipSourceStart;

                  const startFrame =
                    Math.round(relativeStartTime * fps) + clip.startFrame;
                  const endFrame =
                    Math.round(relativeEndTime * fps) + clip.startFrame;

                  // Ensure valid frame range and within clip boundaries
                  if (
                    endFrame > startFrame &&
                    startFrame >= clip.startFrame &&
                    endFrame <= clip.endFrame
                  ) {
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
                      color: getTrackColor(
                        currentTrackCount + subtitleTracks.length,
                      ),
                      subtitleText: word.word,
                      subtitleType: 'karaoke' as const, // Mark as karaoke subtitle
                      trackRowIndex: subtitleRowIndex,
                      // Store RELATIVE timing (relative to clip start)
                      sourceStartTime: relativeStartTime,
                      sourceDuration: relativeEndTime - relativeStartTime,
                      // Store original absolute timing for reference
                      subtitleStartTime: wordStartInSource,
                      subtitleEndTime: wordEndInSource,
                      // NO LINKING - subtitles are independent
                    });
                  }
                }
              });
            } else {
              // LEGACY MODE: Media Library workflow - place at timeline start
              const startFrame = Math.round(wordStartInSource * fps);
              const endFrame = Math.round(wordEndInSource * fps);

              if (endFrame > startFrame) {
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
                  color: getTrackColor(
                    currentTrackCount + subtitleTracks.length,
                  ),
                  subtitleText: word.word,
                  subtitleType: 'karaoke' as const, // Mark as karaoke subtitle
                  trackRowIndex: subtitleRowIndex,
                  sourceStartTime: wordStartInSource,
                  sourceDuration: wordEndInSource - wordStartInSource,
                  subtitleStartTime: wordStartInSource,
                  subtitleEndTime: wordEndInSource,
                  // NO LINKING - subtitles are independent
                });
              }
            }
          });
        } else {
          // Fallback: create segment-level track if no word timestamps
          const segmentStartInSource = segment.start;
          const segmentEndInSource = segment.end;

          // Find which clip(s) this segment belongs to (handles sliced clips)
          if (sourceTrack && clipsToProcess.length > 0) {
            // Check each clip to process (either specific segment or all clips from source)
            clipsToProcess.forEach((clip: any) => {
              const clipSourceStart = clip.sourceStartTime || 0;
              const clipDuration = (clip.endFrame - clip.startFrame) / fps;
              const clipSourceEnd = clipSourceStart + clipDuration;

              // Check if segment falls within this clip's source range
              if (
                segmentStartInSource >= clipSourceStart &&
                segmentStartInSource < clipSourceEnd
              ) {
                // Calculate timeline position for this clip
                const relativeStartTime =
                  segmentStartInSource - clipSourceStart;
                const relativeEndTime = segmentEndInSource - clipSourceStart;

                const startFrame =
                  Math.floor(relativeStartTime * fps) + clip.startFrame;
                const endFrame =
                  Math.ceil(relativeEndTime * fps) + clip.startFrame;

                // Ensure valid frame range and within clip boundaries
                if (
                  endFrame > startFrame &&
                  startFrame >= clip.startFrame &&
                  endFrame <= clip.endFrame
                ) {
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
                    color: getTrackColor(
                      currentTrackCount + subtitleTracks.length,
                    ),
                    subtitleText: segment.text,
                    subtitleType: 'karaoke' as const, // Mark as karaoke subtitle
                    trackRowIndex: subtitleRowIndex,
                    sourceStartTime: relativeStartTime,
                    sourceDuration: relativeEndTime - relativeStartTime,
                    subtitleStartTime: segmentStartInSource,
                    subtitleEndTime: segmentEndInSource,
                    // NO LINKING - subtitles are independent
                  });
                }
              }
            });
          } else {
            // LEGACY MODE: Media Library workflow - place at timeline start
            const startFrame = Math.floor(segmentStartInSource * fps);
            const endFrame = Math.ceil(segmentEndInSource * fps);

            if (endFrame > startFrame) {
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
                subtitleType: 'karaoke' as const, // Mark as karaoke subtitle
                trackRowIndex: subtitleRowIndex,
                sourceStartTime: segmentStartInSource,
                sourceDuration: segmentEndInSource - segmentStartInSource,
                subtitleStartTime: segmentStartInSource,
                subtitleEndTime: segmentEndInSource,
                // NO LINKING - subtitles are independent
              });
            }
          }
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
      // Ensure subtitle track row is visible
      if (state.ensureTrackRowVisible) {
        state.ensureTrackRowVisible('subtitle');
        console.log('📝 Auto-showed Subtitle track row');
      }

      // Mark media as having generated karaoke subtitles
      if (state.updateMediaLibraryItem) {
        state.updateMediaLibraryItem(mediaId, {
          hasGeneratedKaraoke: true,
        });
      }

      set({
        isTranscribing: false,
        currentTranscribingMediaId: null,
        transcriptionProgress: null,
      });

      return {
        success: true,
        trackIds,
        transcriptionResult, // Include full transcription result
      };
    } catch (error) {
      console.error('❌ Karaoke subtitle generation failed:', error);
      window.electronAPI.removeWhisperProgressListener();
      set({
        isTranscribing: false,
        currentTranscribingMediaId: null,
        transcriptionProgress: null,
      });
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
      set({
        isTranscribing: false,
        currentTranscribingMediaId: null,
        currentTranscribingTrackId: null,
        transcriptionProgress: null,
      });
    } catch (error) {
      console.error('Failed to cancel transcription:', error);
    }
  },
});
