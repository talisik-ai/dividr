import LogoDark from '@/frontend/assets/logo/New-Dark.svg';
import Logo from '@/frontend/assets/logo/New-Light.svg';
import { useTheme } from '@/frontend/providers/ThemeProvider';
import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface StartupLoaderProps {
  stage?: string;
  progress?: number;
  isVisible?: boolean;
}

/**
 * StartupLoader Component
 *
 * Displays a branded loading screen during app initialization.
 * Shows immediately on app launch before React fully mounts.
 */
const StartupLoader = ({
  stage = 'Initializing...',
  progress,
  isVisible = true,
}: StartupLoaderProps) => {
  const { theme } = useTheme();
  const [dots, setDots] = useState('');

  // Animated dots effect
  useEffect(() => {
    if (!isVisible) return;

    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    return () => clearInterval(interval);
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-8 max-w-md px-8">
        {/* Brand Logo */}
        <div className="relative">
          <img
            src={theme === 'dark' ? LogoDark : Logo}
            alt="Dividr"
            className="w-32 h-32 animate-pulse"
          />
        </div>

        {/* Loading Spinner */}
        <div className="flex flex-col items-center gap-4 w-full">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-600 dark:text-zinc-400" />

          {/* Stage Text */}
          <div className="text-center">
            <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              {stage}
              <span className="inline-block w-8 text-left">{dots}</span>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-2">
              This may take a moment
            </p>
          </div>

          {/* Progress Bar (optional) */}
          {progress !== undefined && (
            <div className="w-full max-w-xs">
              <div className="h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-500 text-center mt-2">
                {Math.round(progress)}%
              </p>
            </div>
          )}
        </div>

        {/* Helpful tip */}
        <div className="text-xs text-zinc-500 dark:text-zinc-600 text-center max-w-sm">
          <p>Loading your projects and workspace data</p>
        </div>
      </div>
    </div>
  );
};

export default StartupLoader;
