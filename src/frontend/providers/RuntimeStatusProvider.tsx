import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

// ============================================================================
// Types
// ============================================================================

export interface RuntimeStatus {
  installed: boolean;
  version: string | null;
  path: string | null;
  needsUpdate: boolean;
  requiredVersion: string;
  isChecking: boolean;
  lastChecked: Date | null;
}

export interface DownloadProgress {
  stage:
    | 'fetching'
    | 'downloading'
    | 'extracting'
    | 'verifying'
    | 'complete'
    | 'error';
  progress: number;
  bytesDownloaded?: number;
  totalBytes?: number;
  speed?: number;
  message?: string;
  error?: string;
}

interface RuntimeContextValue {
  status: RuntimeStatus;
  refresh: () => Promise<void>;
  isDownloading: boolean;
  downloadProgress: DownloadProgress | null;
  startDownload: () => Promise<{ success: boolean; error?: string }>;
  cancelDownload: () => Promise<void>;
}

// ============================================================================
// Context
// ============================================================================

const initialStatus: RuntimeStatus = {
  installed: false,
  version: null,
  path: null,
  needsUpdate: false,
  requiredVersion: '',
  isChecking: true,
  lastChecked: null,
};

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

// ============================================================================
// Hook
// ============================================================================

export const useRuntime = (): RuntimeContextValue => {
  const context = useContext(RuntimeContext);

  if (!context) {
    throw new Error('useRuntime must be used within a RuntimeStatusProvider');
  }

  return context;
};

// ============================================================================
// Provider
// ============================================================================

interface RuntimeStatusProviderProps {
  children: React.ReactNode;
}

export function RuntimeStatusProvider({
  children,
}: RuntimeStatusProviderProps) {
  const [status, setStatus] = useState<RuntimeStatus>(initialStatus);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);

  // Check runtime status
  const refresh = useCallback(async () => {
    setStatus((prev) => ({ ...prev, isChecking: true }));

    try {
      const result = await window.electronAPI.runtimeStatus();
      setStatus({
        installed: result.installed,
        version: result.version,
        path: result.path,
        needsUpdate: result.needsUpdate,
        requiredVersion: result.requiredVersion,
        isChecking: false,
        lastChecked: new Date(),
      });
    } catch (error) {
      console.error('Failed to check runtime status:', error);
      setStatus((prev) => ({
        ...prev,
        isChecking: false,
        lastChecked: new Date(),
      }));
    }
  }, []);

  // Initial check on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Start download with progress tracking
  const startDownload = useCallback(async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (isDownloading) {
      return { success: false, error: 'Download already in progress' };
    }

    setIsDownloading(true);
    setDownloadProgress({ stage: 'fetching', progress: 0 });

    // Setup progress listener
    const handleProgress = (progress: DownloadProgress) => {
      setDownloadProgress(progress);
    };

    window.electronAPI.onRuntimeDownloadProgress(handleProgress);

    try {
      const result = await window.electronAPI.runtimeDownload();

      if (result.success) {
        // Refresh status after successful download
        await refresh();
      }

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Download failed';
      setDownloadProgress({
        stage: 'error',
        progress: 0,
        error: errorMessage,
        message: errorMessage,
      });
      return { success: false, error: errorMessage };
    } finally {
      setIsDownloading(false);
      window.electronAPI.removeRuntimeDownloadProgressListener();
    }
  }, [isDownloading, refresh]);

  // Cancel download
  const cancelDownload = useCallback(async () => {
    await window.electronAPI.runtimeCancelDownload();
    setIsDownloading(false);
    setDownloadProgress(null);
  }, []);

  const value: RuntimeContextValue = {
    status,
    refresh,
    isDownloading,
    downloadProgress,
    startDownload,
    cancelDownload,
  };

  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}
