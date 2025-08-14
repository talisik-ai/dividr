import { motion } from 'framer-motion';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useVideoEditorStore } from '../../../Store/videoEditorStore';

interface VideoPreviewProps {
  className?: string;
}

interface VideoElement {
  id: string;
  element: HTMLVideoElement;
  isLoaded: boolean;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElementsRef = useRef<Map<string, VideoElement>>(new Map());
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [loadingTracks, setLoadingTracks] = useState<Set<string>>(new Set());

  const {
    preview,
    timeline,
    tracks,
    setPreviewScale,
    playback,
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

  // Create and manage video elements for each track
  useEffect(() => {
    const videoElements = videoElementsRef.current;
    const currentTrackIds = new Set(tracks.map(track => track.id));
    
    // Remove video elements for tracks that no longer exist
    for (const [trackId, videoElement] of videoElements.entries()) {
      if (!currentTrackIds.has(trackId)) {
        videoElement.element.remove();
        videoElements.delete(trackId);
      }
    }

    // Create video elements for new video/image tracks
    tracks.forEach(track => {
      if ((track.type === 'video' || track.type === 'image') && !videoElements.has(track.id) && track.previewUrl) {
        const videoElement = document.createElement('video');
        videoElement.style.display = 'none';
        videoElement.muted = false; // Enable audio
        videoElement.preload = 'metadata';
        videoElement.crossOrigin = 'anonymous';
        videoElement.volume = 0.8; // Set reasonable volume level
        
        // Handle loading
        const handleLoadedData = () => {
          videoElements.set(track.id, {
            id: track.id,
            element: videoElement,
            isLoaded: true
          });
          setLoadingTracks(prev => {
            const newSet = new Set(prev);
            newSet.delete(track.id);
            return newSet;
          });
          
          // Seek to 2 seconds to avoid potential black frames at start
          if (videoElement.duration > 2) {
            videoElement.currentTime = 2;
          }
          
          console.log(`✅ Video loaded: ${track.name}`);
        };

        const handleError = (e: Event) => {
          console.error(`❌ Failed to load: ${track.name}`);
          setLoadingTracks(prev => {
            const newSet = new Set(prev);
            newSet.delete(track.id);
            return newSet;
          });
        };

        videoElement.addEventListener('loadeddata', handleLoadedData);
        videoElement.addEventListener('error', handleError);

        // Set loading state
        setLoadingTracks(prev => new Set(prev).add(track.id));

        // Use the preview URL
        videoElement.src = track.previewUrl;
        document.body.appendChild(videoElement);

        videoElements.set(track.id, {
          id: track.id,
          element: videoElement,
          isLoaded: false
        });
      } else if ((track.type === 'video' || track.type === 'image') && !track.previewUrl) {
        console.warn(`⚠️ Track ${track.name} has no preview URL`);
      }
    });

    // Cleanup on unmount
    return () => {
      for (const videoElement of videoElements.values()) {
        videoElement.element.remove();
      }
      videoElements.clear();
    };
  }, [tracks]);

  // Get active tracks at current frame
  const getActiveTracksAtFrame = useCallback((frame: number) => {
    const activeTracks = tracks.filter(track => 
      track.visible && 
      frame >= track.startFrame && 
      frame < track.endFrame
    );
    
    return activeTracks;
  }, [tracks]);

  // Update video current time based on timeline
  useEffect(() => {
    const currentTimeInSeconds = timeline.currentFrame / timeline.fps;
    const videoElements = videoElementsRef.current;

    tracks.forEach(track => {
      const videoElement = videoElements.get(track.id);
      if (videoElement && videoElement.isLoaded) {
        const trackTimeInSeconds = (timeline.currentFrame - track.startFrame) / timeline.fps;
        if (trackTimeInSeconds >= 0 && trackTimeInSeconds <= track.duration / timeline.fps) {
          // Only update time if it's significantly different to avoid constant seeking
          const timeDiff = Math.abs(videoElement.element.currentTime - trackTimeInSeconds);
          if (timeDiff > 0.1) { // Only seek if more than 100ms difference
            videoElement.element.currentTime = Math.max(0, trackTimeInSeconds);
          }
        }
      }
    });
  }, [timeline.currentFrame, timeline.fps, tracks]);

  // Sync audio playback with timeline controls
  useEffect(() => {
    const videoElements = videoElementsRef.current;
    
    tracks.forEach(track => {
      const videoElement = videoElements.get(track.id);
      if (videoElement && videoElement.isLoaded) {
        const trackTimeInSeconds = (timeline.currentFrame - track.startFrame) / timeline.fps;
        const isTrackActive = track.visible && 
          timeline.currentFrame >= track.startFrame && 
          timeline.currentFrame < track.endFrame;
        
        if (isTrackActive && playback.isPlaying) {
          videoElement.element.play().catch(e => {
            // Handle autoplay restrictions gracefully
            console.log('Autoplay prevented for', track.name);
          });
        } else {
          videoElement.element.pause();
        }
        
        // Sync volume and mute state
        videoElement.element.volume = playback.muted ? 0 : playback.volume * 0.8;
        videoElement.element.muted = playback.muted;
        videoElement.element.playbackRate = playback.playbackRate;
      }
    });
  }, [timeline.currentFrame, timeline.fps, tracks, playback.isPlaying, playback.volume, playback.muted, playback.playbackRate]);

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
    const videoElements = videoElementsRef.current;

    // Render tracks
    activeTracks.forEach((track) => {
      const progress = (timeline.currentFrame - track.startFrame) / (track.endFrame - track.startFrame);
      
      if (track.type === 'video' || track.type === 'image') {
        const videoElement = videoElements.get(track.id);
        
        if (videoElement && videoElement.isLoaded) {
          // Draw actual video frame
          const video = videoElement.element;
          const width = track.width || preview.canvasWidth;
          const height = track.height || preview.canvasHeight / 2;
          const x = track.offsetX || (preview.canvasWidth - width) / 2;
          const y = track.offsetY || (preview.canvasHeight - height) / 2;
          
          try {
            ctx.drawImage(video, x, y, width, height);
            
          } catch (error) {
            console.error(`❌ Failed to draw video frame for ${track.name}:`, error);
            
            // Fallback to placeholder if video can't be drawn
            ctx.fillStyle = track.color;
            ctx.globalAlpha = 0.8;
            ctx.fillRect(x, y, width, height);
            
            // Add track label
            ctx.fillStyle = 'white';
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(track.name, x + width / 2, y + height / 2);
            ctx.globalAlpha = 1;
          }
        } else {
          // Loading placeholder or fallback
          const width = track.width || preview.canvasWidth / 2;
          const height = track.height || preview.canvasHeight / 2;
          const x = track.offsetX || (preview.canvasWidth - width) / 2;
          const y = track.offsetY || (preview.canvasHeight - height) / 2;
          
          ctx.fillStyle = loadingTracks.has(track.id) ? '#444' : track.color;
          ctx.globalAlpha = 0.8;
          ctx.fillRect(x, y, width, height);
          
          // Add loading indicator or track label
          ctx.fillStyle = 'white';
          ctx.font = '16px sans-serif';
          ctx.textAlign = 'center';
          const text = loadingTracks.has(track.id) ? 'Loading...' : track.name;
          ctx.fillText(text, x + width / 2, y + height / 2);
          ctx.globalAlpha = 1;
        }
      } else if (track.type === 'audio') {
        // Audio waveform placeholder
        ctx.fillStyle = track.color;
        ctx.globalAlpha = 0.8;
        
        const waveHeight = 40;
        const y = preview.canvasHeight - waveHeight - 20;
        const barWidth = 2;
        const numBars = preview.canvasWidth / (barWidth + 1);
        
        for (let i = 0; i < numBars; i++) {
          const height = Math.random() * waveHeight * progress;
          ctx.fillRect(i * (barWidth + 1), y + (waveHeight - height) / 2, barWidth, height);
        }
        
        ctx.globalAlpha = 1;
      }
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
   
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 2;
      
      const margin = 0; // 5% margin
      const safeWidth = preview.canvasWidth * (1 - margin * 2);
      const safeHeight = preview.canvasHeight * (1 - margin * 2);
      const safeX = preview.canvasWidth * margin;
      const safeY = preview.canvasHeight * margin;
      
      ctx.strokeRect(safeX, safeY, safeWidth, safeHeight);


  }, [
    preview,
    timeline.currentFrame,
    getActiveTracksAtFrame,
    loadingTracks,
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

      {/* No Content Message */}
      {tracks.length === 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          color: '#aaa',
          zIndex: 5,
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
            No Video Files Loaded
          </div>
          <div style={{ fontSize: '14px', maxWidth: '300px' }}>
            Click the "Import Files" button in the header to add video files and see them in the preview.
          </div>
        </div>
      )}

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

      {/* Loading Indicator */}
      {loadingTracks.size > 0 && (
        <div style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 10,
        }}>
          Loading {loadingTracks.size} track{loadingTracks.size > 1 ? 's' : ''}...
        </div>
      )}
    </div>
  );
}; 