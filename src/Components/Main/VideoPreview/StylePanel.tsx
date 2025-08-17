import React from 'react';
import { useVideoEditorStore } from '../../../Store/videoEditorStore';

interface PropertiesPanelProps {
  className?: string;
}

export const StylePanel: React.FC<PropertiesPanelProps> = ({ className }) => {
  const { tracks, timeline, preview } = useVideoEditorStore();

  return (
    <div className="bg-secondary p-4 overflow-auto w-50 text-white border-r-8 border-black rounded">
      <h3
        style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 16px 0' }}
      >
        Properties
      </h3>

      {timeline.selectedTrackIds.length > 0 ? (
        <div>
          <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 8px 0' }}>
            {timeline.selectedTrackIds.length} track(s) selected
          </p>
        </div>
      ) : (
        <div>
          <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 8px 0' }}>
            {timeline.selectedTrackIds.length} track(s) selected
          </p>
        </div>
      )}

      {/* Canvas Settings */}
      <div style={{ marginTop: '24px' }}>
        <h4
          style={{ fontSize: '12px', fontWeight: 'bold', margin: '0 0 8px 0' }}
        >
          Canvas Settings
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <label style={{ fontSize: '11px', color: '#aaa' }}>
              Resolution:
            </label>
            <span style={{ fontSize: '11px' }}>
              {preview.canvasWidth} × {preview.canvasHeight}
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <label style={{ fontSize: '11px', color: '#aaa' }}>FPS:</label>
            <span style={{ fontSize: '11px' }}>{timeline.fps}</span>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <label style={{ fontSize: '11px', color: '#aaa' }}>Duration:</label>
            <span style={{ fontSize: '11px' }}>
              {(timeline.totalFrames / timeline.fps).toFixed(2)}s
            </span>
          </div>
        </div>
      </div>
      {/* Demo Instructions */}
    </div>
  );
};
