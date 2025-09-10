import { cn } from '@/Lib/utils';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  );
}

function TabsList({
  className,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & {
  variant?: 'default' | 'text';
}) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(
        'inline-flex w-fit items-center justify-center',
        {
          'bg-muted text-muted-foreground h-9 rounded-lg p-[3px]':
            variant === 'default',
          'h-fit gap-4': variant === 'text',
        },
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger> & {
  variant?: 'default' | 'text';
}) {
  // Get variant from parent context or use provided variant
  const parentVariant = variant || 'default';

  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      data-variant={parentVariant}
      className={cn(
        "text-xs transition-all duration-200 inline-flex h-fit items-center justify-center gap-1.5 font-medium whitespace-nowrap focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        {
          // Default variant styles
          'flex-1 rounded-md border border-transparent px-2 py-1 text-muted-foreground hover:text-muted-foreground/80 hover:bg-muted/50 data-[state=active]:text-primary data-[state=active]:bg-background data-[state=active]:border-border data-[state=active]:shadow-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring':
            parentVariant === 'default',
          // Text variant styles
          'relative text-muted-foreground hover:text-foreground data-[state=active]:text-primary after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-full after:bg-transparent after:transition-colors hover:after:bg-border':
            parentVariant === 'text',
        },
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
