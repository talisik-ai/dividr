/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { cn } from '@/Lib/utils';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

const tabsListVariants = cva(
  'relative inline-flex items-center justify-center',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground h-fit w-fit rounded',
        underline: 'flex-shrink-0 w-fit border-none bg-transparent h-auto p-0',
        pill: 'inline-flex items-center rounded-[8px] border border-border-secondary bg-white h-auto',
        'pill-large':
          'inline-flex items-center rounded-full bg-border-secondary h-full p-0.5',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const tabsTriggerVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 uppercase z-10',
  {
    variants: {
      variant: {
        default:
          'data-[state=active]:text-primary-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring h-[calc(100%-1px)] flex-1 gap-1.5 rounded border border-transparent px-2 py-1 focus-visible:ring-[3px] focus-visible:outline-1 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        underline:
          'flex-1 min-w-0 px-4 py-4 border-b-2 transition-colors duration-150 data-[state=active]:text-primary border-gray-200 text-gray-500 hover:text-gray-700 hover:border-gray-300 overflow-hidden text-ellipsis whitespace-nowrap',
        pill: 'font-archivo inline-flex items-center justify-center rounded-[8px] px-[8px] py-[4px] text-center text-[12px] leading-4 font-semibold tracking-wide whitespace-nowrap transition-all duration-200 data-[state=active]:bg-border-secondary data-[state=active]:text-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-foreground',
        'pill-large':
          'font-archivo inline-flex items-center justify-center rounded-full px-[16px] py-[8px] text-center text-[14px] leading-5 font-semibold tracking-wide capitalize whitespace-nowrap transition-all duration-200 h-full data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=inactive]:bg-transparent data-[state=inactive]:text-text-tertiary hover:data-[state=inactive]:bg-white/10',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const indicatorVariants = cva(
  'absolute transition-all duration-300 ease-in-out',
  {
    variants: {
      variant: {
        default:
          'bg-primary dark:border-input dark:bg-input/30 rounded border border-transparent shadow-sm',
        underline:
          'bg-primary h-0.5 bottom-0 rounded-none border-none shadow-none z-10',
        pill: 'bg-border-secondary rounded-[8px] border border-transparent shadow-sm',
        'pill-large': 'bg-white border rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface TabsProps extends React.ComponentProps<typeof TabsPrimitive.Root> {
  variant?: 'default' | 'underline' | 'pill' | 'pill-large';
}

interface TabsListProps
  extends React.ComponentProps<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

interface TabsTriggerProps
  extends React.ComponentProps<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

const TabsContext = React.createContext<{
  variant?: 'default' | 'underline' | 'pill' | 'pill-large';
}>({});

function Tabs({ className, variant = 'default', ...props }: TabsProps) {
  return (
    <TabsContext.Provider value={{ variant }}>
      <TabsPrimitive.Root
        data-slot="tabs"
        className={cn('flex flex-col', className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const effectiveVariant = variant || context.variant || 'default';

  const [indicatorStyle, setIndicatorStyle] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const tabsListRef = useRef<HTMLDivElement | null>(null);

  const updateIndicator = React.useCallback(() => {
    if (!tabsListRef.current) return;

    const activeTab = tabsListRef.current.querySelector<HTMLElement>(
      '[data-state="active"]',
    );
    if (!activeTab) return;

    const activeRect = activeTab.getBoundingClientRect();
    const tabsRect = tabsListRef.current.getBoundingClientRect();

    requestAnimationFrame(() => {
      if (effectiveVariant === 'underline') {
        setIndicatorStyle({
          left: activeRect.left - tabsRect.left,
          top: activeRect.height + 3,
          width: activeRect.width,
          height: 2,
        });
      } else {
        setIndicatorStyle({
          left: activeRect.left - tabsRect.left,
          top: activeRect.top - tabsRect.top,
          width: activeRect.width,
          height: activeRect.height,
        });
      }
    });
  }, [effectiveVariant]);

  useEffect(() => {
    // Initial update
    const timeoutId = setTimeout(updateIndicator, 0);

    // Event listeners
    window.addEventListener('resize', updateIndicator);
    const observer = new MutationObserver(updateIndicator);

    if (tabsListRef.current) {
      observer.observe(tabsListRef.current, {
        attributes: true,
        childList: true,
        subtree: true,
      });
    }

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateIndicator);
      observer.disconnect();
    };
  }, [updateIndicator]);

  return (
    <div className="relative" ref={tabsListRef}>
      <TabsPrimitive.List
        ref={ref}
        data-slot="tabs-list"
        className={cn(
          tabsListVariants({ variant: effectiveVariant }),
          className,
        )}
        {...props}
      />
      <div
        className={cn(indicatorVariants({ variant: effectiveVariant }))}
        style={indicatorStyle}
      />
    </div>
  );
});
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant, children, ...props }, ref) => {
  const context = React.useContext(TabsContext);
  const effectiveVariant = variant || context.variant || 'default';
  const [isActive, setIsActive] = useState(false);
  const [textWidth, setTextWidth] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = triggerRef.current;
    if (!element) return;

    const checkActiveState = () => {
      const currentState = element.getAttribute('data-state') === 'active';
      setIsActive(currentState);
    };

    // Initial check
    checkActiveState();

    // Use MutationObserver to watch for data-state changes
    const observer = new MutationObserver(checkActiveState);
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['data-state'],
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // Measure text width for smooth animation
    if (textRef.current) {
      // Temporarily make the text visible and measure its natural width
      const originalWidth = textRef.current.parentElement?.style.width;
      const originalOpacity = textRef.current.style.opacity;

      // Set to natural width temporarily
      if (textRef.current.parentElement) {
        textRef.current.parentElement.style.width = 'auto';
      }
      textRef.current.style.opacity = '1';

      // Measure the actual rendered width
      const width = textRef.current.offsetWidth;
      setTextWidth(width);

      // Restore original styles
      if (textRef.current.parentElement && originalWidth !== undefined) {
        textRef.current.parentElement.style.width = originalWidth;
      }
      textRef.current.style.opacity = originalOpacity || '0';
    }
  }, [children, isActive]);

  // Parse children to separate icon and text
  const childrenArray = React.Children.toArray(children);
  const iconElement = childrenArray.find(
    (child) => React.isValidElement(child) && (child.props as any)?.size,
  );
  const textElements = childrenArray.filter(
    (child) =>
      typeof child === 'string' ||
      (React.isValidElement(child) && !(child.props as any)?.size),
  );

  return (
    <TabsPrimitive.Trigger
      ref={(node) => {
        triggerRef.current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      }}
      data-slot="tabs-trigger"
      className={cn(
        tabsTriggerVariants({ variant: effectiveVariant }),
        className,
      )}
      {...props}
    >
      <div className="flex items-center justify-center">
        {iconElement}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out"
          style={{
            width: isActive ? `${textWidth}px` : '0px',
            marginLeft: isActive ? '6px' : '0px',
          }}
        >
          <span
            ref={textRef}
            className="whitespace-nowrap transition-opacity duration-300 ease-in-out inline-block"
            style={{
              opacity: isActive ? 1 : 0,
            }}
          >
            {textElements}
          </span>
        </div>
      </div>
    </TabsPrimitive.Trigger>
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

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
