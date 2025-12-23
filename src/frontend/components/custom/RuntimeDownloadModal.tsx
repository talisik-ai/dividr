import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  DownloadProgress,
  useRuntime,
} from '../../providers/RuntimeStatusProvider';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';

interface RuntimeDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  featureName?: string;
}

type ModalState = 'consent' | 'downloading' | 'success' | 'error';

/**
 * Modal dialog for downloading the runtime with consent and progress.
 *
 * States:
 * 1. Consent - Explain download, show size (~350 MB), Download/Cancel buttons
 * 2. Downloading - Progress bar, bytes/total, speed, Cancel button
 * 3. Success - Checkmark, "Installation complete", auto-close
 * 4. Error - Error message, Retry/Cancel buttons
 */
export function RuntimeDownloadModal({
  isOpen,
  onClose,
  onSuccess,
  featureName = 'this feature',
}: RuntimeDownloadModalProps) {
  const { isDownloading, downloadProgress, startDownload, cancelDownload } =
    useRuntime();

  const [modalState, setModalState] = useState<ModalState>('consent');
  const [error, setError] = useState<string | null>(null);

  // Determine modal state based on download progress
  useEffect(() => {
    if (!isOpen) {
      // Reset state when modal closes
      setModalState('consent');
      setError(null);
      return;
    }

    if (isDownloading && downloadProgress) {
      if (downloadProgress.stage === 'error') {
        setModalState('error');
        setError(
          downloadProgress.error ||
            downloadProgress.message ||
            'Download failed',
        );
      } else if (downloadProgress.stage === 'complete') {
        setModalState('success');
      } else {
        setModalState('downloading');
      }
    }
  }, [isOpen, isDownloading, downloadProgress]);

  // Handle download start
  const handleDownload = useCallback(async () => {
    setError(null);
    setModalState('downloading');

    const result = await startDownload();

    if (result.success) {
      setModalState('success');
      // Auto-close and trigger success callback after delay
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } else {
      setModalState('error');
      setError(result.error || 'Download failed');
    }
  }, [startDownload, onSuccess, onClose]);

  // Handle cancel
  const handleCancel = useCallback(async () => {
    if (isDownloading) {
      await cancelDownload();
    }
    onClose();
  }, [isDownloading, cancelDownload, onClose]);

  // Format bytes to human-readable string
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format speed
  const formatSpeed = (bytesPerSec: number): string => {
    return `${formatBytes(bytesPerSec)}/s`;
  };

  // Get stage message
  const getStageMessage = (progress: DownloadProgress): string => {
    switch (progress.stage) {
      case 'fetching':
        return 'Fetching release information...';
      case 'downloading':
        return progress.message || 'Downloading...';
      case 'extracting':
        return 'Extracting files...';
      case 'verifying':
        return 'Verifying installation...';
      case 'complete':
        return 'Installation complete!';
      case 'error':
        return progress.error || 'An error occurred';
      default:
        return 'Processing...';
    }
  };

  // Prevent closing during download
  const handleOpenChange = (open: boolean) => {
    if (!open && !isDownloading) {
      onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        {/* Consent State */}
        {modalState === 'consent' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Download className="size-5 text-primary" />
                Download Required
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-2">
                  <p>
                    <strong>{featureName}</strong> requires the AI runtime
                    component to work.
                  </p>
                  <div className="space-y-1 rounded-md bg-muted/50 p-3">
                    <p className="text-sm font-medium text-foreground">
                      Download Details:
                    </p>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      <li>Size: ~350 MB</li>
                      <li>Source: GitHub Releases</li>
                      <li>One-time download</li>
                    </ul>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleDownload}>
                <Download className="size-4" />
                Download Now
              </Button>
            </AlertDialogFooter>
          </>
        )}

        {/* Downloading State */}
        {modalState === 'downloading' && downloadProgress && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Loader2 className="size-5 animate-spin text-primary" />
                Downloading Runtime
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 pt-2">
                  <p className="text-sm">{getStageMessage(downloadProgress)}</p>
                  <div className="space-y-2">
                    <Progress
                      value={downloadProgress.progress}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{downloadProgress.progress.toFixed(0)}%</span>
                      {downloadProgress.bytesDownloaded &&
                        downloadProgress.totalBytes && (
                          <span>
                            {formatBytes(downloadProgress.bytesDownloaded)} /{' '}
                            {formatBytes(downloadProgress.totalBytes)}
                          </span>
                        )}
                      {downloadProgress.speed && downloadProgress.speed > 0 && (
                        <span>{formatSpeed(downloadProgress.speed)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="destructive" onClick={handleCancel}>
                Cancel
              </Button>
            </AlertDialogFooter>
          </>
        )}

        {/* Success State */}
        {modalState === 'success' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-green-500" />
                Installation Complete
              </AlertDialogTitle>
              <AlertDialogDescription>
                The runtime has been installed successfully. {featureName} is
                now ready to use.
              </AlertDialogDescription>
            </AlertDialogHeader>
          </>
        )}

        {/* Error State */}
        {modalState === 'error' && (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <XCircle className="size-5 text-red-500" />
                Download Failed
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm">{error}</p>
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                    <p className="text-xs text-destructive">
                      Please check your internet connection and try again.
                    </p>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleDownload}>
                <RefreshCw className="size-4" />
                Retry
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
