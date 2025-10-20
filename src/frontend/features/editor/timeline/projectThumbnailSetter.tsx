import { Button } from '@/frontend/components/ui/button';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { cn } from '@/frontend/utils/utils';
import { ImageUp, PenLine } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { ThumbnailChangerDialog } from '../components/thumbnailChangerDialog';
import { useVideoEditorStore } from '../stores/videoEditor/index';

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

    // Get the position of the video track row
    const videoTrackIndex = useMemo(() => {
      // Define the order: video, logo, subtitle, audio
      const order = ['text', 'subtitle', 'logo', 'video', 'audio'];
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
        <div className="space-y-1 mr-2">
          {/* Header spacer to align with timeline ruler */}
          <div className="h-8 pointer-events-none"></div>

          {/* Render spacers for rows before the video track */}
          {Array.from({ length: videoTrackIndex }).map((_, index) => (
            <div
              key={`spacer-${index}`}
              className="sm:h-6 md:h-8 lg:h-12 pointer-events-none"
            ></div>
          ))}

          {/* Video row - this is where we place the thumbnail setter */}
          <div className="sm:h-6 md:h-8 lg:h-12 flex items-center group pointer-events-auto">
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'relative size-10 border-2 group border-dashed group-hover:bg-secondary/20 border-accent group-hover:border-secondary transition-colors bg-accent/10 backdrop-blur-sm overflow-hidden',
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

        <ThumbnailChangerDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onThumbnailSelected={handleThumbnailSelected}
        />
      </>
    );
  });
