/**
 * A custom React fixed component
 * A Fixed element in the header portion of Downlodr, displays the title/logo of Downlodr with the window controls (maximize, minimize, and close)
 *
 * @param className - for UI of TitleBar
 * @returns JSX.Element - The rendered component displaying a TitleBar
 *
 */
import LogoDark from '@/frontend/assets/logo/Logo-Dark.svg';
import LogoLight from '@/frontend/assets/logo/Logo-Light.svg';
import { ModeToggle } from '@/frontend/components/custom/ModeToggle';
import { Button } from '@/frontend/components/ui/button';
import { useTheme } from '@/frontend/providers/ThemeProvider';
import { useWindowState } from '@/frontend/providers/WindowStateProvider';
import { cn } from '@/frontend/utils/utils';
import { Copy, Minus, Square, X } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

interface TitleBarProps {
  className?: string;
}

const TitleBar: React.FC<TitleBarProps> = ({ className }) => {
  const { theme } = useTheme();
  const { isMaximized } = useWindowState();

  // Function to toggle maximize/restore
  const handleMaximizeRestore = () => {
    window.appControl.maximizeApp();
  };

  // Handle close button click
  const handleCloseClick = () => {
    window.appControl.quitApp();
  };

  // Adjust downlodr logo used depending on the light/dark mode
  /*
  const getLogoSrc = () => {
    if (theme === 'system') {
      // Check system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? downlodrLogoDark
        : downlodrLogoLight;
    }
    // Direct theme selection
    return theme === 'dark' ? downlodrLogoDark : downlodrLogoLight;
  };
  */
  return (
    <>
      <div className={cn('', className)}>
        <div className="relative flex items-center h-8 drag-area">
          {/* Logo */}
          <div className="flex items-center no-drag">
            <Link to="/" className="cursor-pointer">
              <img
                src={theme === 'dark' ? LogoDark : LogoLight}
                className="h-10 w-auto"
                alt="Dividr Logo"
              />
            </Link>
          </div>

          {/* Right Side Controls */}
          <div className="flex items-center gap-7 no-drag text-gray-800 dark:text-gray-100 ml-auto">
            {/* Dark Mode/Light Mode Toggle */}
            <div className="flex items-center gap-7">
              {process.env.NODE_ENV === 'development' && (
                <Link to="/whisper-test">
                  <Button variant="ghost" size="sm" title="Whisper Test">
                    Test Whisper
                  </Button>
                </Link>
              )}
              <ModeToggle />
            </div>

            {/* Window Controls */}
            <div className="flex items-center gap-7">
              {/* Minimize Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.appControl.minimizeApp()}
                title="Minimize"
                className="!p-1.5 !size-5"
              >
                <Minus size={16} />
              </Button>

              {/* Maximize Button with dynamic icon */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMaximizeRestore}
                title={isMaximized ? 'Restore' : 'Maximize'}
                className="!p-1.5 !size-5"
              >
                {isMaximized ? (
                  <Copy size={16} className="scale-x-[-1] transform" />
                ) : (
                  <Square size={16} />
                )}
              </Button>

              {/* Close Button */}
              <Button
                variant="ghost"
                size="icon"
                className="!p-1.5 !size-5 hover:bg-red-600 dark:hover:bg-red-600 hover:text-zinc-100"
                onClick={handleCloseClick}
                title="Close"
              >
                <X size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default TitleBar;
