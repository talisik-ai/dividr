/**
 * Startup Manager
 *
 * Manages app startup state, performance tracking, and initialization stages.
 * Provides utilities for monitoring and optimizing the boot sequence.
 */

export type StartupStage =
  | 'app-start'
  | 'renderer-mount'
  | 'indexeddb-init'
  | 'indexeddb-ready'
  | 'projects-loading'
  | 'projects-loaded'
  | 'app-ready';

interface StartupMetric {
  stage: StartupStage;
  timestamp: number;
  duration?: number;
}

class StartupManager {
  private metrics: StartupMetric[] = [];
  private startTime: number = Date.now();
  private listeners: Set<(stage: StartupStage, progress: number) => void> =
    new Set();

  constructor() {
    // Mark app start
    this.logStage('app-start');

    // Log to console for debugging
    if (typeof window !== 'undefined') {
      (window as any).__DIVIDR_STARTUP__ = this;
    }
  }

  /**
   * Log a startup stage with timestamp
   */
  logStage(stage: StartupStage): void {
    const timestamp = Date.now();
    const duration = timestamp - this.startTime;

    this.metrics.push({ stage, timestamp, duration });

    console.log(`🚀 [Startup] ${stage} - ${duration}ms from app start`);

    // Notify listeners
    const progress = this.calculateProgress(stage);
    this.listeners.forEach((listener) => listener(stage, progress));
  }

  /**
   * Calculate progress percentage based on stage
   */
  private calculateProgress(stage: StartupStage): number {
    const stageProgress: Record<StartupStage, number> = {
      'app-start': 0,
      'renderer-mount': 20,
      'indexeddb-init': 40,
      'indexeddb-ready': 60,
      'projects-loading': 75,
      'projects-loaded': 90,
      'app-ready': 100,
    };

    return stageProgress[stage] || 0;
  }

  /**
   * Subscribe to startup progress updates
   */
  subscribe(
    callback: (stage: StartupStage, progress: number) => void,
  ): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Get all metrics
   */
  getMetrics(): StartupMetric[] {
    return [...this.metrics];
  }

  /**
   * Get total startup time
   */
  getTotalStartupTime(): number {
    const lastMetric = this.metrics[this.metrics.length - 1];
    return lastMetric ? lastMetric.duration || 0 : 0;
  }

  /**
   * Print performance summary to console
   */
  printSummary(): void {
    console.group('📊 Startup Performance Summary');
    console.log(`Total startup time: ${this.getTotalStartupTime()}ms`);
    console.table(
      this.metrics.map((m) => ({
        Stage: m.stage,
        'Time (ms)': m.duration,
      })),
    );
    console.groupEnd();

    // Identify bottlenecks
    const bottlenecks = this.identifyBottlenecks();
    if (bottlenecks.length > 0) {
      console.warn('⚠️ Potential bottlenecks detected:');
      bottlenecks.forEach((b) => {
        console.warn(`  - ${b.stage}: ${b.duration}ms`);
      });
    }
  }

  /**
   * Identify stages that took longer than expected
   */
  private identifyBottlenecks(): StartupMetric[] {
    const thresholds: Partial<Record<StartupStage, number>> = {
      'indexeddb-init': 500,
      'projects-loading': 1000,
    };

    return this.metrics.filter((metric) => {
      const threshold = thresholds[metric.stage];
      return threshold && metric.duration && metric.duration > threshold;
    });
  }

  /**
   * Reset metrics (for testing)
   */
  reset(): void {
    this.metrics = [];
    this.startTime = Date.now();
    this.logStage('app-start');
  }
}

// Singleton instance
export const startupManager = new StartupManager();

/**
 * Hook to track startup progress in React components
 */
export const useStartupProgress = (
  callback: (stage: StartupStage, progress: number) => void,
): void => {
  if (typeof window === 'undefined') return;

  const unsubscribe = startupManager.subscribe(callback);

  // Cleanup on unmount
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', unsubscribe);
  }
};
