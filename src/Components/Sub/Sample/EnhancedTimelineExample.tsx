import React, { useState } from 'react';
import { ClipData, Timeline } from '../../Main/Timeline/Timeline';

export const EnhancedTimelineExample: React.FC = () => {
  const [currentFrame, setCurrentFrame] = useState(0);
  
  // Sample clips data
  const sampleClips: ClipData[] = [
    {
      id: 'Video Intro',
      startFrame: 0,
      endFrame: 90,
      track: '1'
    },
    {
      id: 'Music Track',
      startFrame: 30,
      endFrame: 240,
      track: '2'
    },
    {
      id: 'Logo Animation',
      startFrame: 150,
      endFrame: 210,
      track: '1'
    },
    {
      id: 'Voice Over',
      startFrame: 180,
      endFrame: 300,
      track: '2'
    }
  ];

  const handleFrameChange = (frame: number) => {
    setCurrentFrame(frame);
    console.log('Current frame changed to:', frame);
  };

  return (
    <div className="p-6 bg-gray-100 min-h-20">
      <div className="max-w-6xl mx-auto">
        {/* 
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Enhanced Timeline Component
        </h1>
        <p className="text-gray-600 mb-6">
          Based on Remotion's timeline architecture with advanced drag handling, 
          context providers, and smooth interactions.
        </p>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Timeline Features</h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>🎯 **Context-based width management** - Automatic resizing and responsive design</li>
            <li>🚀 **Imperative cursor updates** - Smooth 60fps cursor movement during interactions</li>
            <li>🎨 **Advanced drag handling** - Auto-scrolling, edge detection, and smooth dragging</li>
            <li>📏 **Precise frame calculations** - Consistent pixel-to-frame conversion</li>
            <li>🔧 **Modular architecture** - Separate concerns for better maintainability</li>
            <li>⚡ **Performance optimized** - Direct DOM manipulation for smooth animations</li>
          </ul>
        </div>
*/}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            {/* 
          <h2 className="text-xl font-semibold mb-4">Interactive Timeline</h2>
          <p className="text-gray-600 mb-4">
            Try dragging clips, resizing them, and scrubbing through the timeline. 
            Current frame: <strong>{currentFrame}</strong>
          </p>
          */}
          <Timeline
            clips={sampleClips}
            totalFrames={360}
            fps={30}
            onCurrentFrameChange={handleFrameChange}
          />
        </div>
                {/*
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Key Improvements from Remotion Analysis</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-lg mb-2">Architecture Patterns</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                <li>Context providers for shared state</li>
                <li>Layered component architecture</li>
                <li>Imperative DOM updates for performance</li>
                <li>Centralized scroll and frame logic</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-lg mb-2">Interaction Enhancements</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-700 text-sm">
                <li>Auto-scroll during edge dragging</li>
                <li>Smooth cursor synchronization</li>
                <li>Enhanced clip resize feedback</li>
                <li>Viewport-aware frame positioning</li>
              </ul>
            </div>
            
          </div>
         
        </div>
         */}
      </div>
    </div>
  );
}; 