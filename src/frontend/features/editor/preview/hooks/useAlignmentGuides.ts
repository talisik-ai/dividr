import { useCallback, useState } from 'react';
import { CENTER_ALIGNMENT_TOLERANCE } from '../core/constants';
import { AlignmentGuide } from '../core/types';

/**
 * Hook for managing alignment guides during drag operations
 */

export interface UseAlignmentGuidesProps {
  baseVideoWidth: number;
  baseVideoHeight: number;
}

export function useAlignmentGuides({
  baseVideoWidth,
  baseVideoHeight,
}: UseAlignmentGuidesProps) {
  const [alignmentGuides, setAlignmentGuides] = useState<AlignmentGuide[]>([]);
  const [isDraggingText, setIsDraggingText] = useState(false);

  const handleDragStateChange = useCallback(
    (
      isDragging: boolean,
      position?: { x: number; y: number; width: number; height: number },
    ) => {
      setIsDraggingText(isDragging);

      if (!isDragging || !position) {
        setAlignmentGuides([]);
        return;
      }

      const guides: AlignmentGuide[] = [];

      // Calculate element center in video pixel coordinates (centered at 0,0)
      // position.x and position.y represent the CENTER of the text element
      const elementCenterX = position.x;
      const elementCenterY = position.y;

      // Video frame center (in video pixel coordinates, centered at 0,0)
      const frameCenterX = 0;
      const frameCenterY = 0;

      // CENTER ALIGNMENT - Check if element's CENTER aligns with video frame's CENTER
      // Horizontal center guide (appears when text's Y center aligns with video's Y center)
      const isHorizontallyCentered =
        Math.abs(elementCenterY - frameCenterY) < CENTER_ALIGNMENT_TOLERANCE;
      if (isHorizontallyCentered) {
        guides.push({
          type: 'horizontal',
          position: baseVideoHeight / 2, // Convert from centered coords (0) to top-left coords
          label: 'Center',
        });
      }

      // Vertical center guide (appears when text's X center aligns with video's X center)
      const isVerticallyCentered =
        Math.abs(elementCenterX - frameCenterX) < CENTER_ALIGNMENT_TOLERANCE;
      if (isVerticallyCentered) {
        guides.push({
          type: 'vertical',
          position: baseVideoWidth / 2, // Convert from centered coords (0) to top-left coords
          label: 'Center',
        });
      }

      // Debug logging (development mode only)
      if (process.env.NODE_ENV === 'development') {
        console.log('[Drag Guides Debug]', {
          textCenter: { x: elementCenterX, y: elementCenterY },
          videoCenter: { x: frameCenterX, y: frameCenterY },
          alignment: {
            horizontallyCentered: isHorizontallyCentered,
            verticallyCentered: isVerticallyCentered,
            deltaX: Math.abs(elementCenterX - frameCenterX),
            deltaY: Math.abs(elementCenterY - frameCenterY),
          },
          tolerance: CENTER_ALIGNMENT_TOLERANCE,
          guidesActive: guides.map((g) => `${g.type}-${g.label}`),
        });
      }

      setAlignmentGuides(guides);
    },
    [baseVideoHeight, baseVideoWidth],
  );

  return {
    alignmentGuides,
    isDraggingText,
    handleDragStateChange,
  };
}
