import { KaraokeIcon } from '@/frontend/assets/icons/karaoke';
import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { cn } from '@/frontend/utils/utils';
import {
  Eye,
  EyeOff,
  MoreHorizontal,
  Plus,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { KaraokeConfirmationDialog } from '../components/dialogs/karaokeConfirmationDialog';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';
import { AddTrackButton } from './addTrackButton';
import {
  generateDynamicRows,
  getTrackRowId,
  migrateTracksWithRowIndex,
  TrackRowDefinition,
} from './utils/dynamicTrackRows';
import {
  getRowHeight,
  getRowHeightClasses,
  TIMELINE_HEADER_HEIGHT_CLASSES,
} from './utils/timelineConstants';

interface TrackControllerRowProps {
  rowDef: TrackRowDefinition;
  tracks: VideoTrack[];
}

const TrackControllerRow: React.FC<TrackControllerRowProps> = React.memo(
  ({ rowDef, tracks }) => {
    // Subscribe to only the actions we need, not the entire store
    const toggleTrackVisibility = useVideoEditorStore(
      (state) => state.toggleTrackVisibility,
    );
    const toggleTrackMute = useVideoEditorStore(
      (state) => state.toggleTrackMute,
    );
    const removeTrackRow = useVideoEditorStore((state) => state.removeTrackRow);
    const deleteTrack = useVideoEditorStore((state) => state.removeTrack);
    const allTracks = useVideoEditorStore((state) => state.tracks);
    const currentTranscribingTrackId = useVideoEditorStore(
      (state) => state.currentTranscribingTrackId,
    );
    const currentTranscribingMediaId = useVideoEditorStore(
      (state) => state.currentTranscribingMediaId,
    );

    // Check if this row's video track is being transcribed OR if any transcription is in progress
    const isTranscribing =
      currentTranscribingTrackId ===
        tracks.find((track) => track.type === 'video')?.id ||
      !!(currentTranscribingMediaId || currentTranscribingTrackId);

    const [karaokeConfirmation, setKaraokeConfirmation] = useState<{
      show: boolean;
      trackIds: string[];
      mediaName: string;
      existingSubtitleCount: number;
    }>({
      show: false,
      trackIds: [],
      mediaName: '',
      existingSubtitleCount: 0,
    });
    // Check if any non-audio tracks in this row are visible
    const hasVisibleTracks = tracks.some(
      (track) => track.type !== 'audio' && track.visible,
    );

    // Check if any audio tracks in this row are audible (not muted)
    const hasAudibleTracks = useMemo(() => {
      const audible = tracks.some((track) => {
        if (track.type === 'audio') {
          return !track.muted;
        }
        return false;
      });
      return audible;
    }, [tracks]);

    // Check if video and audio tracks are linked (NO selection requirement for row controllers)
    const hasLinkedAudioVideo = useMemo(() => {
      if (rowDef.id !== 'video') return false;

      const videoTracks = tracks.filter((t) => t.type === 'video');
      return videoTracks.some((videoTrack) => {
        if (!videoTrack.isLinked || !videoTrack.linkedTrackId) return false;
        // Check if there's an audio track with the matching ID
        return allTracks.some(
          (t) => t.type === 'audio' && t.id === videoTrack.linkedTrackId,
        );
      });
    }, [rowDef.id, tracks, allTracks]);

    const handleToggleVisibility = useCallback(() => {
      // Only handle visibility for non-audio tracks (video, image, subtitle)
      tracks.forEach((track) => {
        if (track.type !== 'audio') {
          toggleTrackVisibility(track.id);
        }
      });
    }, [tracks, toggleTrackVisibility]);

    const handleToggleMute = useCallback(() => {
      // Handle mute for audio tracks only
      tracks.forEach((track) => {
        if (track.type === 'audio') {
          toggleTrackMute(track.id);
        }
      });
    }, [tracks, toggleTrackMute]);

    const handleRemoveRow = useCallback(() => {
      // Only allow removing rows that have no tracks
      if (tracks.length === 0) {
        removeTrackRow(rowDef.id);
      }
    }, [tracks.length, removeTrackRow, rowDef.id]);

    const handleDeleteAllTracks = useCallback(() => {
      // Batch delete: collect all track IDs including linked tracks
      const trackIdsToDelete = new Set<string>();

      tracks.forEach((track) => {
        trackIdsToDelete.add(track.id);
        // Include linked track if it exists
        if (track.isLinked && track.linkedTrackId) {
          trackIdsToDelete.add(track.linkedTrackId);
        }
      });

      // Use batch deletion by setting selection and calling removeSelectedTracks
      const { setSelectedTracks, removeSelectedTracks } =
        useVideoEditorStore.getState();

      // Set selection to all tracks to delete
      setSelectedTracks(Array.from(trackIdsToDelete));
      // Execute batch delete
      removeSelectedTracks();
    }, [tracks]);

    const generateKaraokeSubtitlesFromTrack = useVideoEditorStore(
      (state) => state.generateKaraokeSubtitlesFromTrack,
    );
    const selectedTrackIds = useVideoEditorStore(
      (state) => state.timeline.selectedTrackIds,
    );

    const handleGenerateKaraokeSubtitles = useCallback(() => {
      // ROW CONTROLLER: Process video tracks with linked audio in this row
      // If tracks are selected in this row, use only selected ones
      // If no tracks are selected in this row, use all tracks in this row
      const videoTracksInRow = tracks.filter(
        (t) => t.type === 'video' && t.isLinked,
      );

      if (videoTracksInRow.length === 0) {
        console.warn('No video track with linked audio found in this row');
        return;
      }

      // Check if any tracks in this row are selected
      const selectedInRow = videoTracksInRow.filter((t) =>
        selectedTrackIds.includes(t.id),
      );

      // Use selected tracks if any, otherwise use all tracks in row
      const tracksToProcess =
        selectedInRow.length > 0 ? selectedInRow : videoTracksInRow;

      // Check if there are existing subtitle tracks
      const existingSubtitles = allTracks.filter(
        (track) => track.type === 'subtitle',
      );

      if (existingSubtitles.length > 0) {
        // Show confirmation dialog
        setKaraokeConfirmation({
          show: true,
          trackIds: tracksToProcess.map((t) => t.id),
          mediaName:
            tracksToProcess.length === 1
              ? tracksToProcess[0].name
              : `${tracksToProcess.length} tracks`,
          existingSubtitleCount: existingSubtitles.length,
        });
      } else {
        // No existing subtitles, proceed directly
        handleConfirmKaraokeGeneration(
          tracksToProcess.map((t) => t.id),
          false,
        );
      }
    }, [tracks, allTracks, selectedTrackIds]);

    const handleConfirmKaraokeGeneration = useCallback(
      async (trackIds: string[], deleteExisting: boolean) => {
        // Delete existing subtitles if requested
        if (deleteExisting) {
          const existingSubtitles = allTracks.filter(
            (track) => track.type === 'subtitle',
          );
          for (const track of existingSubtitles) {
            deleteTrack(track.id);
          }
        }

        // Process each track sequentially
        for (const trackId of trackIds) {
          const track = allTracks.find((t) => t.id === trackId);
          if (!track) continue;

          console.log(`🎤 Generating subtitles for: ${track.name}`);

          try {
            const result = await generateKaraokeSubtitlesFromTrack(trackId, {
              model: 'base',
              processOnlyThisSegment: true, // Row Controller: process each segment individually
              onProgress: (progress) => {
                console.log('📊 Transcription progress:', progress);
              },
            });

            if (!result.success) {
              console.error(
                `Failed to generate karaoke subtitles for ${track.name}:`,
                result.error,
              );
            } else {
              console.log(
                `✅ Generated ${result.trackIds?.length || 0} subtitles for ${track.name}`,
              );
            }
          } catch (error) {
            console.error(
              `Error generating karaoke subtitles for ${track.name}:`,
              error,
            );
          }
        }
      },
      [allTracks, deleteTrack, generateKaraokeSubtitlesFromTrack],
    );

    const handleKaraokeDialogOpenChange = useCallback((open: boolean) => {
      if (!open) {
        setKaraokeConfirmation({
          show: false,
          trackIds: [],
          mediaName: '',
          existingSubtitleCount: 0,
        });
      }
    }, []);
    // Can only remove non-essential rows (not video or audio) and only if they have no tracks
    const canRemoveRow =
      rowDef.id !== 'video' && rowDef.id !== 'audio' && tracks.length === 0;

    // Parse row ID to get row index and type for label
    const parsedRow = useMemo(() => {
      const match = rowDef.id.match(
        /^(video|audio|image|text|subtitle)-(\d+)$/,
      );
      if (!match) return { type: rowDef.id, rowIndex: 0 };
      return {
        type: match[1] as VideoTrack['type'],
        rowIndex: parseInt(match[2], 10),
      };
    }, [rowDef.id]);

    // Get display label (e.g., "Video 1", "Video 2", "Text 1")
    // const displayLabel = useMemo(() => {
    //   // Validate the type before calling getRowDisplayLabel
    //   const validTypes: VideoTrack['type'][] = [
    //     'video',
    //     'audio',
    //     'image',
    //     'subtitle',
    //     'text',
    //   ];
    //   const type = validTypes.includes(parsedRow.type as VideoTrack['type'])
    //     ? (parsedRow.type as VideoTrack['type'])
    //     : 'video';
    //   return getRowDisplayLabel(type, parsedRow.rowIndex);
    // }, [parsedRow.type, parsedRow.rowIndex]);

    // Alternating row background (even/odd)
    const isEvenRow = parsedRow.rowIndex % 2 === 0;

    // Handler to add a new track row for this media type
    const handleAddTrackRow = useCallback(async () => {
      const state = useVideoEditorStore.getState();

      // Get all existing row indices for this type
      const existingIndices = state.tracks
        .filter((t: VideoTrack) => t.type === parsedRow.type)
        .map((t: VideoTrack) => t.trackRowIndex ?? 0);

      const maxIndex =
        existingIndices.length > 0 ? Math.max(...existingIndices) : 0;
      const newRowIndex = maxIndex + 1;

      console.log(`➕ Adding new row: ${parsedRow.type}-${newRowIndex}`);

      // Create a placeholder track to reserve the new row
      // This track will be tiny (1 frame) and positioned at the end of the timeline
      const { timeline, addTrack } = state;
      const currentEndFrame = Math.max(
        ...state.tracks.map((t: VideoTrack) => t.endFrame),
        timeline.totalFrames,
      );

      // Create appropriate placeholder based on media type
      const placeholderTrack: Partial<VideoTrack> = {
        type: parsedRow.type as VideoTrack['type'],
        name: `${parsedRow.type.charAt(0).toUpperCase() + parsedRow.type.slice(1)} Track ${newRowIndex + 1}`,
        startFrame: currentEndFrame,
        endFrame: currentEndFrame + 30, // 1 second at 30fps
        duration: 30,
        trackRowIndex: newRowIndex,
        visible: true,
        locked: false,
        muted: parsedRow.type === 'audio' ? false : undefined,
        source: '', // Empty source for placeholder
        previewUrl: undefined,
      };

      // Add type-specific properties
      if (parsedRow.type === 'text') {
        placeholderTrack.textContent = 'New Text';
      } else if (parsedRow.type === 'subtitle') {
        placeholderTrack.subtitleText = 'New Subtitle';
      }

      try {
        await addTrack(placeholderTrack as Omit<VideoTrack, 'id'>);
        console.log(
          `✅ Created placeholder track for new row: ${parsedRow.type}-${newRowIndex}`,
        );
      } catch (error) {
        console.error('Failed to create new track row:', error);
      }
    }, [parsedRow.type]);

    return (
      <div
        className={cn(
          'flex items-center justify-between px-2 border-b border-border/20',
          getRowHeightClasses(rowDef.id),
          isEvenRow ? 'bg-transparent' : 'bg-muted/20', // Alternating background
        )}
      >
        {/* Track type info with row label */}
        {/* <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <span className="text-xs" title={displayLabel}>
            {rowDef.icon}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground truncate">
            {displayLabel}
          </span>
          {tracks.length > 0 && (
            <span className="text-[9px] text-muted-foreground/60 bg-accent px-1 rounded">
              {tracks.length}
            </span>
          )}
        </div> */}

        {/* Track controls */}
        <div className="flex items-center justify-center gap-0.5">
          {/* Show visibility toggle for video, image, and subtitle tracks only */}
          {(rowDef.trackTypes.includes('video') ||
            rowDef.trackTypes.includes('image') ||
            rowDef.trackTypes.includes('subtitle') ||
            rowDef.trackTypes.includes('text')) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleToggleVisibility}
                  disabled={tracks.length === 0}
                >
                  {hasVisibleTracks ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3 text-muted-foreground/50" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hasVisibleTracks ? 'Hide tracks' : 'Show tracks'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Show audio control for audio tracks only */}
          {rowDef.trackTypes.includes('audio') && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={handleToggleMute}
                  disabled={tracks.length === 0}
                >
                  {hasAudibleTracks ? (
                    <Volume2 className="h-3 w-3" />
                  ) : (
                    <VolumeX className="h-3 w-3 text-muted-foreground/50" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hasAudibleTracks ? 'Mute audio' : 'Unmute audio'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Ellipsis dropdown menu for all track types */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                disabled={tracks.length === 0}
              >
                <MoreHorizontal className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="right" className="w-fit">
              {/* Delete from timeline - always shown as first item */}
              <DropdownMenuItem
                onClick={handleDeleteAllTracks}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
                Delete from timeline
              </DropdownMenuItem>

              {/* Generate karaoke subtitles - only for video tracks with linked audio */}
              {rowDef.id === 'video' && hasLinkedAudioVideo && (
                <>
                  <DropdownMenuItem
                    onClick={handleGenerateKaraokeSubtitles}
                    disabled={isTranscribing}
                  >
                    <KaraokeIcon className="h-3 w-3" />
                    Generate karaoke subtitles
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Show remove button for non-essential rows when empty */}
          {canRemoveRow && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:text-destructive"
                  onClick={handleRemoveRow}
                >
                  <X className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove empty track row</TooltipContent>
            </Tooltip>
          )}

          {/* Add Track button for creating new rows */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:text-primary"
                onClick={handleAddTrackRow}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add new {parsedRow.type} track row</TooltipContent>
          </Tooltip>
        </div>

        {/* Karaoke Confirmation Dialog */}
        {karaokeConfirmation.show && (
          <KaraokeConfirmationDialog
            open={karaokeConfirmation.show}
            onOpenChange={handleKaraokeDialogOpenChange}
            mediaName={karaokeConfirmation.mediaName}
            existingSubtitleCount={karaokeConfirmation.existingSubtitleCount}
            onConfirm={(deleteExisting: boolean) => {
              if (karaokeConfirmation.trackIds.length > 0) {
                handleConfirmKaraokeGeneration(
                  karaokeConfirmation.trackIds,
                  deleteExisting,
                );
              }
            }}
          />
        )}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison - only re-render if tracks data actually changes
    if (prevProps.rowDef.id !== nextProps.rowDef.id) return false;
    if (prevProps.tracks.length !== nextProps.tracks.length) return false;

    // Deep check on relevant track properties that affect the UI
    return prevProps.tracks.every((prevTrack, index) => {
      const nextTrack = nextProps.tracks[index];
      return (
        prevTrack.id === nextTrack.id &&
        prevTrack.visible === nextTrack.visible &&
        prevTrack.muted === nextTrack.muted &&
        prevTrack.type === nextTrack.type &&
        prevTrack.trackRowIndex === nextTrack.trackRowIndex // CRITICAL: Track row reordering
      );
    });
  },
);

interface TimelineTrackControllersProps {
  tracks: VideoTrack[];
  className?: string;
}

export const TimelineTrackControllers: React.FC<TimelineTrackControllersProps> =
  React.memo(
    ({ tracks, className }) => {
      // Subscribe to visible track rows from timeline state with fallback
      const visibleTrackRows = useVideoEditorStore(
        (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
      );

      // Migrate tracks to ensure they have trackRowIndex
      const migratedTracks = useMemo(
        () => migrateTracksWithRowIndex(tracks),
        [tracks],
      );

      // Generate dynamic rows based on existing tracks
      const dynamicRows = useMemo(
        () => generateDynamicRows(migratedTracks),
        [migratedTracks],
      );

      // Group tracks by their designated rows (using dynamic rows)
      const tracksByRow = useMemo(() => {
        const grouped: Record<string, VideoTrack[]> = {};

        // Initialize empty arrays for all dynamic rows
        dynamicRows.forEach((row) => {
          grouped[row.id] = [];
        });

        // Group migrated tracks by their row ID (type + row index)
        migratedTracks.forEach((track) => {
          const rowId = getTrackRowId(track);
          if (!grouped[rowId]) {
            grouped[rowId] = [];
          }
          grouped[rowId].push(track);
        });

        return grouped;
      }, [migratedTracks, dynamicRows]);

      // Filter dynamic rows to only show visible ones
      const visibleRows = useMemo(() => {
        return dynamicRows.filter((row) => {
          // Extract the media type from the row ID (e.g., "video-0" -> "video")
          const mediaType = row.trackTypes[0];
          return visibleTrackRows.includes(mediaType);
        });
      }, [dynamicRows, visibleTrackRows]);

      // Calculate baseline height and whether we should center - matches TimelineTracks
      const { baselineHeight, shouldCenter } = useMemo(() => {
        // Calculate height for each visible row
        const visibleRowsInOrder = dynamicRows.filter((row) => {
          const mediaType = row.trackTypes[0];
          return visibleTrackRows.includes(mediaType);
        });

        // Baseline height = height of ALL dynamic track rows
        const baseline = dynamicRows.reduce((sum, row) => {
          const mediaType = row.trackTypes[0];
          return sum + getRowHeight(mediaType);
        }, 0);

        return {
          baselineHeight: baseline,
          shouldCenter: visibleRowsInOrder.length < dynamicRows.length,
        };
      }, [visibleTrackRows, dynamicRows]);

      return (
        <div className={cn('', className)}>
          {/* Header with Add Track button */}
          <div
            className={cn(
              'border-b border-border/20 flex items-center justify-center px-2',
              TIMELINE_HEADER_HEIGHT_CLASSES,
            )}
          >
            <AddTrackButton />
          </div>

          {/* Track controller rows wrapper - with centering when <5 tracks */}
          <div
            className="relative"
            style={{
              minHeight: shouldCenter ? `${baselineHeight}px` : 'auto',
              height: shouldCenter ? `${baselineHeight}px` : 'auto',
            }}
          >
            {/* Placeholder borders for ALL dynamic track rows when centering - positioned at absolute positions */}
            {shouldCenter && (
              <div
                className="absolute pointer-events-none"
                style={{
                  top: 0,
                  left: 0,
                  right: 0,
                  height: `${baselineHeight}px`,
                }}
              >
                {dynamicRows.map((rowDef, index) => {
                  // Calculate this row's top position - sum of all previous row heights
                  let top = 0;
                  for (let i = 0; i < index; i++) {
                    const mediaType = dynamicRows[i].trackTypes[0];
                    top += getRowHeight(mediaType);
                  }

                  const mediaType = rowDef.trackTypes[0];
                  const rowHeight = getRowHeight(mediaType);

                  return (
                    <div
                      key={`placeholder-${rowDef.id}`}
                      className="absolute bg-transparent"
                      style={{
                        top: `${top}px`,
                        left: 0,
                        right: 0,
                        height: `${rowHeight}px`,
                      }}
                    />
                  );
                })}
              </div>
            )}

            <div
              className="flex flex-col items-center relative"
              style={{
                height: shouldCenter ? `${baselineHeight}px` : 'auto',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: shouldCenter ? 'center' : 'flex-start',
              }}
            >
              {visibleRows.map((rowDef) => (
                <TrackControllerRow
                  key={rowDef.id}
                  rowDef={rowDef}
                  tracks={tracksByRow[rowDef.id] || []}
                />
              ))}
            </div>
          </div>
        </div>
      );
    },
    (prevProps, nextProps) => {
      // Custom comparison - only re-render if tracks or className change
      if (prevProps.className !== nextProps.className) return false;
      if (prevProps.tracks.length !== nextProps.tracks.length) return false;

      // Deep check on relevant track properties that affect controllers
      return prevProps.tracks.every((prevTrack, index) => {
        const nextTrack = nextProps.tracks[index];
        return (
          prevTrack.id === nextTrack.id &&
          prevTrack.visible === nextTrack.visible &&
          prevTrack.muted === nextTrack.muted &&
          prevTrack.type === nextTrack.type &&
          prevTrack.trackRowIndex === nextTrack.trackRowIndex // CRITICAL: Track row reordering
        );
      });
    },
  );
