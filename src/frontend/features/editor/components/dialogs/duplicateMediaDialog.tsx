import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/frontend/components/ui/alert-dialog';
import { buttonVariants } from '@/frontend/components/ui/button';
import { cn } from '@/frontend/utils/utils';
import { Copy, FileCheck } from 'lucide-react';
import React from 'react';

interface DuplicateMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingMediaName: string;
  existingMediaThumbnail?: string;
  newFileName: string;
  onUseExisting: () => void;
  onImportAsCopy: () => void;
}

export const DuplicateMediaDialog: React.FC<DuplicateMediaDialogProps> = ({
  open,
  onOpenChange,
  existingMediaName,
  existingMediaThumbnail,
  newFileName,
  onUseExisting,
  onImportAsCopy,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-amber-500" />
            Duplicate Media Detected
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                This file appears to already exist in your media library.
              </p>
            </div>

            <div className="space-y-3">
              {/* Existing media info */}
              <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                {existingMediaThumbnail ? (
                  <img
                    src={existingMediaThumbnail}
                    alt="Existing media"
                    className="w-16 h-12 object-cover rounded"
                  />
                ) : (
                  <div className="w-16 h-12 bg-muted rounded flex items-center justify-center">
                    <FileCheck className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">
                    Already in library:
                  </p>
                  <p className="text-sm font-medium text-foreground truncate">
                    {existingMediaName}
                  </p>
                </div>
              </div>

              {/* New file info */}
              <div className="flex items-start gap-3 p-3 rounded-md border border-dashed">
                <div className="w-16 h-12 bg-muted/30 rounded flex items-center justify-center">
                  <Copy className="h-6 w-6 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">Importing:</p>
                  <p className="text-sm font-medium text-foreground truncate">
                    {newFileName}
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Using the existing asset avoids duplication and saves storage
              space. Import as copy if you need separate instances.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              onUseExisting();
              onOpenChange(false);
            }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onImportAsCopy();
              onOpenChange(false);
            }}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'border-muted-foreground/20 text-foreground',
            )}
          >
            Import as Copy
          </AlertDialogAction>
          <AlertDialogAction
            onClick={() => {
              onUseExisting();
              onOpenChange(false);
            }}
          >
            Use Existing
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
