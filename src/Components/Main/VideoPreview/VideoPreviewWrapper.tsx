import React from 'react';
import { VideoPreview } from './VideoPreview';
import { VideoBlobPreview } from './VideoBlobPreview';

interface VideoPreviewWrapperProps {
  className?: string;
  useBlobOptimization?: boolean; // Feature flag for gradual rollout
}

/**
 * Wrapper component that allows easy switching between canvas-based and blob-based video preview
 * This enables gradual rollout and A/B testing of the optimization
 */
export const VideoPreviewWrapper: React.FC<VideoPreviewWrapperProps> = ({ 
  className,
  useBlobOptimization = true // Default to new optimized version
}) => {
  // You can control this via environment variables, user settings, or feature flags
  const envDisabled = import.meta.env.VITE_USE_BLOB_PREVIEW === 'false';
  const shouldUseBlobPreview = useBlobOptimization && !envDisabled;

  // Add error boundary for blob preview
  const [blobError, setBlobError] = React.useState<boolean>(false);

  if (shouldUseBlobPreview && !blobError) {
    try {
      return (
        <React.Suspense fallback={<VideoPreview className={className} />}>
          <VideoBlobErrorBoundary onError={() => setBlobError(true)}>
            <VideoBlobPreview className={className} />
          </VideoBlobErrorBoundary>
        </React.Suspense>
      );
    } catch (error) {
      console.warn('Blob preview failed, falling back to canvas:', error);
      setBlobError(true);
    }
  }

  // Fallback to original canvas-based preview
  return <VideoPreview className={className} />;
};

// Simple error boundary for blob preview
const VideoBlobErrorBoundary: React.FC<{
  children: React.ReactNode;
  onError: () => void;
}> = ({ children, onError }) => {
  React.useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      if (error.message?.includes('blob') || error.message?.includes('MediaRecorder')) {
        console.warn('Blob preview error detected, falling back to canvas');
        onError();
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [onError]);

  return <>{children}</>;
};

// Export both components for direct usage if needed
export { VideoPreview, VideoBlobPreview };
