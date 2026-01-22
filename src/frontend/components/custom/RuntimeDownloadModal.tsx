import {
  ArrowUpCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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

// GitHub repository for the runtime releases
const GITHUB_REPO_URL = 'https://github.com/talisik-ai/dividr-binary/releases';

/**
 * Modal dialog for downloading/updating the runtime with consent and progress.
 *
 * States:
 * 1. Consent - Explain download/update, show size, version info, Download/Cancel buttons
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
  const {
    status,
    isDownloading,
    downloadProgress,
    startDownload,
    cancelDownload,
  } = useRuntime();

  const [modalState, setModalState] = useState<ModalState>('consent');
  const [error, setError] = useState<string | null>(null);

  // Track last valid speed to prevent blinking when speed temporarily drops to 0
  const lastValidSpeedRef = useRef<number>(0);
  const [displaySpeed, setDisplaySpeed] = useState<number>(0);

  // Update display speed with debouncing to prevent blinking
  useEffect(() => {
    if (downloadProgress?.speed && downloadProgress.speed > 0) {
      lastValidSpeedRef.current = downloadProgress.speed;
      setDisplaySpeed(downloadProgress.speed);
    } else if (
      downloadProgress?.stage === 'downloading' &&
      lastValidSpeedRef.current > 0
    ) {
      // Keep showing last valid speed during brief drops
      setDisplaySpeed(lastValidSpeedRef.current);
    }
  }, [downloadProgress?.speed, downloadProgress?.stage]);

  // Reset speed when modal closes
  useEffect(() => {
    if (!isOpen) {
      lastValidSpeedRef.current = 0;
      setDisplaySpeed(0);
    }
  }, [isOpen]);

  // Determine if this is an update or fresh download
  const isUpdate = status.installed && status.needsUpdate;
  const actionWord = isUpdate ? 'Update' : 'Download';

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
            `${actionWord} failed`,
        );
      } else if (downloadProgress.stage === 'complete') {
        setModalState('success');
      } else {
        setModalState('downloading');
      }
    }
  }, [isOpen, isDownloading, downloadProgress, actionWord]);

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
      setError(result.error || `${actionWord} failed`);
    }
  }, [startDownload, onSuccess, onClose, actionWord]);

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
        return 'Fetching release information from GitHub...';
      case 'downloading':
        return progress.message || 'Downloading runtime package...';
      case 'extracting':
        return 'Extracting files...';
      case 'verifying':
        return 'Verifying installation...';
      case 'complete':
        return `${actionWord} complete!`;
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
                {isUpdate ? (
                  <ArrowUpCircle className="size-5 text-primary" />
                ) : (
                  <Download className="size-5 text-primary" />
                )}
                {isUpdate ? 'Update Available' : 'Download Required'}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 pt-2">
                  <p>
                    <strong>{featureName}</strong> requires the{' '}
                    {isUpdate ? 'latest version of the' : ''} AI Media Tools
                    runtime to work.
                  </p>

                  {/* Version Information */}
                  {isUpdate && status.version && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">
                        Current: v{status.version}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium text-primary">
                        v{status.requiredVersion}
                      </span>
                    </div>
                  )}

                  {/* What's New for Updates */}
                  {isUpdate && (
                    <div className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-3">
                      <p className="text-sm font-medium text-foreground">
                        What&apos;s New in v{status.requiredVersion}:
                      </p>
                      <ul className="space-y-0.5 text-xs text-muted-foreground">
                        <li>
                          • Fixed compatibility issues on machines without Python
                        </li>
                        <li>• Complete bundling of all native dependencies</li>
                        <li>• Resolved missing module errors for noise reduction</li>
                      </ul>
                    </div>
                  )}

                  {/* Download Details */}
                  <div className="space-y-1 rounded-md bg-muted/50 p-3">
                    <p className="text-sm font-medium text-foreground">
                      {actionWord} Details:
                    </p>
                    <ul className="space-y-0.5 text-xs text-muted-foreground">
                      <li>
                        <strong>Package:</strong> dividr-tools v
                        {status.requiredVersion}
                      </li>
                      <li>
                        <strong>Size:</strong> ~222 MB
                      </li>
                      <li>
                        <strong>Source:</strong> GitHub Releases (talisik-ai)
                      </li>
                      <li>
                        <strong>Contains:</strong> Transcription
                        (Faster-Whisper) + Noise Reduction (DeepFilterNet)
                      </li>
                    </ul>
                  </div>

                  {/* GitHub Link */}
                  <a
                    href={GITHUB_REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <ExternalLink className="size-3" />
                    View releases on GitHub
                  </a>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleDownload}>
                {isUpdate ? (
                  <ArrowUpCircle className="size-4" />
                ) : (
                  <Download className="size-4" />
                )}
                {actionWord} Now
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
                {isUpdate ? 'Updating' : 'Downloading'} Runtime
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-4 pt-2">
                  <p className="text-sm">{getStageMessage(downloadProgress)}</p>
                  <div className="space-y-2">
                    <Progress
                      value={downloadProgress.progress}
                      className="w-full"
                    />
                    {/* Fixed: Use grid layout to prevent centering issue */}
                    <div className="grid grid-cols-3 text-xs text-muted-foreground">
                      <span className="text-left">
                        {downloadProgress.progress.toFixed(0)}%
                      </span>
                      <span className="text-center">
                        {downloadProgress.bytesDownloaded &&
                        downloadProgress.totalBytes
                          ? `${formatBytes(downloadProgress.bytesDownloaded)} / ${formatBytes(downloadProgress.totalBytes)}`
                          : ''}
                      </span>
                      <span className="text-right min-w-[70px]">
                        {displaySpeed > 0 ? formatSpeed(displaySpeed) : '—'}
                      </span>
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
                {isUpdate ? 'Update' : 'Installation'} Complete
              </AlertDialogTitle>
              <AlertDialogDescription>
                The runtime has been {isUpdate ? 'updated' : 'installed'}{' '}
                successfully to v{status.requiredVersion}. {featureName} is now
                ready to use.
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
                {actionWord} Failed
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p className="text-sm">{error}</p>
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3">
                    <p className="text-xs text-destructive">
                      Please check your internet connection and try again. If
                      the problem persists, you can manually download from{' '}
                      <a
                        href={GITHUB_REPO_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        GitHub Releases
                      </a>
                      .
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
