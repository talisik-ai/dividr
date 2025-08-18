/**
 * Performance monitoring and optimization utilities for video editing
 */

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  memoryUsage?: number;
  gpuErrors: number;
}

export class PerformanceMonitor {
  private frameCount = 0;
  private lastFrameTime = 0;
  private gpuErrorCount = 0;
  private fpsHistory: number[] = [];
  private readonly maxHistorySize = 60;

  updateFrame(currentTime: number): PerformanceMetrics {
    const deltaTime = currentTime - this.lastFrameTime;
    const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

    this.frameCount++;
    this.lastFrameTime = currentTime;

    // Keep FPS history for averaging
    this.fpsHistory.push(fps);
    if (this.fpsHistory.length > this.maxHistorySize) {
      this.fpsHistory.shift();
    }

    return {
      fps,
      frameTime: deltaTime,
      gpuErrors: this.gpuErrorCount,
    };
  }

  recordGpuError(): void {
    this.gpuErrorCount++;
  }

  getAverageFPS(): number {
    if (this.fpsHistory.length === 0) return 0;
    return (
      this.fpsHistory.reduce((sum, fps) => sum + fps, 0) /
      this.fpsHistory.length
    );
  }

  shouldReduceQuality(): boolean {
    const avgFps = this.getAverageFPS();
    return avgFps < 20 || this.gpuErrorCount > 5;
  }

  reset(): void {
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.gpuErrorCount = 0;
    this.fpsHistory = [];
  }
}

/**
 * GPU error recovery strategies
 */
export const handleGpuError = (error: Error, context: string): boolean => {
  console.warn(`🚨 GPU Error in ${context}:`, error.message);

  // Check if it's a recoverable GPU error
  const recoverableErrors = [
    'ContextResult::kTransientFailure',
    'GPU process exited unexpectedly',
    'Failed to send GpuControl.CreateCommandBuffer',
  ];

  const isRecoverable = recoverableErrors.some((pattern) =>
    error.message.includes(pattern),
  );

  if (isRecoverable) {
    console.log('🔄 Attempting GPU error recovery...');
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
    return true;
  }

  return false;
};

/**
 * Memory cleanup utilities
 */
export const cleanupVideoElement = (video: HTMLVideoElement): void => {
  try {
    video.pause();
    video.removeAttribute('src');
    video.load();

    // Clear any cached data
    if ('srcObject' in video) {
      video.srcObject = null;
    }
  } catch (error) {
    console.warn('Error during video cleanup:', error);
  }
};

/**
 * Canvas optimization utilities
 */
export const getOptimalCanvasContext = (
  canvas: HTMLCanvasElement,
  options?: CanvasRenderingContext2DSettings,
): CanvasRenderingContext2D | null => {
  const defaultOptions: CanvasRenderingContext2DSettings = {
    alpha: false,
    desynchronized: true,
    willReadFrequently: false,
    ...options,
  };

  return canvas.getContext('2d', defaultOptions);
};

/**
 * Adaptive frame rate controller
 */
export class AdaptiveFrameRate {
  private targetFps = 60;
  private currentFps = 60;
  private performanceMode = false;

  updatePerformance(metrics: PerformanceMetrics): void {
    if (metrics.fps < 30 || metrics.gpuErrors > 0) {
      this.performanceMode = true;
      this.targetFps = 30;
    } else if (metrics.fps > 50 && metrics.gpuErrors === 0) {
      this.performanceMode = false;
      this.targetFps = 60;
    }

    this.currentFps = metrics.fps;
  }

  getFrameInterval(): number {
    return 1000 / this.targetFps;
  }

  isPerformanceMode(): boolean {
    return this.performanceMode;
  }

  getCurrentFps(): number {
    return this.currentFps;
  }
}
