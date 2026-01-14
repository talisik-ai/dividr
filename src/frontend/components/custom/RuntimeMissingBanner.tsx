import { ArrowUpCircle, Download, Info, X } from 'lucide-react';
import { useState } from 'react';
import { useRuntime } from '../../providers/RuntimeStatusProvider';
import { Button } from '../ui/button';

interface RuntimeMissingBannerProps {
  onDownloadClick: () => void;
}

/**
 * A subtle, dismissible banner shown at startup when the runtime is missing
 * or needs an update. Informs users that Transcription & Noise Reduction
 * features require a download or update.
 */
export function RuntimeMissingBanner({
  onDownloadClick,
}: RuntimeMissingBannerProps) {
  const { status } = useRuntime();
  const [dismissed, setDismissed] = useState(false);

  // Determine if this is an update or fresh download
  const isUpdate = status.installed && status.needsUpdate;
  const needsAction = !status.installed || status.needsUpdate;

  // Don't show if:
  // - Runtime is installed and up to date
  // - User dismissed the banner
  // - Still checking status
  if (!needsAction || dismissed || status.isChecking) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-12 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <Info className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {isUpdate ? (
            <>
              Runtime update available (v{status.version} → v
              {status.requiredVersion})
            </>
          ) : (
            <>
              Transcription & Noise Reduction features require a download (~210
              MB)
            </>
          )}
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={onDownloadClick}
          className="shrink-0"
        >
          {isUpdate ? (
            <>
              <ArrowUpCircle className="size-3.5" />
              Update
            </>
          ) : (
            <>
              <Download className="size-3.5" />
              Download
            </>
          )}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="size-7 shrink-0 p-0"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
