import { cn } from '@/Lib/utils';
import React from 'react';

interface BasePanelProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * BasePanel - Standardized container for all video editor panels
 *
 * Features:
 * - Fixed width of 320px (w-80) for consistent UI
 * - Standardized header with title and description
 * - Proper overflow handling for content
 * - Consistent theming using design system tokens
 * - Always open and unclosable
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
}) => {
  return (
    <div className={cn('w-80 flex flex-col border-l border-accent', className)}>
      {/* Header */}
      <div className="px-4">
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
      </div>

      {/* Content with consistent padding */}
      <div className="flex-1 overflow-hidden p-4">{children}</div>
    </div>
  );
};
