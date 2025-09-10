import { useProjectStore } from '@/Store/ProjectStore';
import { useVideoEditorStore } from '@/Store/VideoEditorStore';
import { VideoEditorProjectData } from '@/Types/Project';
import { useEffect, useRef } from 'react';

/**
 * Custom hook that handles synchronization between the project store and video editor store
 * This ensures that changes in the video editor are reflected in the current project
 * and that loading a project updates the video editor state
 */
export const useProjectSync = () => {
  const { currentProject, updateCurrentProjectData } = useProjectStore();
  const videoEditorStore = useVideoEditorStore();
  const hasLoadedProject = useRef(false);

  // Load project data into video editor when a project is opened
  useEffect(() => {
    if (currentProject && !hasLoadedProject.current) {
      const { videoEditor } = currentProject;

      // Reset the video editor state first
      videoEditorStore.reset();

      // Load the project data
      if (videoEditor.tracks?.length > 0) {
        // Set tracks
        videoEditor.tracks.forEach((track) => {
          videoEditorStore.addTrack(track);
        });
      }

      // Set timeline state
      if (videoEditor.timeline) {
        Object.entries(videoEditor.timeline).forEach(([key, value]) => {
          switch (key) {
            case 'currentFrame':
              videoEditorStore.setCurrentFrame(value as number);
              break;
            case 'totalFrames':
              videoEditorStore.setTotalFrames(value as number);
              break;
            case 'fps':
              videoEditorStore.setFps(value as number);
              break;
            case 'zoom':
              videoEditorStore.setZoom(value as number);
              break;
            case 'scrollX':
              videoEditorStore.setScrollX(value as number);
              break;
            case 'inPoint':
              videoEditorStore.setInPoint(value as number | undefined);
              break;
            case 'outPoint':
              videoEditorStore.setOutPoint(value as number | undefined);
              break;
            case 'selectedTrackIds':
              videoEditorStore.setSelectedTracks(value as string[]);
              break;
          }
        });
      }

      // Set preview state
      if (videoEditor.preview) {
        if (
          videoEditor.preview.canvasWidth &&
          videoEditor.preview.canvasHeight
        ) {
          videoEditorStore.setCanvasSize(
            videoEditor.preview.canvasWidth,
            videoEditor.preview.canvasHeight,
          );
        }
        if (videoEditor.preview.previewScale) {
          videoEditorStore.setPreviewScale(videoEditor.preview.previewScale);
        }
        if (videoEditor.preview.backgroundColor) {
          videoEditorStore.setBackgroundColor(
            videoEditor.preview.backgroundColor,
          );
        }
      }

      // Set playback state
      if (videoEditor.playback) {
        if (videoEditor.playback.playbackRate) {
          videoEditorStore.setPlaybackRate(videoEditor.playback.playbackRate);
        }
        if (videoEditor.playback.volume !== undefined) {
          videoEditorStore.setVolume(videoEditor.playback.volume);
        }
      }

      hasLoadedProject.current = true;
    } else if (!currentProject) {
      // Reset when no project is loaded
      hasLoadedProject.current = false;
    }
  }, [currentProject, videoEditorStore]);

  // Create a function to sync current video editor state to project
  const syncToProject = () => {
    if (!currentProject) return;

    const videoEditorData: VideoEditorProjectData = {
      tracks: videoEditorStore.tracks,
      timeline: videoEditorStore.timeline,
      preview: videoEditorStore.preview,
      playback: videoEditorStore.playback,
    };

    // Calculate total duration from tracks
    const maxDuration =
      videoEditorStore.tracks.length > 0
        ? Math.max(
            ...videoEditorStore.tracks.map(
              (track) => track.endFrame / videoEditorStore.timeline.fps,
            ),
          )
        : 0;

    // Update the current project with new video editor data
    updateCurrentProjectData({
      videoEditor: videoEditorData,
    });
  };

  // Set up periodic sync (optional - could be triggered by specific actions instead)
  useEffect(() => {
    if (!currentProject) return;

    const interval = setInterval(() => {
      syncToProject();
    }, 5000); // Sync every 5 seconds

    return () => clearInterval(interval);
  }, [currentProject, videoEditorStore.tracks.length]);

  // Sync immediately when tracks change
  useEffect(() => {
    if (currentProject && hasLoadedProject.current) {
      syncToProject();
    }
  }, [videoEditorStore.tracks.length]);

  return {
    syncToProject,
    hasLoadedProject: hasLoadedProject.current,
  };
};
