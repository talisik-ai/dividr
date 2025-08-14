import React from 'react';
import { useVideoEditorStore } from '../../../Store/videoEditorStore';

interface PropertiesPanelProps {
  className?: string;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({ className }) => {
  const {
    tracks,
    timeline,
    preview,
  } = useVideoEditorStore();

  return (
   <div 
        className='bg-[#2d2d2d] p-4 overflow-auto w-50'
        >
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
            Properties
          </h3>
          
          {timeline.selectedTrackIds.length > 0 ? (
            <div>
              <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 8px 0' }}>
                {timeline.selectedTrackIds.length} track(s) selected
              </p>
            
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: '#888' }}>
              Select a track to edit properties
            </div>
          )}
          
          {/* Canvas Settings */}
          <div style={{ marginTop: '24px' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
              Canvas Settings
            </h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: '#aaa' }}>Resolution:</label>
                <span style={{ fontSize: '11px' }}>
                  {preview.canvasWidth} × {preview.canvasHeight}
                </span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: '#aaa' }}>FPS:</label>
                <span style={{ fontSize: '11px' }}>{timeline.fps}</span>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ fontSize: '11px', color: '#aaa' }}>Duration:</label>
                <span style={{ fontSize: '11px' }}>
                  {(timeline.totalFrames / timeline.fps).toFixed(2)}s
                </span>
              </div>
            </div>
            </div>
          {/* Demo Instructions */}
          {tracks.length === 0 && (
            <div style={{ 
              marginTop: '32px', 
              padding: '16px', 
              backgroundColor: '#333', 
              borderRadius: '8px',
              border: '1px solid #555'
            }}>
              <h4 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0', color: '#4CAF50' }}>
                🎬 Get Started
              </h4>
              <p style={{ fontSize: '11px', color: '#ccc', lineHeight: '1.4', margin: '0 0 12px 0' }}>
                Click "Add Demo" to populate the timeline with sample tracks, or drag & drop your media files.
              </p>
              <p style={{ fontSize: '11px', color: '#999', lineHeight: '1.4', margin: 0 }}>
                Features:
                <br />• Timeline with zoom & scroll
                <br />• Track selection & dragging
                <br />• Keyboard shortcuts (Space, Arrow keys)
              </p>
            </div>
          )}
        </div>
  );
}; 