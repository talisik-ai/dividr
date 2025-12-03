/**
 * React Hooks for Video Playback Diagnostics Integration
 *
 * These hooks integrate the VideoPlaybackDiagnostics module with React components
 * to automatically track video element events, segment transitions, and playback state.
 */

import { useEffect, useRef } from 'react';
import { VideoPlaybackDiagnostics } from '../utils/videoPlaybackAnalyticsGlobal';

/**
 * Hook to track video element events
 */
export function useVideoElementTracking(
  videoRef: React.RefObject<HTMLVideoElement>,
  trackId: string | undefined,
  sourceUrl: string | undefined,
  videoSlot?: 'A' | 'B' | 'single',
): void {
  const prevSourceRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Track source changes
    if (sourceUrl !== prevSourceRef.current) {
      VideoPlaybackDiagnostics.logVideoElementEvent({
        event: 'src_change',
        trackId,
        sourceUrl,
        videoCurrentTime: video.currentTime,
        videoReadyState: video.readyState,
        videoSlot,
        additionalInfo: {
          prevSource: prevSourceRef.current?.substring(0, 30),
        },
      });
      prevSourceRef.current = sourceUrl;
    }

    // Event handlers
    const handlers: Record<string, () => void> = {
      loadedmetadata: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'loadedmetadata',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
          additionalInfo: {
            duration: video.duration,
            dimensions: `${video.videoWidth}x${video.videoHeight}`,
          },
        });
      },
      canplay: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'canplay',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
      canplaythrough: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'canplaythrough',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
      error: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'error',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
          additionalInfo: {
            error: video.error?.message,
            code: video.error?.code,
          },
        });
      },
      seeking: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'seeking',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
      seeked: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'seeked',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
      playing: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'playing',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
      pause: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'pause',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
      waiting: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'waiting',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
      stalled: () => {
        VideoPlaybackDiagnostics.logVideoElementEvent({
          event: 'stalled',
          trackId,
          sourceUrl,
          videoCurrentTime: video.currentTime,
          videoReadyState: video.readyState,
          videoSlot,
        });
      },
    };

    // Add all event listeners
    Object.entries(handlers).forEach(([event, handler]) => {
      video.addEventListener(event, handler);
    });

    // Log mount
    VideoPlaybackDiagnostics.logVideoElementEvent({
      event: 'mount',
      trackId,
      sourceUrl,
      videoCurrentTime: video.currentTime,
      videoReadyState: video.readyState,
      videoSlot,
    });

    return () => {
      // Remove all event listeners
      Object.entries(handlers).forEach(([event, handler]) => {
        video.removeEventListener(event, handler);
      });

      // Log unmount
      VideoPlaybackDiagnostics.logVideoElementEvent({
        event: 'unmount',
        trackId,
        sourceUrl,
        videoCurrentTime: video.currentTime,
        videoReadyState: video.readyState,
        videoSlot,
      });
    };
  }, [videoRef, trackId, sourceUrl, videoSlot]);
}

/**
 * Hook to track segment transitions
 */
export function useSegmentTransitionTracking(
  activeTrackId: string | undefined,
  sourceUrl: string | undefined,
  currentFrame: number,
  isPlaying: boolean,
  videoRef: React.RefObject<HTMLVideoElement>,
  fps: number,
): void {
  const prevTrackIdRef = useRef<string | undefined>(undefined);
  const prevSourceUrlRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const video = videoRef.current;
    if (!activeTrackId) return;

    const isTrackChange =
      prevTrackIdRef.current !== undefined &&
      prevTrackIdRef.current !== activeTrackId;
    const isSourceChange =
      prevSourceUrlRef.current !== undefined &&
      prevSourceUrlRef.current !== sourceUrl;

    if (isTrackChange) {
      let transitionType: 'same-source' | 'cross-clip' | 'seek' = 'same-source';
      if (isSourceChange) {
        transitionType = 'cross-clip';
      } else if (!isPlaying) {
        transitionType = 'seek';
      }

      VideoPlaybackDiagnostics.logSegmentTransition({
        fromTrackId: prevTrackIdRef.current,
        toTrackId: activeTrackId,
        fromSourceUrl: prevSourceUrlRef.current,
        toSourceUrl: sourceUrl || '',
        isSameSource: !isSourceChange,
        isPlaying,
        videoCurrentTime: video?.currentTime || 0,
        expectedTime: currentFrame / fps,
        currentFrame,
        videoReadyState: video?.readyState || 0,
        transitionType,
      });
    }

    prevTrackIdRef.current = activeTrackId;
    prevSourceUrlRef.current = sourceUrl;
  }, [activeTrackId, sourceUrl, currentFrame, isPlaying, videoRef, fps]);
}

/**
 * Hook to update global playback state
 */
export function usePlaybackStateTracking(
  isPlaying: boolean,
  currentFrame: number,
  activeTrackId: string | undefined,
  sourceUrl: string | undefined,
  videoRef: React.RefObject<HTMLVideoElement>,
): void {
  useEffect(() => {
    const video = videoRef.current;

    VideoPlaybackDiagnostics.updateState({
      isPlaying,
      currentFrame,
      activeTrackId,
      activeSourceUrl: sourceUrl,
      videoReadyState: video?.readyState || 0,
      videoCurrentTime: video?.currentTime || 0,
      videoPaused: video?.paused ?? true,
    });
  }, [isPlaying, currentFrame, activeTrackId, sourceUrl, videoRef]);
}

/**
 * Hook to detect and log black frames during playback
 */
export function useBlackFrameDetection(
  videoRef: React.RefObject<HTMLVideoElement>,
  isPlaying: boolean,
  currentFrame: number,
  fps: number,
): void {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const frameCallbackRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !isPlaying) return;

    // Create canvas for frame analysis
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
      canvasRef.current.width = 32;
      canvasRef.current.height = 32;
      ctxRef.current = canvasRef.current.getContext('2d', {
        willReadFrequently: true,
      });
    }

    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!ctx) return;

    let lastCheckedFrame = -1;

    const checkFrame = (
      _now: DOMHighResTimeStamp,
      metadata: VideoFrameCallbackMetadata,
    ) => {
      if (!video || video.paused) return;

      const currentVideoFrame = Math.floor(metadata.mediaTime * fps);

      // Only check once per frame
      if (currentVideoFrame === lastCheckedFrame) {
        frameCallbackRef.current = video.requestVideoFrameCallback(checkFrame);
        return;
      }
      lastCheckedFrame = currentVideoFrame;

      try {
        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        // Calculate average brightness
        let totalBrightness = 0;
        for (let i = 0; i < data.length; i += 4) {
          totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
        }
        const avgBrightness = totalBrightness / (canvas.width * canvas.height);

        // Detect black frame (very low brightness)
        const isBlackFrame = avgBrightness < 5;

        // Log frame render event
        VideoPlaybackDiagnostics.logFrameRender({
          frame: currentFrame,
          expectedFrame: currentVideoFrame,
          videoMediaTime: metadata.mediaTime,
          videoCurrentTime: video.currentTime,
          isBlackFrame,
          avgBrightness,
          readyState: video.readyState,
        });
      } catch (e) {
        // Ignore canvas errors (cross-origin, etc.)
      }

      frameCallbackRef.current = video.requestVideoFrameCallback(checkFrame);
    };

    frameCallbackRef.current = video.requestVideoFrameCallback(checkFrame);

    return () => {
      if (frameCallbackRef.current && video) {
        video.cancelVideoFrameCallback(frameCallbackRef.current);
      }
    };
  }, [videoRef, isPlaying, currentFrame, fps]);
}
