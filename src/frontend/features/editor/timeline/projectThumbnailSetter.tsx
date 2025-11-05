import { Button } from '@/frontend/components/ui/button';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { cn } from '@/frontend/utils/utils';
import { ImageUp, PenLine } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { ThumbnailChangerDialog } from '../components/thumbnailChangerDialog';
import { useVideoEditorStore } from '../stores/videoEditor/index';
import { TRACK_ROWS } from './timelineTracks';
import {
  getRowHeight,
  getRowHeightClasses,
  TIMELINE_HEADER_HEIGHT_CLASSES,
} from './utils/timelineConstants';

interface ProjectThumbnailSetterProps {
  className?: string;
}

export const ProjectThumbnailSetter: React.FC<ProjectThumbnailSetterProps> =
  React.memo(({ className }) => {
    const [dialogOpen, setDialogOpen] = useState(false);
    const setProjectThumbnail = useVideoEditorStore(
      (state) => state.setProjectThumbnail,
    );
    const currentProject = useProjectStore((state) => state.currentProject);

    // Subscribe to visible track rows to dynamically position the thumbnail setter
    const visibleTrackRows = useVideoEditorStore(
      (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
    );

    const projectThumbnail = useMemo(() => {
      return currentProject?.metadata?.thumbnail;
    }, [currentProject]);

    const handleOpenDialog = useCallback(() => {
      setDialogOpen(true);
    }, []);

    const handleThumbnailSelected = useCallback(
      async (thumbnailData: string) => {
        try {
          await setProjectThumbnail(thumbnailData);
        } catch (error) {
          // Failed to set thumbnail
        }
      },
      [setProjectThumbnail],
    );

    // Calculate baseline height (5 tracks) and whether we should center - matches TimelineTracks
    const { baselineHeight, shouldCenter, videoRowOffset } = useMemo(() => {
      // Calculate height for each visible row
      const visibleRowsInOrder = TRACK_ROWS.filter((row) =>
        visibleTrackRows.includes(row.id),
      );

      // Baseline height = height of ALL 5 track rows (even if not visible)
      // This ensures the grid always shows space for 5 tracks
      const baseline = TRACK_ROWS.reduce((sum, row) => {
        return sum + getRowHeight(row.id);
      }, 0);

      // Calculate total height of all visible rows
      const totalHeight = visibleRowsInOrder.reduce((sum, row) => {
        return sum + getRowHeight(row.id);
      }, 0);

      // Calculate offset for video row
      const videoIndex = visibleRowsInOrder.findIndex(
        (row) => row.id === 'video',
      );
      let offset = 0;
      if (videoIndex !== -1) {
        for (let i = 0; i < videoIndex; i++) {
          offset += getRowHeight(visibleRowsInOrder[i].id);
        }
      }

      // If centering, add the top padding offset
      const centeringOffset =
        visibleRowsInOrder.length < TRACK_ROWS.length
          ? (baseline - totalHeight) / 2
          : 0;

      return {
        baselineHeight: baseline,
        shouldCenter: visibleRowsInOrder.length < TRACK_ROWS.length,
        videoRowOffset: offset + centeringOffset,
      };
    }, [visibleTrackRows]);

    // Get the position of the video track row
    const videoTrackIndex = useMemo(() => {
      // Define the order: video, image, text, subtitle, audio
      const order = ['text', 'subtitle', 'image', 'video', 'audio'];
      const visibleRowsInOrder = order.filter((id) =>
        visibleTrackRows.includes(id),
      );
      return visibleRowsInOrder.indexOf('video');
    }, [visibleTrackRows]);

    // If video track is not visible, don't render
    if (videoTrackIndex === -1) {
      return null;
    }

    return (
      <>
        <div className="flex flex-col mr-2 flex-shrink-0 w-[48px]">
          {/* Header spacer to align with timeline ruler */}
          <div
            className={cn(
              'pointer-events-none',
              TIMELINE_HEADER_HEIGHT_CLASSES,
            )}
          ></div>

          {/* Wrapper with baseline height and centering */}
          <div
            className="flex-shrink-0 relative"
            style={{
              minHeight: shouldCenter ? `${baselineHeight}px` : 'auto',
              height: shouldCenter ? `${baselineHeight}px` : 'auto',
            }}
          >
            {/* Placeholder borders for ALL 5 track rows when centering - positioned at absolute positions */}
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
                {TRACK_ROWS.map((rowDef) => {
                  // Calculate this row's top position - sum of all previous row heights
                  let top = 0;
                  for (let i = 0; i < TRACK_ROWS.length; i++) {
                    if (TRACK_ROWS[i].id === rowDef.id) break;
                    top += getRowHeight(TRACK_ROWS[i].id);
                  }

                  const rowHeight = getRowHeight(rowDef.id);

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

            {/* Video row - positioned absolutely to align with centered track */}
            <div
              className={cn(
                'flex items-center group pointer-events-auto absolute',
                getRowHeightClasses('video'),
              )}
              style={{
                top: `${videoRowOffset}px`,
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'relative size-10 border-2 group border-dashed group-hover:bg-secondary/20 border-accent group-hover:border-secondary transition-colors bg-accent/10 backdrop-blur-sm overflow-hidden rounded-sm',
                  className,
                )}
                onClick={handleOpenDialog}
                title="Set project thumbnail"
              >
                {projectThumbnail ? (
                  <>
                    <img
                      src={projectThumbnail}
                      alt="Project thumbnail"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    <div className="absolute group-hover:opacity-100 opacity-0 inset-0 bg-black/40 group-hover:bg-black/60 transition-colors flex items-center justify-center">
                      <PenLine className="h-3 w-3 text-white" />
                    </div>
                  </>
                ) : (
                  <ImageUp className="h-3 w-3 text-accent group-hover:text-secondary" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <ThumbnailChangerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onThumbnailSelected={handleThumbnailSelected}
        />
      </>
    );
  });
