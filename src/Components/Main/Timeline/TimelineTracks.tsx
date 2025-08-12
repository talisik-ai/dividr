import React from "react";
import { DraggableClip } from "./DraggableClip";
import { ClipData } from "./Timeline";
import { useTimelineWidth } from "./TimelineProvider";

interface TimelineTracksProps {
  clips: ClipData[];
  zoom?: number; // Keep for backward compatibility but not used with provider
  totalFrames: number;
  onUpdateClip: (id: string, newStart: number, newEnd: number) => void;
}

export const TimelineTracks: React.FC<TimelineTracksProps> = ({
  clips,
  totalFrames,
  onUpdateClip
}) => {
  const trackHeight = 40;
  const { width } = useTimelineWidth();

  // Don't render until width is available
  if (!width) {
    return (
      <div className="relative bg-gray-900 h-full w-full flex items-center justify-center">
        <div className="text-gray-500 text-sm">Loading timeline...</div>
      </div>
    );
  }

  return (
    <div 
      className="relative bg-gray-900 h-full"
      style={{ 
        minWidth: width,
        width: '100%'
      }}
    >
      {/* Track backgrounds */}
      <div className="absolute inset-0">
        <div 
          className="border-b border-gray-700 bg-gray-800" 
          style={{ height: trackHeight }}
        />
        <div 
          className="border-b border-gray-700 bg-gray-850" 
          style={{ height: trackHeight }}
        />
      </div>

      {/* Clips */}
      {clips.map((clip) => (
        <DraggableClip
          key={clip.id}
          clip={clip}
          trackHeight={trackHeight}
          totalFrames={totalFrames}
          onUpdateClip={onUpdateClip}
        />
      ))}
    </div>
  );
};
