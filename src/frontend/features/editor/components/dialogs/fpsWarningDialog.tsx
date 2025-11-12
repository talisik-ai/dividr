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
import { Checkbox } from '@/frontend/components/ui/checkbox';
import React, { useState } from 'react';

interface FpsWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originalFps: number;
  newFps: number;
  onConfirm: (enableInterpolation: boolean) => void;
  showInterpolationOption?: boolean;
}

export const FpsWarningDialog: React.FC<FpsWarningDialogProps> = ({
  open,
  onOpenChange,
  originalFps,
  newFps,
  onConfirm,
  showInterpolationOption = false,
}) => {
  const [enableInterpolation, setEnableInterpolation] = useState(false);

  const handleConfirm = () => {
    onConfirm(enableInterpolation);
    onOpenChange(false);
    setEnableInterpolation(false); // Reset for next time
  };

  const handleCancel = () => {
    onOpenChange(false);
    setEnableInterpolation(false); // Reset for next time
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>FPS Change Warning</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3">
              <p className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                ⚠️ Your original video is only {originalFps} FPS.
              </p>
              <p className="text-amber-600 dark:text-amber-400 text-xs mt-2">
                Changing to {newFps} FPS requires frame interpolation or
                duplication, which may not result in smoother playback and could
                increase export time.
              </p>
            </div>

            <p className="text-xs text-muted-foreground">
              Would you like to proceed with this change?
            </p>

            {showInterpolationOption && (
              <div className="flex items-start space-x-3 rounded-md border border-muted p-3 mt-3">
                <Checkbox
                  id="enable-interpolation"
                  checked={enableInterpolation}
                  onCheckedChange={(checked) =>
                    setEnableInterpolation(checked as boolean)
                  }
                />
                <div className="space-y-1">
                  <label
                    htmlFor="enable-interpolation"
                    className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Enable frame interpolation
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Use AI to generate intermediate frames for smoother motion
                    (experimental, increases processing time significantly)
                  </p>
                </div>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm}>
            Proceed Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
