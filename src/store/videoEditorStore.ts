import { v4 as uuidv4 } from 'uuid';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

export interface VideoTrack {
  id: string;
  type: 'video' | 'audio' | 'image';
  name: string;
  source: string; // This will be a blob URL for display purposes
  originalFile?: File; // Store the original File object for FFmpeg conversion
  tempFilePath?: string; // Store the temporary file path when converted
  duration: number; // in frames
  startFrame: number;
  endFrame: number;
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
  duplicateTrack: (trackId: string) => string;
  splitTrack: (trackId: string, frame: number) => void;
  
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
  startRender: (job: { outputPath: string; format: string; quality: string }) => void;
  updateRenderProgress: (progress: number, status: string) => void;
  finishRender: () => void;
  cancelRender: () => void;
  
  // Utility Actions
  reset: () => void;
  importMediaFromDialog: () => Promise<void>; // New method using native dialog
  importMediaFromFiles: (files: File[]) => Promise<void>; // Keep for backward compatibility
  exportProject: () => string;
  importProject: (data: string) => void;
}

const TRACK_COLORS = [
  '#8e44ad', '#3498db', '#e74c3c', '#f39c12', 
  '#27ae60', '#e67e22', '#9b59b6', '#34495e'
];

const getTrackColor = (index: number) => TRACK_COLORS[index % TRACK_COLORS.length];

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
      canvasWidth: 1920,
      canvasHeight: 1080,
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
        timeline: { ...state.timeline, currentFrame: Math.max(0, Math.min(frame, state.timeline.totalFrames)) }
      })),
    
    setTotalFrames: (frames) => 
      set((state) => ({
        timeline: { ...state.timeline, totalFrames: Math.max(1, frames) }
      })),
    
    setFps: (fps) => 
      set((state) => ({
        timeline: { ...state.timeline, fps: Math.max(1, fps) }
      })),
    
    setZoom: (zoom) => 
      set((state) => ({
        timeline: { ...state.timeline, zoom: Math.max(0.1, Math.min(zoom, 10)) }
      })),
    
    setScrollX: (scrollX) => 
      set((state) => ({
        timeline: { ...state.timeline, scrollX: Math.max(0, scrollX) }
      })),
    
    setInPoint: (frame) => 
      set((state) => ({
        timeline: { ...state.timeline, inPoint: frame }
      })),
    
    setOutPoint: (frame) => 
      set((state) => ({
        timeline: { ...state.timeline, outPoint: frame }
      })),
    
    setSelectedTracks: (trackIds) => 
      set((state) => ({
        timeline: { ...state.timeline, selectedTrackIds: trackIds }
      })),

    // Track Actions
    addTrack: (trackData) => {
      const id = uuidv4();
      const track: VideoTrack = {
        ...trackData,
        id,
        color: getTrackColor(get().tracks.length),
      };
      
      set((state) => ({
        tracks: [...state.tracks, track]
      }));
      
      return id;
    },
    
    removeTrack: (trackId) => 
      set((state) => ({
        tracks: state.tracks.filter(t => t.id !== trackId),
        timeline: {
          ...state.timeline,
          selectedTrackIds: state.timeline.selectedTrackIds.filter(id => id !== trackId)
        }
      })),
    
    updateTrack: (trackId, updates) => 
      set((state) => ({
        tracks: state.tracks.map(track => 
          track.id === trackId ? { ...track, ...updates } : track
        )
      })),
    
    moveTrack: (trackId, newStartFrame) => 
      set((state) => ({
        tracks: state.tracks.map(track => {
          if (track.id === trackId) {
            const duration = track.endFrame - track.startFrame;
            return {
              ...track,
              startFrame: newStartFrame,
              endFrame: newStartFrame + duration,
            };
          }
          return track;
        })
      })),
    
    duplicateTrack: (trackId) => {
      const originalTrack = get().tracks.find(t => t.id === trackId);
      if (!originalTrack) return '';
      
      const newId = uuidv4();
      const duplicatedTrack: VideoTrack = {
        ...originalTrack,
        id: newId,
        name: `${originalTrack.name} Copy`,
        startFrame: originalTrack.endFrame,
        endFrame: originalTrack.endFrame + (originalTrack.endFrame - originalTrack.startFrame),
      };
      
      set((state) => ({
        tracks: [...state.tracks, duplicatedTrack]
      }));
      
      return newId;
    },
    
    splitTrack: (trackId, frame) => {
      const track = get().tracks.find(t => t.id === trackId);
      if (!track || frame <= track.startFrame || frame >= track.endFrame) return;
      
      const newId = uuidv4();
      const firstPart = { ...track, endFrame: frame };
      const secondPart: VideoTrack = {
        ...track,
        id: newId,
        name: `${track.name} (2)`,
        startFrame: frame,
      };
      
      set((state) => ({
        tracks: state.tracks.map(t => t.id === trackId ? firstPart : t).concat(secondPart)
      }));
    },

    // Playback Actions
    play: () => 
      set((state) => ({
        playback: { ...state.playback, isPlaying: true }
      })),
    
    pause: () => 
      set((state) => ({
        playback: { ...state.playback, isPlaying: false }
      })),
    
    stop: () => 
      set((state) => ({
        playback: { ...state.playback, isPlaying: false },
        timeline: { ...state.timeline, currentFrame: state.timeline.inPoint || 0 }
      })),
    
    togglePlayback: () => 
      set((state) => ({
        playback: { ...state.playback, isPlaying: !state.playback.isPlaying }
      })),
    
    setPlaybackRate: (rate) => 
      set((state) => ({
        playback: { ...state.playback, playbackRate: Math.max(0.1, Math.min(rate, 4)) }
      })),
    
    setVolume: (volume) => 
      set((state) => ({
        playback: { ...state.playback, volume: Math.max(0, Math.min(volume, 1)) }
      })),
    
    toggleMute: () => 
      set((state) => ({
        playback: { ...state.playback, muted: !state.playback.muted }
      })),
    
    toggleLoop: () => 
      set((state) => ({
        playback: { ...state.playback, isLooping: !state.playback.isLooping }
      })),

    // Preview Actions
    setCanvasSize: (width, height) => 
      set((state) => ({
        preview: { ...state.preview, canvasWidth: width, canvasHeight: height }
      })),
    
    setPreviewScale: (scale) => 
      set((state) => ({
        preview: { ...state.preview, previewScale: Math.max(0.1, Math.min(scale, 5)) }
      })),
    
    toggleGrid: () => 
      set((state) => ({
        preview: { ...state.preview, showGrid: !state.preview.showGrid }
      })),
    
    toggleSafeZones: () => 
      set((state) => ({
        preview: { ...state.preview, showSafeZones: !state.preview.showSafeZones }
      })),
    
    setBackgroundColor: (color) => 
      set((state) => ({
        preview: { ...state.preview, backgroundColor: color }
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
        }
      })),
    
    updateRenderProgress: (progress, status) => 
      set((state) => ({
        render: { ...state.render, progress, status }
      })),
    
    finishRender: () => 
      set((state) => ({
        render: {
          ...state.render,
          isRendering: false,
          progress: 100,
          status: 'Render complete',
          currentJob: undefined,
        }
      })),
    
    cancelRender: () => 
      set((state) => ({
        render: {
          ...state.render,
          isRendering: false,
          progress: 0,
          status: 'Render cancelled',
          currentJob: undefined,
        }
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
          properties: ['openFile', 'multiSelections']
        });

        console.log(result);

        if (!result.success || result.canceled || !result.files) {
          return;
        }

        const newTracks = result.files.map((fileInfo, index) => {
          // Estimate duration based on file type
          const estimatedDuration = fileInfo.type === 'image' ? 150 : 1500; // 5s for images, 50s for video/audio
          
          return {
            type: fileInfo.type,
            name: fileInfo.name,
            source: fileInfo.path, // This is the actual file system path
            duration: estimatedDuration,
            startFrame: index * 150, // Stagger by 5 seconds
            endFrame: index * 150 + estimatedDuration,
            visible: true,
            locked: false,
            color: getTrackColor(get().tracks.length + index),
          };
        });
        
        newTracks.forEach(track => get().addTrack(track));
      } catch (error) {
        console.error('Failed to import media from dialog:', error);
      }
    },
    
    importMediaFromFiles: async (files) => {
      // Legacy method for web File objects - fallback for drag & drop
      const newTracks = await Promise.all(
        files.map(async (file, index) => {
          // For regular File objects, we'll create blob URLs for preview
          // but log a warning that this won't work with FFmpeg
          const blobUrl = URL.createObjectURL(file);
          console.warn('Using blob URL for file:', file.name, 'This will not work with FFmpeg. Use importMediaFromDialog instead.');
          
          const type = file.type.startsWith('video/') ? 'video' as const : 
                      file.type.startsWith('audio/') ? 'audio' as const : 'image' as const;
          
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
        })
      );
      
      newTracks.forEach(track => get().addTrack(track));
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
  }))
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
      store.timeline.selectedTrackIds.forEach(id => store.removeTrack(id));
      store.setSelectedTracks([]);
    },
  };
}; 