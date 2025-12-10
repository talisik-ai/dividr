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
import React from 'react';

interface KaraokeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaName: string;
  existingSubtitleCount: number;
  onConfirm: (deleteExisting: boolean) => void;
  mode?: 'generate' | 'import';
}

export const KaraokeConfirmationDialog: React.FC<
  KaraokeConfirmationDialogProps
> = ({
  open,
  onOpenChange,
  mediaName,
  existingSubtitleCount,
  onConfirm,
  mode = 'generate',
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {mode === 'generate'
              ? 'Generate Karaoke Subtitles for '
              : 'Import Subtitles for '}
            <span className="font-normal text-foreground">"{mediaName}"</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            {existingSubtitleCount > 0 && (
              <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
                <p className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                  ⚠️ You have {existingSubtitleCount} existing subtitle track
                  {existingSubtitleCount !== 1 ? 's' : ''} on the timeline.
                </p>
                <p className="text-amber-600/80 dark:text-amber-400/80 text-xs mt-1">
                  Do you want to delete them before generating new karaoke
                  subtitles?
                </p>
              </div>
            )}
            {mode === 'generate' ? (
              <p className="text-xs text-muted-foreground">
                This will use Whisper AI to transcribe the audio and create
                word-level subtitle tracks for karaoke-style animations.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Importing subtitles will add a new subtitle track without
                merging into existing generated/karaoke subtitles.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {existingSubtitleCount > 0 && (
            <AlertDialogAction
              onClick={() => {
                onConfirm(true);
                onOpenChange(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete & Generate
            </AlertDialogAction>
          )}
          <AlertDialogAction
            onClick={() => {
              onConfirm(false);
              onOpenChange(false);
            }}
          >
            {existingSubtitleCount > 0 ? 'Keep & Generate' : 'Generate'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
