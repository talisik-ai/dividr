import { cn } from '@/frontend/utils/utils';
import React from 'react';

interface BasePanelProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerActions?: React.ReactNode; // Custom component to render in the header (e.g., tabs, buttons)
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
export const BasePanel: React.FC<BasePanelProps> = React.memo(
  ({ title, description, children, className, headerActions }) => {
    return (
      <div
        className={cn(
          'w-80 flex flex-col border-l border-r border-accent',
          className,
        )}
      >
        {/* Header */}
        <div className="px-4">
          <div className="flex justify-between gap-2 flex-1 min-w-0">
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
            {headerActions && (
              <div className="flex-shrink-0">{headerActions}</div>
            )}
          </div>
        </div>

        {/* Content with consistent padding */}
        <div className="flex-1 min-h-0 p-4 grid">{children}</div>
      </div>
    );
  },
);
