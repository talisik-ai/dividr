import { KaraokeIcon } from '@/frontend/assets/icons/karaoke';
import { RuntimeDownloadModal } from '@/frontend/components/custom/RuntimeDownloadModal';
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
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { KaraokeConfirmationDialog } from '../components/dialogs/karaokeConfirmationDialog';
import { useVideoEditorStore, VideoTrack } from '../stores/videoEditor/index';
import {
  generateDynamicRows,
  getRowDisplayIcon,
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

    // Runtime download modal state
    const [showRuntimeModal, setShowRuntimeModal] = useState(false);
    const [pendingKaraokeAction, setPendingKaraokeAction] = useState<{
      trackIds: string[];
      deleteExisting: boolean;
    } | null>(null);

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
      if (!rowDef.trackTypes.includes('video')) return false;

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
              keepExistingSubtitles:
                !deleteExisting && allTracks.some((t) => t.type === 'subtitle'),
              onProgress: (progress) => {
                console.log('📊 Transcription progress:', progress);
              },
            });

            if (result.success) {
              console.log(
                `✅ Generated ${result.trackIds?.length || 0} subtitles for ${track.name}`,
              );
            } else if (result.requiresDownload) {
              // Runtime not installed - show download modal and stop processing
              setPendingKaraokeAction({ trackIds, deleteExisting });
              setShowRuntimeModal(true);
              return; // Exit early, will retry after download
            } else {
              console.error(
                `Failed to generate karaoke subtitles for ${track.name}:`,
                result.error,
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

    // Handler for successful runtime download - retry pending karaoke generation
    const handleRuntimeDownloadSuccess = useCallback(() => {
      if (pendingKaraokeAction) {
        const { trackIds, deleteExisting } = pendingKaraokeAction;
        setPendingKaraokeAction(null);
        // Retry the karaoke generation
        handleConfirmKaraokeGeneration(trackIds, deleteExisting);
      }
    }, [pendingKaraokeAction, handleConfirmKaraokeGeneration]);

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

    // Alternating row background (even/odd)
    const isEvenRow = parsedRow.rowIndex % 2 === 0;

    return (
      <div
        className={cn(
          'flex items-center justify-between px-2 gap-6 border-b border-border/20',
          getRowHeightClasses(rowDef.id),
          isEvenRow ? 'bg-transparent' : 'bg-muted/20', // Alternating background
        )}
      >
        {/* Track type info with row label */}
        <div className="flex-1 min-w-0">
          {getRowDisplayIcon(
            parsedRow.type as VideoTrack['type'],
            parsedRow.rowIndex,
          )}
        </div>

        {/* Track controls */}
        <div className="flex items-center justify-center gap-2">
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
                className="group text-red-500 dark:text-red-400 focus:text-red-600 dark:focus:text-red-300 data-[highlighted]:bg-red-500/10 dark:data-[highlighted]:bg-red-400/20 data-[highlighted]:text-red-600 dark:data-[highlighted]:text-red-300"
              >
                <Trash2 className="h-3 w-3 text-current" />
                Delete from timeline
              </DropdownMenuItem>

              {/* Generate karaoke subtitles - only for video tracks with linked audio */}
              {rowDef.trackTypes.includes('video') && hasLinkedAudioVideo && (
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

        {/* Runtime download modal for transcription feature */}
        <RuntimeDownloadModal
          isOpen={showRuntimeModal}
          onClose={() => {
            setShowRuntimeModal(false);
            setPendingKaraokeAction(null);
          }}
          onSuccess={handleRuntimeDownloadSuccess}
          featureName="Karaoke Subtitle Generation"
        />
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

// Placeholder controller row - empty space with no controls
const PlaceholderControllerRow: React.FC<{ id: string }> = React.memo(
  ({ id }) => {
    return (
      <div
        key={id}
        className="flex items-center justify-between px-2 gap-6 border-b border-border/20 h-12 bg-transparent pointer-events-none"
      >
        {/* Empty placeholder row - no controls, no interaction */}
      </div>
    );
  },
);

interface TimelineTrackControllersProps {
  tracks: VideoTrack[];
  className?: string;
  scrollbarHeight: number;
}

// Placeholder row height
const PLACEHOLDER_ROW_HEIGHT = 48;

export const TimelineTrackControllers: React.FC<TimelineTrackControllersProps> =
  React.memo(
    ({ tracks, className, scrollbarHeight }) => {
      // Subscribe to visible track rows from timeline state with fallback
      const visibleTrackRows = useVideoEditorStore(
        (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
      );
      const transcribingSubtitleRowIndex = useVideoEditorStore(
        (state) => state.transcribingSubtitleRowIndex,
      );

      // Migrate tracks to ensure they have trackRowIndex
      const migratedTracks = useMemo(
        () => migrateTracksWithRowIndex(tracks),
        [tracks],
      );

      // Generate dynamic rows based on existing tracks (includes transient subtitle row)
      const dynamicRows = useMemo(
        () =>
          generateDynamicRows(migratedTracks, {
            transcribingSubtitleRowIndex,
          }),
        [migratedTracks, transcribingSubtitleRowIndex],
      );

      // Calculate placeholder rows needed - MUST MATCH timelineTracks.tsx
      const MAX_PLACEHOLDER_ROWS = 3;

      const { placeholderRowsAbove, placeholderRowsBelow, totalHeight } =
        useMemo(() => {
          // Calculate total height of dynamic rows
          const dynamicRowsHeight = dynamicRows.reduce((sum, row) => {
            const mediaType = row.trackTypes[0];
            return sum + getRowHeight(mediaType);
          }, 0);

          // Calculate how many extra rows we have beyond base (video-0, audio-0)
          const baseRowCount = 2;
          const extraRowsCount = Math.max(0, dynamicRows.length - baseRowCount);
          const remainingPlaceholders = Math.max(
            0,
            MAX_PLACEHOLDER_ROWS - extraRowsCount,
          );

          // Distribute placeholders: 2 above, 1 below (or however many remain)
          const above = Math.min(2, remainingPlaceholders);
          const below = Math.max(0, remainingPlaceholders - 2);

          const placeholderHeight = (above + below) * PLACEHOLDER_ROW_HEIGHT;

          return {
            placeholderRowsAbove: above,
            placeholderRowsBelow: below,
            totalHeight: dynamicRowsHeight + placeholderHeight,
          };
        }, [dynamicRows]);

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

      return (
        <div className={cn('', className)}>
          {/* Header with Add Track button - STICKY */}
          <div
            className={cn(
              'sticky top-0 z-20 dark:bg-zinc-900 bg-zinc-100 border-b border-border/20 flex items-center justify-center px-2',
              TIMELINE_HEADER_HEIGHT_CLASSES,
            )}
          >
            {/* <AddTrackButton /> */}
          </div>

          {/* Track controller rows wrapper - with placeholders */}
          <div
            className="relative flex flex-col justify-center"
            style={{
              minHeight: `${totalHeight}px`,
            }}
          >
            {/* Placeholder rows above */}
            {Array.from({ length: placeholderRowsAbove }, (_, i) => (
              <PlaceholderControllerRow
                key={`placeholder-above-${i}`}
                id={`placeholder-above-${i}`}
              />
            ))}

            {/* Actual track controller rows */}
            {visibleRows.map((rowDef) => {
              // Check if this is video-0
              const isVideoZero = rowDef.id === 'video-0';

              return (
                <div
                  key={rowDef.id}
                  className={cn(isVideoZero && 'sticky bottom-0 z-30')}
                  style={
                    isVideoZero
                      ? {
                          boxShadow: `0 ${scrollbarHeight + 10}px 0 0 var(--timeline-sticky-bg)`,
                        }
                      : undefined
                  }
                >
                  <div
                    className={cn(
                      isVideoZero && 'dark:bg-zinc-900 bg-zinc-100',
                    )}
                  >
                    <TrackControllerRow
                      rowDef={rowDef}
                      tracks={tracksByRow[rowDef.id] || []}
                    />
                  </div>
                </div>
              );
            })}

            {/* Placeholder rows below */}
            {Array.from({ length: placeholderRowsBelow }, (_, i) => (
              <PlaceholderControllerRow
                key={`placeholder-below-${i}`}
                id={`placeholder-below-${i}`}
              />
            ))}
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
