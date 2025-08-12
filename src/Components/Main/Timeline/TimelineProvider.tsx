import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

type TimelineWidthContextType = {
  width: number | null;
  scrollAreaRef: React.RefObject<HTMLDivElement>;
  pixelsPerFrame: number;
  setPixelsPerFrame: (ppf: number) => void;
};

const TimelineWidthContext = createContext<TimelineWidthContextType | null>(null);

export const useTimelineWidth = () => {
  const context = useContext(TimelineWidthContext);
  if (!context) {
    throw new Error('useTimelineWidth must be used within TimelineProvider');
  }
  return context;
};

interface TimelineProviderProps {
  children: React.ReactNode;
  totalFrames: number;
  initialZoom?: number;
}

export const TimelineProvider: React.FC<TimelineProviderProps> = ({ 
  children, 
  totalFrames, 
  initialZoom = 1 
}) => {
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [pixelsPerFrame, setPixelsPerFrame] = useState(initialZoom);

  useEffect(() => {
    const updateWidth = () => {
      if (scrollAreaRef.current) {
        setWidth(scrollAreaRef.current.clientWidth);
      }
    };

    updateWidth();
    const resizeObserver = new ResizeObserver(updateWidth);
    
    if (scrollAreaRef.current) {
      resizeObserver.observe(scrollAreaRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const contextValue: TimelineWidthContextType = {
    width,
    scrollAreaRef,
    pixelsPerFrame,
    setPixelsPerFrame,
  };

  return (
    <TimelineWidthContext.Provider value={contextValue}>
      {children}
    </TimelineWidthContext.Provider>
  );
}; 