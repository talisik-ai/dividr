import React from 'react';
import { useVideoEditorStore } from '../../../Store/VideoEditorStore';

interface PropertiesPanelProps {
  className?: string;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  className,
}) => {
  const { tracks, timeline, preview } = useVideoEditorStore();

  return (
    <div className="bg-primary dark:bg-primary-dark p-4 overflow-auto w-50 border-l-8 border-secondary dark:border-secondary-dark rounded text-black dark:text-white">
      <h3 className="text-sm font-bold mb-4">Properties</h3>

      {timeline.selectedTrackIds.length > 0 ? (
        <div>
          <p className="text-xs text-[#aaa] mb-2">
            {timeline.selectedTrackIds.length} track(s) selected
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs text-[#aaa] mb-2">
            {timeline.selectedTrackIds.length} track(s) selected
          </p>
        </div>
      )}

      {/* Canvas Settings */}
      <div className="mt-6">
        <h4 className="text-xs font-bold mb-2">Canvas Settings</h4>

        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <label className="text-[11px] text-[#aaa]">Resolution:</label>
            <span className="text-[11px]">
              {preview.canvasWidth} × {preview.canvasHeight}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <label className="text-[11px] text-[#aaa]">FPS:</label>
            <span className="text-[11px]">{timeline.fps}</span>
          </div>

          <div className="flex justify-between items-center">
            <label className="text-[11px] text-[#aaa]">Duration:</label>
            <span className="text-[11px]">
              {(timeline.totalFrames / timeline.fps).toFixed(2)}s
            </span>
          </div>
        </div>
      </div>
      {/* Demo Instructions */}
    </div>
  );
};
