import { cn } from '@/frontend/utils/utils';
import React from 'react';

function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        // Base styles
        'bg-muted text-muted-foreground pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm px-1 font-sans text-xs font-medium select-none',
        // SVG sizing
        "[&_svg:not([class*='size-'])]:size-3",
        // Tooltip content styling - lighter background when inside tooltips
        '[data-slot=tooltip-content]_&:bg-background/20 [data-slot=tooltip-content]_&:text-background',
        'dark:[data-slot=tooltip-content]_&:bg-background/10 dark:[data-slot=tooltip-content]_&:text-background',
        // Dropdown menu shortcut styling
        '[data-slot=dropdown-menu-shortcut]_&:h-4 [data-slot=dropdown-menu-shortcut]_&:min-w-4',
        // Menubar shortcut styling
        '[data-slot=menubar-shortcut]_&:h-4 [data-slot=menubar-shortcut]_&:min-w-4',
        className,
      )}
      {...props}
    />
  );
}

function KbdGroup({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  // Convert children to array and filter out null/undefined
  const childArray = React.Children.toArray(children);

  // Add separators between Kbd elements
  const childrenWithSeparators = childArray.map((child, index) => (
    <React.Fragment key={index}>
      {child}
      {index < childArray.length - 1 && (
        <span className="text-muted-foreground text-xs select-none [[data-slot=tooltip-content]_&]:text-background/80 dark:[[data-slot=tooltip-content]_&]:text-background/60">
          +
        </span>
      )}
    </React.Fragment>
  ));

  return (
    <div
      data-slot="kbd-group"
      className={cn('inline-flex items-center gap-0.5', className)}
      {...props}
    >
      {childrenWithSeparators}
    </div>
  );
}

export { Kbd, KbdGroup };
