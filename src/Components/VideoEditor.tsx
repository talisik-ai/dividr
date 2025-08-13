import React, { useCallback } from 'react';
import { VideoEditJob } from '../Schema/ffmpegConfig';
import { useVideoEditorStore } from '../store/videoEditorStore';
import { FfmpegCallbacks, runFfmpegWithProgress } from '../Utility/ffmpegRunner';
import { Timeline } from './Timeline/Timeline';
import { VideoPreview } from './VideoPreview/VideoPreview';

interface VideoEditorProps {
  className?: string;
}

export const VideoEditor: React.FC<VideoEditorProps> = ({ className }) => {
  const {
    tracks,
    timeline,
    preview,
    render,
    importMediaFromDialog,
    importMediaFromFiles,
    addTrack,
    startRender,
    updateRenderProgress,
    finishRender,
    cancelRender,
    exportProject,
    importProject,
    reset,
  } = useVideoEditorStore();

  /*
  // Add demo tracks for demonstration
  const addDemoTracks = useCallback(() => {
    // Add some sample tracks
    addTrack({
      type: 'video',
      name: 'Sample Video 1',
      source: 'demo://video1.mp4',
      duration: 600, // 20 seconds at 30fps
      startFrame: 0,
      endFrame: 600,
      width: 640,
      height: 360,
      visible: true,
      locked: false,
    });

    addTrack({
      type: 'audio',
      name: 'Background Music',
      source: 'demo://music.mp3',
      duration: 900, // 30 seconds at 30fps
      startFrame: 0,
      endFrame: 900,
      volume: 0.8,
      visible: true,
      locked: false,
    });

    addTrack({
      type: 'video',
      name: 'Sample Video 2',
      source: 'demo://video2.mp4',
      duration: 450, // 15 seconds at 30fps
      startFrame: 300, // Start at 10 seconds
      endFrame: 750,
      width: 640,
      height: 360,
      visible: true,
      locked: false,
    });

    addTrack({
      type: 'image',
      name: 'Logo Overlay',
      source: 'demo://logo.png',
      duration: 150, // 5 seconds at 30fps
      startFrame: 600,
      endFrame: 750,
      width: 200,
      height: 200,
      offsetX: 50,
      offsetY: 50,
      visible: true,
      locked: false,
    });
  }, [addTrack]);

 */ 

  // File import using native Electron dialog
  const handleImportFiles = useCallback(async () => {
    await importMediaFromDialog();
  }, [importMediaFromDialog]);

  // Legacy file import for drag & drop (will show warning)
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

  // Convert tracks to FFmpeg job
  const createFFmpegJob = useCallback((): VideoEditJob => {
    // Build a simple concatenation job for now
    // In a full implementation, you'd handle more complex compositions
    return {
      inputs: tracks.map(track => track.source),
      output: 'final_video.mp4',
      operations: {
        concat: tracks.length > 1,
        targetFrameRate: timeline.fps,
        normalizeFrameRate: true,
      },
    };
  }, [tracks, timeline.fps]);

  // Render video using FFmpeg
  const handleRender = useCallback(async () => {
    if (tracks.length === 0) {
      alert('No tracks to render');
      return;
    }

    const job = createFFmpegJob();
    console.log(job);

    const callbacks: FfmpegCallbacks = {
      onProgress: (progress) => {
        if (progress.percentage) {
          updateRenderProgress(progress.percentage, `Rendering... ${progress.percentage.toFixed(1)}%`);
        }
      },
      onStatus: (status) => {
        updateRenderProgress(render.progress, status);
      },
      onLog: (log, type) => {
        console.log(`[${type}] ${log}`);
      },
    };

    try {
      startRender({
        outputPath: job.output,
        format: 'mp4',
        quality: 'high',
      });

      await runFfmpegWithProgress(job, callbacks);
      finishRender();
      alert('Render completed successfully!');
    } catch (error) {
      console.error('Render failed:', error);
      cancelRender();
      alert(`Render failed: ${error}`);
    }
  }, [tracks, createFFmpegJob, render.progress, startRender, updateRenderProgress, finishRender, cancelRender]);

  // Project management
  const handleExportProject = useCallback(() => {
    const projectData = exportProject();
    const blob = new Blob([projectData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'video-project.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [exportProject]);

  const handleImportProject = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result as string;
            importProject(data);
          } catch (error) {
            alert('Failed to import project');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [importProject]);

  return (
    <div 
      className={`video-editor ${className || ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        backgroundColor: '#1a1a1a',
        color: '#ffffff',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Top Menu Bar */}
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
          <h1 style={{ fontSize: '16px', fontWeight: 'bold', margin: 0 }}>
            Dividr Video Editor
          </h1>
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleImportFiles}
              style={{
                backgroundColor: '#4CAF50',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              Import Media
            </button>
            {/* 
            <button
              onClick={addDemoTracks}
              style={{
                backgroundColor: '#9C27B0',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              Add Demo
            </button>
            */}
            <button
              onClick={handleImportProject}
              style={{
                backgroundColor: '#2196F3',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              Open Project
            </button>
            
            <button
              onClick={handleExportProject}
              style={{
                backgroundColor: '#FF9800',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              Save Project
            </button>
            
            <button
              onClick={reset}
              style={{
                backgroundColor: '#f44336',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              New Project
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Project Info */}
          <div style={{ fontSize: '12px', color: '#aaa' }}>
            {tracks.length} tracks • {timeline.fps} fps • {timeline.totalFrames} frames
          </div>
          
          {/* Render Button */}
          <button
            onClick={handleRender}
            disabled={render.isRendering || tracks.length === 0}
            style={{
              backgroundColor: render.isRendering ? '#666' : '#FF5722',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              cursor: render.isRendering ? 'not-allowed' : 'pointer',
              padding: '6px 16px',
              borderRadius: '4px',
              fontWeight: 'bold',
            }}
          >
            {render.isRendering ? `Rendering... ${render.progress.toFixed(0)}%` : 'Render Video'}
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        display: 'flex',
        flex: 1,
        overflow: 'hidden',
      }}>
        {/* Preview Area */}
        <div style={{
          flex: '2',
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #3d3d3d',
        }}>
          <VideoPreview />
        </div>

        {/* Properties Panel (placeholder) */}
        <div style={{
          width: '300px',
          backgroundColor: '#2d2d2d',
          borderRight: '1px solid #3d3d3d',
          padding: '16px',
          overflow: 'auto',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 16px 0' }}>
            Properties
          </h3>
          
          {timeline.selectedTrackIds.length > 0 ? (
            <div>
              <p style={{ fontSize: '12px', color: '#aaa', margin: '0 0 8px 0' }}>
                {timeline.selectedTrackIds.length} track(s) selected
              </p>
              
              {/* Track properties would go here */}
              <div style={{ fontSize: '12px', color: '#ccc' }}>
                Track properties panel coming soon...
              </div>
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
                <br />• Video preview canvas
                <br />• Keyboard shortcuts (Space, Arrow keys)
                <br />• FFmpeg integration
              </p>
            </div>
          )}
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
            minWidth: '300px',
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