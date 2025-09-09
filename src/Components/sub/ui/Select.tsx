/**
 * Select Component
 * A dropdown select component for choosing options
 */
import { cn } from '@/Lib/utils';
import React from 'react';

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'underline';
}

interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

// Simple Select implementation
export const Select: React.FC<SelectProps> = ({
  value,
  onValueChange,
  children,
  className,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const selectRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        selectRef.current &&
        !selectRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const cloneChildWithProps = (
    child: React.ReactElement,
  ): React.ReactElement => {
    // Handle SelectTrigger
    if (child.type === SelectTrigger) {
      return React.cloneElement(
        child as React.ReactElement<Record<string, unknown>>,
        {
          value,
          isOpen,
          setIsOpen,
        },
      );
    }

    // Handle SelectContent - need to pass props to its SelectItem children
    if (child.type === SelectContent) {
      return React.cloneElement(
        child as React.ReactElement<Record<string, unknown>>,
        {
          isOpen,
          onValueChange,
          setIsOpen,
        },
      );
    }

    return child;
  };

  return (
    <div ref={selectRef} className={cn('relative', className)}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return cloneChildWithProps(child as React.ReactElement);
        }
        return child;
      })}
    </div>
  );
};

export const SelectTrigger: React.FC<
  SelectTriggerProps & {
    value?: string;
    isOpen?: boolean;
    setIsOpen?: (open: boolean) => void;
  }
> = ({
  children,
  className,
  value,
  isOpen,
  setIsOpen,
  variant = 'default',
}) => {
  const baseClasses =
    'flex items-center justify-between text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

  const variantClasses = {
    default:
      'h-10 w-full rounded-md border border-input bg-background px-3 py-2 ring-offset-background placeholder:text-muted-foreground focus:ring-2 focus:ring-ring focus:ring-offset-2',
    underline:
      'w-fit h-fit border-b border-input bg-transparent focus:border-ring transition-colors',
  };

  return (
    <button
      type="button"
      className={cn(baseClasses, variantClasses[variant], className)}
      onClick={() => setIsOpen?.(!isOpen)}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === SelectValue) {
          return React.cloneElement(
            child as React.ReactElement<Record<string, unknown>>,
            { value },
          );
        }
        return child;
      })}
      <svg
        className={cn(
          'h-4 w-4 opacity-50 transition-transform ml-1',
          isOpen && 'rotate-180',
        )}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>
  );
};

export const SelectValue: React.FC<
  SelectValueProps & {
    value?: string;
  }
> = ({ placeholder, value, className }) => (
  <span className={cn('block truncate', className)}>
    {value || placeholder}
  </span>
);

export const SelectContent: React.FC<
  SelectContentProps & {
    isOpen?: boolean;
    setIsOpen?: (open: boolean) => void;
    onValueChange?: (value: string) => void;
  }
> = ({ children, className, isOpen, onValueChange, setIsOpen }) => {
  if (!isOpen) return null;

  return (
    <div
      className={cn(
        'absolute top-full left-0 z-[9999] min-w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto',
        className,
      )}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child) && child.type === SelectItem) {
          return React.cloneElement(
            child as React.ReactElement<Record<string, unknown>>,
            {
              onValueChange,
              setIsOpen,
            },
          );
        }
        return child;
      })}
    </div>
  );
};

export const SelectItem: React.FC<
  SelectItemProps & {
    onValueChange?: (value: string) => void;
    setIsOpen?: (open: boolean) => void;
  }
> = ({ value, children, className, onValueChange, setIsOpen }) => (
  <div
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground transition-colors',
      className,
    )}
    onClick={() => {
      onValueChange?.(value);
      setIsOpen?.(false);
    }}
    onMouseDown={(e) => {
      // Prevent the dropdown from closing immediately
      e.preventDefault();
    }}
  >
    {children}
  </div>
);
