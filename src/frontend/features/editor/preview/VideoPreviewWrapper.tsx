/* eslint-disable @typescript-eslint/no-explicit-any */

import React from 'react';
import { useVideoEditorStore } from '../stores/videoEditor/index';
import { VideoBlobPreview } from './VideoBlobPreview';
import { VideoPreview } from './VideoPreview';

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
  // Check if fullscreen mode is active - if so, don't render the normal preview
  const isFullscreen = useVideoEditorStore(
    (state) => state.preview.isFullscreen,
  );

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

  // Don't render normal preview when in fullscreen mode to avoid duplicate video elements
  if (isFullscreen) {
    return null;
  }

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
            <VideoBlobPreview className={className} />
          </VideoDirectErrorBoundary>
        </React.Suspense>
      );
    } catch (error) {
      console.warn('Direct preview failed, falling back to canvas:', error);
      setDirectError(true);
    }
  }

  // Fallback to original canvas-based preview
  // this should be an error
  return <VideoPreview className={className} />;
};

// Simple error boundary for direct preview
const VideoDirectErrorBoundary: React.FC<{
  children: React.ReactNode;
  onError: () => void;
}> = ({ children, onError }) => {
  const [hasError, setHasError] = React.useState(false);

  React.useEffect(() => {
    const handleError = (error: ErrorEvent) => {
      // Only catch critical errors that would break the direct preview
      if (
        error.message?.includes('Cannot read properties') ||
        error.message?.includes('Cannot access before initialization') ||
        error.message?.includes('ReferenceError')
      ) {
        console.warn(
          'Critical direct preview error detected, falling back to canvas:',
          error.message,
        );
        setHasError(true);
        onError();
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [onError]);

  if (hasError) {
    return <div>Falling back to canvas rendering...</div>;
  }

  return <>{children}</>;
};

// Export both components for direct usage if needed
export { VideoBlobPreview, VideoPreview };
