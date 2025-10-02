import React from 'react';
import { useVideoEditorStore } from '../features/editor/stores/VideoEditorStore';

export const TimelineHeader: React.FC = React.memo(() => {
  const { timeline, setZoom, setFps } = useVideoEditorStore();

  return (
    <div className="h-10 bg-[#2d2d2d] border-b border-[#3d3d3d] flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <span className="text-xs font-bold">Timeline</span>

        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[#aaa]">FPS:</label>
          <select
            value={timeline.fps}
            onChange={(e) => setFps(Number(e.target.value))}
            className="bg-[#1a1a1a] text-white border border-[#555] rounded-sm px-1 py-0.5 text-[11px]"
          >
            <option value={24}>24</option>
            <option value={25}>25</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-[#aaa]">Zoom:</label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={timeline.zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-20"
          />
          <span className="text-[11px] min-w-[35px]">
            {timeline.zoom.toFixed(1)}x
          </span>
        </div>

        <button
          onClick={() => setZoom(1)}
          className="bg-[#3d3d3d] text-white border border-[#555] rounded-sm px-2 py-1 text-[11px] cursor-pointer"
        >
          Reset
        </button>
      </div>
    </div>
  );
});
