/* eslint-disable @typescript-eslint/no-explicit-any */
import { useVideoEditorStore } from '../';

export const useTimelineShortcuts = () => {
  const store = useVideoEditorStore();

  return {
    onSpace: () => store.togglePlayback(),

    onHome: () => store.setCurrentFrame(0),

    onEnd: () => {
      const effectiveEndFrame =
        store.tracks.length > 0
          ? Math.max(
              ...store.tracks.map((track: any) => track.endFrame),
              store.timeline.totalFrames,
            )
          : store.timeline.totalFrames;
      store.setCurrentFrame(effectiveEndFrame - 1);
    },

    onArrowLeft: () => store.setCurrentFrame(store.timeline.currentFrame - 1),

    onArrowRight: () => store.setCurrentFrame(store.timeline.currentFrame + 1),

    onI: () => store.setInPoint(store.timeline.currentFrame),

    onO: () => store.setOutPoint(store.timeline.currentFrame),

    onDelete: () => store.removeSelectedTracks(),

    onS: () => store.toggleSnap(),

    onD: () => {
      const selectedIds = store.timeline.selectedTrackIds;
      if (selectedIds.length > 0) {
        selectedIds.forEach((id: any) => store.duplicateTrack(id));
      }
    },

    onC: () => store.splitAtPlayhead(),

    onEscape: () => store.setSelectedTracks([]),

    onShiftLeft: () => store.setCurrentFrame(store.timeline.currentFrame - 10),

    onShiftRight: () => store.setCurrentFrame(store.timeline.currentFrame + 10),
  };
};
