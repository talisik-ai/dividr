import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { ScrollArea, ScrollBar } from './scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

interface ScrollTabsProps {
  tabs: { value: string; label: string; content: React.ReactNode }[];
  defaultValue?: string;
  className?: string;
}

export function ScrollTabs({ tabs, defaultValue, className }: ScrollTabsProps) {
  const scrollViewportRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const updateScrollButtons = React.useCallback(() => {
    const viewport = scrollViewportRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement;
    if (!viewport) return;

    const { scrollLeft, scrollWidth, clientWidth } = viewport;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1); // -1 for rounding errors
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    // Find the scroll viewport element within the ScrollArea
    const viewport = scrollViewportRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement;
    if (!viewport) return;

    const { scrollLeft, clientWidth, scrollWidth } = viewport;
    const scrollDistance = Math.min(clientWidth * 0.6, 200); // Scroll 60% of visible width or max 200px

    let newScroll: number;
    if (dir === 'left') {
      newScroll = Math.max(0, scrollLeft - scrollDistance);
    } else {
      newScroll = Math.min(
        scrollWidth - clientWidth,
        scrollLeft + scrollDistance,
      );
    }

    viewport.scrollTo({ left: newScroll, behavior: 'smooth' });

    // Update button states after scroll animation
    setTimeout(updateScrollButtons, 300);
  };

  // Update scroll button states on mount and when tabs change
  React.useEffect(() => {
    const viewport = scrollViewportRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement;
    if (!viewport) return;

    updateScrollButtons();

    const handleScroll = () => updateScrollButtons();
    viewport.addEventListener('scroll', handleScroll);

    // Also listen for resize events
    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(viewport);

    return () => {
      viewport.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
    };
  }, [tabs, updateScrollButtons]);

  return (
    <Tabs
      defaultValue={defaultValue ?? tabs[0]?.value}
      className={cn('w-full', className)}
    >
      <div className="relative flex items-center">
        {/* Left Button */}
        <button
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className={cn(
            'absolute left-0 z-10 h-9 w-9 flex items-center justify-center rounded-md bg-background shadow transition-opacity',
            canScrollLeft
              ? 'hover:bg-accent opacity-100'
              : 'opacity-50 cursor-not-allowed',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Scrollable Tabs */}
        <ScrollArea ref={scrollViewportRef} className="w-full overflow-hidden">
          <TabsList className="flex w-max gap-2 bg-transparent p-0 px-10">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Right Button */}
        <button
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          className={cn(
            'absolute right-0 z-10 h-9 w-9 flex items-center justify-center rounded-md bg-background shadow transition-opacity',
            canScrollRight
              ? 'hover:bg-accent opacity-100'
              : 'opacity-50 cursor-not-allowed',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Tab Content */}
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
