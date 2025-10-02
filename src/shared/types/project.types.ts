/* eslint-disable @typescript-eslint/no-inferrable-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  MediaLibraryItem,
  PlaybackState,
  PreviewState,
  TimelineState,
  VideoTrack,
} from '@/frontend/features/editor/stores/VideoEditorStore';

// Project persistence types
export interface ProjectData {
  id: string;
  metadata: ProjectMetadata;
  videoEditor: VideoEditorProjectData;
  version: string; // For future migrations
}

export interface ProjectMetadata {
  title: string;
  description: string;
  thumbnail?: string; // Base64 encoded thumbnail
  duration: number; // Total duration in seconds
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  lastOpenedAt?: string; // ISO string
}

export interface VideoEditorProjectData {
  tracks: VideoTrack[];
  mediaLibrary?: MediaLibraryItem[]; // Optional for backward compatibility
  timeline: TimelineState;
  preview: PreviewState;
  playback: PlaybackState;
}

// UI state for project management
export interface ProjectSummary {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

// Project file export/import format
export interface ProjectExportData {
  metadata: ProjectMetadata;
  videoEditor: VideoEditorProjectData;
  version: string;
  exportedAt: string;
}

// Database migration helpers
export interface ProjectVersion {
  version: string;
  migrationNeeded: boolean;
}

export const PROJECT_VERSION = '1.0.0';
export const PROJECT_DB_NAME = 'DividrProjects';
export const PROJECT_STORE_NAME = 'projects';
export const PROJECT_DB_VERSION = 1;

// Validation helpers
export const isValidProject = (data: unknown): data is ProjectData => {
  return (
    data &&
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof (data as any).id === 'string' &&
    'metadata' in data &&
    (data as any).metadata &&
    typeof (data as any).metadata.title === 'string' &&
    typeof (data as any).metadata.createdAt === 'string' &&
    'videoEditor' in data &&
    (data as any).videoEditor &&
    Array.isArray((data as any).videoEditor.tracks) &&
    (data as any).videoEditor.timeline &&
    (data as any).videoEditor.preview
  );
};

export const createDefaultProject = (
  title: string,
  description: string = '',
): ProjectData => {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    metadata: {
      title,
      description,
      duration: 0,
      createdAt: now,
      updatedAt: now,
    },
    videoEditor: {
      tracks: [],
      timeline: {
        currentFrame: 0,
        totalFrames: 3000, // 100 seconds at 30fps
        fps: 30,
        zoom: 1,
        scrollX: 0,
        selectedTrackIds: [],
        playheadVisible: true,
        snapEnabled: true, // Add this property
        isSplitModeActive: false, // Add this property
      },
      preview: {
        canvasWidth: 800,
        canvasHeight: 540,
        previewScale: 1,
        showGrid: false,
        showSafeZones: false,
        backgroundColor: '#000000',
      },
      playback: {
        isPlaying: false,
        isLooping: false,
        playbackRate: 1,
        volume: 1,
        muted: false,
      },
    },
    version: PROJECT_VERSION,
  };
};

export const projectToSummary = (project: ProjectData): ProjectSummary => ({
  id: project.id,
  title: project.metadata.title,
  description: project.metadata.description,
  thumbnail: project.metadata.thumbnail,
  duration: project.metadata.duration,
  createdAt: project.metadata.createdAt,
  updatedAt: project.metadata.updatedAt,
  lastOpenedAt: project.metadata.lastOpenedAt,
});
