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
import { Clock, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';

interface HardwareInfo {
  hasHardwareEncoder: boolean;
  encoderType: string;
  encoderDescription: string;
  cpuCores: number;
  totalRamGB: number;
  freeRamGB: number;
  isLowHardware: boolean;
}

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

  // Fetch hardware capabilities when dialog opens
  const [hardwareInfo, setHardwareInfo] = useState<HardwareInfo | null>(null);

  useEffect(() => {
    if (open && !hardwareInfo) {
      window.electronAPI
        .getHardwareCapabilities()
        .then((result) => {
          if (result.success && result.capabilities) {
            setHardwareInfo(result.capabilities);
          }
        })
        .catch(console.error);
    }
  }, [open, hardwareInfo]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            High-Resolution Media
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-foreground">"{mediaName}"</span>
              {is4K && (
                <Badge className="py-0 !text-[10px] px-1 !h-fit">
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
                    take several minutes for longer clips
                  </p>
                </div>
              </div>
            </div>

            {/* {hardwareInfo && (
              <div className="bg-muted/30 rounded-lg p-3 text-xs">
                <p className="font-medium text-foreground mb-2 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5" />
                  Your System
                </p>
                <div className="grid grid-cols-[1fr_auto] gap-2 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3 text-green-500" />
                    <span>
                      {hardwareInfo.hasHardwareEncoder
                        ? hardwareInfo.encoderDescription
                        : 'CPU Encoding'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <HardDrive className="h-3 w-3" />
                    <span>{hardwareInfo.totalRamGB}GB RAM</span>
                  </div>
                </div>
                {hardwareInfo.hasHardwareEncoder && (
                  <p className="mt-1.5 text-green-600 dark:text-green-400">
                    ✓ GPU acceleration enabled
                  </p>
                )}
              </div>
            )} */}
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
