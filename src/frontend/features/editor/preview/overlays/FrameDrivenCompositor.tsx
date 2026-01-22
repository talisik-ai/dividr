/**
 * FrameDrivenCompositor - Canvas-based video compositor for multi-layer playback.
 *
 * Key features:
 * - One video element per clip (handles same-source overlaps)
 * - Per-layer frame hold prevents black frames during buffering
 * - Continuous compositing during playback via rAF loop
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { VideoTrack } from '../../stores/videoEditor/index';
import {
  FrameRequest,
  getVideoSource,
  hasVisibleClipsAtFrame,
  resolveFrameRequests,
} from '../services/FrameResolver';

export interface FrameDrivenCompositorRef {
  getCanvas: () => HTMLCanvasElement | null;
  forceRender: () => void;
  getStats: () => CompositorStats;
}

export interface CompositorStats {
  lastRenderTime: number;
  framesRendered: number;
  fallbacksUsed: number;
}

export interface FrameDrivenCompositorProps {
  tracks: VideoTrack[];
  currentFrame: number;
  fps: number;
  isPlaying: boolean;
  playbackRate: number;
  width: number;
  height: number;
  baseVideoWidth: number;
  baseVideoHeight: number;
  onFrameRendered?: (frame: number) => void;
  className?: string;
}

const SEEK_TOLERANCE_SCRUBBING = 0.05;
const SEEK_TOLERANCE_PLAYBACK = 0.25;

interface ManagedVideo {
  element: HTMLVideoElement;
  clipId: string;
  sourceUrl: string;
  isReady: boolean;
  lastSeekTime: number;
  lastDrawnFrame: ImageBitmap | null;
}

export const FrameDrivenCompositor = forwardRef<
  FrameDrivenCompositorRef,
  FrameDrivenCompositorProps
>(
  (
    {
      tracks,
      currentFrame,
      fps,
      isPlaying,
      playbackRate,
      width,
      height,
      baseVideoWidth,
      baseVideoHeight,
      onFrameRendered,
      className,
    },
    ref,
  ) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const lastRenderedFrameRef = useRef<number>(-1);
    const videosRef = useRef<Map<string, ManagedVideo>>(new Map());
    const lastCanvasStateRef = useRef<ImageData | null>(null);
    const statsRef = useRef<CompositorStats>({
      lastRenderTime: 0,
      framesRendered: 0,
      fallbacksUsed: 0,
    });
    const prevIsPlayingRef = useRef<boolean>(isPlaying);
    const prevFrameRef = useRef<number>(currentFrame);

    const videoTracks = useMemo(
      () => tracks.filter((t) => t.type === 'video' && t.visible),
      [tracks],
    );

    // Canvas setup
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.width = width;
      canvas.height = height;
      ctxRef.current = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });

      return () => {
        ctxRef.current = null;
      };
    }, [width, height]);

    // Video element management
    const getOrCreateVideoForClip = useCallback(
      (clipId: string, sourceUrl: string): ManagedVideo => {
        let managed = videosRef.current.get(clipId);

        if (managed) {
          if (managed.sourceUrl !== sourceUrl) {
            managed.element.src = sourceUrl;
            managed.sourceUrl = sourceUrl;
            managed.isReady = false;
          }
          return managed;
        }

        const video = document.createElement('video');
        video.crossOrigin = 'anonymous';
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.src = sourceUrl;

        managed = {
          element: video,
          clipId,
          sourceUrl,
          isReady: false,
          lastSeekTime: -1,
          lastDrawnFrame: null,
        };

        const onReady = () => {
          const m = videosRef.current.get(clipId);
          if (m) {
            m.isReady = true;
            if (!isPlayingRef.current) {
              compositeFrameRef.current(currentFrameRef.current, false);
            }
          }
        };

        video.addEventListener('canplay', onReady);
        video.addEventListener('loadeddata', onReady);
        video.addEventListener('playing', onReady);
        video.addEventListener('waiting', () => {
          const m = videosRef.current.get(clipId);
          if (m) m.isReady = false;
        });

        videosRef.current.set(clipId, managed);
        return managed;
      },
      [],
    );

    // Sync video elements with tracks
    useEffect(() => {
      const activeClipIds = new Set<string>();

      for (const track of videoTracks) {
        const url = getVideoSource(track);
        if (url) {
          activeClipIds.add(track.id);
          getOrCreateVideoForClip(track.id, url);
        }
      }

      videosRef.current.forEach((managed, clipId) => {
        if (!activeClipIds.has(clipId)) {
          managed.element.pause();
          managed.element.src = '';
          managed.element.load();
          managed.lastDrawnFrame?.close();
          videosRef.current.delete(clipId);
        }
      });
    }, [videoTracks, getOrCreateVideoForClip]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
        videosRef.current.forEach((managed) => {
          managed.element.pause();
          managed.element.src = '';
          managed.element.load();
          managed.lastDrawnFrame?.close();
        });
        videosRef.current.clear();
      };
    }, []);

    // Draw video frame with per-layer fallback
    const drawVideoFrame = useCallback(
      (
        ctx: CanvasRenderingContext2D,
        managed: ManagedVideo,
        request: FrameRequest,
        canvasWidth: number,
        canvasHeight: number,
      ): boolean => {
        const video = managed.element;
        const { transform, opacity } = request;

        const scaleX = canvasWidth / baseVideoWidth;
        const scaleY = canvasHeight / baseVideoHeight;
        const scale = Math.min(scaleX, scaleY);

        // Validate transform values to prevent NaN/Infinity breaking canvas state
        const safeScale = Number.isFinite(transform.scale)
          ? transform.scale
          : 1;
        const safeWidth = Number.isFinite(transform.width)
          ? transform.width
          : baseVideoWidth;
        const safeHeight = Number.isFinite(transform.height)
          ? transform.height
          : baseVideoHeight;
        const safeX = Number.isFinite(transform.x) ? transform.x : 0;
        const safeY = Number.isFinite(transform.y) ? transform.y : 0;
        const safeRotation = Number.isFinite(transform.rotation)
          ? transform.rotation
          : 0;
        const safeOpacity = Number.isFinite(opacity)
          ? Math.max(0, Math.min(1, opacity))
          : 1;

        const drawWidth = safeWidth * scale * safeScale;
        const drawHeight = safeHeight * scale * safeScale;
        const centerX = canvasWidth / 2;
        const centerY = canvasHeight / 2;
        const offsetX = safeX * (canvasWidth / 2);
        const offsetY = safeY * (canvasHeight / 2);
        const drawX = centerX + offsetX - drawWidth / 2;
        const drawY = centerY + offsetY - drawHeight / 2;

        ctx.save();
        ctx.globalAlpha = safeOpacity;

        if (safeRotation !== 0) {
          const rotationCenterX = drawX + drawWidth / 2;
          const rotationCenterY = drawY + drawHeight / 2;
          ctx.translate(rotationCenterX, rotationCenterY);
          ctx.rotate((safeRotation * Math.PI) / 180);
          ctx.translate(-rotationCenterX, -rotationCenterY);
        }

        // Try drawing from video
        if (video.readyState >= 2) {
          try {
            ctx.drawImage(video, drawX, drawY, drawWidth, drawHeight);
            ctx.restore();

            // Capture frame for fallback (async, non-blocking)
            createImageBitmap(video)
              .then((bitmap) => {
                managed.lastDrawnFrame?.close();
                managed.lastDrawnFrame = bitmap;
              })
              .catch(() => {
                // Ignore bitmap creation errors
              });

            return true;
          } catch {
            // Fall through to fallback
          }
        }

        // Fallback: use last drawn frame
        if (managed.lastDrawnFrame) {
          try {
            ctx.drawImage(
              managed.lastDrawnFrame,
              drawX,
              drawY,
              drawWidth,
              drawHeight,
            );
            ctx.restore();
            return true;
          } catch {
            // Fallback failed
          }
        }

        ctx.restore();
        return false;
      },
      [baseVideoWidth, baseVideoHeight],
    );

    // Main composite function
    const compositeFrame = useCallback(
      (frameNumber: number, forceSync = false): boolean => {
        const ctx = ctxRef.current;
        const canvas = canvasRef.current;
        if (!ctx || !canvas) return false;

        const startTime = performance.now();
        const requests = resolveFrameRequests(frameNumber, tracks, fps);
        const hasClips = hasVisibleClipsAtFrame(frameNumber, tracks);

        if (!hasClips) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          lastCanvasStateRef.current = null;
          return true;
        }

        const seekTolerance = isPlaying
          ? SEEK_TOLERANCE_PLAYBACK
          : SEEK_TOLERANCE_SCRUBBING;

        // Sync video elements
        for (const request of requests) {
          const managed = getOrCreateVideoForClip(
            request.clipId,
            request.sourceUrl,
          );
          const video = managed.element;
          const targetTime = request.sourceTime;
          const diff = Math.abs(video.currentTime - targetTime);

          if ((forceSync || diff > seekTolerance) && video.readyState >= 1) {
            video.currentTime = targetTime;
            managed.lastSeekTime = targetTime;
          }

          if (video.playbackRate !== playbackRate) {
            video.playbackRate = playbackRate;
          }

          if (isPlaying) {
            if (video.paused && video.readyState >= 2) {
              video.play().catch(() => {
                // Ignore autoplay errors
              });
            }
          } else {
            if (!video.paused) {
              video.pause();
            }
          }
        }

        // Pause inactive videos
        videosRef.current.forEach((managed, clipId) => {
          const isActive = requests.some((r) => r.clipId === clipId);
          if (!isActive && !managed.element.paused) {
            managed.element.pause();
          }
        });

        // Clear and composite
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let renderedAny = false;
        for (const request of requests) {
          const managed = videosRef.current.get(request.clipId);
          if (!managed) continue;

          if (
            drawVideoFrame(ctx, managed, request, canvas.width, canvas.height)
          ) {
            renderedAny = true;
          }
        }

        // Global fallback
        if (!renderedAny && hasClips && lastCanvasStateRef.current) {
          ctx.putImageData(lastCanvasStateRef.current, 0, 0);
          statsRef.current.fallbacksUsed++;
          return true;
        }

        if (renderedAny) {
          try {
            lastCanvasStateRef.current = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height,
            );
          } catch {
            // Ignore
          }
        }

        statsRef.current.lastRenderTime = performance.now() - startTime;
        statsRef.current.framesRendered++;
        return renderedAny;
      },
      [
        tracks,
        fps,
        isPlaying,
        playbackRate,
        drawVideoFrame,
        getOrCreateVideoForClip,
      ],
    );

    // Refs for rAF closure
    const currentFrameRef = useRef<number>(currentFrame);
    const isPlayingRef = useRef<boolean>(isPlaying);
    const compositeFrameRef = useRef(compositeFrame);

    useEffect(() => {
      currentFrameRef.current = currentFrame;
    }, [currentFrame]);

    useEffect(() => {
      isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
      compositeFrameRef.current = compositeFrame;
    }, [compositeFrame]);

    // Initial render
    const hasInitializedRef = useRef(false);
    useEffect(() => {
      if (hasInitializedRef.current || !ctxRef.current) return;
      hasInitializedRef.current = true;

      const timeout = setTimeout(() => {
        compositeFrameRef.current(currentFrameRef.current, true);
        lastRenderedFrameRef.current = currentFrameRef.current;
      }, 100);

      return () => clearTimeout(timeout);
    }, []);

    // Handle play/pause
    useEffect(() => {
      const playStateChanged = isPlaying !== prevIsPlayingRef.current;
      prevIsPlayingRef.current = isPlaying;

      if (playStateChanged) {
        compositeFrame(currentFrame, true);
        lastRenderedFrameRef.current = currentFrame;
      }
    }, [isPlaying, currentFrame, compositeFrame]);

    // Handle scrubbing (frame changes while paused)
    useEffect(() => {
      if (isPlaying) return;

      const frameChanged = currentFrame !== prevFrameRef.current;
      const frameDelta = Math.abs(currentFrame - prevFrameRef.current);
      prevFrameRef.current = currentFrame;

      if (frameChanged) {
        compositeFrame(currentFrame, frameDelta > 1);
        lastRenderedFrameRef.current = currentFrame;
        onFrameRendered?.(currentFrame);
      }
    }, [isPlaying, currentFrame, compositeFrame, onFrameRendered]);

    // Re-render when tracks change (for transform updates)
    // CRITICAL: This must work during BOTH playback AND when paused
    // During playback, track changes (like rotation) must be reflected immediately
    // Without this, Properties Panel rotation updates would not render until playback stops
    const prevTracksRef = useRef(tracks);
    const prevTracksJsonRef = useRef<string>('');
    useEffect(() => {
      // Quick reference check first
      if (prevTracksRef.current === tracks) {
        return;
      }
      prevTracksRef.current = tracks;

      // For transform changes (position, scale, rotation), we need to detect actual changes
      // since the track reference changes on any store update
      // Compare relevant transform properties to detect actual visual changes
      const currentTracksTransformKey = tracks
        .filter((t) => t.type === 'video' && t.visible)
        .map((t) => {
          const transform = t.textTransform;
          const x = transform?.x ?? 0;
          const y = transform?.y ?? 0;
          const scale = transform?.scale ?? 1;
          const rotation = transform?.rotation ?? 0;
          return `${t.id}:${x},${y},${scale},${rotation}`;
        })
        .join('|');

      if (prevTracksJsonRef.current !== currentTracksTransformKey) {
        prevTracksJsonRef.current = currentTracksTransformKey;
        // Force re-composite with the latest tracks
        // This ensures rotation changes from Properties Panel are reflected immediately
        compositeFrame(currentFrame, false);
      }
    }, [tracks, currentFrame, compositeFrame]);

    // Playback render loop
    useEffect(() => {
      if (!isPlaying) {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        return;
      }

      let running = true;

      const animate = () => {
        if (!running) return;
        compositeFrameRef.current(currentFrameRef.current, false);
        lastRenderedFrameRef.current = currentFrameRef.current;
        animationFrameRef.current = requestAnimationFrame(animate);
      };

      animationFrameRef.current = requestAnimationFrame(animate);

      return () => {
        running = false;
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
    }, [isPlaying]);

    useImperativeHandle(
      ref,
      () => ({
        getCanvas: () => canvasRef.current,
        forceRender: () => compositeFrame(currentFrame, true),
        getStats: () => ({ ...statsRef.current }),
      }),
      [currentFrame, compositeFrame],
    );

    return (
      <canvas
        ref={canvasRef}
        className={className}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          backgroundColor: '#000000',
          pointerEvents: 'none', // Ensure canvas doesn't capture clicks
        }}
        aria-label="Video preview canvas"
      />
    );
  },
);

FrameDrivenCompositor.displayName = 'FrameDrivenCompositor';

export default FrameDrivenCompositor;
