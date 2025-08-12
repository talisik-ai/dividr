// Timeline utility functions inspired by Remotion's scroll logic

export const TIMELINE_PADDING = 10;

export const getFrameFromX = ({
  clientX,
  totalFrames,
  width,
  pixelsPerFrame,
  extrapolate = 'clamp',
}: {
  clientX: number;
  totalFrames: number;
  width: number;
  pixelsPerFrame: number;
  extrapolate?: 'clamp' | 'extend';
}): number => {
  const pos = clientX - TIMELINE_PADDING;
  const totalWidth = width - TIMELINE_PADDING * 2;
  
  if (extrapolate === 'clamp') {
    const clampedPos = Math.max(0, Math.min(pos, totalWidth));
    return Math.round((clampedPos / totalWidth) * (totalFrames - 1));
  }
  
  return Math.round((pos / totalWidth) * (totalFrames - 1));
};

export const getXFromFrame = ({
  frame,
  totalFrames,
  width,
}: {
  frame: number;
  totalFrames: number;
  width: number;
}): number => {
  const totalWidth = width - TIMELINE_PADDING * 2;
  const ratio = frame / (totalFrames - 1);
  return TIMELINE_PADDING + ratio * totalWidth;
};

export const getFrameIncrement = (totalFrames: number, width: number): number => {
  return (width - TIMELINE_PADDING * 2) / (totalFrames - 1);
};

export const formatTime = (frame: number, fps: number): string => {
  const seconds = frame / fps;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, '0')}`;
};

export const canScrollInDirection = (
  scrollRef: React.RefObject<HTMLDivElement>
): { canScrollLeft: boolean; canScrollRight: boolean } => {
  if (!scrollRef.current) {
    return { canScrollLeft: false, canScrollRight: false };
  }
  
  const { scrollWidth, scrollLeft, clientWidth } = scrollRef.current;
  
  return {
    canScrollLeft: scrollLeft > TIMELINE_PADDING,
    canScrollRight: scrollWidth - scrollLeft - clientWidth > TIMELINE_PADDING,
  };
};

export const ensureFrameIsInViewport = ({
  frame,
  totalFrames,
  scrollRef,
  width,
}: {
  frame: number;
  totalFrames: number;
  scrollRef: React.RefObject<HTMLDivElement>;
  width: number;
}): void => {
  if (!scrollRef.current) return;
  
  const frameX = getXFromFrame({ frame, totalFrames, width });
  const { scrollLeft, clientWidth } = scrollRef.current;
  
  const leftBound = scrollLeft + TIMELINE_PADDING;
  const rightBound = scrollLeft + clientWidth - TIMELINE_PADDING;
  
  if (frameX < leftBound) {
    scrollRef.current.scrollLeft = frameX - TIMELINE_PADDING;
  } else if (frameX > rightBound) {
    scrollRef.current.scrollLeft = frameX - clientWidth + TIMELINE_PADDING;
  }
}; 