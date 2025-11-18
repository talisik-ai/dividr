import { Toggle } from '@/frontend/components/ui/toggle';
import { useTheme } from '@/frontend/providers/ThemeProvider';
import { MoonIcon, SunIcon } from 'lucide-react';

export function ModeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center">
      <Toggle
        variant="default"
        className="group !size-5 !p-1.5 !min-w-0 hover:!bg-transparent !bg-transparent"
        pressed={theme === 'dark'}
        onPressedChange={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      >
        {/* Note: After dark mode implementation, rely on dark: prefix rather than group-data-[state=on]: */}
        <MoonIcon
          size={16}
          className="shrink-0 scale-0 opacity-0 transition-all group-data-[state=on]:scale-100 group-data-[state=on]:opacity-100"
          aria-hidden="true"
        />
        <SunIcon
          size={16}
          className="absolute shrink-0 scale-100 opacity-100 transition-all group-data-[state=on]:scale-0 group-data-[state=on]:opacity-0"
          aria-hidden="true"
        />
      </Toggle>
    </div>
  );
}
