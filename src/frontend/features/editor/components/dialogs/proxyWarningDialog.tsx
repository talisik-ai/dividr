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
import { Badge } from '@/frontend/components/ui/badge';
import { AlertTriangle, Clock, Zap } from 'lucide-react';
import React from 'react';

interface ProxyWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaName: string;
  resolution?: { width: number; height: number };
  onUseAnyway: () => void;
  onWaitForOptimization: () => void;
}

/**
 * Dialog shown when user attempts to add 4K (or higher resolution) media
 * to the timeline while proxy generation is still in progress.
 *
 * Always shows regardless of hardware capability, as proxy generation
 * can still take significant time even with GPU acceleration.
 */
export const ProxyWarningDialog: React.FC<ProxyWarningDialogProps> = ({
  open,
  onOpenChange,
  mediaName,
  resolution,
  onUseAnyway,
  onWaitForOptimization,
}) => {
  const resolutionLabel = resolution
    ? `${resolution.width}×${resolution.height}`
    : '4K+';

  const is4K = resolution ? resolution.width > 2000 : true;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            High-Resolution Media
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">"{mediaName}"</span>
              {is4K && (
                <Badge variant="secondary" className="text-xs">
                  {resolutionLabel}
                </Badge>
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              This asset is still being optimized for smooth editing. Using it
              now may cause:
            </p>

            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside ml-2">
              <li>Playback lag and stuttering</li>
              <li>Slower preview rendering</li>
              <li>Potential freezes during scrubbing</li>
            </ul>

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Clock className="h-4 w-4 mt-0.5 text-yellow-500 flex-shrink-0" />
                <div>
                  <p className="font-medium text-foreground mb-1">
                    Why does this take time?
                  </p>
                  <p>
                    High-resolution video requires generating an optimized
                    preview copy (proxy). Even with GPU acceleration, this can
                    take several minutes for longer clips. This is standard
                    practice in professional editing software.
                  </p>
                </div>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel
            onClick={onWaitForOptimization}
            className="flex items-center gap-2 sm:order-2 !bg-yellow-600 hover:!bg-yellow-700 text-white"
          >
            <Clock className="h-4 w-4" />
            Wait for Optimization
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onUseAnyway}
            className="flex items-center gap-2 bg-transparent hover:bg-transparent border text-foreground sm:order-1"
          >
            <Zap className="h-4 w-4" />
            Use Anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ProxyWarningDialog;
