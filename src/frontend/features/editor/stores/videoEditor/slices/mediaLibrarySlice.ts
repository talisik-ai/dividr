/* eslint-disable @typescript-eslint/no-explicit-any */
import AudioWaveformGenerator from '@/backend/frontend_use/audioWaveformGenerator';
import { VideoSpriteSheetGenerator } from '@/backend/frontend_use/videoSpriteSheetGenerator';
import { VideoThumbnailGenerator } from '@/backend/frontend_use/videoThumbnailGenerator';
import { projectService } from '@/backend/services/projectService';
import { v4 as uuidv4 } from 'uuid';
import { StateCreator } from 'zustand';
import { MediaLibraryItem } from '../types';

export interface MediaLibrarySlice {
  mediaLibrary: MediaLibraryItem[];
  generatingSpriteSheets: Set<string>;
  generatingWaveforms: Set<string>;
  addToMediaLibrary: (item: Omit<MediaLibraryItem, 'id'>) => string;
  removeFromMediaLibrary: (mediaId: string, force?: boolean) => void;
  updateMediaLibraryItem: (
    mediaId: string,
    updates: Partial<MediaLibraryItem>,
  ) => void;
  getMediaLibraryItem: (mediaId: string) => MediaLibraryItem | undefined;
  clearMediaLibrary: () => void;
  getSpriteSheetsBySource: (
    source: string,
  ) => MediaLibraryItem['spriteSheets'] | undefined;
  isGeneratingSpriteSheet: (mediaId: string) => boolean;
  setGeneratingSpriteSheet: (mediaId: string, isGenerating: boolean) => void;
  generateSpriteSheetForMedia: (mediaId: string) => Promise<boolean>;
  generateThumbnailForMedia: (mediaId: string) => Promise<boolean>;
  updateProjectThumbnailFromTimeline: () => Promise<void>;
  getWaveformBySource: (
    source: string,
  ) => MediaLibraryItem['waveform'] | undefined;
  isGeneratingWaveform: (mediaId: string) => boolean;
  setGeneratingWaveform: (mediaId: string, isGenerating: boolean) => void;
  generateWaveformForMedia: (mediaId: string) => Promise<boolean>;

  // State management helpers
  markUnsavedChanges?: () => void;
  updateTrack?: (trackId: string, updates: any) => void;
  removeTrack?: (trackId: string) => void;
}

export const createMediaLibrarySlice: StateCreator<
  MediaLibrarySlice,
  [],
  [],
  MediaLibrarySlice
> = (set, get) => ({
  mediaLibrary: [],
  generatingSpriteSheets: new Set<string>(),
  generatingWaveforms: new Set<string>(),

  addToMediaLibrary: (itemData) => {
    const id = uuidv4();
    const item: MediaLibraryItem = {
      ...itemData,
      id,
    };

    set((state: any) => ({
      mediaLibrary: [...state.mediaLibrary, item],
    }));

    const state = get() as any;
    state.markUnsavedChanges?.();

    return id;
  },

  removeFromMediaLibrary: (mediaId, force = false) => {
    const state = get() as any;
    const mediaItem = state.mediaLibrary?.find(
      (item: MediaLibraryItem) => item.id === mediaId,
    );

    if (!mediaItem) {
      console.warn(`Media item ${mediaId} not found`);
      return;
    }

    // Find all tracks that use this media (by source or tempFilePath)
    const affectedTracks = state.tracks?.filter(
      (track: any) =>
        track.source === mediaItem.source ||
        track.source === mediaItem.tempFilePath ||
        (mediaItem.extractedAudio &&
          track.source === mediaItem.extractedAudio.audioPath),
    );

    if (affectedTracks && affectedTracks.length > 0) {
      if (!force) {
        // Prevent deletion and throw error for UI to handle
        console.log(
          `🚫 Cannot delete media "${mediaItem.name}" - it's used by ${affectedTracks.length} track(s) on the timeline`,
        );
        console.log(
          'Affected tracks:',
          affectedTracks.map((t: any) => t.name),
        );

        throw new Error(
          `Cannot delete "${mediaItem.name}" - it's currently used by ${affectedTracks.length} track(s) on the timeline. Please remove the tracks first.`,
        );
      } else {
        // Force delete: cascade remove all affected tracks
        console.log(
          `⚠️ Force deleting media "${mediaItem.name}" and removing ${affectedTracks.length} track(s) from timeline`,
        );

        affectedTracks.forEach((track: any) => {
          console.log(`  - Removing track: ${track.name}`);
          state.removeTrack?.(track.id);
        });
      }
    }

    // Safe to delete - no tracks are using this media (or we force deleted them)
    console.log(`🗑️ Deleting media from library: ${mediaItem.name}`);

    set((state: any) => ({
      mediaLibrary: state.mediaLibrary.filter(
        (item: MediaLibraryItem) => item.id !== mediaId,
      ),
    }));

    state.markUnsavedChanges?.();
  },

  updateMediaLibraryItem: (mediaId, updates) => {
    set((state: any) => ({
      mediaLibrary: state.mediaLibrary.map((item: MediaLibraryItem) =>
        item.id === mediaId ? { ...item, ...updates } : item,
      ),
    }));

    if (updates.extractedAudio) {
      const state = get() as any;
      const mediaItem = state.mediaLibrary.find(
        (item: MediaLibraryItem) => item.id === mediaId,
      );
      if (mediaItem?.type === 'video') {
        console.log(
          `🔄 Extracted audio updated for video: ${mediaItem.name}, checking for linked audio tracks`,
        );

        // Find all audio tracks that are linked to video tracks from this source
        const linkedAudioTracks = state.tracks?.filter(
          (track: any) =>
            track.type === 'audio' &&
            track.isLinked &&
            track.source === mediaItem.source, // Currently using video source
        );

        // Update each linked audio track with the extracted audio source
        linkedAudioTracks?.forEach((audioTrack: any) => {
          console.log(
            `🎵 Updating linked audio track ${audioTrack.id} with extracted audio source`,
          );
          state.updateTrack?.(audioTrack.id, {
            source: updates.extractedAudio.audioPath,
            previewUrl: updates.extractedAudio.previewUrl,
            name: `${mediaItem.name.replace(/\.[^/.]+$/, '')} (Extracted Audio)`,
          });
        });
      }
    }

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  getMediaLibraryItem: (mediaId) => {
    const state = get() as any;
    return state.mediaLibrary.find(
      (item: MediaLibraryItem) => item.id === mediaId,
    );
  },

  clearMediaLibrary: () => {
    set(() => ({
      mediaLibrary: [],
    }));

    const state = get() as any;
    state.markUnsavedChanges?.();
  },

  getSpriteSheetsBySource: (source) => {
    const state = get() as any;
    const mediaItem = state.mediaLibrary.find(
      (item: MediaLibraryItem) =>
        item.source === source || item.tempFilePath === source,
    );
    return mediaItem?.spriteSheets;
  },

  isGeneratingSpriteSheet: (mediaId) => {
    const state = get() as any;
    return state.generatingSpriteSheets.has(mediaId);
  },

  setGeneratingSpriteSheet: (mediaId: string, isGenerating: boolean) => {
    set((state: MediaLibrarySlice) => {
      const newGeneratingSet = new Set<string>(state.generatingSpriteSheets);
      if (isGenerating) {
        newGeneratingSet.add(mediaId);
      } else {
        newGeneratingSet.delete(mediaId);
      }
      return {
        generatingSpriteSheets: newGeneratingSet,
      };
    });
  },

  getWaveformBySource: (source) => {
    const state = get() as any;
    const mediaItem = state.mediaLibrary.find(
      (item: MediaLibraryItem) => item.source === source,
    );
    return mediaItem?.waveform;
  },

  isGeneratingWaveform: (mediaId) => {
    const state = get() as any;
    return state.generatingWaveforms.has(mediaId);
  },

  setGeneratingWaveform: (mediaId: string, isGenerating: boolean) => {
    set((state: MediaLibrarySlice) => {
      const newGeneratingSet = new Set<string>(state.generatingWaveforms);
      if (isGenerating) {
        newGeneratingSet.add(mediaId);
      } else {
        newGeneratingSet.delete(mediaId);
      }
      return {
        generatingWaveforms: newGeneratingSet,
      };
    });
  },

  generateWaveformForMedia: async (mediaId: string) => {
    const state = get() as any;
    const mediaItem = state.mediaLibrary.find(
      (item: MediaLibraryItem) => item.id === mediaId,
    );
    if (!mediaItem) {
      console.error('Media item not found:', mediaId);
      return false;
    }

    // Only generate waveforms for audio files or video files with extracted audio
    const isAudioFile = mediaItem.type === 'audio';
    const isVideoWithExtractedAudio =
      mediaItem.type === 'video' && mediaItem.extractedAudio;

    if (!isAudioFile && !isVideoWithExtractedAudio) {
      console.log(
        `Skipping waveform generation for: ${mediaItem.name} (not audio or video with extracted audio)`,
      );
      return true; // Not an error, just not applicable
    }

    // Skip if waveform already exists
    if (mediaItem.waveform?.success) {
      console.log(`Waveform already exists for: ${mediaItem.name}`);
      return true;
    }

    // Skip if already generating
    if (get().isGeneratingWaveform(mediaId)) {
      console.log(`Waveform already generating for: ${mediaItem.name}`);
      return true;
    }

    // Determine audio source - prefer extracted audio for video files
    let audioPath: string;
    if (isVideoWithExtractedAudio && mediaItem.extractedAudio?.previewUrl) {
      audioPath = mediaItem.extractedAudio.previewUrl;
    } else if (isAudioFile && mediaItem.previewUrl) {
      audioPath = mediaItem.previewUrl;
    } else if (isAudioFile) {
      audioPath = mediaItem.source;
    } else if (mediaItem.type === 'video' && !mediaItem.extractedAudio) {
      // Video without extracted audio yet - this is expected during import
      console.log(
        `Audio extraction not complete yet for video: ${mediaItem.name}`,
      );
      return false; // Return false to allow retry logic
    } else {
      console.warn(`No suitable audio source found for: ${mediaItem.name}`);
      return false;
    }

    // Skip blob URLs if they are local file paths (Web Audio API requires proper URLs)
    if (audioPath.startsWith('blob:') && !audioPath.includes('localhost')) {
      console.warn(
        `Skipping waveform generation for blob URL: ${mediaItem.name}`,
      );
      return true; // Skip but don't error
    }

    console.log(
      `🎵 Generating waveform for media library item: ${mediaItem.name}`,
    );

    try {
      // Mark as generating
      get().setGeneratingWaveform(mediaId, true);

      const result = await AudioWaveformGenerator.generateWaveform({
        audioPath,
        duration: mediaItem.duration,
        sampleRate: 8000, // Good balance between quality and performance
        peaksPerSecond: 30, // 30 peaks per second for better timeline accuracy
      });

      if (result.success) {
        // Update media library item with waveform data
        set((state: any) => ({
          mediaLibrary: state.mediaLibrary.map((item: MediaLibraryItem) =>
            item.id === mediaId
              ? {
                  ...item,
                  waveform: {
                    success: result.success,
                    peaks: result.peaks,
                    duration: result.duration,
                    sampleRate: result.sampleRate,
                    cacheKey: result.cacheKey,
                    generatedAt: Date.now(),
                  },
                }
              : item,
          ),
        }));

        // Mark as having unsaved changes
        state.markUnsavedChanges?.();

        console.log(`✅ Waveform generated and cached for: ${mediaItem.name}`);
        return true;
      } else {
        console.error(
          `❌ Failed to generate waveform for ${mediaItem.name}:`,
          result.error,
        );
        return false;
      }
    } catch (error) {
      console.error(
        `❌ Error generating waveform for ${mediaItem.name}:`,
        error,
      );
      return false;
    } finally {
      // Clear generating state
      get().setGeneratingWaveform(mediaId, false);
    }
  },

  generateSpriteSheetForMedia: async (mediaId: string) => {
    const state = get() as any;
    const mediaItem = state.mediaLibrary.find(
      (item: MediaLibraryItem) => item.id === mediaId,
    );
    if (!mediaItem) {
      console.error('Media item not found:', mediaId);
      return false;
    }

    // Only generate sprite sheets for video files
    if (mediaItem.type !== 'video') {
      console.log(
        `Skipping sprite sheet generation for non-video: ${mediaItem.name}`,
      );
      return true; // Not an error, just not applicable
    }

    // Skip if sprite sheets already exist
    if (mediaItem.spriteSheets?.success) {
      console.log(`Sprite sheets already exist for: ${mediaItem.name}`);
      return true;
    }

    // Skip if already generating
    if (get().isGeneratingSpriteSheet(mediaId)) {
      console.log(`Sprite sheets already generating for: ${mediaItem.name}`);
      return true;
    }

    const videoPath = mediaItem.tempFilePath || mediaItem.source;

    // Skip blob URLs (they won't work with FFmpeg)
    if (videoPath.startsWith('blob:')) {
      console.warn(
        `Cannot generate sprite sheets from blob URL: ${mediaItem.name}`,
      );
      return false;
    }

    try {
      // Set generating state
      get().setGeneratingSpriteSheet(mediaId, true);
      console.log(
        `🎬 Generating sprite sheets for media library item: ${mediaItem.name}`,
      );

      const result = await VideoSpriteSheetGenerator.generateSpriteSheets({
        videoPath,
        duration: mediaItem.duration,
        fps: mediaItem.metadata?.fps || 30,
        thumbWidth: 120,
        thumbHeight: 68,
        maxThumbnailsPerSheet: 100,
      });

      if (result.success) {
        // Update the media library item with sprite sheet data
        set((state: any) => ({
          mediaLibrary: state.mediaLibrary.map((item: MediaLibraryItem) =>
            item.id === mediaId
              ? {
                  ...item,
                  spriteSheets: {
                    success: result.success,
                    spriteSheets: result.spriteSheets,
                    cacheKey: result.cacheKey,
                    generatedAt: Date.now(),
                  },
                }
              : item,
          ),
        }));

        // Mark as having unsaved changes
        state.markUnsavedChanges?.();

        console.log(
          `✅ Sprite sheets generated and cached for: ${mediaItem.name}`,
        );
        return true;
      } else {
        console.error(
          `❌ Failed to generate sprite sheets for ${mediaItem.name}:`,
          result.error,
        );
        return false;
      }
    } catch (error) {
      console.error(
        `❌ Error generating sprite sheets for ${mediaItem.name}:`,
        error,
      );
      return false;
    } finally {
      // Clear generating state
      get().setGeneratingSpriteSheet(mediaId, false);
    }
  },

  generateThumbnailForMedia: async (mediaId: string) => {
    const state = get() as any;
    const mediaItem = state.mediaLibrary.find(
      (item: MediaLibraryItem) => item.id === mediaId,
    );
    if (!mediaItem) {
      console.error('Media item not found:', mediaId);
      return false;
    }

    // Only generate thumbnails for video files
    if (mediaItem.type !== 'video') {
      console.log(
        `Skipping thumbnail generation for non-video: ${mediaItem.name}`,
      );
      return true; // Not an error, just not applicable
    }

    // Skip if thumbnail already exists
    if (mediaItem.thumbnail) {
      console.log(`Thumbnail already exists for: ${mediaItem.name}`);
      return true;
    }

    const videoPath = mediaItem.tempFilePath || mediaItem.source;

    // Skip blob URLs (they won't work with FFmpeg)
    if (videoPath.startsWith('blob:')) {
      console.warn(
        `Cannot generate thumbnail from blob URL: ${mediaItem.name}`,
      );
      return false;
    }

    try {
      console.log(
        `📸 Generating thumbnail for media library item: ${mediaItem.name}`,
      );

      // Generate a single thumbnail at 1 second (or 10% of duration, whichever is smaller)
      const thumbnailTime = Math.min(1, mediaItem.duration * 0.1);

      const result = await VideoThumbnailGenerator.generateThumbnails({
        videoPath,
        duration: 0.1, // Very short duration, just one frame
        fps: 30,
        intervalSeconds: 0.1,
        width: 320, // Higher quality thumbnail for project display
        height: 180, // 16:9 aspect ratio
        sourceStartTime: thumbnailTime,
      });

      if (result.success && result.thumbnails.length > 0) {
        const thumbnailUrl = result.thumbnails[0].url;

        // Use thumbnail URL directly (base64 conversion would need proper electron API)
        const base64Thumbnail = thumbnailUrl;

        // Update the media library item with thumbnail data
        set((state: any) => ({
          mediaLibrary: state.mediaLibrary.map((item: MediaLibraryItem) =>
            item.id === mediaId
              ? {
                  ...item,
                  thumbnail: base64Thumbnail,
                }
              : item,
          ),
        }));

        // Mark as having unsaved changes
        state.markUnsavedChanges?.();

        console.log(`✅ Thumbnail generated and cached for: ${mediaItem.name}`);
        return true;
      } else {
        console.error(
          `❌ Failed to generate thumbnail for ${mediaItem.name}:`,
          result.error,
        );
        return false;
      }
    } catch (error) {
      console.error(
        `❌ Error generating thumbnail for ${mediaItem.name}:`,
        error,
      );
      return false;
    }
  },

  updateProjectThumbnailFromTimeline: async () => {
    const state = get() as any;

    // Find the first video track on the timeline
    const firstVideoTrack = state.tracks
      .filter((track: any) => track.type === 'video' && track.visible)
      .sort((a: any, b: any) => a.startFrame - b.startFrame)[0];

    if (!firstVideoTrack) {
      console.log('No video tracks on timeline, clearing project thumbnail');

      // Clear project thumbnail if we have a current project but no video tracks
      if (state.currentProjectId) {
        try {
          const currentProject = await projectService.getProject(
            state.currentProjectId,
          );
          if (currentProject) {
            const updatedProject = {
              ...currentProject,
              metadata: {
                ...currentProject.metadata,
                thumbnail: undefined as string | undefined, // Clear the thumbnail
                updatedAt: new Date().toISOString(),
              },
            };

            await projectService.updateProject(updatedProject);
            const fullState = get() as any;
            fullState.syncWithProjectStore();

            console.log(
              `📸 Cleared project thumbnail (no video tracks remaining)`,
            );
          }
        } catch (error) {
          console.error('Failed to clear project thumbnail:', error);
        }
      }
      return;
    }

    console.log(
      `📸 Updating project thumbnail from track: ${firstVideoTrack.name}`,
    );

    // Find the media library item for this track
    const mediaItem = state.mediaLibrary.find(
      (item: MediaLibraryItem) =>
        item.source === firstVideoTrack.source ||
        item.tempFilePath === firstVideoTrack.source,
    );

    if (!mediaItem) {
      console.error('Media library item not found for first video track');
      return;
    }

    // Generate thumbnail if it doesn't exist
    if (!mediaItem.thumbnail) {
      const success = await get().generateThumbnailForMedia(mediaItem.id);
      if (!success) {
        console.error('Failed to generate thumbnail for project');
        return;
      }
    }

    // Update project thumbnail if we have a current project
    if (state.currentProjectId && mediaItem.thumbnail) {
      try {
        const currentProject = await projectService.getProject(
          state.currentProjectId,
        );
        if (currentProject) {
          const updatedProject = {
            ...currentProject,
            metadata: {
              ...currentProject.metadata,
              thumbnail: mediaItem.thumbnail,
              updatedAt: new Date().toISOString(),
            },
          };

          await projectService.updateProject(updatedProject);
          const fullState = get() as any;
          fullState.syncWithProjectStore();

          console.log(
            `📸 Updated project thumbnail from: ${firstVideoTrack.name}`,
          );
        }
      } catch (error) {
        console.error('Failed to update project thumbnail:', error);
      }
    }
  },
});
