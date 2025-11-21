import { cn } from '@/frontend/utils/utils';
import React from 'react';

interface InsertionLineIndicatorProps {
  /** Y position of the insertion line in pixels */
  top: number;
  /** Width of the timeline in pixels */
  width: number;
  /** Scroll offset for horizontal positioning */
  scrollX: number;
  /** Whether the insertion is valid */
  isValid: boolean;
}

/**
 * InsertionLineIndicator - CapCut-style thin line showing where a new track row will be inserted
 *
 * Features:
 * - Thin 1px bright blue/teal line
 * - Spans full timeline width
 * - Smooth fade-in animation (150ms)
 * - Only shows during drag operations
 * - Positioned at exact insertion point
 */
export const InsertionLineIndicator: React.FC<InsertionLineIndicatorProps> =
  React.memo(({ top, width, scrollX, isValid }) => {
    return (
      <div
        className={cn(
          'absolute pointer-events-none z-[999] transition-all duration-150 ease-out',
          'animate-in fade-in slide-in-from-top-1',
          isValid && 'bg-secondary',
        )}
        style={{
          left: `${-scrollX}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: '1px',
        }}
      ></div>
    );
  });

InsertionLineIndicator.displayName = 'InsertionLineIndicator';
