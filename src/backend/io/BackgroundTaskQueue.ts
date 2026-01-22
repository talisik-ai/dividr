/**
 * BackgroundTaskQueue - Controlled concurrency for background processing tasks
 *
 * Used for coordinating:
 * - Thumbnail generation
 * - Sprite sheet generation
 * - Waveform generation
 * - Metadata extraction
 * - Audio extraction
 *
 * Features:
 * - Priority-based task scheduling
 * - Concurrency limits per task type
 * - Progress tracking
 * - Graceful error handling
 * - Task cancellation support
 */

export type TaskType =
  | 'thumbnail'
  | 'sprite-sheet'
  | 'waveform'
  | 'metadata'
  | 'audio-extraction'
  | 'file-write'
  | 'transcode';

export type TaskStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Task<T = unknown> {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  mediaId?: string;
  filePath?: string;
  operation: () => Promise<T>;
  onProgress?: (progress: number) => void;
  onComplete?: (result: T) => void;
  onError?: (error: Error) => void;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  retries: number;
  maxRetries: number;
  error?: Error;
  result?: T;
}

export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
  byType: Record<TaskType, { pending: number; running: number }>;
}

// Concurrency limits per task type
const DEFAULT_CONCURRENCY_LIMITS: Record<TaskType, number> = {
  thumbnail: 2,
  'sprite-sheet': 1, // Heavy FFmpeg operation
  waveform: 3,
  metadata: 5,
  'audio-extraction': 1, // Heavy FFmpeg operation
  'file-write': 5,
  transcode: 1, // Very heavy FFmpeg operation
};

// Priority weights for sorting
const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

class BackgroundTaskQueue {
  private tasks: Map<string, Task> = new Map();
  private pendingTasks: Task[] = [];
  private runningTasks: Map<string, Task> = new Map();
  private concurrencyLimits: Record<TaskType, number>;
  private taskIdCounter = 0;
  private isProcessing = false;
  private stats = {
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  constructor(concurrencyLimits?: Partial<Record<TaskType, number>>) {
    this.concurrencyLimits = {
      ...DEFAULT_CONCURRENCY_LIMITS,
      ...concurrencyLimits,
    };
    console.log(
      '📋 BackgroundTaskQueue initialized with limits:',
      this.concurrencyLimits,
    );
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(type: TaskType): string {
    return `${type}_${++this.taskIdCounter}_${Date.now()}`;
  }

  /**
   * Count running tasks by type
   */
  private countRunningByType(type: TaskType): number {
    let count = 0;
    for (const task of this.runningTasks.values()) {
      if (task.type === type) count++;
    }
    return count;
  }

  /**
   * Check if we can start a task of the given type
   */
  private canStartTask(type: TaskType): boolean {
    const running = this.countRunningByType(type);
    return running < this.concurrencyLimits[type];
  }

  /**
   * Sort pending tasks by priority and creation time
   */
  private sortPendingTasks(): void {
    this.pendingTasks.sort((a, b) => {
      const priorityDiff =
        PRIORITY_WEIGHTS[a.priority] - PRIORITY_WEIGHTS[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return a.createdAt - b.createdAt;
    });
  }

  /**
   * Process the queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      this.sortPendingTasks();

      // Find tasks that can be started
      const tasksToStart: Task[] = [];
      const remainingTasks: Task[] = [];

      for (const task of this.pendingTasks) {
        if (task.status === 'cancelled') {
          continue; // Skip cancelled tasks
        }

        if (this.canStartTask(task.type)) {
          tasksToStart.push(task);
          // Update running count for this iteration
          this.concurrencyLimits[task.type]--; // Temporarily decrease
        } else {
          remainingTasks.push(task);
        }
      }

      // Restore concurrency limits
      for (const task of tasksToStart) {
        this.concurrencyLimits[task.type]++;
      }

      this.pendingTasks = remainingTasks;

      // Start the tasks
      for (const task of tasksToStart) {
        this.executeTask(task);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Execute a single task
   */
  private async executeTask(task: Task): Promise<void> {
    task.status = 'running';
    task.startedAt = Date.now();
    this.runningTasks.set(task.id, task);

    console.log(
      `▶️ Starting task ${task.id} (${task.type}) - Running: ${this.countRunningByType(task.type)}/${this.concurrencyLimits[task.type]}`,
    );

    try {
      const result = await task.operation();

      // Check if cancelled during execution (task could be modified externally)
      const currentTask = this.tasks.get(task.id);
      if (currentTask?.status === 'cancelled') {
        console.log(`⏹️ Task ${task.id} was cancelled during execution`);
        return;
      }

      task.status = 'completed';
      task.completedAt = Date.now();
      task.result = result;
      this.stats.completed++;

      console.log(
        `✅ Task ${task.id} completed in ${task.completedAt - task.startedAt!}ms`,
      );

      task.onComplete?.(result);
    } catch (error) {
      const err = error as Error;

      // Check if this is an EMFILE error and can retry
      const isEMFILE = this.isEMFILEError(err);

      if (isEMFILE && task.retries < task.maxRetries) {
        task.retries++;
        task.status = 'pending';
        console.warn(
          `⚠️ Task ${task.id} hit EMFILE, retrying (${task.retries}/${task.maxRetries})`,
        );

        // Re-queue with delay
        setTimeout(() => {
          this.pendingTasks.unshift(task);
          this.processQueue();
        }, 1000 * task.retries); // Increasing backoff
      } else {
        task.status = 'failed';
        task.completedAt = Date.now();
        task.error = err;
        this.stats.failed++;

        console.error(`❌ Task ${task.id} failed:`, err.message);
        task.onError?.(err);
      }
    } finally {
      this.runningTasks.delete(task.id);
      // Schedule next queue processing
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Check if an error is EMFILE
   */
  private isEMFILEError(error: Error): boolean {
    const nodeError = error as NodeJS.ErrnoException;
    return (
      nodeError.code === 'EMFILE' ||
      nodeError.code === 'ENFILE' ||
      error.message.includes('too many open files') ||
      error.message.includes('EMFILE')
    );
  }

  /**
   * Add a task to the queue
   */
  addTask<T>(options: {
    type: TaskType;
    priority?: TaskPriority;
    mediaId?: string;
    filePath?: string;
    operation: () => Promise<T>;
    onProgress?: (progress: number) => void;
    onComplete?: (result: T) => void;
    onError?: (error: Error) => void;
    maxRetries?: number;
  }): string {
    const task: Task<T> = {
      id: this.generateTaskId(options.type),
      type: options.type,
      priority: options.priority || 'normal',
      status: 'pending',
      mediaId: options.mediaId,
      filePath: options.filePath,
      operation: options.operation,
      onProgress: options.onProgress,
      onComplete: options.onComplete as (result: unknown) => void,
      onError: options.onError,
      createdAt: Date.now(),
      retries: 0,
      maxRetries: options.maxRetries ?? 3,
    };

    this.tasks.set(task.id, task);
    this.pendingTasks.push(task);

    console.log(
      `📋 Task ${task.id} added to queue (${task.type}, priority: ${task.priority}) - Queue size: ${this.pendingTasks.length}`,
    );

    // Trigger queue processing
    setImmediate(() => this.processQueue());

    return task.id;
  }

  /**
   * Cancel a task by ID
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    if (task.status === 'pending') {
      task.status = 'cancelled';
      this.pendingTasks = this.pendingTasks.filter((t) => t.id !== taskId);
      this.stats.cancelled++;
      console.log(`⏹️ Task ${taskId} cancelled`);
      return true;
    }

    if (task.status === 'running') {
      task.status = 'cancelled';
      this.stats.cancelled++;
      console.log(
        `⏹️ Task ${taskId} marked for cancellation (currently running)`,
      );
      return true;
    }

    return false;
  }

  /**
   * Cancel all tasks for a specific media ID
   */
  cancelTasksForMedia(mediaId: string): number {
    let cancelledCount = 0;

    for (const task of this.tasks.values()) {
      if (
        task.mediaId === mediaId &&
        (task.status === 'pending' || task.status === 'running')
      ) {
        if (this.cancelTask(task.id)) {
          cancelledCount++;
        }
      }
    }

    return cancelledCount;
  }

  /**
   * Cancel all tasks of a specific type
   */
  cancelTasksByType(type: TaskType): number {
    let cancelledCount = 0;

    for (const task of this.tasks.values()) {
      if (
        task.type === type &&
        (task.status === 'pending' || task.status === 'running')
      ) {
        if (this.cancelTask(task.id)) {
          cancelledCount++;
        }
      }
    }

    return cancelledCount;
  }

  /**
   * Get task status
   */
  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get queue statistics
   */
  getStats(): QueueStats {
    const byType: Record<TaskType, { pending: number; running: number }> = {
      thumbnail: { pending: 0, running: 0 },
      'sprite-sheet': { pending: 0, running: 0 },
      waveform: { pending: 0, running: 0 },
      metadata: { pending: 0, running: 0 },
      'audio-extraction': { pending: 0, running: 0 },
      'file-write': { pending: 0, running: 0 },
      transcode: { pending: 0, running: 0 },
    };

    for (const task of this.pendingTasks) {
      if (task.status === 'pending') {
        byType[task.type].pending++;
      }
    }

    for (const task of this.runningTasks.values()) {
      byType[task.type].running++;
    }

    return {
      pending: this.pendingTasks.length,
      running: this.runningTasks.size,
      completed: this.stats.completed,
      failed: this.stats.failed,
      cancelled: this.stats.cancelled,
      byType,
    };
  }

  /**
   * Check if the queue is idle
   */
  isIdle(): boolean {
    return this.pendingTasks.length === 0 && this.runningTasks.size === 0;
  }

  /**
   * Wait for all tasks to complete
   */
  async waitForAll(timeoutMs?: number): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.isIdle()) {
          resolve();
          return;
        }

        if (timeoutMs && Date.now() - startTime > timeoutMs) {
          reject(new Error(`Queue did not complete within ${timeoutMs}ms`));
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }

  /**
   * Wait for tasks of a specific type to complete
   */
  async waitForType(type: TaskType, timeoutMs?: number): Promise<void> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const check = () => {
        const hasPending = this.pendingTasks.some(
          (t) => t.type === type && t.status === 'pending',
        );
        const hasRunning = Array.from(this.runningTasks.values()).some(
          (t) => t.type === type,
        );

        if (!hasPending && !hasRunning) {
          resolve();
          return;
        }

        if (timeoutMs && Date.now() - startTime > timeoutMs) {
          reject(
            new Error(
              `Tasks of type ${type} did not complete within ${timeoutMs}ms`,
            ),
          );
          return;
        }

        setTimeout(check, 100);
      };

      check();
    });
  }

  /**
   * Clear completed/failed/cancelled tasks from memory
   */
  clearCompletedTasks(): number {
    let cleared = 0;

    for (const [id, task] of this.tasks) {
      if (
        task.status === 'completed' ||
        task.status === 'failed' ||
        task.status === 'cancelled'
      ) {
        this.tasks.delete(id);
        cleared++;
      }
    }

    if (cleared > 0) {
      console.log(`🧹 Cleared ${cleared} completed/failed/cancelled tasks`);
    }

    return cleared;
  }

  /**
   * Update concurrency limit for a task type
   */
  setConcurrencyLimit(type: TaskType, limit: number): void {
    this.concurrencyLimits[type] = Math.max(1, limit);
    console.log(`📋 Updated concurrency limit for ${type}: ${limit}`);
    // Trigger queue processing in case we can now run more tasks
    setImmediate(() => this.processQueue());
  }

  /**
   * Get current concurrency limits
   */
  getConcurrencyLimits(): Record<TaskType, number> {
    return { ...this.concurrencyLimits };
  }
}

// Export singleton instance
export const backgroundTaskQueue = new BackgroundTaskQueue();

// Export class for testing or custom instances
export { BackgroundTaskQueue };
