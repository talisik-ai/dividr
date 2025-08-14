import React from 'react';
import { useVideoEditorStore } from '../../../Store/videoEditorStore';

export const TimelineHeader: React.FC = () => {
  const { timeline, setZoom, setFps } = useVideoEditorStore();

  return (
    <div style={{
      height: '40px',
      backgroundColor: '#2d2d2d',
      borderBottom: '1px solid #3d3d3d',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Timeline</span>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '11px', color: '#aaa' }}>FPS:</label>
          <select 
            value={timeline.fps}
            onChange={(e) => setFps(Number(e.target.value))}
            style={{
              backgroundColor: '#1a1a1a',
              color: '#fff',
              border: '1px solid #555',
              borderRadius: '3px',
              padding: '2px 4px',
              fontSize: '11px',
            }}
          >
            <option value={24}>24</option>
            <option value={25}>25</option>
            <option value={30}>30</option>
            <option value={60}>60</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '11px', color: '#aaa' }}>Zoom:</label>
          <input
            type="range"
            min="0.1"
            max="10"
            step="0.1"
            value={timeline.zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ width: '80px' }}
          />
          <span style={{ fontSize: '11px', minWidth: '35px' }}>{timeline.zoom.toFixed(1)}x</span>
        </div>
        
        <button
          onClick={() => setZoom(1)}
          style={{
            backgroundColor: '#3d3d3d',
            color: '#fff',
            border: '1px solid #555',
            borderRadius: '3px',
            padding: '4px 8px',
            fontSize: '11px',
            cursor: 'pointer',
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}; 