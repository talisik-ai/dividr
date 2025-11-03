import NewDark from '@/frontend/assets/logo/New-Dark.svg';
import New from '@/frontend/assets/logo/New-Light.svg';
import { useTheme } from '@/frontend/providers/ThemeProvider';
import { cn } from '@/frontend/utils/utils';
import React from 'react';

/**
 * Placeholder component shown when no media is loaded
 */

export interface PreviewPlaceholderProps {
  dragActive: boolean;
  onImport: () => Promise<void>;
}

export const PreviewPlaceholder: React.FC<PreviewPlaceholderProps> = ({
  dragActive,
  onImport,
}) => {
  const { theme } = useTheme();

  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col gap-2 items-center justify-center border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200',
        dragActive
          ? 'border-secondary bg-secondary/10'
          : 'border-accent hover:!border-secondary hover:bg-secondary/10',
      )}
      onClick={onImport}
    >
      <img src={theme === 'dark' ? NewDark : New} alt="New Project" />
      <p className="text-sm text-muted-foreground">
        Click to browse or drag and drop files here
      </p>
    </div>
  );
};
