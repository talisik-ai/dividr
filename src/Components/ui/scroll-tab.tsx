import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import * as React from 'react';
import { ScrollArea, ScrollBar } from './scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

interface ScrollTabsProps {
  tabs: { value: string; label: string; content: React.ReactNode }[];
  defaultValue?: string;
  className?: string;
  onValueChange?: (value: string) => void;
}

export function ScrollTabs({
  tabs,
  defaultValue,
  className,
  onValueChange,
}: ScrollTabsProps) {
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
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  const scroll = (dir: 'left' | 'right') => {
    const viewport = scrollViewportRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement;
    if (!viewport) return;

    const { scrollLeft, clientWidth, scrollWidth } = viewport;
    const scrollDistance = Math.min(clientWidth * 0.6, 200);

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
    setTimeout(updateScrollButtons, 300);
  };

  React.useEffect(() => {
    const viewport = scrollViewportRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement;
    if (!viewport) return;

    updateScrollButtons();
    const handleScroll = () => updateScrollButtons();
    viewport.addEventListener('scroll', handleScroll);

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
      onValueChange={onValueChange}
      className={cn('w-full', className)}
    >
      <div className="flex items-center w-full px-2">
        {/* Left Button */}
        <button
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          className={cn(
            'h-9 w-4 flex items-center justify-center rounded-md bg-background shadow transition-opacity',
            canScrollLeft ? 'hover:bg-accent opacity-100' : 'hidden',
          )}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Scrollable Tabs */}
        <ScrollArea ref={scrollViewportRef} className="flex-1 overflow-hidden">
          <TabsList className="flex w-max gap-1 bg-transparent p-0 !text-[8px]">
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
            'h-9 w-4 flex items-center justify-center rounded-md bg-background shadow transition-opacity',
            canScrollRight ? 'hover:bg-accent opacity-100' : 'hidden',
          )}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Tab Content */}
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-4 text-sm">
          {tab.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
