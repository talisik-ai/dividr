/* eslint-disable prettier/prettier */  
import { motion } from 'framer-motion';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { FaSquarePlus } from 'react-icons/fa6';
import { useVideoEditorStore } from '../../../store/VideoEditorStore';
  
// Custom debounce and throttle utilities to avoid external dependencies  
const debounce = <T extends (...args: unknown[]) => unknown>(  
  func: T,  
  wait: number,  
): ((...args: Parameters<T>) => void) => {  
  let timeout: NodeJS.Timeout | null = null;  
  return (...args: Parameters<T>) => {  
    if (timeout) clearTimeout(timeout);  
    timeout = setTimeout(() => func(...args), wait);  
  };  
};  
  
const throttle = <T extends (...args: unknown[]) => unknown>(  
  func: T,  
  limit: number,  
): ((...args: Parameters<T>) => void) => {  
  let inThrottle: boolean;  
  return (...args: Parameters<T>) => {  
    if (!inThrottle) {  
      func(...args);  
      inThrottle = true;  
      setTimeout(() => (inThrottle = false), limit);  
    }  
  };  
};  
  
interface VideoPreviewProps {  
  className?: string;  
}  
  
interface VideoElement {  
  id: string;  
  element: HTMLVideoElement;  
  isLoaded: boolean;  
  isBuffering: boolean;  
  lastSeekTime: number | null;  
}  
  
// Remotion-inspired media time calculation  
const calculateMediaTime = (  
  currentFrame: number,  
  startFrame: number,  
  fps: number,  
  playbackRate: number,  
) => {  
  const framesSinceStart = currentFrame - startFrame;  
  const expectedFrame = framesSinceStart * playbackRate;  
  return (expectedFrame * (1000 / fps)) / 1000;  
};  
  
// Remotion-inspired seeking logic  
const shouldSeek = (  
  currentTime: number,  
  targetTime: number,  
  isPlaying: boolean,  
) => {  
  const seekThreshold = isPlaying ? 0.15 : 0.01;  
  const timeDiff = Math.abs(currentTime - targetTime);  
  return timeDiff > seekThreshold && timeDiff < 3; // Don't seek if too far apart  
};  
  
export const VideoPreview: React.FC<VideoPreviewProps> = ({ className }) => {  
  const canvasRef = useRef<HTMLCanvasElement>(null);  
  const containerRef = useRef<HTMLDivElement>(null);  
  const videoElementsRef = useRef<Map<string, VideoElement>>(new Map());  
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });  
  const [loadingTracks, setLoadingTracks] = useState<Set<string>>(new Set());  
  const [bufferingTracks, setBufferingTracks] = useState<Set<string>>(  
    new Set(),  
  );  
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);  
  const renderFrameRef = useRef<number>(0);  
  
  const { preview, timeline, tracks, setPreviewScale, playback } =  
    useVideoEditorStore();  
  
  // Enhanced container size management with better responsiveness
  useEffect(() => {  
    const updateSize = () => {  
      if (containerRef.current) {  
        const { clientWidth, clientHeight } = containerRef.current;  
        const newSize = { width: clientWidth, height: clientHeight };
        
        // Only update if size has meaningfully changed (avoid micro-updates)
        setContainerSize(prevSize => {
          const widthDiff = Math.abs(prevSize.width - newSize.width);
          const heightDiff = Math.abs(prevSize.height - newSize.height);
          
          if (widthDiff > 5 || heightDiff > 5) {
            return newSize;
          }
          return prevSize;
        });
      }  
    };  
  
    const debouncedUpdateSize = debounce(updateSize, 100); // Increased debounce for stability
  
    let resizeObserver: ResizeObserver | null = null;  
    updateSize();  
  
    if (containerRef.current && window.ResizeObserver) {  
      resizeObserver = new ResizeObserver(debouncedUpdateSize);
      resizeObserver.observe(containerRef.current);  
    } else {  
      window.addEventListener('resize', debouncedUpdateSize);  
    }  
  
    const handleVisibilityChange = () => {  
      if (!document.hidden) {  
        setTimeout(updateSize, 100);  
      }  
    };  
  
    document.addEventListener('visibilitychange', handleVisibilityChange);  
  
    return () => {  
      if (resizeTimeoutRef.current) {  
        clearTimeout(resizeTimeoutRef.current);  
      }  
      if (resizeObserver) {  
        resizeObserver.disconnect();  
      } else {  
        window.removeEventListener('resize', debouncedUpdateSize);  
      }  
      document.removeEventListener('visibilitychange', handleVisibilityChange);  
    };  
  }, []);  
  
  const calculateContentScale = useCallback(() => {  
    if (!containerSize.width || !containerSize.height)  
      return { scaleX: 1, scaleY: 1, actualWidth: preview.canvasWidth, actualHeight: preview.canvasHeight };  
  
    // Calculate scale to fit content within container while maintaining aspect ratio
    const scaleX = containerSize.width / preview.canvasWidth;  
    const scaleY = containerSize.height / preview.canvasHeight;  
    const scale = Math.min(scaleX, scaleY); // Use uniform scale to maintain aspect ratio
    
    const actualWidth = preview.canvasWidth * scale;
    const actualHeight = preview.canvasHeight * scale;
    
    return { 
      scaleX: scale, 
      scaleY: scale, 
      actualWidth,
      actualHeight
    };  
  }, [containerSize, preview.canvasWidth, preview.canvasHeight]);  
  
  const handleWheel = useCallback(  
    (e: WheelEvent) => {  
      if (e.ctrlKey || e.metaKey) {  
        e.preventDefault();  
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;  
        setPreviewScale(  
          Math.max(0.1, Math.min(preview.previewScale * zoomFactor, 5)),  
        );  
      }  
    },  
    [preview.previewScale, setPreviewScale],  
  );  
  
  useEffect(() => {  
    const canvas = canvasRef.current;  
    if (canvas) {  
      canvas.addEventListener('wheel', handleWheel, { passive: false });  
      return () => canvas.removeEventListener('wheel', handleWheel);  
    }  
  }, [handleWheel]);  
  
  // Enhanced video element management with proper cleanup and memory management  
  useEffect(() => {  
    const videoElements = videoElementsRef.current;  
    const currentTrackIds = new Set(tracks.map((track) => track.id));  
  
    // Remove video elements for tracks that no longer exist with proper cleanup  
    for (const [trackId, videoElement] of videoElements.entries()) {  
      if (!currentTrackIds.has(trackId)) {  
        // Proper cleanup to prevent memory leaks  
        try {  
          videoElement.element.pause();  
          videoElement.element.src = '';  
          videoElement.element.load(); // Force cleanup  
          videoElement.element.remove();  
        } catch (error) {  
          console.warn(`⚠️ Error cleaning up video element ${trackId}:`, error);  
        }  
        videoElements.delete(trackId);  
  
        // Update loading/buffering state  
        setLoadingTracks((prev) => {  
          const newSet = new Set(prev);  
          newSet.delete(trackId);  
          return newSet;  
        });  
        setBufferingTracks((prev) => {  
          const newSet = new Set(prev);  
          newSet.delete(trackId);  
          return newSet;  
        });  
      }  
    }  
  
    // Create video elements for new video/image tracks  
    tracks.forEach((track) => {  
      if (  
        (track.type === 'video' || track.type === 'image') &&  
        !videoElements.has(track.id) &&  
        track.previewUrl  
      ) {  
        const videoElement = document.createElement('video');  
        videoElement.style.display = 'none';  
        videoElement.muted = false;  
        videoElement.preload = 'metadata';  
        videoElement.crossOrigin = 'anonymous';  
        videoElement.volume = 0.8;  
  
        // Enhanced loading handlers with buffering state  
        const handleLoadedData = () => {  
          videoElements.set(track.id, {  
            id: track.id,  
            element: videoElement,  
            isLoaded: true,  
            isBuffering: false,  
            lastSeekTime: null,  
          });  
          setLoadingTracks((prev) => {  
            const newSet = new Set(prev);  
            newSet.delete(track.id);  
            return newSet;  
          });  
  
         // console.log(`✅ Video loaded: ${track.name}`);  
        };  
  
        const handleError = (e: Event) => {  
       //   console.error(`❌ Failed to load: ${track.name}`);  
          setLoadingTracks((prev) => {  
            const newSet = new Set(prev);  
            newSet.delete(track.id);  
            return newSet;  
          });  
          setBufferingTracks((prev) => {  
            const newSet = new Set(prev);  
            newSet.delete(track.id);  
            return newSet;  
          });  
        };  
  
        // Add buffering event listeners  
        const handleWaiting = () => {  
       //   console.log(`⏳ Video ${track.name} started buffering`);  
          setBufferingTracks((prev) => new Set(prev).add(track.id));  
        };  
  
        const handleCanPlay = () => {  
      //    console.log(`▶️ Video ${track.name} can play`);  
          setBufferingTracks((prev) => {  
            const newSet = new Set(prev);  
            newSet.delete(track.id);  
            return newSet;  
          });  
        };  
  
        const handleLoadedMetadata = () => {  
        //  console.log(`📊 Video ${track.name} metadata loaded`);  
          setBufferingTracks((prev) => {  
            const newSet = new Set(prev);  
            newSet.delete(track.id);  
            return newSet;  
          });  
        };  
  
        videoElement.addEventListener('loadeddata', handleLoadedData);  
        videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);  
        videoElement.addEventListener('error', handleError);  
        videoElement.addEventListener('waiting', handleWaiting);  
        videoElement.addEventListener('canplay', handleCanPlay);  
  
        setLoadingTracks((prev) => new Set(prev).add(track.id));  
        videoElement.src = track.previewUrl;  
        document.body.appendChild(videoElement);  
  
        videoElements.set(track.id, {  
          id: track.id,  
          element: videoElement,  
          isLoaded: false,  
          isBuffering: false,  
          lastSeekTime: null,  
        });  
      }  
    });  
  
    return () => {  
      for (const videoElement of videoElements.values()) {  
        videoElement.element.remove();  
      }  
      videoElements.clear();  
    };  
  }, [tracks]);  
  
  const getActiveTracksAtFrame = useCallback(  
    (frame: number) => {  
      const activeTracks = tracks.filter(  
        (track) =>  
          track.visible && frame >= track.startFrame && frame < track.endFrame,  
      );  
        
      // Debug logging for active tracks  
      activeTracks.forEach((track) => {  
        if (track.type === 'video') {  
      //    console.log(`Track ${track.name}: visible=${track.visible}, frame=${frame}, start=${track.startFrame}, end=${track.endFrame}, active=true`);  
        }  
      });  
        
      return activeTracks;  
    },  
    [tracks],  
  );  
  
  // Simplified video synchronization - remove debouncing for debugging  
  useEffect(() => {  
    const videoElements = videoElementsRef.current;  
  
    tracks.forEach((track) => {  
      const videoElement = videoElements.get(track.id);  
      if (videoElement && videoElement.isLoaded) {  
        const targetTime = calculateMediaTime(  
          timeline.currentFrame,  
          track.startFrame,  
          timeline.fps,  
          playback.playbackRate,  
        );  
  
        const isTrackActive =  
          track.visible &&  
          timeline.currentFrame >= track.startFrame &&  
          timeline.currentFrame < track.endFrame;  
  
        if (  
          isTrackActive &&  
          targetTime >= 0 &&  
          targetTime <= track.duration / timeline.fps  
        ) {  
          // Simplified seeking - remove complex logic for debugging  
          if (Math.abs(videoElement.element.currentTime - targetTime) > 0.1) {  
            videoElement.element.currentTime = targetTime;  
          }  
        }  
      }  
    });  
  }, [timeline.currentFrame, timeline.fps, playback.playbackRate, tracks]);  
  
  // Enhanced playback synchronization with buffering awareness  
  useEffect(() => {  
    const videoElements = videoElementsRef.current;  
    const anyBuffering = bufferingTracks.size > 0;  
  
    tracks.forEach((track) => {  
      const videoElement = videoElements.get(track.id);  
      if (videoElement && videoElement.isLoaded) {  
        const isTrackActive =  
          track.visible &&  
          timeline.currentFrame >= track.startFrame &&  
          timeline.currentFrame < track.endFrame;  
  
        // Don't play if any video is buffering (Remotion-inspired behavior)  
        if (isTrackActive && playback.isPlaying && !anyBuffering) {  
          videoElement.element.play().catch((e) => {  
           // console.log('Autoplay prevented for', track.name);  
          });  
        } else {  
          videoElement.element.pause();  
        }  
  
        // Sync volume and playback rate  
        videoElement.element.volume = playback.muted  
          ? 0  
          : playback.volume * 0.8;  
        videoElement.element.muted = playback.muted;  
        videoElement.element.playbackRate = playback.playbackRate;  
      }  
    });  
  }, [  
    timeline.currentFrame,  
    timeline.fps,  
    tracks,  
    playback.isPlaying,  
    playback.volume,  
    playback.muted,  
    playback.playbackRate,  
    bufferingTracks.size,  
  ]);  
  
  // Simplified rendering with detailed debugging  
  const renderFrame = useCallback(() => {  
    const canvas = canvasRef.current;  
    if (!canvas) return;  
  
    const ctx = canvas.getContext('2d', {  
      alpha: false, // Disable alpha for better performance  
      desynchronized: true, // Allow async rendering  
    });  
    if (!ctx) return;  
  
    try {  
      const { scaleX, scaleY, actualWidth, actualHeight } = calculateContentScale();
      
      // Use actual scaled dimensions for canvas
      const canvasWidth = Math.max(actualWidth || preview.canvasWidth, 100); // Minimum size
      const canvasHeight = Math.max(actualHeight || preview.canvasHeight, 100);
  
      // Only resize canvas when necessary to avoid GPU resets  
      if (  
        Math.abs(canvas.width - canvasWidth) > 10 ||  
        Math.abs(canvas.height - canvasHeight) > 10  
      ) {  
        canvas.width = canvasWidth;  
        canvas.height = canvasHeight;  
      }  
  
      ctx.save();  
      
      // Clear entire canvas first
      ctx.fillStyle = preview.backgroundColor;  
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Center the content and apply scale
      const offsetX = (canvas.width - actualWidth) / 2;
      const offsetY = (canvas.height - actualHeight) / 2;
      ctx.translate(offsetX, offsetY);
      ctx.scale(scaleX, scaleY);  
  
      const activeTracks = getActiveTracksAtFrame(timeline.currentFrame);  
      const videoElements = videoElementsRef.current;  
      let successfulDraws = 0;  
      let failedDraws = 0;  
  
             activeTracks.forEach((track) => {  
         if (track.type === 'video' || track.type === 'image') {  
           const videoElement = videoElements.get(track.id);  
           const width = track.width || preview.canvasWidth;
           const height = track.height || preview.canvasHeight;
           const x = track.offsetX || (preview.canvasWidth - width) / 2;
           const y = track.offsetY || (preview.canvasHeight - height) / 2;

           // Debug logging for each track
          // console.log(`🎬 Processing track: ${track.name}, type: ${track.type}, videoElement exists: ${!!videoElement}`);

           if (!videoElement) {
           //  console.warn(`⚠️ No video element found for track: ${track.name}`);
             // Draw placeholder for missing video element
             ctx.fillStyle = track.color || '#666666';
             ctx.globalAlpha = 0.7;
             ctx.fillRect(x, y, width, height);
             ctx.globalAlpha = 1.0;
             return;
           }

           // More detailed logging about video element state
           /*console.log(`📊 Video element state for ${track.name}:`, {
             isLoaded: videoElement.isLoaded,
             isBuffering: videoElement.isBuffering,
             readyState: videoElement.element.readyState,
             videoWidth: videoElement.element.videoWidth,
             videoHeight: videoElement.element.videoHeight,
             currentTime: videoElement.element.currentTime,
             duration: videoElement.element.duration
           });
           */
           // Simplified rendering conditions for debugging
           if (videoElement && videoElement.isLoaded) {
             const video = videoElement.element;

             try {
               // Very permissive conditions - just try to draw if we have a video element
               if (video.readyState >= 1) {
                 ctx.drawImage(video, x, y, width, height);
                 successfulDraws++;
              //   console.log(`✅ Successfully drew ${track.name}`);
               } else {
                 // Video not ready, draw placeholder
                 ctx.fillStyle = track.color || '#444444';
                 ctx.globalAlpha = 0.6;
                 ctx.fillRect(x, y, width, height);
                 ctx.globalAlpha = 1.0;
              //   console.log(`⏳ Video ${track.name} not ready, readyState: ${video.readyState}`);
               }
             } catch (error) {
               failedDraws++;
               // Fallback rendering with error recovery
               ctx.fillStyle = track.color || '#ff4444';
               ctx.globalAlpha = 0.5;
               ctx.fillRect(x, y, width, height);
               ctx.globalAlpha = 1.0;
             //  console.warn(`⚠️ Draw failed for ${track.name}:`, error);
             }
           } else {
             // Video element exists but not loaded
             ctx.fillStyle = track.color || '#333333';
             ctx.globalAlpha = 0.5;
             ctx.fillRect(x, y, width, height);
             ctx.globalAlpha = 1.0;
             
             const loadStatus = videoElement ? 
               `isLoaded: ${videoElement.isLoaded}, isBuffering: ${videoElement.isBuffering}` : 
               'no video element';
          //   console.log(`⏳ Video ${track.name} loading... ${loadStatus}`);
           }
         }
       });

       ctx.restore();

       // Performance monitoring with detailed logging
   //    console.log(`🎬 Render stats: ${successfulDraws} successful, ${failedDraws} failed, ${activeTracks.length} active tracks`);
       
       if (failedDraws > successfulDraws && activeTracks.length > 0) {
         console.warn(
           `🚨 High failure rate: ${failedDraws}/${failedDraws + successfulDraws} draws failed`,
         );
       }
       
       if (activeTracks.length > 0 && successfulDraws === 0) {
         console.error('🚨 No videos rendered successfully! Check video loading and track states.');
       }
     } catch (error) {
       console.error('🚨 Critical rendering error:', error);
       // Emergency cleanup
       try {
         ctx?.clearRect(0, 0, canvas.width, canvas.height);
       } catch (e) {
         console.error('Failed to clear canvas:', e);
       }
     }
   }, [
     containerSize,
     preview,
     timeline.currentFrame,
     calculateContentScale,
     getActiveTracksAtFrame,
   ]);

   // Simplified render function without throttling for debugging
   const renderFrameSimple = useCallback(() => {
     renderFrame();
   }, [renderFrame]);

   // Simple animation loop for debugging
   useEffect(() => {
     let isAnimating = true;

     const animate = () => {
       if (!isAnimating) return;
       
       try {
         renderFrameSimple();
       } catch (error) {
         console.error('🚨 Animation frame error:', error);
       }
       
       renderFrameRef.current = requestAnimationFrame(animate);
     };

     renderFrameRef.current = requestAnimationFrame(animate);

     return () => {
       isAnimating = false;
       if (renderFrameRef.current) {
         cancelAnimationFrame(renderFrameRef.current);
       }
     };
   }, [renderFrameSimple]);

   return (
     <div
       ref={containerRef}
       className={`relative overflow-hidden w-full h-full min-h-0 flex items-center justify-center ${className || ''}`}
     >
       <canvas
         ref={canvasRef}
         className="max-w-full max-h-full object-contain"
         style={{
           transform: `scale(${preview.previewScale})`,
           transformOrigin: 'center'
         }}
       />

       {/* Loading indicator */}
       {loadingTracks.size > 0 && (
         <div className="absolute top-4 right-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded text-sm">
           Loading {loadingTracks.size} track{loadingTracks.size > 1 ? 's' : ''}...
         </div>
       )}

       {/* Buffering indicator */}
       {bufferingTracks.size > 0 && (
         <div className="absolute top-4 left-4 bg-yellow-600 bg-opacity-75 text-white px-3 py-1 rounded text-sm">
           Buffering {bufferingTracks.size} track{bufferingTracks.size > 1 ? 's' : ''}...
         </div>
       )}

       {/* Debug info
       <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-3 py-1 rounded text-xs">
         Tracks: {tracks.length} | Active: {getActiveTracksAtFrame(timeline.currentFrame).length} | Frame: {timeline.currentFrame}
       </div>
 */}
       {/* Add media button when no tracks */}
       {tracks.length === 0 && (
         <motion.div
           initial={{ opacity: 0, scale: 0.9 }}
           animate={{ opacity: 1, scale: 1 }}
           className="absolute inset-0 flex items-center justify-center"
         >
           <div className="text-center text-gray-400 p-4">
             <FaSquarePlus className="mx-auto mb-4 text-3xl lg:text-5xl" />
             <p className="mx-auto text-sm md:text-md lg:text-lg">Drop media files here or click to add</p>
           </div>
         </motion.div>
       )}
     </div>
   );
}; 