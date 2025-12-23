import { useCallback, useState } from 'react';
import { useRuntime } from '../providers/RuntimeStatusProvider';

interface UseRequireRuntimeOptions {
  featureName: string;
  onRuntimeReady?: () => void;
}

interface UseRequireRuntimeResult {
  /**
   * Wrap an action that requires the runtime.
   * If runtime is not installed, shows the download modal instead.
   */
  requireRuntime: <T>(action: () => T | Promise<T>) => () => Promise<T | void>;

  /** Whether the download modal should be shown */
  showDownloadModal: boolean;

  /** Set the download modal visibility */
  setShowDownloadModal: (show: boolean) => void;

  /** Called after successful download to retry the pending action */
  handleDownloadSuccess: () => Promise<void>;

  /** The feature name for display in the modal */
  featureName: string;

  /** Whether the runtime is currently available */
  isRuntimeAvailable: boolean;
}

/**
 * Hook for wrapping feature calls that require the runtime.
 *
 * Usage:
 * ```tsx
 * const { requireRuntime, showDownloadModal, setShowDownloadModal, handleDownloadSuccess } =
 *   useRequireRuntime({ featureName: 'Transcription' });
 *
 * const handleClick = requireRuntime(async () => {
 *   await transcribe();
 * });
 *
 * return (
 *   <>
 *     <Button onClick={handleClick}>Transcribe</Button>
 *     <RuntimeDownloadModal
 *       isOpen={showDownloadModal}
 *       onClose={() => setShowDownloadModal(false)}
 *       onSuccess={handleDownloadSuccess}
 *       featureName="Transcription"
 *     />
 *   </>
 * );
 * ```
 */
export function useRequireRuntime({
  featureName,
  onRuntimeReady,
}: UseRequireRuntimeOptions): UseRequireRuntimeResult {
  const { status, refresh } = useRuntime();
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    (() => unknown | Promise<unknown>) | null
  >(null);

  const isRuntimeAvailable = status.installed && !status.needsUpdate;

  // Wrapper that checks runtime before executing action
  const requireRuntime = useCallback(
    <T>(action: () => T | Promise<T>) => {
      return async (): Promise<T | void> => {
        // Refresh status to ensure it's current
        await refresh();

        // Check if runtime is available
        const currentStatus = await window.electronAPI.runtimeStatus();

        if (currentStatus.installed && !currentStatus.needsUpdate) {
          // Runtime available, execute action
          return await action();
        } else {
          // Runtime missing, show modal and save pending action
          setPendingAction(() => action);
          setShowDownloadModal(true);
          return;
        }
      };
    },
    [refresh],
  );

  // Called after successful download
  const handleDownloadSuccess = useCallback(async () => {
    await refresh();

    if (pendingAction) {
      // Auto-retry the pending action
      try {
        await pendingAction();
      } catch (error) {
        console.error('Failed to execute pending action:', error);
      }
      setPendingAction(null);
    }

    onRuntimeReady?.();
  }, [pendingAction, refresh, onRuntimeReady]);

  return {
    requireRuntime,
    showDownloadModal,
    setShowDownloadModal,
    handleDownloadSuccess,
    featureName,
    isRuntimeAvailable,
  };
}
