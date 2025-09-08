import { Button } from '@/Components/sub/ui/Button';
import { cn } from '@/Lib/utils';
import { X } from 'lucide-react';
import React from 'react';

interface BasePanelProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

/**
 * BasePanel - Standardized container for all video editor panels
 *
 * Features:
 * - Fixed width of 320px (w-80) for consistent UI
 * - Standardized header with title, description, and close button
 * - Proper overflow handling for content
 * - Consistent theming using design system tokens
 *
 * Usage:
 * Wrap your panel content with this component to ensure consistency
 * across all panels in the video editor interface.
 */
export const BasePanel: React.FC<BasePanelProps> = ({
  title,
  description,
  children,
  className,
  onClose,
}) => {
  return (
    <div className={cn('w-80 flex flex-col border-l border-border', className)}>
      {/* Header */}
      <div className="flex items-start justify-between px-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-foreground text-sm truncate">
            {title}
          </h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
        {onClose && (
          <Button
            onClick={onClose}
            variant="native"
            size="icon"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Content with consistent padding */}
      <div className="flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
};
