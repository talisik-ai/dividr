/* eslint-disable @typescript-eslint/no-explicit-any */
import { FileIntegrityValidator } from '@/frontend/utils/fileValidator';
import { StateCreator } from 'zustand';
import {
  FileProcessingSlice,
  ImportResult,
  MediaLibraryItem,
  ProcessedFileInfo,
  VideoTrack,
} from '../types';

// Track colors for visual differentiation
const TRACK_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f39c12',
  '#9b59b6',
  '#34495e',
];

// Helper function to detect subtitle files
const isSubtitleFile = (fileName: string): boolean => {
  const subtitleExtensions = [
    '.srt',
    '.vtt',
    '.ass',
    '.ssa',
    '.sub',
    '.sbv',
    '.lrc',
  ];
  return subtitleExtensions.some((ext) => fileName.toLowerCase().endsWith(ext));
};

// Subtitle parsing interface
interface SubtitleSegment {
  startTime: number; // in seconds
  endTime: number; // in seconds
  text: string;
  index?: number;
}

// Parse SRT subtitle format
const parseSRT = (content: string): SubtitleSegment[] => {
  const segments: SubtitleSegment[] = [];
  const blocks = content.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 3) continue;

    const index = parseInt(lines[0]);
    const timeRegex =
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/;
    const timeMatch = lines[1].match(timeRegex);

    if (timeMatch) {
      const startTime =
        parseInt(timeMatch[1]) * 3600 +
        parseInt(timeMatch[2]) * 60 +
        parseInt(timeMatch[3]) +
        parseInt(timeMatch[4]) / 1000;

      const endTime =
        parseInt(timeMatch[5]) * 3600 +
        parseInt(timeMatch[6]) * 60 +
        parseInt(timeMatch[7]) +
        parseInt(timeMatch[8]) / 1000;

      const text = lines.slice(2).join('\n').trim();

      segments.push({
        startTime,
        endTime,
        text,
        index,
      });
    }
  }

  return segments;
};

// Parse VTT subtitle format
const parseVTT = (content: string): SubtitleSegment[] => {
  const segments: SubtitleSegment[] = [];
  const lines = content.split('\n');
  let i = 0;

  // Skip header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes('-->')) {
      const timeRegex =
        /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
      const timeMatch = line.match(timeRegex);

      if (timeMatch) {
        const startTime =
          parseInt(timeMatch[1]) * 3600 +
          parseInt(timeMatch[2]) * 60 +
          parseInt(timeMatch[3]) +
          parseInt(timeMatch[4]) / 1000;

        const endTime =
          parseInt(timeMatch[5]) * 3600 +
          parseInt(timeMatch[6]) * 60 +
          parseInt(timeMatch[7]) +
          parseInt(timeMatch[8]) / 1000;

        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim());
          i++;
        }

        const text = textLines.join('\n');

        segments.push({
          startTime,
          endTime,
          text,
        });
      }
    }
    i++;
  }

  return segments;
};

// Main subtitle parser function
const parseSubtitleContent = (
  content: string,
  fileName: string,
): SubtitleSegment[] => {
  const extension = fileName.toLowerCase().split('.').pop();

  switch (extension) {
    case 'srt':
      return parseSRT(content);
    case 'vtt':
      return parseVTT(content);
    default:
      // For other formats, try SRT parsing as fallback
      return parseSRT(content);
  }
};

// Helper function to process subtitle files and create individual tracks
const processSubtitleFile = async (
  fileInfo: ProcessedFileInfo,
  fileContent: string,
  currentTrackCount: number,
  fps: number,
  previewUrl?: string,
): Promise<Omit<VideoTrack, 'id'>[]> => {
  try {
    // Parse subtitle segments
    const segments = parseSubtitleContent(fileContent, fileInfo.name);

    if (segments.length > 0) {
      // Create individual tracks for each subtitle segment
      const subtitleTracks = segments.map((segment, segmentIndex) => {
        // Convert precise seconds to frames using Math.floor for start (inclusive)
        // and Math.ceil for end (exclusive) to ensure full coverage
        const startFrame = Math.floor(segment.startTime * fps);
        const endFrame = Math.ceil(segment.endTime * fps);

        return {
          type: 'subtitle' as const,
          name: `${
            segment.text.length > 30
              ? segment.text.substring(0, 30) + '...'
              : segment.text
          }`,
          source: fileInfo.path,
          previewUrl,
          duration: endFrame - startFrame,
          startFrame,
          endFrame,
          visible: true,
          locked: false,
          color: getTrackColor(currentTrackCount + segmentIndex),
          subtitleText: segment.text,
          // Store original precise timing from SRT for reference
          subtitleStartTime: segment.startTime,
          subtitleEndTime: segment.endTime,
        };
      });

      return subtitleTracks;
    }
  } catch (error) {
    console.error(`❌ Error parsing subtitle file ${fileInfo.name}:`, error);
  }

  return [
    {
      type: 'subtitle' as const,
      name: fileInfo.name,
      source: fileInfo.path,
      previewUrl,
      duration: 150, // 5 seconds at 30fps
      startFrame: 0,
      endFrame: 150,
      visible: true,
      locked: false,
      color: getTrackColor(currentTrackCount),
      subtitleText: `Subtitle: ${fileInfo.name}`,
    },
  ];
};

const getTrackColor = (index: number) =>
  TRACK_COLORS[index % TRACK_COLORS.length];

// Shared helper function to process imported files
const processImportedFile = async (
  fileInfo: any,
  addToLibraryFn: (item: Omit<MediaLibraryItem, 'id'>) => string,
  addToTimelineFn?: (track: Omit<VideoTrack, 'id'>) => Promise<string>,
  getFps?: () => number,
  generateSpriteFn?: (mediaId: string) => Promise<boolean>,
  generateThumbnailFn?: (mediaId: string) => Promise<boolean>,
  generateWaveformFn?: (mediaId: string) => Promise<boolean>,
  updateMediaLibraryFn?: (
    mediaId: string,
    updates: Partial<MediaLibraryItem>,
  ) => void,
) => {
  // Get accurate duration using FFprobe
  // Note: For images, we use a default duration since images are static and extensible
  let actualDurationSeconds: number;
  if (fileInfo.type === 'image') {
    // Images are extensible - use a default starting duration of 5 seconds
    actualDurationSeconds = 5;
  } else {
    try {
      actualDurationSeconds = await window.electronAPI.getDuration(
        fileInfo.path,
      );
    } catch (error) {
      console.warn(
        `⚠️ Failed to get duration for ${fileInfo.name}, using fallback:`,
        error,
      );
      actualDurationSeconds = fileInfo.type === 'audio' ? 30 : 30;
    }
  }
  // Get video dimensions
  let videoDimensions: { width: number; height: number };
  try {
    videoDimensions = await window.electronAPI.getVideoDimensions(
      fileInfo.path,
    );
  } catch (error) {
    console.warn(
      `⚠️ Failed to get dimensions for ${fileInfo.name}, using fallback:`,
      error,
    );
    videoDimensions = { width: 1920, height: 1080 }; // sensible default
  }

  // Create preview URL for video and image files
  let previewUrl: string | undefined;
  if (fileInfo.type === 'video' || fileInfo.type === 'image') {
    try {
      const previewResult = await window.electronAPI.createPreviewUrl(
        fileInfo.path,
      );
      if (previewResult.success) {
        previewUrl = previewResult.url;
      }
    } catch (error) {
      console.warn(
        `⚠️ Error creating preview URL for ${fileInfo.name}:`,
        error,
      );
    }
  }

  // Determine proper MIME type and track type
  let mimeType = 'application/octet-stream';
  let trackType: 'video' | 'audio' | 'image' | 'subtitle' = fileInfo.type;

  // Check for subtitle files FIRST (override any incorrect type detection)
  if (isSubtitleFile(fileInfo.name)) {
    mimeType = `text/${fileInfo.extension}`;
    trackType = 'subtitle';
  } else if (fileInfo.type === 'video') {
    mimeType = `video/${fileInfo.extension}`;
  } else if (fileInfo.type === 'audio') {
    mimeType = `audio/${fileInfo.extension}`;
  } else if (fileInfo.type === 'image') {
    mimeType = `image/${fileInfo.extension}`;
  }

  // Add to media library
  const mediaLibraryItem: Omit<MediaLibraryItem, 'id'> = {
    name: fileInfo.name,
    type: trackType,
    source: fileInfo.path,
    previewUrl,
    duration: actualDurationSeconds,
    size: fileInfo.size,
    mimeType,
    metadata: { width: videoDimensions.width, height: videoDimensions.height },
  };

  const mediaId = addToLibraryFn(mediaLibraryItem);

  // Generate sprite sheets and thumbnails for video files (async, don't wait)
  if (trackType === 'video') {
    if (generateSpriteFn) {
      // Run sprite sheet generation in background without blocking import
      generateSpriteFn(mediaId).catch((error) => {
        console.warn(
          `⚠️ Sprite sheet generation failed for ${fileInfo.name}:`,
          error,
        );
      });
    }

    if (generateThumbnailFn) {
      // Run thumbnail generation in background without blocking import
      generateThumbnailFn(mediaId).catch((error) => {
        console.warn(
          `⚠️ Thumbnail generation failed for ${fileInfo.name}:`,
          error,
        );
      });
    }

    // Extract audio from video file for independent audio track usage
    // Use a retry mechanism to handle FFmpeg concurrency issues
    const extractAudioWithRetry = async (retries = 3, delay = 2000) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const result = await window.electronAPI.extractAudioFromVideo(
            fileInfo.path,
          );

          if (result.success && result.audioPath) {
            // Update the media library item with extracted audio information
            if (updateMediaLibraryFn && result.audioPath) {
              updateMediaLibraryFn(mediaId, {
                extractedAudio: {
                  audioPath: result.audioPath,
                  previewUrl: result.previewUrl,
                  size: result.size || 0,
                  extractedAt: Date.now(),
                },
              });
            }
            return; // Success, exit retry loop
          } else if (
            result.error?.includes('Another FFmpeg process is already running')
          ) {
            if (attempt < retries) {
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue; // Retry
            } else {
              console.warn(
                `⚠️ Audio extraction failed after ${retries} attempts for ${fileInfo.name}: ${result.error}`,
              );
            }
          } else {
            console.warn(
              `⚠️ Audio extraction failed for ${fileInfo.name}:`,
              result.error,
            );
            return; // Non-retry error, exit
          }
        } catch (error) {
          console.warn(
            `⚠️ Audio extraction error for ${fileInfo.name} (attempt ${attempt}):`,
            error,
          );
          if (attempt === retries) {
            console.warn(
              `⚠️ Audio extraction failed after ${retries} attempts for ${fileInfo.name}`,
            );
          }
        }
      }
    };

    // Run audio extraction with retry logic (non-blocking)
    extractAudioWithRetry().catch((error) => {
      console.warn(
        `⚠️ Audio extraction retry handler failed for ${fileInfo.name}:`,
        error,
      );
    });

    // Generate waveform for video files (coordinated with audio extraction)
    if (generateWaveformFn) {
      // Run waveform generation with smart retry logic to coordinate with audio extraction
      const generateWaveformWithRetry = async () => {
        let retries = 6; // Allow up to 6 retries (30 seconds max)
        const retryDelay = 5000; // 5 second intervals

        while (retries > 0) {
          try {
            const result = await generateWaveformFn(mediaId);
            if (result) {
              return;
            }
          } catch (error) {
            console.warn(
              `⚠️ Waveform generation attempt failed for ${fileInfo.name}:`,
              error,
            );
          }

          retries--;
          if (retries > 0) {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }

        console.warn(
          `⚠️ Waveform generation failed after all retries for ${fileInfo.name}`,
        );
      };

      // Start generation with retry logic (non-blocking)
      generateWaveformWithRetry().catch((error) => {
        console.warn(
          `⚠️ Waveform generation retry handler failed for ${fileInfo.name}:`,
          error,
        );
      });
    }
  }

  // Generate waveform for direct audio files (immediate start)
  if (trackType === 'audio' && generateWaveformFn) {
    // Run waveform generation in background without blocking import
    // For direct audio files, we can start immediately as no extraction is needed
    generateWaveformFn(mediaId).catch((error) => {
      console.warn(
        `⚠️ Waveform generation failed for ${fileInfo.name}:`,
        error,
      );
    });
  }

  // Add to timeline if requested
  if (addToTimelineFn && getFps) {
    const fps = getFps();

    if (trackType === 'subtitle' && isSubtitleFile(fileInfo.name)) {
      // Handle subtitle files specially
      try {
        const subtitleContent = await window.electronAPI.readFile(
          fileInfo.path,
        );
        if (subtitleContent) {
          const subtitleTracks = await processSubtitleFile(
            fileInfo,
            subtitleContent,
            0, // Will be repositioned by addTrack
            fps,
            previewUrl,
          );

          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for (const [_index, track] of subtitleTracks.entries()) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            await addToTimelineFn(track);
          }
        }
      } catch (error) {
        console.error(`❌ Error processing subtitle file:`, error);
        // Add single fallback track - Use precise duration calculation
        const duration = Math.floor(actualDurationSeconds * fps);
        await addToTimelineFn({
          type: 'subtitle',
          name: fileInfo.name,
          source: fileInfo.path,
          previewUrl,
          duration,
          startFrame: 0,
          endFrame: duration,
          visible: true,
          locked: false,
          color: getTrackColor(0),
          subtitleText: `Subtitle: ${fileInfo.name}`,
        });
      }
    } else {
      // Add regular media to timeline - Use precise duration calculation
      const duration = Math.floor(actualDurationSeconds * fps);
      await addToTimelineFn({
        type: trackType,
        name: fileInfo.name,
        source: fileInfo.path,
        previewUrl,
        duration,
        startFrame: 0,
        endFrame: duration,
        visible: true,
        locked: false,
        color: getTrackColor(0),
      });
    }
  }

  return {
    id: mediaId,
    name: fileInfo.name,
    type: mimeType,
    size: fileInfo.size,
    url: previewUrl || fileInfo.path,
  };
};

export const createFileProcessingSlice: StateCreator<
  FileProcessingSlice,
  [],
  [],
  FileProcessingSlice
> = (set, get) => ({
  importMediaFromDialog: async (): Promise<ImportResult> => {
    try {
      console.log('🔍 Opening file dialog for media selection...');

      // Use Electron's native file dialog
      const result = await window.electronAPI.openFileDialog({
        title: 'Select Media Files',
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Media Files',
            extensions: [
              'mp4',
              'avi',
              'mov',
              'mkv',
              'mp3',
              'wav',
              'aac',
              'jpg',
              'jpeg',
              'png',
              'gif',
              'srt',
              'vtt',
              'ass',
              'ssa',
              'sub',
              'sbv',
              'lrc',
            ],
          },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      if (
        !result.success ||
        result.canceled ||
        !result.files ||
        result.files.length === 0
      ) {
        return { success: false, importedFiles: [] };
      }

      console.log(
        `🔍 Validating ${result.files.length} selected files from dialog...`,
      );

      // STEP 1: Validate files BEFORE any processing
      // Convert file paths to File objects for validation
      const fileObjects = await Promise.all(
        result.files.map(async (fileInfo) => {
          try {
            // Read file from disk as ArrayBuffer
            const fileBuffer = await window.electronAPI.readFileAsBuffer(
              fileInfo.path,
            );
            // Create File object from buffer for validation
            return new File([fileBuffer], fileInfo.name, {
              type: fileInfo.type || 'application/octet-stream',
            });
          } catch (error) {
            console.error(
              `❌ Failed to read file ${fileInfo.name} for validation:`,
              error,
            );
            return null;
          }
        }),
      );

      // Filter out null values (files that couldn't be read)
      const validFileObjects = fileObjects.filter(
        (file): file is File => file !== null,
      );

      if (validFileObjects.length === 0) {
        console.error('❌ No files could be read for validation');
        return {
          success: false,
          importedFiles: [],
          error: 'Failed to read selected files',
        };
      }

      // Validate all files
      const validationResults = await FileIntegrityValidator.validateFiles(
        validFileObjects,
        (completed, total) => {
          console.log(`Validation progress: ${completed}/${total}`);
        },
      );

      // Separate valid and invalid files
      const validFileIndices: number[] = [];
      const rejectedFiles: Array<{
        name: string;
        reason: string;
        error?: string;
      }> = [];

      validationResults.forEach((validationResult, file) => {
        const originalIndex = validFileObjects.indexOf(file);
        if (validationResult.isValid) {
          validFileIndices.push(originalIndex);
          console.log(`✅ Valid: ${file.name}`);
        } else {
          const reason = validationResult.error || 'File validation failed';
          rejectedFiles.push({
            name: file.name,
            reason,
            error: reason,
          });
          console.warn(`🚫 Rejected: ${file.name} - ${reason}`);
        }
      });

      // If no valid files, return early with rejection info
      if (validFileIndices.length === 0) {
        console.warn('❌ No valid files to import (all rejected)');
        return {
          success: false,
          importedFiles: [],
          rejectedFiles,
          error: 'All files were rejected due to corruption or invalid format',
        };
      }

      // STEP 2: Process only valid files
      console.log(
        `📦 Processing ${validFileIndices.length} valid files from dialog...`,
      );

      const importedFiles: Array<{
        id: string;
        name: string;
        type: string;
        size: number;
        url: string;
        thumbnail?: string;
      }> = [];

      // Process only valid files and add to media library
      await Promise.all(
        validFileIndices.map(async (index) => {
          const fileInfo = result.files[index];
          try {
            const fileData = await processImportedFile(
              fileInfo,
              (get() as any).addToMediaLibrary,
              undefined, // No timeline addition
              () => (get() as any).timeline.fps,
              (get() as any).generateSpriteSheetForMedia,
              (get() as any).generateThumbnailForMedia,
              (get() as any).generateWaveformForMedia,
              (get() as any).updateMediaLibraryItem,
            );
            importedFiles.push(fileData);
          } catch (error: any) {
            console.error(`❌ Failed to import ${fileInfo.name}:`, error);
            rejectedFiles.push({
              name: fileInfo.name,
              reason: error.message || 'Failed to process file',
              error: error.toString(),
            });
          }
        }),
      );

      console.log(
        `✅ Successfully imported ${importedFiles.length} files from dialog`,
      );
      if (rejectedFiles.length > 0) {
        console.warn(`⚠️ Rejected ${rejectedFiles.length} files`);
      }

      return {
        success: true,
        importedFiles,
        rejectedFiles: rejectedFiles.length > 0 ? rejectedFiles : undefined,
      };
    } catch (error: any) {
      console.error('Failed to import media from dialog:', error);
      return {
        success: false,
        importedFiles: [],
        error: error.message || 'Unknown error occurred',
      };
    }
  },

  importMediaFromFiles: async (files: File[]): Promise<void> => {
    // Validate files before processing
    const validationResults = await FileIntegrityValidator.validateFiles(files);
    const validFiles: File[] = [];
    const rejectedFiles: Array<{ name: string; reason: string }> = [];

    validationResults.forEach((result, file) => {
      if (result.isValid) {
        validFiles.push(file);
      } else {
        rejectedFiles.push({
          name: file.name,
          reason: result.error || 'File validation failed',
        });
      }
    });

    if (rejectedFiles.length > 0) {
      console.warn('🚫 Rejected corrupted/invalid files:', rejectedFiles);
    }

    if (validFiles.length === 0) {
      console.warn('No valid files to import');
      return;
    }

    // Continue with existing implementation for valid files only
    const newTracks = await Promise.all(
      validFiles.map(async (file, index) => {
        // Check if this is a subtitle file
        if (isSubtitleFile(file.name)) {
          try {
            // Read subtitle file content
            const fileContent = await file.text();

            // Create file info object for the helper
            const fileInfo = {
              name: file.name,
              path: URL.createObjectURL(file), // Use blob URL as path for legacy support
              type: 'subtitle',
              extension: file.name.split('.').pop() || '',
              size: file.size,
            };

            // Process subtitle file using helper
            const subtitleTracks = await processSubtitleFile(
              fileInfo,
              fileContent,
              (get() as any).tracks.length + index,
              (get() as any).timeline.fps,
            );

            return subtitleTracks;
          } catch (error) {
            console.error(
              `❌ Error processing subtitle file ${file.name}:`,
              error,
            );
            // Fallback to single subtitle track
            return {
              type: 'subtitle' as const,
              name: file.name,
              source: URL.createObjectURL(file),
              originalFile: file,
              duration: 150,
              startFrame: index * 150,
              endFrame: index * 150 + 150,
              visible: true,
              locked: false,
              color: getTrackColor((get() as any).tracks.length + index),
              subtitleText: `Subtitle: ${file.name}`,
            };
          }
        }

        // For regular File objects, we'll create blob URLs for preview
        // but log a warning that this won't work with FFmpeg
        const blobUrl = URL.createObjectURL(file);

        const type = file.type.startsWith('video/')
          ? ('video' as const)
          : file.type.startsWith('audio/')
            ? ('audio' as const)
            : ('image' as const);

        const estimatedDuration = type === 'image' ? 150 : 1500;

        return {
          type,
          name: file.name,
          source: blobUrl, // This will be a blob URL - won't work with FFmpeg
          originalFile: file,
          duration: estimatedDuration,
          startFrame: index * 150,
          endFrame: index * 150 + estimatedDuration,
          visible: true,
          locked: false,
          color: getTrackColor((get() as any).tracks.length + index),
        };
      }),
    );

    // Flatten tracks array (subtitle files return arrays of tracks) and filter out null/undefined
    const validTracks = newTracks.flat().filter(Boolean);

    // Use batch addTracks for better performance when adding multiple tracks
    if (validTracks.length > 1) {
      console.log(`🚀 Adding ${validTracks.length} tracks in batch...`);
      await (get() as any).addTracks(validTracks);
    } else if (validTracks.length === 1) {
      await (get() as any).addTrack(validTracks[0]);
    }
  },

  importMediaFromDrop: async (files: File[]): Promise<ImportResult> => {
    try {
      console.log(`🔍 Validating ${files.length} dropped files...`);

      // STEP 1: Validate files BEFORE any processing
      const validationResults = await FileIntegrityValidator.validateFiles(
        files,
        (completed, total) => {
          console.log(`Validation progress: ${completed}/${total}`);
        },
      );

      // Separate valid and invalid files
      const validFiles: File[] = [];
      const rejectedFiles: Array<{
        name: string;
        reason: string;
        error?: string;
      }> = [];

      validationResults.forEach((result, file) => {
        if (result.isValid) {
          validFiles.push(file);
          console.log(`✅ Valid: ${file.name}`);
        } else {
          const reason = result.error || 'File validation failed';
          rejectedFiles.push({
            name: file.name,
            reason,
            error: reason,
          });
          console.warn(`🚫 Rejected: ${file.name} - ${reason}`);
        }
      });

      // If no valid files, return early with rejection info
      if (validFiles.length === 0) {
        console.warn('❌ No valid files to import (all rejected)');
        return {
          success: false,
          importedFiles: [],
          rejectedFiles,
          error: 'All files were rejected due to corruption or invalid format',
        };
      }

      // STEP 2: Process only valid files
      console.log(`📦 Processing ${validFiles.length} valid files...`);

      // Convert File objects to ArrayBuffers for IPC transfer
      const fileBuffers = await Promise.all(
        validFiles.map(async (file) => {
          const buffer = await file.arrayBuffer();
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            buffer,
          };
        }),
      );

      // Process files in main process to get real file paths
      const result = await window.electronAPI.processDroppedFiles(fileBuffers);

      if (!result.success) {
        console.error(
          '❌ Failed to process files in main process:',
          result.error,
        );
        return {
          success: false,
          importedFiles: [],
          rejectedFiles,
          error: result.error || 'Failed to process files',
        };
      }

      const importedFiles: Array<{
        id: string;
        name: string;
        type: string;
        size: number;
        url: string;
        thumbnail?: string;
      }> = [];

      // Process files and add to media library
      await Promise.all(
        result.files.map(async (fileInfo) => {
          try {
            const fileData = await processImportedFile(
              fileInfo,
              (get() as any).addToMediaLibrary,
              undefined, // No timeline addition
              () => (get() as any).timeline.fps,
              (get() as any).generateSpriteSheetForMedia,
              (get() as any).generateThumbnailForMedia,
              (get() as any).generateWaveformForMedia,
              (get() as any).updateMediaLibraryItem,
            );
            importedFiles.push(fileData);
          } catch (error: any) {
            console.error(`❌ Failed to import ${fileInfo.name}:`, error);
            rejectedFiles.push({
              name: fileInfo.name,
              reason: error.message || 'Failed to process file',
              error: error.toString(),
            });
          }
        }),
      );

      console.log(`✅ Successfully imported ${importedFiles.length} files`);
      if (rejectedFiles.length > 0) {
        console.warn(`⚠️ Rejected ${rejectedFiles.length} files`);
      }

      return {
        success: true,
        importedFiles,
        rejectedFiles: rejectedFiles.length > 0 ? rejectedFiles : undefined,
      };
    } catch (error: any) {
      console.error('Failed to import media from drop:', error);
      return {
        success: false,
        importedFiles: [],
        error: error.message || 'Unknown error occurred',
      };
    }
  },

  importMediaToTimeline: async (files: File[]): Promise<ImportResult> => {
    try {
      console.log(`🔍 Validating ${files.length} files for timeline import...`);

      // STEP 1: Validate files BEFORE any processing
      const validationResults = await FileIntegrityValidator.validateFiles(
        files,
        (completed, total) => {
          console.log(`Validation progress: ${completed}/${total}`);
        },
      );

      // Separate valid and invalid files
      const validFiles: File[] = [];
      const rejectedFiles: Array<{
        name: string;
        reason: string;
        error?: string;
      }> = [];

      validationResults.forEach((result, file) => {
        if (result.isValid) {
          validFiles.push(file);
          console.log(`✅ Valid: ${file.name}`);
        } else {
          const reason = result.error || 'File validation failed';
          rejectedFiles.push({
            name: file.name,
            reason,
            error: reason,
          });
          console.warn(`🚫 Rejected: ${file.name} - ${reason}`);
        }
      });

      // If no valid files, return early
      if (validFiles.length === 0) {
        console.warn('❌ No valid files to import (all rejected)');
        return {
          success: false,
          importedFiles: [],
          rejectedFiles,
          error: 'All files were rejected due to corruption or invalid format',
        };
      }

      // STEP 2: Process only valid files
      console.log(
        `📦 Processing ${validFiles.length} valid files for timeline...`,
      );

      // Convert File objects to ArrayBuffers for IPC transfer
      const fileBuffers = await Promise.all(
        validFiles.map(async (file) => {
          const buffer = await file.arrayBuffer();
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            buffer,
          };
        }),
      );

      // Process files in main process
      const result = await window.electronAPI.processDroppedFiles(fileBuffers);

      if (!result.success) {
        console.error(
          '❌ Failed to process files in main process:',
          result.error,
        );
        return {
          success: false,
          importedFiles: [],
          rejectedFiles,
          error: result.error || 'Failed to process files',
        };
      }

      const importedFiles: Array<{
        id: string;
        name: string;
        type: string;
        size: number;
        url: string;
        thumbnail?: string;
      }> = [];

      // Process files and add to both media library AND timeline
      await Promise.all(
        result.files.map(async (fileInfo) => {
          try {
            const fileData = await processImportedFile(
              fileInfo,
              (get() as any).addToMediaLibrary,
              (get() as any).addTrack, // Also add to timeline
              () => (get() as any).timeline.fps,
              (get() as any).generateSpriteSheetForMedia,
              (get() as any).generateThumbnailForMedia,
              (get() as any).generateWaveformForMedia,
              (get() as any).updateMediaLibraryItem,
            );
            importedFiles.push(fileData);
          } catch (error: any) {
            console.error(`❌ Failed to import ${fileInfo.name}:`, error);
            rejectedFiles.push({
              name: fileInfo.name,
              reason: error.message || 'Failed to process file',
              error: error.toString(),
            });
          }
        }),
      );

      console.log(
        `✅ Added ${importedFiles.length} files to both media library and timeline`,
      );
      if (rejectedFiles.length > 0) {
        console.warn(`⚠️ Rejected ${rejectedFiles.length} files`);
      }

      return {
        success: true,
        importedFiles,
        rejectedFiles: rejectedFiles.length > 0 ? rejectedFiles : undefined,
      };
    } catch (error: any) {
      console.error('Failed to import media to timeline:', error);
      return {
        success: false,
        importedFiles: [],
        error: error.message || 'Unknown error occurred',
      };
    }
  },
});

export type { FileProcessingSlice };
