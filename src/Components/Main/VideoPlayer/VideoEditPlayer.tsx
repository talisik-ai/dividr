import { Maximize, Minimize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import React, {
  forwardRef,
  SyntheticEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { VideoEditJob } from '../../../Schema/ffmpegConfig';

export interface VideoPlayerRef {
  play: () => void;
  pause: () => void;
  toggle: () => void;
  getCurrentTime: () => number;
  seekTo: (time: number) => void;
  isPlaying: () => boolean;
  getVolume: () => number;
  setVolume: (volume: number) => void;
  isMuted: () => boolean;
  mute: () => void;
  unmute: () => void;
  requestFullscreen: () => void;
  exitFullscreen: () => void;
  isFullscreen: () => boolean;
}

export interface VideoPlayerCallbacks {
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  onLoadedMetadata?: (duration: number, videoWidth: number, videoHeight: number) => void;
  onError?: (error: Error) => void;
  onVolumeChange?: (volume: number, muted: boolean) => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

interface VideoEditPlayerProps {
  // Core props
  videoSrc: string;
  editJob?: VideoEditJob;
  
  // Control props
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  volume?: number;
  playbackRate?: number;
  
  // UI props
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  className?: string;
  
  // Interaction props
  clickToPlay?: boolean;
  doubleClickToFullscreen?: boolean;
  showVolumeControls?: boolean;
  alwaysShowControls?: boolean;
  hideControlsWhenPointerDoesntMove?: boolean | number;
  
  // Preview props
  showPreviewEffects?: boolean;
  previewQuality?: 'low' | 'medium' | 'high';
  
  // Callbacks
  callbacks?: VideoPlayerCallbacks;
  
  // Error handling
  errorFallback?: (error: Error) => React.ReactNode;
  loadingFallback?: () => React.ReactNode;
}

const VideoEditPlayer = forwardRef<VideoPlayerRef, VideoEditPlayerProps>(({
  videoSrc,
  editJob,
  controls = true,
  autoPlay = false,
  loop = false,
  muted = false,
  volume = 1,
  playbackRate = 1,
  width = '100%',
  height = 'auto',
  style,
  className,
  clickToPlay = true,
  doubleClickToFullscreen = true,
  showVolumeControls = true,
  alwaysShowControls = false,
  hideControlsWhenPointerDoesntMove = true,
  showPreviewEffects = true,
  previewQuality = 'medium',
  callbacks,
  errorFallback,
  loadingFallback,
}, ref) => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(volume);
  const [videoMuted, setVideoMuted] = useState(muted);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(alwaysShowControls);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{
    width: number;
    height: number;
    aspectRatio: number;
  } | null>(null);

  // Debug effect
  useEffect(() => {
    console.log('🎬 VideoEditPlayer: Component mounted');
    console.log('🎬 VideoEditPlayer: videoSrc =', videoSrc);
    console.log('🎬 VideoEditPlayer: editJob =', editJob);
    
    return () => {
      console.log('🎬 VideoEditPlayer: Component unmounting');
    };
  }, []);

  // Debug video ref effect
  useEffect(() => {
    console.log('🎬 VideoEditPlayer: Video ref effect');
    const video = videoRef.current;
    if (video) {
      console.log('🎬 VideoEditPlayer: Video element found:', video);
      console.log('🎬 VideoEditPlayer: Video src:', video.src);
      console.log('🎬 VideoEditPlayer: Video readyState:', video.readyState);
    } else {
      console.log('🎬 VideoEditPlayer: Video element not found');
    }
  }, [videoRef.current]);

  // Helper function to convert time string to seconds
  const timeStringToSeconds = (timeString: string): number => {
    const parts = timeString.split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return parts[0] || 0;
  };

  // Calculate video transformations based on edit job
  const videoTransform = useMemo(() => {
    if (!editJob?.operations || !showPreviewEffects) return {};
    
    const transforms: React.CSSProperties = {};
    
    // Apply crop preview (simulate with CSS clipping)
    if (editJob.operations.crop) {
      const { width: cropW, height: cropH, x, y } = editJob.operations.crop;
      transforms.clipPath = `polygon(
        ${x}px ${y}px,
        ${x + cropW}px ${y}px,
        ${x + cropW}px ${y + cropH}px,
        ${x}px ${y + cropH}px
      )`;
    }
    
    // Apply aspect ratio preview
    if (editJob.operations.aspect) {
      const [w, h] = editJob.operations.aspect.split(':').map(Number);
      if (w && h) {
        transforms.aspectRatio = `${w}/${h}`;
      }
    }
    
    return transforms;
  }, [editJob, showPreviewEffects]);

  // Calculate trimmed time range
  const trimRange = useMemo(() => {
    if (!editJob?.operations.trim) return { start: 0, end: Infinity };
    
    const trim = editJob.operations.trim;
    const start = trim.start ? timeStringToSeconds(trim.start) : 0;
    
    let end = Infinity;
    if (trim.duration) {
      end = start + parseFloat(trim.duration);
    } else if (trim.end) {
      end = timeStringToSeconds(trim.end);
    }
    
    return { start, end };
  }, [editJob]);

  // Video event handlers
  const handleLoadedMetadata = useCallback(() => {
    console.log('🎬 VideoEditPlayer: loadedmetadata event fired');
    const video = videoRef.current;
    if (!video) {
      console.log('❌ VideoEditPlayer: No video ref available');
      return;
    }
    
    console.log(`🎬 VideoEditPlayer: Video metadata - Duration: ${video.duration}s, Size: ${video.videoWidth}x${video.videoHeight}`);
    
    setDuration(video.duration);
    setIsLoading(false);
    
    const metadata = {
      width: video.videoWidth,
      height: video.videoHeight,
      aspectRatio: video.videoWidth / video.videoHeight,
    };
    setVideoMetadata(metadata);
    
    callbacks?.onLoadedMetadata?.(video.duration, video.videoWidth, video.videoHeight);
    
    // Set initial volume
    video.volume = videoVolume;
    video.muted = videoMuted;
  }, [callbacks, videoVolume, videoMuted]);

  // Separate effect to handle trim start after metadata is loaded
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isLoading) return;
    
    if (trimRange.start > 0 && video.duration > 0) {
      console.log(`🎬 VideoEditPlayer: Setting start time to ${trimRange.start}s`);
      video.currentTime = trimRange.start;
    }
  }, [trimRange.start, isLoading]);

  const handleLoadedData = useCallback(() => {
    console.log('🎬 VideoEditPlayer: loadeddata event fired');
    setIsLoading(false);
  }, []);

  const handleCanPlay = useCallback(() => {
    console.log('🎬 VideoEditPlayer: canplay event fired');
    setIsLoading(false);
  }, []);

  const handleLoadStart = useCallback(() => {
    console.log('🎬 VideoEditPlayer: loadstart event fired');
    setIsLoading(true);
  }, []);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    let currentVideoTime = video.currentTime;
    
    // Handle trim end
    if (currentVideoTime >= trimRange.end) {
      if (loop) {
        video.currentTime = trimRange.start;
        currentVideoTime = trimRange.start;
      } else {
        video.pause();
        setIsPlaying(false);
        callbacks?.onEnded?.();
        return;
      }
    }
    
    setCurrentTime(currentVideoTime);
    callbacks?.onTimeUpdate?.(currentVideoTime, video.duration);
  }, [callbacks, trimRange, loop]);

  const handlePlay = useCallback(() => {
    setIsPlaying(true);
    callbacks?.onPlay?.();
  }, [callbacks]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    callbacks?.onPause?.();
  }, [callbacks]);

  const handleEnded = useCallback(() => {
    setIsPlaying(false);
    callbacks?.onEnded?.();
  }, [callbacks]);

  const handleError = useCallback((e: SyntheticEvent<HTMLVideoElement, Event>) => {
    const video = e.currentTarget;
    const error = new Error(`Video error: ${video.error?.message || 'Unknown error'}`);
    setError(error);
    callbacks?.onError?.(error);
  }, [callbacks]);

  const handleVolumeChange = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    setVideoVolume(video.volume);
    setVideoMuted(video.muted);
    callbacks?.onVolumeChange?.(video.volume, video.muted);
  }, [callbacks]);

  // Player controls
  const play = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    
    // Ensure we're within trim range
    if (video.currentTime < trimRange.start) {
      video.currentTime = trimRange.start;
    }
    
    video.play().catch(console.error);
  }, [trimRange.start]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  const seekTo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    // Clamp time to trim range
    const clampedTime = Math.max(trimRange.start, Math.min(trimRange.end, time));
    video.currentTime = clampedTime;
  }, [trimRange]);

  const setVolume = useCallback((vol: number) => {
    const video = videoRef.current;
    if (!video) return;
    
    const clampedVolume = Math.max(0, Math.min(1, vol));
    video.volume = clampedVolume;
  }, []);

  const mute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = true;
  }, []);

  const unmute = useCallback(() => {
    const video = videoRef.current;
    if (video) video.muted = false;
  }, []);

  // Fullscreen handlers
  const requestFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if ((container as any).webkitRequestFullscreen) {
      (container as any).webkitRequestFullscreen();
    }
  }, []);

  const exitFullscreen = useCallback(() => {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    }
  }, []);

  // Controls visibility
  const hideControlsTimeout = typeof hideControlsWhenPointerDoesntMove === 'number' 
    ? hideControlsWhenPointerDoesntMove 
    : 3000;

  const handleMouseMove = useCallback(() => {
    if (!hideControlsWhenPointerDoesntMove || alwaysShowControls) return;
    
    setShowControls(true);
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, hideControlsTimeout);
  }, [hideControlsWhenPointerDoesntMove, alwaysShowControls, isPlaying, hideControlsTimeout]);

  const handleMouseLeave = useCallback(() => {
    if (!hideControlsWhenPointerDoesntMove || alwaysShowControls) return;
    
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    if (isPlaying) {
      setShowControls(false);
    }
  }, [hideControlsWhenPointerDoesntMove, alwaysShowControls, isPlaying]);

  // Click handlers
  const handleVideoClick = useCallback((e: React.MouseEvent) => {
    if (!clickToPlay) return;
    e.preventDefault();
    toggle();
  }, [clickToPlay, toggle]);

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickRatio = clickX / rect.width;
    const seekTime = trimRange.start + clickRatio * (Math.min(trimRange.end, duration) - trimRange.start);
    seekTo(seekTime);
  };

  const handleVideoDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!doubleClickToFullscreen) return;
    e.preventDefault();
    
    if (isFullscreen) {
      exitFullscreen();
    } else {
      requestFullscreen();
    }
  }, [doubleClickToFullscreen, isFullscreen, requestFullscreen, exitFullscreen]);

  // Fullscreen detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreenNow = !!(
        document.fullscreenElement === containerRef.current ||
        (document as any).webkitFullscreenElement === containerRef.current
      );
      
      setIsFullscreen(isFullscreenNow);
      callbacks?.onFullscreenChange?.(isFullscreenNow);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [callbacks]);

  // Auto-play effect
  useEffect(() => {
    if (autoPlay && !isLoading) {
      play();
    }
  }, [autoPlay, isLoading, play]);

  // Cleanup controls timeout
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Imperative handle
  useImperativeHandle(ref, () => ({
    play,
    pause,
    toggle,
    getCurrentTime: () => currentTime,
    seekTo,
    isPlaying: () => isPlaying,
    getVolume: () => videoVolume,
    setVolume,
    isMuted: () => videoMuted,
    mute,
    unmute,
    requestFullscreen,
    exitFullscreen,
    isFullscreen: () => isFullscreen,
  }), [
    play, pause, toggle, currentTime, seekTo, isPlaying, videoVolume, setVolume,
    videoMuted, mute, unmute, requestFullscreen, exitFullscreen, isFullscreen
  ]);

  // Calculate container styles
  const containerStyle = useMemo(() => ({
    width,
    height,
    position: 'relative' as const,
    backgroundColor: '#000',
    borderRadius: '8px',
    overflow: 'hidden',
    ...style,
  }), [width, height, style]);

  // Calculate video styles
  const videoStyle = useMemo(() => ({
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    ...videoTransform,
  }), [videoTransform]);

  // Format time for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Error fallback
  if (error) {
    if (errorFallback) {
      return <div style={containerStyle}>{errorFallback(error)}</div>;
    }
    return (
      <div style={containerStyle} className={`${className} flex items-center justify-center`}>
        <div className="text-red-400 text-center">
          <div className="text-lg font-semibold mb-2">Video Error</div>
          <div className="text-sm text-gray-300">{error.message}</div>
        </div>
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const trimmedDuration = Math.min(trimRange.end, duration) - trimRange.start;
  const trimmedProgress = trimmedDuration > 0 
    ? ((currentTime - trimRange.start) / trimmedDuration) * 100 
    : 0;

  return (
    <div
      ref={containerRef}
      style={containerStyle}
      className={className}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Video element - ALWAYS render so events can fire */}
      <video
        ref={videoRef}
        src={videoSrc}
        style={videoStyle}
        onClick={handleVideoClick}
        onDoubleClick={handleVideoDoubleClick}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        onError={handleError}
        onVolumeChange={handleVolumeChange}
        muted={videoMuted}
        playsInline
        preload="metadata"
        onLoadedData={handleLoadedData}
        onCanPlay={handleCanPlay}
        onLoadStart={handleLoadStart}
      />

      {/* Loading overlay - shown on top when loading */}
      {isLoading && (
        <div 
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10
          }}
        >
          {loadingFallback ? loadingFallback() : (
            <div className="text-white text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <div className="text-sm color-white">Loading video...</div>
            </div>
          )}
        </div>
      )}

      {/* Canvas for advanced effects (future use) */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0, // Hidden for now, can be used for real-time effects
        }}
      />

      {/* Controls */}
      {controls && (
        <div
          className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${
            showControls || alwaysShowControls ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {/* Progress bar */}
          <div className="mb-3">
            <div className="w-full bg-gray-600 rounded-full h-1 cursor-pointer"   onClick={handleProgressClick}
            >
              <div
                className="bg-blue-500 h-1 rounded-full transition-all duration-150"
                style={{ width: `${editJob?.operations.trim ? trimmedProgress : progress}%` }}
              />
            </div>
          </div>

          {/* Control buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {/* Play/Pause */}
              <button
                onClick={toggle}
                className="text-white hover:text-blue-400 transition-colors p-1"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>

              {/* Time display */}
              <div className="text-white text-sm font-mono">
                {formatTime(currentTime)} / {formatTime(editJob?.operations.trim ? trimmedDuration : duration)}
              </div>

              {/* Edit job indicator */}
              {editJob && showPreviewEffects && (
                <div className="text-xs text-blue-400 bg-blue-400/20 px-2 py-1 rounded">
                  Preview Mode
                </div>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {/* Volume controls */}
              {showVolumeControls && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={videoMuted ? unmute : mute}
                    className="text-white hover:text-blue-400 transition-colors p-1"
                  >
                    {videoMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={videoMuted ? 0 : videoVolume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              )}

              {/* Fullscreen */}
              <button
                onClick={isFullscreen ? exitFullscreen : requestFullscreen}
                className="text-white hover:text-blue-400 transition-colors p-1"
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

VideoEditPlayer.displayName = 'VideoEditPlayer';

export default VideoEditPlayer; 