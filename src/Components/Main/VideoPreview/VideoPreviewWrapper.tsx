import React from 'react';
import { VideoPreview } from './VideoPreview';
import { VideoDirectPreview } from './VideoDirectPreview';

interface VideoPreviewWrapperProps {
  className?: string;
  useDirectOptimization?: boolean; // Feature flag for direct video optimization
}

/**
 * Wrapper component that allows easy switching between canvas-based and direct video preview
 * Direct video preview is much more efficient and maintains audio
 */
export const VideoPreviewWrapper: React.FC<VideoPreviewWrapperProps> = ({
  className,
  useDirectOptimization = true, // Default to direct video for better performance
}) => {
  // You can control this via environment variables, user settings, or feature flags
  const envDisabled =
    (import.meta as any).env?.VITE_USE_DIRECT_PREVIEW === 'false';
  const envEnabled =
    (import.meta as any).env?.VITE_USE_DIRECT_PREVIEW === 'true';

  // Use direct video optimization by default (much better than blobs or canvas)
  const shouldUseDirectPreview =
    (useDirectOptimization || envEnabled) && !envDisabled;

  // Add error boundary for direct preview
  const [directError, setDirectError] = React.useState<boolean>(false);

  // Log the mode being used
  React.useEffect(() => {
    console.log(
      `🎬 Video Preview Mode: ${shouldUseDirectPreview && !directError ? 'Direct Video (Optimized)' : 'Canvas Rendering (Fallback)'}`,
    );
  }, [shouldUseDirectPreview, directError]);

  if (shouldUseDirectPreview && !directError) {
    try {
      return (
        <React.Suspense
          fallback={
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                <span className="text-sm text-gray-400">
                  Loading direct video preview...
                </span>
              </div>
            </div>
          }
        >
          <VideoDirectErrorBoundary onError={() => setDirectError(true)}>
            <VideoDirectPreview className={className} />
          </VideoDirectErrorBoundary>
        </React.Suspense>
      );
    } catch (error) {
      console.warn('Direct preview failed, falling back to canvas:', error);
      setDirectError(true);
    }
  }

  // Fallback to original canvas-based preview
  return <VideoPreview className={className} />;
};

// Simple error boundary for direct preview
const VideoDirectErrorBoundary: React.FC<{
  children: React.ReactNode;
  onError: () => void;
}> = ({ children, onError }) => {
  React.useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      if (
        error.message?.includes('video') ||
        error.message?.includes('DirectPreview')
      ) {
        console.warn('Direct preview error detected, falling back to canvas');
        onError();
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [onError]);

  return <>{children}</>;
};

// Export both components for direct usage if needed
export { VideoPreview, VideoDirectPreview };
