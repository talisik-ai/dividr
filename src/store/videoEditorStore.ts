import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface VideoTrack {
  id: string;
  type: 'video' | 'audio' | 'image';
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
  color: string;
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
  currentJob?: {
    outputPath: string;
    format: string;
    quality: string;
  };
}

interface VideoEditorStore {
  // State
  tracks: VideoTrack[];
  timeline: TimelineState;
  playback: PlaybackState;
  preview: PreviewState;
  render: RenderState;

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
  removeTrack: (trackId: string) => void;
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
  updateRenderProgress: (progress: number, status: string) => void;
  finishRender: () => void;
  cancelRender: () => void;

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
  }>; // New method using native dialog
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
  }>; // New method for drag-and-drop with proper file handling
  exportProject: () => string;
  importProject: (data: string) => void;
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

const getTrackColor = (index: number) =>
  TRACK_COLORS[index % TRACK_COLORS.length];

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
    },

    // Timeline Actions
    setCurrentFrame: (frame) =>
      set((state) => ({
        timeline: {
          ...state.timeline,
          currentFrame: Math.max(
            0,
            Math.min(frame, state.timeline.totalFrames),
          ),
        },
      })),

    setTotalFrames: (frames) =>
      set((state) => ({
        timeline: { ...state.timeline, totalFrames: Math.max(1, frames) },
      })),

    setFps: (fps) =>
      set((state) => ({
        timeline: { ...state.timeline, fps: Math.max(1, fps) },
      })),

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
      };

      set((state) => ({
        tracks: [...state.tracks, track],
      }));

      return id;
    },

    removeTrack: (trackId) =>
      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== trackId),
        timeline: {
          ...state.timeline,
          selectedTrackIds: state.timeline.selectedTrackIds.filter(
            (id) => id !== trackId,
          ),
        },
      })),

    updateTrack: (trackId, updates) =>
      set((state) => ({
        tracks: state.tracks.map((track) =>
          track.id === trackId ? { ...track, ...updates } : track,
        ),
      })),

    moveTrack: (trackId, newStartFrame) =>
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
      })),

    resizeTrack: (trackId, newStartFrame, newEndFrame) =>
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
      })),

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
    setCanvasSize: (width, height) =>
      set((state) => ({
        preview: { ...state.preview, canvasWidth: width, canvasHeight: height },
      })),

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

    updateRenderProgress: (progress, status) =>
      set((state) => ({
        render: { ...state.render, progress, status },
      })),

    finishRender: () =>
      set((state) => ({
        render: {
          ...state.render,
          isRendering: false,
          progress: 100,
          status: 'Render complete',
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
          currentJob: undefined,
        },
      })),

    // Utility Actions
    reset: () =>
      set({
        tracks: [],
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
        },
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

        const newTracks = await Promise.all(
          result.files.map(async (fileInfo, index) => {
            // Get accurate duration using FFprobe
            let actualDuration: number;
            try {
              const durationSeconds = await window.electronAPI.getDuration(
                fileInfo.path,
              );
              actualDuration = Math.round(durationSeconds * get().timeline.fps); // Convert to frames
            } catch (error) {
              console.warn(
                `⚠️ Failed to get duration for ${fileInfo.name}, using fallback:`,
                error,
              );
              // Fallback to estimation
              const estimatedDuration = fileInfo.type === 'image' ? 150 : 1500; // 5s for images, 50s for video/audio
              actualDuration = estimatedDuration;
            }

            // Create preview URL for video and image tracks
            let previewUrl: string | undefined;
            if (fileInfo.type === 'video' || fileInfo.type === 'image') {
              try {
                const previewResult = await window.electronAPI.createPreviewUrl(
                  fileInfo.path,
                );
                if (previewResult.success) {
                  previewUrl = previewResult.url;
                  console.log(`✅ Preview URL created for: ${fileInfo.name}`);
                } else {
                  console.warn(
                    `⚠️ Failed to create preview URL for ${fileInfo.name}:`,
                    previewResult.error,
                  );
                }
              } catch (error) {
                console.warn(
                  `⚠️ Error creating preview URL for ${fileInfo.name}:`,
                  error,
                );
              }
            }

            // Determine proper MIME type
            let mimeType = 'application/octet-stream';
            if (fileInfo.type === 'video') {
              mimeType = `video/${fileInfo.extension}`;
            } else if (fileInfo.type === 'audio') {
              mimeType = `audio/${fileInfo.extension}`;
            } else if (fileInfo.type === 'image') {
              mimeType = `image/${fileInfo.extension}`;
            }

            // Add to imported files list for MediaImportPanel
            importedFiles.push({
              id: Math.random().toString(36).substr(2, 9),
              name: fileInfo.name,
              type: mimeType,
              size: fileInfo.size,
              url: previewUrl || fileInfo.path,
            });

            return {
              type: fileInfo.type,
              name: fileInfo.name,
              source: fileInfo.path, // This is the actual file system path for FFmpeg
              previewUrl, // This is the data URL for preview display
              duration: actualDuration,
              startFrame: 0, // Start at 0, let the smart positioning handle arrangement
              endFrame: actualDuration,
              visible: true,
              locked: false,
              color: getTrackColor(get().tracks.length + index),
            };
          }),
        );

        newTracks.forEach((track) => get().addTrack(track));

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

      newTracks.forEach((track) => get().addTrack(track));
    },

    importMediaFromDrop: async (files) => {
      try {
        console.log(
          '🎯 importMediaFromDrop called with files:',
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

        const newTracks = await Promise.all(
          result.files.map(async (fileInfo, index) => {
            console.log(
              `🔍 Processing file: ${fileInfo.name}, path: ${fileInfo.path}`,
            );

            // Get accurate duration using FFprobe
            let actualDuration: number;
            try {
              const durationSeconds = await window.electronAPI.getDuration(
                fileInfo.path,
              );
              console.log(
                `⏱️ Duration for ${fileInfo.name}: ${durationSeconds}s`,
              );
              actualDuration = Math.round(
                durationSeconds * (get().timeline.fps || 30),
              );
            } catch (error) {
              console.warn(
                `⚠️ Failed to get duration for ${fileInfo.name}:`,
                error,
              );
              const estimatedDuration = fileInfo.type === 'image' ? 150 : 1500;
              actualDuration = estimatedDuration;
            }

            // Create preview URL
            let previewUrl: string | undefined;
            if (fileInfo.type === 'video' || fileInfo.type === 'image') {
              try {
                const previewResult = await window.electronAPI.createPreviewUrl(
                  fileInfo.path,
                );
                if (previewResult.success) {
                  previewUrl = previewResult.url;
                  console.log(`✅ Preview URL created for: ${fileInfo.name}`);
                } else {
                  console.warn(
                    `⚠️ Failed to create preview URL for ${fileInfo.name}:`,
                    previewResult.error,
                  );
                }
              } catch (error) {
                console.warn(
                  `⚠️ Error creating preview URL for ${fileInfo.name}:`,
                  error,
                );
              }
            }

            // Determine proper MIME type
            let mimeType = 'application/octet-stream';
            if (fileInfo.type === 'video') {
              mimeType = `video/${fileInfo.extension}`;
            } else if (fileInfo.type === 'audio') {
              mimeType = `audio/${fileInfo.extension}`;
            } else if (fileInfo.type === 'image') {
              mimeType = `image/${fileInfo.extension}`;
            }

            // Add to imported files list for MediaImportPanel
            importedFiles.push({
              id: Math.random().toString(36).substr(2, 9),
              name: fileInfo.name,
              type: mimeType,
              size: fileInfo.size,
              url: previewUrl || fileInfo.path,
            });

            const track = {
              type: fileInfo.type,
              name: fileInfo.name,
              source: fileInfo.path, // Use actual file path for FFmpeg compatibility
              previewUrl, // Use preview URL for display
              duration: actualDuration,
              startFrame: 0, // Start at 0, let smart positioning handle arrangement
              endFrame: actualDuration,
              visible: true,
              locked: false,
              color: getTrackColor(get().tracks.length + index),
            };

            console.log(`📋 Created track for ${fileInfo.name}:`, track);
            return track;
          }),
        );

        console.log(
          `✅ Adding ${newTracks.length} tracks to timeline:`,
          newTracks.map((t) => ({
            name: t.name,
            type: t.type,
            previewUrl: !!t.previewUrl,
          })),
        );
        console.log(
          `📊 Current tracks count before adding: ${get().tracks.length}`,
        );
        newTracks.forEach((track) => {
          const addedId = get().addTrack(track);
          console.log(`➕ Added track with ID: ${addedId} for ${track.name}`);
        });
        console.log(
          `📊 Current tracks count after adding: ${get().tracks.length}`,
        );
        console.log(
          `📋 All tracks in store:`,
          get().tracks.map((t) => ({ id: t.id, name: t.name, type: t.type })),
        );

        return { success: true, importedFiles };
      } catch (error) {
        console.error('Failed to import media from drop:', error);
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
          preview: { ...state.preview, ...projectData.preview },
        }));
      } catch (error) {
        console.error('Failed to import project:', error);
      }
    },
  })),
);

// Timeline keyboard shortcuts hook
export const useTimelineShortcuts = () => {
  const store = useVideoEditorStore();

  return {
    onSpace: () => store.togglePlayback(),
    onHome: () => store.setCurrentFrame(0),
    onEnd: () => store.setCurrentFrame(store.timeline.totalFrames),
    onArrowLeft: () => store.setCurrentFrame(store.timeline.currentFrame - 1),
    onArrowRight: () => store.setCurrentFrame(store.timeline.currentFrame + 1),
    onI: () => store.setInPoint(store.timeline.currentFrame),
    onO: () => store.setOutPoint(store.timeline.currentFrame),
    onDelete: () => {
      store.timeline.selectedTrackIds.forEach((id) => store.removeTrack(id));
      store.setSelectedTracks([]);
    },
  };
};
