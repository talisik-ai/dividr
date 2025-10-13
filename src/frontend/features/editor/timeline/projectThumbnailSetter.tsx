import { Button } from '@/frontend/components/ui/button';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { cn } from '@/frontend/utils/utils';
import { ImageUp, PenLine } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import { ThumbnailChangerDialog } from '../components/ThumbnailChangerDialog';
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

    return (
      <>
        <div className="space-y-1 mr-2">
          {/* Header spacer to align with timeline ruler */}
          <div className="h-8 pointer-events-none"></div>
          {/* Subtitle row spacer */}
          <div className="sm:h-6 md:h-8 lg:h-12 pointer-events-none"></div>
          {/* Assets row spacer */}
          <div className="sm:h-6 md:h-8 lg:h-12 pointer-events-none"></div>

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
