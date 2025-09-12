import { cn } from '@/Lib/utils';
import { PenLine } from 'lucide-react';
import React, { useCallback } from 'react';
import { Button } from '../../sub/ui/Button';

interface ProjectThumbnailSetterProps {
  className?: string;
}

export const ProjectThumbnailSetter: React.FC<ProjectThumbnailSetterProps> =
  React.memo(({ className }) => {
    const handleSetThumbnail = useCallback(async () => {
      try {
        // Open file dialog to select image for project thumbnail
        const result = await window.electronAPI.openFileDialog({
          title: 'Select Project Thumbnail',
          properties: ['openFile'],
          filters: [
            {
              name: 'Image Files',
              extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
            },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (
          result.success &&
          !result.canceled &&
          result.files &&
          result.files.length > 0
        ) {
          const thumbnailFile = result.files[0];
          console.log('Setting project thumbnail:', thumbnailFile.name);

          // TODO: Add logic to save the thumbnail to the project metadata
          // This could involve creating a preview URL and storing it in the project store

          // For now, just log success
          console.log(
            'Project thumbnail set successfully:',
            thumbnailFile.path,
          );
        }
      } catch (error) {
        console.error('Failed to set project thumbnail:', error);
      }
    }, []);

    return (
      <div className="space-y-1 mr-2">
        {/* Header spacer to align with timeline ruler */}
        <div className="h-8 pointer-events-none"></div>
        {/* Subtitle row spacer */}
        <div className="sm:h-6 md:h-8 lg:h-12 pointer-events-none"></div>
        {/* Video row - this is where we place the thumbnail setter */}
        <div className="sm:h-6 md:h-8 lg:h-12 flex items-center group pointer-events-auto">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-10 border-2 border-dashed group-hover:bg-secondary/20 border-accent group-hover:border-secondary transition-colors bg-accent/10 backdrop-blur-sm',
              className,
            )}
            onClick={handleSetThumbnail}
            title="Set project thumbnail"
          >
            <PenLine className="h-3 w-3 text-accent group-hover:text-secondary" />
          </Button>
        </div>
      </div>
    );
  });
