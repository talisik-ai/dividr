/**
 * A custom React fixed component
 * A Fixed element in the header portion of Downlodr, displays the title/logo of Downlodr with the window controls (maximize, minimize, and close)
 *
 * @param className - for UI of TitleBar
 * @returns JSX.Element - The rendered component displaying a TitleBar
 *
 */
import LogoDark from '@/Assets/Logo/Logo-Dark.svg';
import LogoLight from '@/Assets/Logo/Logo-Light.svg';
import { ModeToggle } from '@/Components/sub/custom/ModeToggle';
import { Button } from '@/Components/sub/ui/Button';
import { cn } from '@/Lib/utils';
import { useProjectStore } from '@/Store/ProjectStore';
import { useTheme } from '@/Utility/ThemeProvider';
import { Copy, Minus, Plus, Square, X } from 'lucide-react';
import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

interface TitleBarProps {
  className?: string;
}

const TitleBar: React.FC<TitleBarProps> = ({ className }) => {
  const { metadata } = useProjectStore();
  const { theme } = useTheme();

  const location = useLocation();

  const [isMaximized, setIsMaximized] = React.useState<boolean>(false);

  const navigate = useNavigate();

  // Determine context based on current route
  const isInVideoEditor = location.pathname.startsWith('/video-editor');

  const handleCreateProject = () => {
    navigate('/video-editor');
  };

  // Function to toggle maximize/restore
  const handleMaximizeRestore = () => {
    window.appControl.maximizeApp();
    setIsMaximized(!isMaximized);
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
                className="h-5 w-auto"
                alt="Dividr Logo"
              />
            </Link>
          </div>

          {/* Right Side Controls */}
          <div className="flex items-center gap-2 no-drag text-gray-800 dark:text-gray-100 ml-auto h-6">
            {/* New Project Button - Only show when not in video editor */}
            {!isInVideoEditor && (
              <Button onClick={handleCreateProject} variant="secondary">
                <Plus size={16} /> New Project
              </Button>
            )}

            {/* Dark Mode/Light Mode Toggle */}
            <div className="flex items-center">
              <ModeToggle />
            </div>

            {/* Window Controls */}
            <div className="flex items-center">
              {/* Minimize Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.appControl.minimizeApp()}
                title="Minimize"
              >
                <Minus size={16} />
              </Button>

              {/* Maximize Button with dynamic icon */}
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMaximizeRestore}
                title={isMaximized ? 'Restore' : 'Maximize'}
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
                className="hover:bg-red-600 dark:hover:bg-red-600 hover:text-zinc-100"
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
