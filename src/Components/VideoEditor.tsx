import React, { useCallback } from 'react';
import { useVideoEditorStore } from '../Store/videoEditorStore';
import { Timeline } from './Main/Timeline/Timeline';
import { PropertiesPanel } from './Main/VideoPreview/PropertiesPanel';
import { VideoPreview } from './Main/VideoPreview/VideoPreview';
interface VideoEditorProps {
  className?: string;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ className }) => {
  const {
    render,
    importMediaFromFiles,
    cancelRender,
  } = useVideoEditorStore();

  // Legacy fie import for drag & drop (will show warning)
  const handleFileImport = useCallback((files: FileList) => {
    const fileArray = Array.from(files);
    importMediaFromFiles(fileArray);
  }, [importMediaFromFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFileImport(e.dataTransfer.files);
    }
  }, [handleFileImport]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);


  return (
    <div 
      className={`bg-secondary ${className || ''} flex flex-col h-[100vh] bg-body font-white`}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
<div className='flex overflow-hidden'>
<div className='text-white'>
        me side
      </div>
      {/* Main Content Area */}
      <div className='flex mx-12 my-6'>
    <VideoPreview />
  </div>
  
  {/* Properties Panel with Fixed Width */}
  <div className='w-50'> {/* Fixed width */}
    <PropertiesPanel />
  </div>
</div>

      {/* Timeline Area */}
      <div style={{
        height: '300px',
        borderTop: '1px solid #3d3d3d',
      }}>
        <Timeline />
      </div>

      {/* Render Progress Overlay */}
      {render.isRendering && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: '#2d2d2d',
            padding: '32px',
            borderRadius: '8px',
            textAlign: 'center',
            minWidth: '200px',
          }}>
            <h3 style={{ margin: '0 0 16px 0' }}>Rendering Video</h3>
            
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#1a1a1a',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '16px',
            }}>
              <div style={{
                width: `${render.progress}%`,
                height: '100%',
                backgroundColor: '#4CAF50',
                transition: 'width 0.3s ease',
              }} />
            </div>
            
            <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 16px 0' }}>
              {render.status}
            </p>
            
            <button
              onClick={cancelRender}
              style={{
                backgroundColor: '#f44336',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '8px 16px',
                borderRadius: '4px',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; 