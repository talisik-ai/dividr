/**
 * Dialog Component
 * A modal dialog component for user interactions
 */
import React from 'react';
import { cn } from '../../../lib/utils';

interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}

interface DialogContentProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogHeaderProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface DialogFooterProps {
  children: React.ReactNode;
  className?: string;
}

// Main Dialog Container
export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  children,
  className,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog Content */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg mx-4 bg-background border rounded-lg shadow-lg',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
};

// Dialog Content
export const DialogContent: React.FC<DialogContentProps> = ({
  children,
  className,
}) => <div className={cn('p-6', className)}>{children}</div>;

// Dialog Header
export const DialogHeader: React.FC<DialogHeaderProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left mb-4',
      className,
    )}
  >
    {children}
  </div>
);

// Dialog Title
export const DialogTitle: React.FC<DialogTitleProps> = ({
  children,
  className,
}) => (
  <h3
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className,
    )}
  >
    {children}
  </h3>
);

// Dialog Footer
export const DialogFooter: React.FC<DialogFooterProps> = ({
  children,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-6',
      className,
    )}
  >
    {children}
  </div>
);
