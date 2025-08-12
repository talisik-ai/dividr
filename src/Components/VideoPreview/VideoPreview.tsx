import { motion } from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../store/videoEditorStore';

interface VideoPreviewProps {
  className?: string;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const {
    preview,
    timeline,
    tracks,
    setPreviewScale,
    setCanvasSize,
    toggleGrid,
    toggleSafeZones,
  } = useVideoEditorStore();

  // Update container size on resize
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        setContainerSize({ width: clientWidth, height: clientHeight });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Calculate scale to fit canvas in container
  const calculateFitScale = useCallback(() => {
    if (!containerSize.width || !containerSize.height) return 1;

    const scaleX = containerSize.width / preview.canvasWidth;
    const scaleY = containerSize.height / preview.canvasHeight;
    return Math.min(scaleX, scaleY, 1);
  }, [containerSize, preview.canvasWidth, preview.canvasHeight]);

  // Handle wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setPreviewScale(Math.max(0.1, Math.min(preview.previewScale * zoomFactor, 5)));
    }
  }, [preview.previewScale, setPreviewScale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      return () => canvas.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  // Get active tracks at current frame
  const getActiveTracksAtFrame = useCallback((frame: number) => {
    return tracks.filter(track => 
      track.visible && 
      frame >= track.startFrame && 
      frame < track.endFrame
    );
  }, [tracks]);

  // Render preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = preview.canvasWidth;
    canvas.height = preview.canvasHeight;

    // Clear canvas
    ctx.fillStyle = preview.backgroundColor;
    ctx.fillRect(0, 0, preview.canvasWidth, preview.canvasHeight);

    // Get active tracks
    const activeTracks = getActiveTracksAtFrame(timeline.currentFrame);

    // Render tracks (simplified preview - in real implementation you'd render actual media)
    activeTracks.forEach((track, index) => {
      const progress = (timeline.currentFrame - track.startFrame) / (track.endFrame - track.startFrame);
      
      // Simple placeholder rendering
      ctx.fillStyle = track.color;
      ctx.globalAlpha = 0.8;
      
      if (track.type === 'video' || track.type === 'image') {
        const width = track.width || preview.canvasWidth / 2;
        const height = track.height || preview.canvasHeight / 2;
        const x = track.offsetX || (preview.canvasWidth - width) / 2;
        const y = track.offsetY || (preview.canvasHeight - height) / 2;
        
        ctx.fillRect(x, y, width, height);
        
        // Add track label
        ctx.fillStyle = 'white';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(track.name, x + width / 2, y + height / 2);
      } else if (track.type === 'audio') {
        // Audio waveform placeholder
        const waveHeight = 40;
        const y = preview.canvasHeight - waveHeight - 20;
        const barWidth = 2;
        const numBars = preview.canvasWidth / (barWidth + 1);
        
        for (let i = 0; i < numBars; i++) {
          const height = Math.random() * waveHeight;
          ctx.fillRect(i * (barWidth + 1), y + (waveHeight - height) / 2, barWidth, height);
        }
      }
      
      ctx.globalAlpha = 1;
    });

    // Draw grid if enabled
    if (preview.showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      
      const gridSize = 50;
      for (let x = 0; x <= preview.canvasWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, preview.canvasHeight);
        ctx.stroke();
      }
      
      for (let y = 0; y <= preview.canvasHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(preview.canvasWidth, y);
        ctx.stroke();
      }
    }

    // Draw safe zones if enabled
    if (preview.showSafeZones) {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 2;
      
      const margin = 0.05; // 5% margin
      const safeWidth = preview.canvasWidth * (1 - margin * 2);
      const safeHeight = preview.canvasHeight * (1 - margin * 2);
      const safeX = preview.canvasWidth * margin;
      const safeY = preview.canvasHeight * margin;
      
      ctx.strokeRect(safeX, safeY, safeWidth, safeHeight);
    }

  }, [
    preview,
    timeline.currentFrame,
    getActiveTracksAtFrame,
  ]);

  const effectiveScale = typeof preview.previewScale === 'number' ? preview.previewScale : calculateFitScale();

  return (
    <div
      ref={containerRef}
      className={`video-preview ${className || ''}`}
      style={{
        display: 'flex',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1a1a1a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Preview Controls */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        display: 'flex',
        gap: '8px',
        zIndex: 10,
      }}>
        <button
          onClick={toggleGrid}
          style={{
            backgroundColor: preview.showGrid ? '#4CAF50' : 'rgba(0,0,0,0.7)',
            border: '1px solid #555',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: '4px',
          }}
          title="Toggle grid"
        >
          Grid
        </button>
        
        <button
          onClick={toggleSafeZones}
          style={{
            backgroundColor: preview.showSafeZones ? '#4CAF50' : 'rgba(0,0,0,0.7)',
            border: '1px solid #555',
            color: '#fff',
            fontSize: '12px',
            cursor: 'pointer',
            padding: '6px 12px',
            borderRadius: '4px',
          }}
          title="Toggle safe zones"
        >
          Safe
        </button>
      </div>

      {/* Scale Controls */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        right: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: '8px',
        borderRadius: '4px',
        zIndex: 10,
      }}>
        <button
          onClick={() => setPreviewScale(calculateFitScale())}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #555',
            color: '#fff',
            fontSize: '11px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '3px',
          }}
        >
          Fit
        </button>
        
        <button
          onClick={() => setPreviewScale(1)}
          style={{
            backgroundColor: 'transparent',
            border: '1px solid #555',
            color: '#fff',
            fontSize: '11px',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: '3px',
          }}
        >
          100%
        </button>
        
        <span style={{ color: '#aaa', fontSize: '11px' }}>
          {Math.round(effectiveScale * 100)}%
        </span>
      </div>

      {/* Canvas */}
      <motion.canvas
        ref={canvasRef}
        style={{
          border: '1px solid #555',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          cursor: 'grab',
        }}
        animate={{
          scale: effectiveScale,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
      />

      {/* Resolution Display */}
      <div style={{
        position: 'absolute',
        bottom: '16px',
        left: '16px',
        backgroundColor: 'rgba(0,0,0,0.7)',
        color: '#fff',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '11px',
        zIndex: 10,
      }}>
        {preview.canvasWidth} × {preview.canvasHeight}
      </div>
    </div>
  );
}; 