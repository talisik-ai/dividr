/**
 * A custom React component
 * A React component that toggles between light and dark themes.
 * It displays a button with icons for light and dark modes.
 *
 * @returns JSX.Element - The rendered mode toggle component.
 */
import { Button } from '@/components/sub/ui/button';
import { useTheme } from '@/utility/ThemeProvider';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // use effect to close dropdown on window blur
  useEffect(() => {
    const handleWindowBlur = () => {
      setIsOpen(false);
    };

    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Get the current theme icon
  const getCurrentIcon = () => {
    switch (theme) {
      case 'light':
        return <Sun className="h-4 w-4 transition-all duration-200" />;
      case 'dark':
        return <Moon className="h-4 w-4 transition-all duration-200" />;
      case 'system':
        return <Monitor className="h-4 w-4 transition-all duration-200" />;
      default:
        return <Sun className="h-4 w-4 transition-all duration-200" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        variant="ghost"
        size="icon"
        className="w-8 h-7 hover:bg-gray-700 dark:hover:bg-darkModeCompliment transition-colors border-none bg-transparent p-0"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="flex items-center justify-center text-white">
          {getCurrentIcon()}
        </span>
        <span className="sr-only">Toggle theme</span>
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-32 rounded-md bg-primary dark:bg-primary-dark shadow-lg ring-1 ring-black ring-opacity-5 z-[100]">
          <div className="py-1" role="menu">
            <button
              className={`flex items-center gap-2 w-full h-8 px-3 
    text-sm font-medium leading-none 
    text-left text-gray-700 dark:text-gray-200 
    hover:bg-secondary dark:hover:bg-secondary-dark 
    border border-transparent transition-colors duration-150
    ${theme === 'light' ? 'bg-gray-100 dark:bg-secondary-dark' : ''}`}
              onClick={() => {
                setTheme('light');
                setIsOpen(false);
              }}
            >
              <span>Light</span>
            </button>
            <button
              className={`flex items-center gap-2 w-full h-8 px-3 
    text-sm font-medium leading-none 
    text-left text-gray-700 dark:text-gray-200 
    hover:bg-gray-100 dark:hover:bg-secondary-dark 
    border border-transparent transition-colors duration-150
    ${theme === 'dark' ? 'bg-gray-100 dark:bg-secondary-dark' : ''}`}
              onClick={() => {
                setTheme('dark');
                setIsOpen(false);
              }}
            >
              <span>Dark</span>
            </button>
            <button
              className={`flex items-center gap-2 w-full h-8 px-3 
  text-sm font-medium leading-none 
  text-left text-gray-700 dark:text-gray-200  
  hover:bg-gray-100 dark:hover:bg-secondary-dark 
  border- transition-colors duration-150
  ${theme === 'system' ? 'bg-gray-100 dark:bg-secondary-dark' : ''}`}
              onClick={() => {
                setTheme('system');
                setIsOpen(false);
              }}
            >
              <span>System</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
