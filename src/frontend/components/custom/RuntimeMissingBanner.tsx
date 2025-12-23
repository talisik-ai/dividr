import { Download, Info, X } from 'lucide-react';
import { useState } from 'react';
import { useRuntime } from '../../providers/RuntimeStatusProvider';
import { Button } from '../ui/button';

interface RuntimeMissingBannerProps {
  onDownloadClick: () => void;
}

/**
 * A subtle, dismissible banner shown at startup when the runtime is missing.
 * Informs users that Transcription & Noise Reduction features require an
 * additional download.
 */
export function RuntimeMissingBanner({
  onDownloadClick,
}: RuntimeMissingBannerProps) {
  const { status } = useRuntime();
  const [dismissed, setDismissed] = useState(false);

  // Don't show if:
  // - Runtime is installed
  // - User dismissed the banner
  // - Still checking status
  if (status.installed || dismissed || status.isChecking) {
    return null;
  }

  return (
    <div className="fixed left-1/2 top-12 z-50 -translate-x-1/2 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <Info className="size-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Transcription & Noise Reduction features require an additional
          download (~350 MB)
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={onDownloadClick}
          className="shrink-0"
        >
          <Download className="size-3.5" />
          Download
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
