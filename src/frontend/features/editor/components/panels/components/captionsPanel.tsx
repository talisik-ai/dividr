import { Button } from '@/frontend/components/ui/button';
import { cn } from '@/frontend/utils/utils';
import { Play, Trash2 } from 'lucide-react';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { BasePanel, CustomPanelProps } from '..';
import { useVideoEditorStore } from '../../../stores/videoEditor';
import { VideoTrack } from '../../../stores/videoEditor/types/track.types';

interface SubtitleItemState {
  isActive: boolean;
  isSelected: boolean;
  isEditing: boolean;
}

type CaptionMode = 'karaoke' | 'subtitle';

// Memoized SubtitleItem component for better performance
const SubtitleItem = React.memo<{
  track: VideoTrack;
  index: number;
  state: SubtitleItemState;
  startTime: number;
  endTime: number;
  editingText: string;
  editInputRef: React.RefObject<HTMLInputElement>;
  activeSubtitleRef: React.RefObject<HTMLDivElement> | null;
  formatTime: (seconds: number) => string;
  onSelect: (track: VideoTrack, index: number, e: React.MouseEvent) => void;
  onTextDoubleClick: (track: VideoTrack, e: React.MouseEvent) => void;
  onPlay: (track: VideoTrack, e: React.MouseEvent) => void;
  onDelete: (track: VideoTrack, e: React.MouseEvent) => void;
  onEditChange: (text: string) => void;
  onEditSave: (trackId: string) => void;
  onEditCancel: () => void;
}>(
  ({
    track,
    index,
    state,
    startTime,
    endTime,
    editingText,
    editInputRef,
    activeSubtitleRef,
    formatTime,
    onSelect,
    onTextDoubleClick,
    onPlay,
    onDelete,
    onEditChange,
    onEditSave,
    onEditCancel,
  }) => {
    return (
      <div
        ref={state.isActive ? activeSubtitleRef : null}
        onClick={(e) => onSelect(track, index, e)}
        className={cn(
          'px-3 py-2.5 rounded-lg transition-all cursor-pointer group select-none',
          state.isEditing
            ? ''
            : state.isSelected
              ? 'bg-accent'
              : state.isActive
                ? 'bg-accent/50'
                : 'bg-transparent hover:bg-accent/30',
        )}
      >
        {/* Timestamp and Controls */}
        <div
          className={cn(
            'flex items-center justify-between text-xs mb-0.5',
            state.isSelected ? 'text-secondary' : 'text-muted-foreground',
          )}
        >
          <span>
            {formatTime(startTime)} - {formatTime(endTime)}
          </span>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => onPlay(track, e)}
              className="p-1 hover:bg-secondary/20 rounded transition-colors"
              title="Play from this subtitle"
            >
              <Play className="size-3" />
            </button>
            <button
              onClick={(e) => onDelete(track, e)}
              className="p-1 hover:bg-red-500/20 rounded transition-colors text-red-400"
              title="Delete this subtitle"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>

        {/* Text Content */}
        {state.isEditing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editingText}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={() => onEditSave(track.id)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                onEditSave(track.id);
              } else if (e.key === 'Escape') {
                onEditCancel();
              }
            }}
            className="w-full text-sm text-foreground bg-transparent border-0 p-0 m-0 outline-none focus:outline-none focus:ring-0 appearance-none"
            style={{
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              boxShadow: 'none',
              border: 'none',
              outline: 'none',
            }}
          />
        ) : (
          <p
            onDoubleClick={(e) => onTextDoubleClick(track, e)}
            className="text-sm text-foreground break-words"
          >
            {track.subtitleText || 'No text'}
          </p>
        )}
      </div>
    );
  },
  (prev, next) => {
    return (
      prev.track.id === next.track.id &&
      prev.state.isActive === next.state.isActive &&
      prev.state.isSelected === next.state.isSelected &&
      prev.state.isEditing === next.state.isEditing &&
      prev.track.subtitleText === next.track.subtitleText &&
      prev.editingText === next.editingText
    );
  },
);

SubtitleItem.displayName = 'SubtitleItem';

export const CaptionsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  const [captionMode, setCaptionMode] = useState<CaptionMode>('karaoke');
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Get state from store - get all tracks first
  const allTracks = useVideoEditorStore((state) => state.tracks);
  const currentFrame = useVideoEditorStore(
    (state) => state.timeline.currentFrame,
  );
  const fps = useVideoEditorStore((state) => state.timeline.fps);
  const isPlaying = useVideoEditorStore((state) => state.playback.isPlaying);
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );
  const setCurrentFrame = useVideoEditorStore((state) => state.setCurrentFrame);
  const updateTrack = useVideoEditorStore((state) => state.updateTrack);
  const removeSelectedTracks = useVideoEditorStore(
    (state) => state.removeSelectedTracks,
  );
  const play = useVideoEditorStore((state) => state.play);
  const pause = useVideoEditorStore((state) => state.pause);
  const setSelectedTracks = useVideoEditorStore(
    (state) => state.setSelectedTracks,
  );

  // Filter and categorize subtitle tracks - memoized to prevent unnecessary recalculations
  const { subtitleTracks, karaokeSubtitles, regularSubtitles } = useMemo(() => {
    const subtitles = allTracks.filter((track) => track.type === 'subtitle');
    const karaoke: VideoTrack[] = [];
    const regular: VideoTrack[] = [];

    subtitles.forEach((track) => {
      // Use subtitleType field to distinguish between karaoke and regular subtitles
      if (track.subtitleType === 'karaoke') {
        karaoke.push(track);
      } else if (track.subtitleType === 'regular') {
        regular.push(track);
      } else {
        // Fallback for legacy tracks without subtitleType (shouldn't happen in new tracks)
        // Default to regular if the subtitle type is not specified
        regular.push(track);
      }
    });

    return {
      subtitleTracks: subtitles,
      karaokeSubtitles: karaoke,
      regularSubtitles: regular,
    };
  }, [allTracks]);

  // Check if panel should be enabled
  const hasSubtitles = subtitleTracks.length > 0;
  const hasKaraokeSubtitles = karaokeSubtitles.length > 0;
  const hasRegularSubtitles = regularSubtitles.length > 0;

  // Get active subtitles based on mode
  const activeSubtitles = useMemo(() => {
    if (captionMode === 'karaoke') {
      return karaokeSubtitles;
    }
    return regularSubtitles;
  }, [captionMode, karaokeSubtitles, regularSubtitles]);

  // Handle text double-click to edit
  const handleTextDoubleClick = useCallback(
    (track: VideoTrack, e: React.MouseEvent) => {
      e.stopPropagation();
      if (isPlaying) {
        return; // Prevent editing while playing
      }
      setEditingTrackId(track.id);
      setEditingText(track.subtitleText || '');
    },
    [isPlaying],
  );

  // Handle play button click
  const handlePlay = useCallback(
    (track: VideoTrack, e: React.MouseEvent) => {
      e.stopPropagation();
      if (isPlaying) {
        pause();
      }
      setCurrentFrame(track.startFrame);
      setTimeout(() => {
        play();
      }, 0);
    },
    [isPlaying, pause, setCurrentFrame, play],
  );

  // Handle delete button click
  const handleDelete = useCallback(
    (track: VideoTrack, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedTracks([track.id]);
      setTimeout(() => {
        removeSelectedTracks();
      }, 0);
    },
    [setSelectedTracks, removeSelectedTracks],
  );

  // Handle edit save
  const handleEditSave = useCallback(
    (trackId: string) => {
      if (editingText.trim()) {
        updateTrack(trackId, { subtitleText: editingText.trim() });
      }
      setEditingTrackId(null);
      setEditingText('');
    },
    [editingText, updateTrack],
  );

  // Handle edit cancel
  const handleEditCancel = useCallback(() => {
    setEditingTrackId(null);
    setEditingText('');
  }, []);

  // Handle delete selected subtitles
  const handleDeleteSelected = useCallback(() => {
    if (selectedTrackIds.length > 0) {
      const selectedSubtitleIds = activeSubtitles
        .filter((track) => selectedTrackIds.includes(track.id))
        .map((track) => track.id);

      if (selectedSubtitleIds.length > 0) {
        // Set only subtitle tracks as selected, then remove them
        setSelectedTracks(selectedSubtitleIds);
        // Wait for state update, then remove
        setTimeout(() => {
          removeSelectedTracks();
        }, 0);
      }
    }
  }, [
    selectedTrackIds,
    activeSubtitles,
    removeSelectedTracks,
    setSelectedTracks,
  ]);

  // Get selected subtitles from active list
  const selectedSubtitlesInView = useMemo(() => {
    return activeSubtitles.filter((track) =>
      selectedTrackIds.includes(track.id),
    );
  }, [activeSubtitles, selectedTrackIds]);

  // Track last selected index for shift-select
  const lastSelectedIndexRef = useRef<number | null>(null);

  // Handle subtitle selection with shift multi-select support
  const handleSubtitleSelect = useCallback(
    (track: VideoTrack, index: number, e: React.MouseEvent) => {
      e.stopPropagation();

      if (e.shiftKey && lastSelectedIndexRef.current !== null) {
        // Shift+click: select range
        const start = Math.min(lastSelectedIndexRef.current, index);
        const end = Math.max(lastSelectedIndexRef.current, index);
        const rangeIds = activeSubtitles.slice(start, end + 1).map((t) => t.id);

        // Add range to current selection
        const newSelection = [...new Set([...selectedTrackIds, ...rangeIds])];
        setSelectedTracks(newSelection);
      } else if (e.ctrlKey || e.metaKey) {
        // Ctrl/Cmd+click: toggle selection
        if (selectedTrackIds.includes(track.id)) {
          setSelectedTracks(selectedTrackIds.filter((id) => id !== track.id));
        } else {
          setSelectedTracks([...selectedTrackIds, track.id]);
        }
        lastSelectedIndexRef.current = index;
      } else {
        // Regular click: replace selection
        setSelectedTracks([track.id]);
        lastSelectedIndexRef.current = index;
      }
    },
    [activeSubtitles, selectedTrackIds, setSelectedTracks],
  );

  // Format time as hh:mm:ss
  const formatTime = useCallback((seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // Auto-switch to available tab if current mode has no subtitles
  useEffect(() => {
    if (
      captionMode === 'karaoke' &&
      !hasKaraokeSubtitles &&
      hasRegularSubtitles
    ) {
      setCaptionMode('subtitle');
    } else if (
      captionMode === 'subtitle' &&
      !hasRegularSubtitles &&
      hasKaraokeSubtitles
    ) {
      setCaptionMode('karaoke');
    }
  }, [captionMode, hasKaraokeSubtitles, hasRegularSubtitles]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTrackId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTrackId]);

  // Auto-scroll to active subtitle - throttled for better performance
  const activeSubtitleRef = useRef<HTMLDivElement>(null);
  const lastScrollFrameRef = useRef<number>(-1);

  useEffect(() => {
    if (activeSubtitleRef.current && isPlaying) {
      // Only scroll if we've moved to a different subtitle (reduces scroll calls)
      const frameDiff = Math.abs(currentFrame - lastScrollFrameRef.current);
      if (frameDiff > fps / 4) {
        // Only scroll every ~0.25 seconds
        lastScrollFrameRef.current = currentFrame;
        activeSubtitleRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [currentFrame, isPlaying, fps]);

  // Pre-compute subtitle states and times to reduce per-item computation
  const { visibleStates, visibleTimes } = useMemo(() => {
    const states = new Map<string, SubtitleItemState>();
    const times = new Map<string, { startTime: number; endTime: number }>();
    const selectedSet = new Set(selectedTrackIds);

    activeSubtitles.forEach((track) => {
      const isActive =
        currentFrame >= track.startFrame && currentFrame < track.endFrame;
      const isSelected = selectedSet.has(track.id);
      const isEditing = editingTrackId === track.id;
      states.set(track.id, { isActive, isSelected, isEditing });

      times.set(track.id, {
        startTime: track.startFrame / fps,
        endTime: track.endFrame / fps,
      });
    });

    return { visibleStates: states, visibleTimes: times };
  }, [activeSubtitles, currentFrame, selectedTrackIds, editingTrackId, fps]);

  return (
    <BasePanel title="Captions" className={className}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Header with Mode Tabs */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <Button
              variant={captionMode === 'karaoke' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setCaptionMode('karaoke')}
              disabled={!hasKaraokeSubtitles}
              className={cn(
                'text-xs py-1 h-fit',
                !hasKaraokeSubtitles && 'opacity-50 cursor-not-allowed',
              )}
            >
              Karaoke
            </Button>
            <Button
              variant={captionMode === 'subtitle' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setCaptionMode('subtitle')}
              disabled={!hasRegularSubtitles}
              className={cn(
                'text-xs py-1 h-fit',
                !hasRegularSubtitles && 'opacity-50 cursor-not-allowed',
              )}
            >
              Subtitle
            </Button>
          </div>
        </div>
        {/* Selection count and batch actions */}
        {selectedSubtitlesInView.length > 0 && (
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <div className="text-xs text-muted-foreground">
              {selectedSubtitlesInView.length} selected
            </div>
            {selectedSubtitlesInView.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDeleteSelected}
                className="h-7 gap-1.5 text-xs text-red-400 hover:text-red-300"
                title="Delete selected subtitles"
              >
                <Trash2 className="size-3" />
                Delete
              </Button>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {!hasSubtitles ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">No captions loaded</p>
              <p className="text-xs mt-2">
                Import a subtitle file or generate karaoke subtitles from audio
              </p>
            </div>
          ) : activeSubtitles.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">
                No {captionMode === 'karaoke' ? 'karaoke' : 'regular'} subtitles
              </p>
              <p className="text-xs mt-2">
                Switch to {captionMode === 'karaoke' ? 'subtitle' : 'karaoke'}{' '}
                mode
              </p>
            </div>
          ) : (
            activeSubtitles.map((track, index) => {
              const state = visibleStates.get(track.id);
              const times = visibleTimes.get(track.id);
              if (!state || !times) return null;

              return (
                <div key={track.id} style={{ marginBottom: '8px' }}>
                  <SubtitleItem
                    track={track}
                    index={index}
                    state={state}
                    startTime={times.startTime}
                    endTime={times.endTime}
                    editingText={editingText}
                    editInputRef={editInputRef}
                    activeSubtitleRef={
                      state.isActive ? activeSubtitleRef : null
                    }
                    formatTime={formatTime}
                    onSelect={handleSubtitleSelect}
                    onTextDoubleClick={handleTextDoubleClick}
                    onPlay={handlePlay}
                    onDelete={handleDelete}
                    onEditChange={setEditingText}
                    onEditSave={handleEditSave}
                    onEditCancel={handleEditCancel}
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </BasePanel>
  );
};
