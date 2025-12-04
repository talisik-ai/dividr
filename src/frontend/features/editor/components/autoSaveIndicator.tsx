import { Check, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useVideoEditorStore } from '../stores/videoEditor';

export const AutosaveIndicator = () => {
  const { isSaving, lastSavedAt, hasUnsavedChanges } = useVideoEditorStore();
  const [timeAgo, setTimeAgo] = useState<string>('');

  // Update relative time every 5 seconds
  useEffect(() => {
    const updateTimeAgo = () => {
      if (!lastSavedAt) {
        setTimeAgo('');
        return;
      }

      const now = Date.now();
      const savedTime = new Date(lastSavedAt).getTime();
      const diffSeconds = Math.floor((now - savedTime) / 1000);

      if (diffSeconds < 10) {
        setTimeAgo('Just now');
      } else if (diffSeconds < 60) {
        setTimeAgo(`${diffSeconds}s ago`);
      } else if (diffSeconds < 3600) {
        const minutes = Math.floor(diffSeconds / 60);
        setTimeAgo(`${minutes}m ago`);
      } else {
        const hours = Math.floor(diffSeconds / 3600);
        setTimeAgo(`${hours}h ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 5000);

    return () => clearInterval(interval);
  }, [lastSavedAt]);

  if (!lastSavedAt && !isSaving) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-1 rounded-md bg-background/50 backdrop-blur-sm border border-border/50">
      {isSaving ? (
        <>
          <Loader2
            size={12}
            className="animate-spin text-blue-700 dark:text-blue-500"
          />
          <span className="dark:text-blue-500">Saving...</span>
        </>
      ) : (
        <>
          <Check size={12} className="text-green-700 dark:text-secondary" />
          <span className="text-green-700   dark:text-secondary">Saved</span>
          {timeAgo && (
            <span className="text-muted-foreground">· {timeAgo}</span>
          )}
        </>
      )}

      {hasUnsavedChanges && !isSaving && (
        <span className="text-amber-500 dark:text-amber-700">
          · Unsaved changes
        </span>
      )}
    </div>
  );
};
