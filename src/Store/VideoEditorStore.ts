/* eslint-disable @typescript-eslint/no-explicit-any */
import { projectService } from '@/Services/ProjectService';
import { default as VideoSpriteSheetGenerator } from '@/Utility/VideoSpriteSheetGenerator';
import { VideoThumbnailGenerator } from '@/Utility/VideoThumbnailGenerator';
import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { useProjectStore } from './ProjectStore';

export interface VideoTrack {
  id: string;
  type: 'video' | 'audio' | 'image' | 'subtitle';
  name: string;
  source: string; // File path for FFmpeg processing
  previewUrl?: string; // Preview URL for video preview component
  originalFile?: File; // Store the original File object for FFmpeg conversion
  tempFilePath?: string; // Store the temporary file path when converted
  duration: number; // in frames
  startFrame: number;
  endFrame: number;
  sourceStartTime?: number; // in seconds - where in the source file this track segment starts
  offsetX?: number;
  offsetY?: number;
  width?: number;
  height?: number;
  volume?: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean; // For audio tracks
  color: string;
  subtitleText?: string; // For subtitle tracks, store the actual subtitle content
}

export interface TimelineState {
  currentFrame: number;
  totalFrames: number;
  fps: number;
  zoom: number;
  scrollX: number;
  inPoint?: number;
  outPoint?: number;
  selectedTrackIds: string[];
  playheadVisible: boolean;
}

export interface PlaybackState {
  isPlaying: boolean;
  isLooping: boolean;
  playbackRate: number;
  volume: number;
  muted: boolean;
}

export interface PreviewState {
  canvasWidth: number;
  canvasHeight: number;
  previewScale: number;
  showGrid: boolean;
  showSafeZones: boolean;
  backgroundColor: string;
}

export interface RenderState {
  isRendering: boolean;
  progress: number;
  status: string;
  currentTime?: string; // Current render time in HH:MM:SS.FF format from FFmpeg outTime
  currentJob?: {
    outputPath: string;
    format: string;
    quality: string;
  };
}

export interface MediaLibraryItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image' | 'subtitle';
  source: string; // File path for FFmpeg processing
  previewUrl?: string; // Preview URL for display
  originalFile?: File;
  tempFilePath?: string;
  duration: number; // in seconds
  size: number; // file size in bytes
  mimeType: string;
  thumbnail?: string;
  metadata?: {
    width?: number;
    height?: number;
    fps?: number;
    channels?: number;
    sampleRate?: number;
  };
  spriteSheets?: {
    success: boolean;
    spriteSheets: Array<{
      id: string;
      url: string;
      width: number;
      height: number;
      thumbnailsPerRow: number;
      thumbnailsPerColumn: number;
      thumbnailWidth: number;
      thumbnailHeight: number;
      thumbnails: Array<{
        id: string;
        timestamp: number;
        frameNumber: number;
        sheetIndex: number;
        x: number;
        y: number;
        width: number;
        height: number;
      }>;
    }>;
    cacheKey: string;
    generatedAt?: number; // timestamp when generated
  };
}

export interface TextStyleState {
  activeStyle: string;
  styles: {
    [key: string]: {
      fontFamily?: string;
      fontWeight?: string;
      fontStyle?: string;
      textTransform?: string;
    };
  };
}

interface VideoEditorStore {
  // State
  tracks: VideoTrack[];
  timeline: TimelineState;
  playback: PlaybackState;
  preview: PreviewState;
  render: RenderState;
  textStyle: TextStyleState;

  // Media Library State (imported but not yet on timeline)
  mediaLibrary: MediaLibraryItem[];

  // Project persistence state
  currentProjectId: string | null;
  isAutoSaveEnabled: boolean;
  lastSavedAt: string | null;
  hasUnsavedChanges: boolean;

  // Sprite sheet generation tracking
  generatingSpriteSheets: Set<string>; // Set of media IDs currently generating sprite sheets

  // Timeline Actions
  setCurrentFrame: (frame: number) => void;
  setTotalFrames: (frames: number) => void;
  setFps: (fps: number) => void;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setInPoint: (frame?: number) => void;
  setOutPoint: (frame?: number) => void;
  setSelectedTracks: (trackIds: string[]) => void;

  // Track Actions
  addTrack: (track: Omit<VideoTrack, 'id'>) => string;
  addTrackFromMediaLibrary: (
    mediaId: string,
    startFrame?: number,
  ) => Promise<string>;
  removeTrack: (trackId: string) => void;
  removeSelectedTracks: () => void;
  updateTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
  moveTrack: (trackId: string, newStartFrame: number) => void;
  resizeTrack: (
    trackId: string,
    newStartFrame?: number,
    newEndFrame?: number,
  ) => void;
  duplicateTrack: (trackId: string) => string;
  splitTrack: (trackId: string, frame: number) => void;
  splitAtPlayhead: () => boolean;
  toggleTrackVisibility: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;

  // Media Library Actions
  addToMediaLibrary: (item: Omit<MediaLibraryItem, 'id'>) => string;
  removeFromMediaLibrary: (mediaId: string) => void;
  getMediaLibraryItem: (mediaId: string) => MediaLibraryItem | undefined;
  generateSpriteSheetForMedia: (mediaId: string) => Promise<boolean>;
  getSpriteSheetsBySource: (
    source: string,
  ) => MediaLibraryItem['spriteSheets'] | undefined;
  isGeneratingSpriteSheet: (mediaId: string) => boolean;
  setGeneratingSpriteSheet: (mediaId: string, isGenerating: boolean) => void;
  generateThumbnailForMedia: (mediaId: string) => Promise<boolean>;
  updateProjectThumbnailFromTimeline: () => Promise<void>;
  clearMediaLibrary: () => void;

  // Playback Actions
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlayback: () => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  toggleLoop: () => void;

  // Preview Actions
  setCanvasSize: (width: number, height: number) => void;
  setPreviewScale: (scale: number) => void;
  toggleGrid: () => void;
  toggleSafeZones: () => void;
  setBackgroundColor: (color: string) => void;

  // Render Actions
  startRender: (job: {
    outputPath: string;
    format: string;
    quality: string;
  }) => void;
  updateRenderProgress: (
    progress: number,
    status: string,
    currentTime?: string,
  ) => void;
  finishRender: () => void;
  cancelRender: () => void;

  // Text Style Actions
  setActiveTextStyle: (styleId: string) => void;
  getTextStyleForSubtitle: (styleId: string) => React.CSSProperties;

  // Utility Actions
  reset: () => void;
  importMediaFromDialog: () => Promise<{
    success: boolean;
    importedFiles: Array<{
      id: string;
      name: string;
      type: string;
      size: number;
      url: string;
      thumbnail?: string;
    }>;
  }>; // New method using native dialog - library only
  importMediaFromFiles: (files: File[]) => Promise<void>; // Keep for backward compatibility
  importMediaFromDrop: (files: File[]) => Promise<{
    success: boolean;
    importedFiles: Array<{
      id: string;
      name: string;
      type: string;
      size: number;
      url: string;
      thumbnail?: string;
    }>;
  }>; // New method for drag-and-drop - library only
  importMediaToTimeline: (files: File[]) => Promise<{
    success: boolean;
    importedFiles: Array<{
      id: string;
      name: string;
      type: string;
      size: number;
      url: string;
      thumbnail?: string;
    }>;
  }>; // Import directly to timeline (also adds to library)
  exportProject: () => string;
  importProject: (data: string) => void;

  // Project persistence actions
  setCurrentProjectId: (projectId: string | null) => void;
  loadProjectData: (projectId: string) => Promise<void>;
  saveProjectData: () => Promise<void>;
  setAutoSave: (enabled: boolean) => void;
  markUnsavedChanges: () => void;
  clearUnsavedChanges: () => void;
  syncWithProjectStore: () => void;
}

const TRACK_COLORS = [
  '#8e44ad',
  '#3498db',
  '#e74c3c',
  '#f39c12',
  '#27ae60',
  '#e67e22',
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
  fileInfo: {
    name: string;
    path: string;
    type: string;
    extension: string;
    size: number;
  },
  fileContent: string,
  currentTrackCount: number,
  fps: number,
  previewUrl?: string,
): Promise<Omit<VideoTrack, 'id'>[]> => {
  try {
    console.log(`📖 Parsing subtitle content for: ${fileInfo.name}`);

    // Parse subtitle segments
    const segments = parseSubtitleContent(fileContent, fileInfo.name);
    console.log(`🎬 Parsed ${segments.length} subtitle segments`);

    if (segments.length > 0) {
      // Create individual tracks for each subtitle segment
      const subtitleTracks = segments.map((segment, segmentIndex) => {
        const startFrame = Math.round(segment.startTime * fps);
        const endFrame = Math.round(segment.endTime * fps);

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
        };
      });

      console.log(
        `📋 Created ${subtitleTracks.length} subtitle tracks for ${fileInfo.name}`,
      );
      return subtitleTracks;
    }
  } catch (error) {
    console.error(`❌ Error parsing subtitle file ${fileInfo.name}:`, error);
  }

  // Fallback: create single subtitle track if parsing fails
  console.log(`📖 Creating fallback subtitle track for: ${fileInfo.name}`);
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
  addToTimelineFn?: (track: Omit<VideoTrack, 'id'>) => string,
  getFps?: () => number,
  generateSpriteFn?: (mediaId: string) => Promise<boolean>,
  generateThumbnailFn?: (mediaId: string) => Promise<boolean>,
) => {
  // Get accurate duration using FFprobe
  let actualDurationSeconds: number;
  try {
    actualDurationSeconds = await window.electronAPI.getDuration(fileInfo.path);
  } catch (error) {
    console.warn(
      `⚠️ Failed to get duration for ${fileInfo.name}, using fallback:`,
      error,
    );
    actualDurationSeconds = fileInfo.type === 'image' ? 5 : 30;
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

  console.log(`🔍 File type detection for: ${fileInfo.name}`);
  console.log(`   - Original fileInfo.type: ${fileInfo.type}`);
  console.log(
    `   - isSubtitleFile(${fileInfo.name}): ${isSubtitleFile(fileInfo.name)}`,
  );

  // Check for subtitle files FIRST (override any incorrect type detection)
  if (isSubtitleFile(fileInfo.name)) {
    mimeType = `text/${fileInfo.extension}`;
    trackType = 'subtitle';
    console.log(
      `🎬 ✅ Detected subtitle file: ${fileInfo.name} -> type: ${trackType}`,
    );
  } else if (fileInfo.type === 'video') {
    mimeType = `video/${fileInfo.extension}`;
    console.log(
      `📹 Detected video file: ${fileInfo.name} -> type: ${trackType}`,
    );
  } else if (fileInfo.type === 'audio') {
    mimeType = `audio/${fileInfo.extension}`;
    console.log(
      `🎵 Detected audio file: ${fileInfo.name} -> type: ${trackType}`,
    );
  } else if (fileInfo.type === 'image') {
    mimeType = `image/${fileInfo.extension}`;
    console.log(
      `🖼️ Detected image file: ${fileInfo.name} -> type: ${trackType}`,
    );
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
    metadata: {},
  };

  const mediaId = addToLibraryFn(mediaLibraryItem);

  // Generate sprite sheets and thumbnails for video files (async, don't wait)
  if (trackType === 'video') {
    if (generateSpriteFn) {
      console.log(
        `🎬 Triggering sprite sheet generation for: ${fileInfo.name}`,
      );
      // Run sprite sheet generation in background without blocking import
      generateSpriteFn(mediaId).catch((error) => {
        console.warn(
          `⚠️ Sprite sheet generation failed for ${fileInfo.name}:`,
          error,
        );
      });
    }

    if (generateThumbnailFn) {
      console.log(`📸 Triggering thumbnail generation for: ${fileInfo.name}`);
      // Run thumbnail generation in background without blocking import
      generateThumbnailFn(mediaId).catch((error) => {
        console.warn(
          `⚠️ Thumbnail generation failed for ${fileInfo.name}:`,
          error,
        );
      });
    }
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
          console.log(`📖 Processing subtitle file: ${fileInfo.name}`);
          const subtitleTracks = await processSubtitleFile(
            fileInfo,
            subtitleContent,
            0, // Will be repositioned by addTrack
            fps,
            previewUrl,
          );

          console.log(
            `➕ Adding ${subtitleTracks.length} subtitle tracks to timeline`,
          );
          subtitleTracks.forEach((track, index) => {
            console.log(
              `📝 Adding subtitle track ${index + 1}: "${track.subtitleText?.substring(0, 50)}..."`,
            );
            const trackId = addToTimelineFn(track);
            console.log(`✅ Added subtitle track with ID: ${trackId}`);
          });
        }
      } catch (error) {
        console.error(`❌ Error processing subtitle file:`, error);
        // Add single fallback track
        const duration = Math.round(actualDurationSeconds * fps);
        console.log(`📝 Adding fallback subtitle track for: ${fileInfo.name}`);
        const trackId = addToTimelineFn({
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
        console.log(`✅ Added fallback subtitle track with ID: ${trackId}`);
      }
    } else {
      // Add regular media to timeline
      const duration = Math.round(actualDurationSeconds * fps);
      console.log(
        `📹 Adding ${trackType} track: ${fileInfo.name} (duration: ${duration} frames)`,
      );
      const trackId = addToTimelineFn({
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
      console.log(`✅ Added ${trackType} track with ID: ${trackId}`);
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

// Helper function to convert image URL to base64
async function convertImageToBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('Failed to convert image to base64'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read image blob'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error converting image to base64:', error);
    throw error;
  }
}

// Helper function to find a non-overlapping position for a track
function findNonOverlappingPosition(
  desiredStartFrame: number,
  duration: number,
  existingTracks: VideoTrack[],
): number {
  const desiredEndFrame = desiredStartFrame + duration;

  // Sort existing tracks by start frame
  const sortedTracks = [...existingTracks].sort(
    (a, b) => a.startFrame - b.startFrame,
  );

  // Check if desired position conflicts with any existing track
  const hasConflict = sortedTracks.some(
    (track) =>
      desiredStartFrame < track.endFrame && desiredEndFrame > track.startFrame,
  );

  if (!hasConflict) {
    console.log(
      `✅ No conflict for position ${desiredStartFrame}-${desiredEndFrame}`,
    );
    return Math.max(0, desiredStartFrame); // No conflict, use desired position
  }

  console.log(
    `⚠️ Conflict detected for position ${desiredStartFrame}-${desiredEndFrame}, finding alternative...`,
  );

  // Find the best position to place the track
  // Try to place it as close as possible to the desired position

  // Option 1: Try to place it before the conflicting track
  for (const track of sortedTracks) {
    if (track.startFrame >= desiredStartFrame) {
      const spaceBeforeTrack = track.startFrame;
      if (spaceBeforeTrack >= duration) {
        const newPos = Math.max(0, track.startFrame - duration);
        console.log(
          `📍 Placing before track at ${newPos}-${newPos + duration}`,
        );
        return newPos;
      }
      break;
    }
  }

  // Option 2: Try to place it after the conflicting tracks
  let latestEndFrame = 0;
  for (const track of sortedTracks) {
    if (track.endFrame > desiredStartFrame) {
      latestEndFrame = Math.max(latestEndFrame, track.endFrame);
    }
  }
  console.log(
    `📍 Placing after conflicts at ${latestEndFrame}-${latestEndFrame + duration}`,
  );
  return latestEndFrame;
}

export const useVideoEditorStore = create<VideoEditorStore>()(
  subscribeWithSelector((set, get) => ({
    // Initial State
    tracks: [] as VideoTrack[],
    mediaLibrary: [] as MediaLibraryItem[],
    timeline: {
      currentFrame: 0,
      totalFrames: 3000, // 100 seconds at 30fps
      fps: 30,
      zoom: 1,
      scrollX: 0,
      selectedTrackIds: [] as string[],
      playheadVisible: true,
    },
    playback: {
      isPlaying: false,
      isLooping: false,
      playbackRate: 1,
      volume: 1,
      muted: false,
    },
    preview: {
      canvasWidth: 800,
      canvasHeight: 540,
      previewScale: 1,
      showGrid: false,
      showSafeZones: false,
      backgroundColor: '#000000',
    },
    render: {
      isRendering: false,
      progress: 0,
      status: 'ready',
      currentTime: undefined as string | undefined,
    },
    textStyle: {
      activeStyle: 'regular',
      styles: {
        regular: {
          fontWeight: '400',
        },
        semibold: {
          fontWeight: '600',
        },
        bold: {
          fontWeight: '900',
        },
        italic: {
          fontWeight: '400',
          fontStyle: 'italic',
        },
        uppercase: {
          fontWeight: '800',
          textTransform: 'uppercase',
        },
        script: {
          fontFamily: '"Segoe Script", cursive',
          fontWeight: '400',
        },
      },
    },

    // Project persistence state
    currentProjectId: null as string | null,
    isAutoSaveEnabled: true,
    lastSavedAt: null as string | null,
    hasUnsavedChanges: false,

    // Sprite sheet generation tracking
    generatingSpriteSheets: new Set<string>(),

    // Timeline Actions
    setCurrentFrame: (frame) =>
      set((state) => {
        // Calculate effective end frame considering all tracks
        const effectiveEndFrame =
          state.tracks.length > 0
            ? Math.max(
                ...state.tracks.map((track) => track.endFrame),
                state.timeline.totalFrames,
              )
            : state.timeline.totalFrames;

        return {
          timeline: {
            ...state.timeline,
            currentFrame: Math.max(0, Math.min(frame, effectiveEndFrame)),
          },
        };
      }),

    setTotalFrames: (frames) => {
      set((state) => ({
        timeline: { ...state.timeline, totalFrames: Math.max(1, frames) },
      }));
      get().markUnsavedChanges();
    },

    setFps: (fps) => {
      set((state) => ({
        timeline: { ...state.timeline, fps: Math.max(1, fps) },
      }));
      get().markUnsavedChanges();
    },

    setZoom: (zoom) =>
      set((state) => ({
        timeline: {
          ...state.timeline,
          zoom: Math.max(0.1, Math.min(zoom, 10)),
        },
      })),

    setScrollX: (scrollX) =>
      set((state) => ({
        timeline: { ...state.timeline, scrollX: Math.max(0, scrollX) },
      })),

    setInPoint: (frame) =>
      set((state) => ({
        timeline: { ...state.timeline, inPoint: frame },
      })),

    setOutPoint: (frame) =>
      set((state) => ({
        timeline: { ...state.timeline, outPoint: frame },
      })),

    setSelectedTracks: (trackIds) =>
      set((state) => ({
        timeline: { ...state.timeline, selectedTrackIds: trackIds },
      })),

    // Track Actions
    addTrack: (trackData) => {
      const id = uuidv4();

      // Get existing tracks of the same type for smart positioning
      const existingTracks = get().tracks.filter(
        (t) => t.type === trackData.type,
      );
      const duration = trackData.endFrame - trackData.startFrame;

      // Find a non-overlapping position for the new track
      const startFrame = findNonOverlappingPosition(
        trackData.startFrame,
        duration,
        existingTracks,
      );

      const track: VideoTrack = {
        ...trackData,
        id,
        startFrame,
        endFrame: startFrame + duration,
        sourceStartTime: trackData.sourceStartTime || 0, // Default to beginning of source file
        color: getTrackColor(get().tracks.length),
        muted:
          trackData.type === 'audio' || trackData.type === 'video'
            ? false
            : undefined, // Initialize muted for audio and video tracks
      };

      set((state) => ({
        tracks: [...state.tracks, track],
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();

      // Update project thumbnail if this is a video track
      if (trackData.type === 'video') {
        get()
          .updateProjectThumbnailFromTimeline()
          .catch((error) => {
            console.warn('Failed to update project thumbnail:', error);
          });
      }

      return id;
    },

    addTrackFromMediaLibrary: async (mediaId, startFrame = 0) => {
      const mediaItem = get().mediaLibrary.find((item) => item.id === mediaId);
      if (!mediaItem) {
        console.error('Media item not found in library:', mediaId);
        return '';
      }

      // Handle subtitle files specially - parse and create individual tracks
      if (mediaItem.type === 'subtitle' && isSubtitleFile(mediaItem.name)) {
        try {
          // Read subtitle content
          const subtitleContent = await window.electronAPI.readFile(
            mediaItem.source,
          );
          if (subtitleContent) {
            console.log(
              `📖 Processing subtitle from media library: ${mediaItem.name}`,
            );
            // Parse subtitle content and create individual tracks
            const subtitleTracks = await processSubtitleFile(
              {
                name: mediaItem.name,
                path: mediaItem.source,
                type: 'subtitle',
                extension: mediaItem.name.split('.').pop() || '',
                size: mediaItem.size,
              },
              subtitleContent,
              get().tracks.length,
              get().timeline.fps,
              mediaItem.previewUrl,
            );

            console.log(
              `➕ Adding ${subtitleTracks.length} subtitle tracks from media library`,
            );
            // Add each subtitle segment as a track at the specified start frame
            const addedIds: string[] = [];
            let currentStartFrame = startFrame;

            subtitleTracks.forEach((track, index) => {
              const adjustedTrack = {
                ...track,
                startFrame: currentStartFrame,
                endFrame: currentStartFrame + track.duration,
              };
              console.log(
                `📝 Adding subtitle segment ${index + 1}: "${track.subtitleText?.substring(0, 50)}..." at frame ${currentStartFrame}`,
              );
              const trackId = get().addTrack(adjustedTrack);
              addedIds.push(trackId);
              console.log(`✅ Added subtitle track with ID: ${trackId}`);
              currentStartFrame = adjustedTrack.endFrame; // Stack subtitle segments
            });

            console.log(
              `📋 Successfully added ${subtitleTracks.length} subtitle tracks to timeline for ${mediaItem.name}`,
            );
            return addedIds[0] || ''; // Return first track ID
          }
        } catch (error) {
          console.error(
            `❌ Error processing subtitle file ${mediaItem.name}:`,
            error,
          );
          // Fall through to single track creation
        }
      }

      // Convert media library item to single track (for non-subtitles or fallback)
      const duration = Math.round(mediaItem.duration * get().timeline.fps);
      const track: Omit<VideoTrack, 'id'> = {
        type: mediaItem.type,
        name: mediaItem.name,
        source: mediaItem.source,
        previewUrl: mediaItem.previewUrl,
        originalFile: mediaItem.originalFile,
        tempFilePath: mediaItem.tempFilePath,
        duration,
        startFrame,
        endFrame: startFrame + duration,
        sourceStartTime: 0,
        visible: true,
        locked: false,
        color: getTrackColor(get().tracks.length),
        ...(mediaItem.type === 'subtitle' && {
          subtitleText: `Subtitle: ${mediaItem.name}`,
        }),
      };

      return get().addTrack(track);
    },

    removeTrack: (trackId) => {
      const trackToRemove = get().tracks.find((t) => t.id === trackId);
      const isVideoTrack = trackToRemove?.type === 'video';

      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== trackId),
        timeline: {
          ...state.timeline,
          selectedTrackIds: state.timeline.selectedTrackIds.filter(
            (id) => id !== trackId,
          ),
        },
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();

      // Update project thumbnail if a video track was removed or if no tracks remain
      const remainingTracks = get().tracks;
      const hasVideoTracks = remainingTracks.some(
        (track) => track.type === 'video',
      );

      if (isVideoTrack || !hasVideoTracks) {
        get()
          .updateProjectThumbnailFromTimeline()
          .catch((error) => {
            console.warn('Failed to update project thumbnail:', error);
          });
      }
    },

    removeSelectedTracks: () => {
      const state = get();
      const selectedTrackIds = state.timeline.selectedTrackIds;

      if (selectedTrackIds.length === 0) {
        return;
      }

      const tracksToRemove = state.tracks.filter((track) =>
        selectedTrackIds.includes(track.id),
      );
      const hasVideoTracks = tracksToRemove.some(
        (track) => track.type === 'video',
      );

      set((state) => ({
        tracks: state.tracks.filter((t) => !selectedTrackIds.includes(t.id)),
        timeline: {
          ...state.timeline,
          selectedTrackIds: [], // Clear selection after deletion
        },
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();

      // Update project thumbnail if any video tracks were removed or if no tracks remain
      const remainingTracks = get().tracks;
      const remainingVideoTracks = remainingTracks.some(
        (track) => track.type === 'video',
      );

      if (hasVideoTracks || !remainingVideoTracks) {
        get()
          .updateProjectThumbnailFromTimeline()
          .catch((error) => {
            console.warn('Failed to update project thumbnail:', error);
          });
      }
    },

    updateTrack: (trackId, updates) => {
      set((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, ...updates } : track,
        ),
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },

    moveTrack: (trackId, newStartFrame) => {
      set((state) => ({
        tracks: state.tracks.map((track) => {
          if (track.id === trackId) {
            const duration = track.endFrame - track.startFrame;

            // For video tracks, prevent overlaps with other video tracks
            // For audio/image tracks, allow them to overlap with different types but not same type
            const conflictingTracks = state.tracks.filter((t) => {
              if (t.id === trackId) return false;

              // Video tracks can't overlap with any other video tracks
              if (track.type === 'video' && t.type === 'video') return true;

              // Non-video tracks can't overlap with same type
              if (track.type !== 'video' && t.type === track.type) return true;

              return false;
            });

            // Check for collisions and find the best position
            const finalStartFrame = findNonOverlappingPosition(
              newStartFrame,
              duration,
              conflictingTracks,
            );

            console.log(
              `🎬 Moving ${track.type} track "${track.name}" from ${track.startFrame} to ${finalStartFrame}`,
            );

            return {
              ...track,
              startFrame: finalStartFrame,
              endFrame: finalStartFrame + duration,
            };
          }
          return track;
        }),
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },

    resizeTrack: (trackId, newStartFrame, newEndFrame) => {
      set((state) => ({
        tracks: state.tracks.map((track) => {
          if (track.id === trackId) {
            const updatedStartFrame = newStartFrame || track.startFrame;
            const updatedEndFrame = newEndFrame || track.endFrame;
            return {
              ...track,
              startFrame: updatedStartFrame,
              endFrame: updatedEndFrame,
              duration: updatedEndFrame - updatedStartFrame, // Keep duration in sync
            };
          }
          return track;
        }),
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },

    duplicateTrack: (trackId) => {
      const originalTrack = get().tracks.find((t) => t.id === trackId);
      if (!originalTrack) return '';

      const newId = uuidv4();
      const duplicatedTrack: VideoTrack = {
        ...originalTrack,
        id: newId,
        name: `${originalTrack.name} Copy`,
        startFrame: originalTrack.endFrame,
        endFrame:
          originalTrack.endFrame +
          (originalTrack.endFrame - originalTrack.startFrame),
      };

      set((state) => ({
        tracks: [...state.tracks, duplicatedTrack],
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();

      return newId;
    },

    splitTrack: (trackId, frame) => {
      const state = get();
      const track = state.tracks.find((t) => t.id === trackId);
      if (!track || frame <= track.startFrame || frame >= track.endFrame)
        return;

      const newId = uuidv4();

      // Calculate timing for split parts
      const splitTimeInSeconds =
        (frame - track.startFrame) / state.timeline.fps;
      const originalSourceStartTime = track.sourceStartTime || 0;

      const firstPart = {
        ...track,
        endFrame: frame,
        duration: frame - track.startFrame, // Update duration for first part
        sourceStartTime: originalSourceStartTime, // Keep original source start time
      };

      const secondPart: VideoTrack = {
        ...track,
        id: newId,
        name: `${track.name} (2)`,
        startFrame: frame,
        duration: track.endFrame - frame, // Update duration for second part
        sourceStartTime: originalSourceStartTime + splitTimeInSeconds, // Start from split point in source
      };

      console.log(
        `✂️ Split timing: First part source start: ${firstPart.sourceStartTime}s, Second part source start: ${secondPart.sourceStartTime}s`,
      );

      set((state) => ({
        tracks: state.tracks
          .map((t) => (t.id === trackId ? firstPart : t))
          .concat(secondPart),
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },

    splitAtPlayhead: () => {
      const state = get();
      const currentFrame = state.timeline.currentFrame;

      // Find all tracks that intersect with the current playhead position
      const intersectingTracks = state.tracks.filter(
        (track) =>
          currentFrame > track.startFrame && currentFrame < track.endFrame,
      );

      if (intersectingTracks.length === 0) {
        console.log('🚫 No tracks found at current playhead position');
        return false;
      }

      // Split all intersecting tracks at the current playhead position
      let splitCount = 0;
      intersectingTracks.forEach((track) => {
        console.log(
          `✂️ Splitting track "${track.name}" at frame ${currentFrame}`,
        );
        get().splitTrack(track.id, currentFrame);
        splitCount++;
      });

      console.log(
        `✅ Successfully split ${splitCount} track(s) at frame ${currentFrame}`,
      );
      return true;
    },

    toggleTrackVisibility: (trackId) => {
      set((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, visible: !track.visible } : track,
        ),
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },

    toggleTrackMute: (trackId) => {
      set((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, muted: !track.muted } : track,
        ),
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },

    // Playback Actions
    play: () =>
      set((state) => ({
        playback: { ...state.playback, isPlaying: true },
      })),

    pause: () =>
      set((state) => ({
        playback: { ...state.playback, isPlaying: false },
      })),

    stop: () =>
      set((state) => ({
        playback: { ...state.playback, isPlaying: false },
        timeline: {
          ...state.timeline,
          currentFrame: state.timeline.inPoint || 0,
        },
      })),

    togglePlayback: () =>
      set((state) => ({
        playback: { ...state.playback, isPlaying: !state.playback.isPlaying },
      })),

    setPlaybackRate: (rate) =>
      set((state) => ({
        playback: {
          ...state.playback,
          playbackRate: Math.max(0.1, Math.min(rate, 4)),
        },
      })),

    setVolume: (volume) =>
      set((state) => ({
        playback: {
          ...state.playback,
          volume: Math.max(0, Math.min(volume, 1)),
        },
      })),

    toggleMute: () =>
      set((state) => ({
        playback: { ...state.playback, muted: !state.playback.muted },
      })),

    toggleLoop: () =>
      set((state) => ({
        playback: { ...state.playback, isLooping: !state.playback.isLooping },
      })),

    // Preview Actions
    setCanvasSize: (width, height) => {
      set((state) => ({
        preview: { ...state.preview, canvasWidth: width, canvasHeight: height },
      }));
      get().markUnsavedChanges();
    },

    setPreviewScale: (scale) =>
      set((state) => ({
        preview: {
          ...state.preview,
          previewScale: Math.max(0.1, Math.min(scale, 5)),
        },
      })),

    toggleGrid: () =>
      set((state) => ({
        preview: { ...state.preview, showGrid: !state.preview.showGrid },
      })),

    toggleSafeZones: () =>
      set((state) => ({
        preview: {
          ...state.preview,
          showSafeZones: !state.preview.showSafeZones,
        },
      })),

    setBackgroundColor: (color) =>
      set((state) => ({
        preview: { ...state.preview, backgroundColor: color },
      })),

    // Render Actions
    startRender: (job) =>
      set((state) => ({
        render: {
          ...state.render,
          isRendering: true,
          progress: 0,
          status: 'Starting render...',
          currentJob: job,
        },
      })),

    updateRenderProgress: (progress, status, currentTime) =>
      set((state) => ({
        render: { ...state.render, progress, status, currentTime },
      })),

    finishRender: () =>
      set((state) => ({
        render: {
          ...state.render,
          isRendering: false,
          progress: 100,
          status: 'Render complete',
          currentTime: undefined,
          currentJob: undefined,
        },
      })),

    cancelRender: () =>
      set((state) => ({
        render: {
          ...state.render,
          isRendering: false,
          progress: 0,
          status: 'Render cancelled',
          currentTime: undefined,
          currentJob: undefined,
        },
      })),

    // Text Style Actions
    setActiveTextStyle: (styleId) =>
      set((state) => ({
        textStyle: {
          ...state.textStyle,
          activeStyle: styleId,
        },
      })),

    getTextStyleForSubtitle: (styleId) => {
      const state = get();
      const style =
        state.textStyle.styles[styleId] || state.textStyle.styles.regular;
      return {
        fontFamily: style.fontFamily || '"Arial", sans-serif',
        fontWeight: style.fontWeight || '400',
        fontStyle: style.fontStyle || 'normal',
        textTransform:
          (style.textTransform as
            | 'none'
            | 'uppercase'
            | 'lowercase'
            | 'capitalize') || 'none',
      };
    },

    // Utility Actions
    reset: () =>
      set({
        tracks: [],
        mediaLibrary: [],
        timeline: {
          currentFrame: 0,
          totalFrames: 3000,
          fps: 30,
          zoom: 1,
          scrollX: 0,
          selectedTrackIds: [],
          playheadVisible: true,
        },
        playback: {
          isPlaying: false,
          isLooping: false,
          playbackRate: 1,
          volume: 1,
          muted: false,
        },
        render: {
          isRendering: false,
          progress: 0,
          status: 'ready',
          currentTime: undefined,
        },
        currentProjectId: null,
        isAutoSaveEnabled: true,
        lastSavedAt: null,
        hasUnsavedChanges: false,
      }),

    importMediaFromDialog: async () => {
      try {
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

        const importedFiles: Array<{
          id: string;
          name: string;
          type: string;
          size: number;
          url: string;
          thumbnail?: string;
        }> = [];

        // Process files and add to media library only (no timeline)
        await Promise.all(
          result.files.map(async (fileInfo) => {
            const fileData = await processImportedFile(
              fileInfo,
              get().addToMediaLibrary,
              undefined, // No timeline addition
              () => get().timeline.fps,
              get().generateSpriteSheetForMedia, // Generate sprite sheets on import
              get().generateThumbnailForMedia, // Generate thumbnails on import
            );
            importedFiles.push(fileData);
          }),
        );

        return { success: true, importedFiles };
      } catch (error) {
        console.error('Failed to import media from dialog:', error);
        return { success: false, importedFiles: [] };
      }
    },

    importMediaFromFiles: async (files) => {
      // Legacy method for web File objects - fallback for drag & drop
      const newTracks = await Promise.all(
        files.map(async (file, index) => {
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
                get().tracks.length + index,
                get().timeline.fps,
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
                color: getTrackColor(get().tracks.length + index),
                subtitleText: `Subtitle: ${file.name}`,
              };
            }
          }

          // For regular File objects, we'll create blob URLs for preview
          // but log a warning that this won't work with FFmpeg
          const blobUrl = URL.createObjectURL(file);
          console.warn(
            'Using blob URL for file:',
            file.name,
            'This will not work with FFmpeg. Use importMediaFromDialog instead.',
          );

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
            color: getTrackColor(get().tracks.length + index),
          };
        }),
      );

      // Flatten tracks array (subtitle files return arrays of tracks) and filter out null/undefined
      const validTracks = newTracks.flat().filter(Boolean);
      validTracks.forEach((track) => get().addTrack(track));
    },

    importMediaFromDrop: async (files) => {
      try {
        console.log(
          '🎯 importMediaFromDrop called with files (library only):',
          files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        );

        // Convert File objects to ArrayBuffers for IPC transfer
        const fileBuffers = await Promise.all(
          files.map(async (file) => {
            const buffer = await file.arrayBuffer();
            return {
              name: file.name,
              type: file.type,
              size: file.size,
              buffer,
            };
          }),
        );

        console.log('🚀 Sending files to main process for processing...');

        // Process files in main process to get real file paths
        const result =
          await window.electronAPI.processDroppedFiles(fileBuffers);

        if (!result.success) {
          console.error(
            '❌ Failed to process files in main process:',
            result.error,
          );
          return { success: false, importedFiles: [] };
        }

        console.log('✅ Files processed in main process:', result.files);

        const importedFiles: Array<{
          id: string;
          name: string;
          type: string;
          size: number;
          url: string;
          thumbnail?: string;
        }> = [];

        // Process files and add to media library only (no timeline)
        await Promise.all(
          result.files.map(async (fileInfo) => {
            const fileData = await processImportedFile(
              fileInfo,
              get().addToMediaLibrary,
              undefined, // No timeline addition
              () => get().timeline.fps,
              get().generateSpriteSheetForMedia, // Generate sprite sheets on import
              get().generateThumbnailForMedia, // Generate thumbnails on import
            );
            importedFiles.push(fileData);
          }),
        );

        console.log(
          `✅ Added ${importedFiles.length} files to media library only`,
        );
        return { success: true, importedFiles };
      } catch (error) {
        console.error('Failed to import media from drop:', error);
        return { success: false, importedFiles: [] };
      }
    },

    importMediaToTimeline: async (files) => {
      try {
        console.log(
          '🎯 importMediaToTimeline called with files:',
          files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        );

        // Convert File objects to ArrayBuffers for IPC transfer
        const fileBuffers = await Promise.all(
          files.map(async (file) => {
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
        const result =
          await window.electronAPI.processDroppedFiles(fileBuffers);

        if (!result.success) {
          console.error(
            '❌ Failed to process files in main process:',
            result.error,
          );
          return { success: false, importedFiles: [] };
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
            const fileData = await processImportedFile(
              fileInfo,
              get().addToMediaLibrary,
              get().addTrack, // Also add to timeline
              () => get().timeline.fps,
              get().generateSpriteSheetForMedia, // Generate sprite sheets on import
              get().generateThumbnailForMedia, // Generate thumbnails on import
            );
            importedFiles.push(fileData);
          }),
        );

        console.log(
          `✅ Added ${importedFiles.length} files to both library and timeline`,
        );
        return { success: true, importedFiles };
      } catch (error) {
        console.error('Failed to import media to timeline:', error);
        return { success: false, importedFiles: [] };
      }
    },

    exportProject: () => {
      const state = get();
      return JSON.stringify({
        tracks: state.tracks,
        timeline: state.timeline,
        preview: state.preview,
      });
    },

    importProject: (data) => {
      try {
        const projectData = JSON.parse(data);
        set((state) => ({
          ...state,
          tracks: projectData.tracks || [],
          timeline: { ...state.timeline, ...projectData.timeline },
          playback: {
            ...state.playback,
            ...(projectData.playback || {}),
            isPlaying: false, // Always start paused when importing a project
          },
          preview: { ...state.preview, ...projectData.preview },
          hasUnsavedChanges: false,
        }));
      } catch (error) {
        console.error('Failed to import project:', error);
      }
    },

    // Project persistence actions
    setCurrentProjectId: (projectId) => {
      set({ currentProjectId: projectId, hasUnsavedChanges: false });
    },

    loadProjectData: async (projectId) => {
      try {
        const project = await projectService.getProject(projectId);
        if (!project) {
          throw new Error('Project not found');
        }

        const { videoEditor } = project;
        set((state) => ({
          ...state,
          tracks: videoEditor.tracks || [],
          mediaLibrary: (videoEditor as any).mediaLibrary || [], // Support for legacy projects
          timeline: { ...state.timeline, ...videoEditor.timeline },
          playback: {
            ...state.playback,
            ...videoEditor.playback,
            isPlaying: false, // Always start paused when loading a project
          },
          preview: { ...state.preview, ...videoEditor.preview },
          currentProjectId: projectId,
          hasUnsavedChanges: false,
          lastSavedAt: new Date().toISOString(),
        }));

        console.log(`✅ Loaded project data for: ${project.metadata.title}`);
      } catch (error) {
        console.error('Failed to load project data:', error);
        throw error;
      }
    },

    saveProjectData: async () => {
      const state = get();
      if (!state.currentProjectId) {
        console.warn('No current project ID set, cannot save');
        return;
      }

      try {
        // Get current project from ProjectService
        const currentProject = await projectService.getProject(
          state.currentProjectId,
        );
        if (!currentProject) {
          throw new Error('Current project not found');
        }

        // Update the project with current video editor state
        const updatedProject = {
          ...currentProject,
          videoEditor: {
            tracks: state.tracks,
            mediaLibrary: state.mediaLibrary,
            timeline: state.timeline,
            playback: state.playback,
            preview: state.preview,
          },
          metadata: {
            ...currentProject.metadata,
            updatedAt: new Date().toISOString(),
            // Update duration based on tracks
            duration:
              state.tracks.length > 0
                ? Math.max(...state.tracks.map((t) => t.endFrame)) /
                  state.timeline.fps
                : 0,
          },
        };

        // Save to IndexedDB
        await projectService.updateProject(updatedProject);

        // Update local state
        set({
          hasUnsavedChanges: false,
          lastSavedAt: new Date().toISOString(),
        });

        // Sync with ProjectStore to update the project list
        get().syncWithProjectStore();

        console.log(
          `💾 Saved project data for: ${updatedProject.metadata.title}`,
        );
      } catch (error) {
        console.error('Failed to save project data:', error);
        throw error;
      }
    },

    setAutoSave: (enabled) => {
      set({ isAutoSaveEnabled: enabled });
    },

    markUnsavedChanges: () => {
      const state = get();
      if (!state.hasUnsavedChanges) {
        set({ hasUnsavedChanges: true });

        // Auto-save if enabled and we have a current project
        if (state.isAutoSaveEnabled && state.currentProjectId) {
          // Debounce auto-save to avoid too frequent saves
          setTimeout(() => {
            const currentState = get();
            if (
              currentState.hasUnsavedChanges &&
              currentState.currentProjectId
            ) {
              currentState.saveProjectData().catch(console.error);
            }
          }, 2000); // 2 second delay
        }
      }
    },

    clearUnsavedChanges: () => {
      set({ hasUnsavedChanges: false });
    },

    syncWithProjectStore: () => {
      // Trigger ProjectStore to reload projects
      const projectStore = useProjectStore.getState();
      projectStore.loadProjects().catch(console.error);
    },

    // Media Library Actions
    addToMediaLibrary: (itemData) => {
      const id = uuidv4();
      const item: MediaLibraryItem = {
        ...itemData,
        id,
      };

      set((state) => ({
        mediaLibrary: [...state.mediaLibrary, item],
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();

      return id;
    },

    removeFromMediaLibrary: (mediaId) => {
      set((state) => ({
        mediaLibrary: state.mediaLibrary.filter((item) => item.id !== mediaId),
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },

    getMediaLibraryItem: (mediaId) => {
      return get().mediaLibrary.find((item) => item.id === mediaId);
    },

    getSpriteSheetsBySource: (source) => {
      const mediaItem = get().mediaLibrary.find(
        (item) => item.source === source || item.tempFilePath === source,
      );
      return mediaItem?.spriteSheets;
    },

    isGeneratingSpriteSheet: (mediaId) => {
      return get().generatingSpriteSheets.has(mediaId);
    },

    setGeneratingSpriteSheet: (mediaId, isGenerating) => {
      set((state) => {
        const newGeneratingSet = new Set(state.generatingSpriteSheets);
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

    generateSpriteSheetForMedia: async (mediaId) => {
      const mediaItem = get().mediaLibrary.find((item) => item.id === mediaId);
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
          set((state) => ({
            mediaLibrary: state.mediaLibrary.map((item) =>
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
          get().markUnsavedChanges();

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

    generateThumbnailForMedia: async (mediaId) => {
      const mediaItem = get().mediaLibrary.find((item) => item.id === mediaId);
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

          // Convert thumbnail to base64 for storage
          const base64Thumbnail = await convertImageToBase64(thumbnailUrl);

          // Update the media library item with thumbnail data
          set((state) => ({
            mediaLibrary: state.mediaLibrary.map((item) =>
              item.id === mediaId
                ? {
                    ...item,
                    thumbnail: base64Thumbnail,
                  }
                : item,
            ),
          }));

          // Mark as having unsaved changes
          get().markUnsavedChanges();

          console.log(
            `✅ Thumbnail generated and cached for: ${mediaItem.name}`,
          );
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
      const state = get();

      // Find the first video track on the timeline
      const firstVideoTrack = state.tracks
        .filter((track) => track.type === 'video' && track.visible)
        .sort((a, b) => a.startFrame - b.startFrame)[0];

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
              get().syncWithProjectStore();

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

      // Find the corresponding media library item
      const mediaItem = state.mediaLibrary.find(
        (item) =>
          item.source === firstVideoTrack.source ||
          item.tempFilePath === firstVideoTrack.source,
      );

      if (!mediaItem) {
        console.log('Media library item not found for first video track');
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
            get().syncWithProjectStore();

            console.log(
              `📸 Updated project thumbnail from: ${firstVideoTrack.name}`,
            );
          }
        } catch (error) {
          console.error('Failed to update project thumbnail:', error);
        }
      }
    },

    clearMediaLibrary: () => {
      set(() => ({
        mediaLibrary: [],
      }));

      // Mark as having unsaved changes
      get().markUnsavedChanges();
    },
  })),
);

// Timeline keyboard shortcuts hook
export const useTimelineShortcuts = () => {
  const store = useVideoEditorStore();

  return {
    onSpace: () => store.togglePlayback(),
    onHome: () => store.setCurrentFrame(0),
    onEnd: () => {
      // Calculate effective end frame considering all tracks
      const effectiveEndFrame =
        store.tracks.length > 0
          ? Math.max(
              ...store.tracks.map((track) => track.endFrame),
              store.timeline.totalFrames,
            )
          : store.timeline.totalFrames;
      store.setCurrentFrame(effectiveEndFrame - 1);
    },
    onArrowLeft: () => store.setCurrentFrame(store.timeline.currentFrame - 1),
    onArrowRight: () => store.setCurrentFrame(store.timeline.currentFrame + 1),
    onI: () => store.setInPoint(store.timeline.currentFrame),
    onO: () => store.setOutPoint(store.timeline.currentFrame),
    onDelete: () => {
      store.removeSelectedTracks();
    },
  };
};
