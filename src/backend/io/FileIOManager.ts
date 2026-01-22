/**
 * FileIOManager - Controlled concurrency for file I/O operations
 *
 * Prevents EMFILE (too many open files) errors by:
 * 1. Limiting concurrent file operations
 * 2. Queuing excess operations
 * 3. Proper file handle management
 * 4. Graceful error handling with retries
 */

import fs, { promises as fsPromises } from 'node:fs';
import path from 'node:path';

// Task types for the queue
interface FileTask<T> {
  id: string;
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  retries: number;
  priority: 'high' | 'normal' | 'low';
  createdAt: number;
}

// Configuration options
interface FileIOManagerConfig {
  maxConcurrentReads: number;
  maxConcurrentWrites: number;
  maxRetries: number;
  retryDelayMs: number;
  operationTimeoutMs: number;
}

// Statistics for monitoring
export interface FileIOStats {
  activeReads: number;
  activeWrites: number;
  queuedReads: number;
  queuedWrites: number;
  completedOperations: number;
  failedOperations: number;
  emfileErrors: number;
}

const DEFAULT_CONFIG: FileIOManagerConfig = {
  maxConcurrentReads: 10, // Limit concurrent file reads
  maxConcurrentWrites: 5, // Limit concurrent file writes
  maxRetries: 3,
  retryDelayMs: 500,
  operationTimeoutMs: 30000, // 30 seconds timeout
};

class FileIOManager {
  private config: FileIOManagerConfig;
  private readQueue: FileTask<Buffer | string>[] = [];
  private writeQueue: FileTask<void>[] = [];
  private activeReads = 0;
  private activeWrites = 0;
  private stats: FileIOStats = {
    activeReads: 0,
    activeWrites: 0,
    queuedReads: 0,
    queuedWrites: 0,
    completedOperations: 0,
    failedOperations: 0,
    emfileErrors: 0,
  };
  private taskIdCounter = 0;

  constructor(config: Partial<FileIOManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log(
      `📁 FileIOManager initialized: maxReads=${this.config.maxConcurrentReads}, maxWrites=${this.config.maxConcurrentWrites}`,
    );
  }

  /**
   * Check if an error is an EMFILE (too many open files) error
   */
  private isEMFILEError(error: unknown): boolean {
    if (error instanceof Error) {
      const nodeError = error as NodeJS.ErrnoException;
      return nodeError.code === 'EMFILE' || nodeError.code === 'ENFILE';
    }
    return false;
  }

  /**
   * Generate unique task ID
   */
  private generateTaskId(): string {
    return `task_${++this.taskIdCounter}_${Date.now()}`;
  }

  /**
   * Process the read queue
   */
  private processReadQueue(): void {
    while (
      this.activeReads < this.config.maxConcurrentReads &&
      this.readQueue.length > 0
    ) {
      // Sort by priority (high first) and then by creation time
      this.readQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff =
          priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.createdAt - b.createdAt;
      });

      const task = this.readQueue.shift();
      if (task) {
        this.executeReadTask(task);
      }
    }
    this.updateStats();
  }

  /**
   * Process the write queue
   */
  private processWriteQueue(): void {
    while (
      this.activeWrites < this.config.maxConcurrentWrites &&
      this.writeQueue.length > 0
    ) {
      // Sort by priority (high first) and then by creation time
      this.writeQueue.sort((a, b) => {
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff =
          priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.createdAt - b.createdAt;
      });

      const task = this.writeQueue.shift();
      if (task) {
        this.executeWriteTask(task);
      }
    }
    this.updateStats();
  }

  /**
   * Execute a read task with error handling and retries
   */
  private async executeReadTask(
    task: FileTask<Buffer | string>,
  ): Promise<void> {
    this.activeReads++;
    this.updateStats();

    try {
      const result = await this.withTimeout(
        task.operation(),
        this.config.operationTimeoutMs,
      );
      task.resolve(result);
      this.stats.completedOperations++;
    } catch (error) {
      if (this.isEMFILEError(error)) {
        this.stats.emfileErrors++;
        console.warn(
          `⚠️ EMFILE error on read task ${task.id}, retrying (${task.retries}/${this.config.maxRetries})`,
        );

        if (task.retries < this.config.maxRetries) {
          task.retries++;
          // Re-queue with delay
          setTimeout(() => {
            this.readQueue.unshift(task); // Priority re-queue
            this.processReadQueue();
          }, this.config.retryDelayMs * task.retries);
        } else {
          task.reject(
            new Error(
              `EMFILE: Too many open files. Operation failed after ${this.config.maxRetries} retries.`,
            ),
          );
          this.stats.failedOperations++;
        }
      } else {
        task.reject(error as Error);
        this.stats.failedOperations++;
      }
    } finally {
      this.activeReads--;
      this.updateStats();
      // Process next task
      setImmediate(() => this.processReadQueue());
    }
  }

  /**
   * Execute a write task with error handling and retries
   */
  private async executeWriteTask(task: FileTask<void>): Promise<void> {
    this.activeWrites++;
    this.updateStats();

    try {
      await this.withTimeout(task.operation(), this.config.operationTimeoutMs);
      task.resolve();
      this.stats.completedOperations++;
    } catch (error) {
      if (this.isEMFILEError(error)) {
        this.stats.emfileErrors++;
        console.warn(
          `⚠️ EMFILE error on write task ${task.id}, retrying (${task.retries}/${this.config.maxRetries})`,
        );

        if (task.retries < this.config.maxRetries) {
          task.retries++;
          // Re-queue with delay
          setTimeout(() => {
            this.writeQueue.unshift(task); // Priority re-queue
            this.processWriteQueue();
          }, this.config.retryDelayMs * task.retries);
        } else {
          task.reject(
            new Error(
              `EMFILE: Too many open files. Operation failed after ${this.config.maxRetries} retries.`,
            ),
          );
          this.stats.failedOperations++;
        }
      } else {
        task.reject(error as Error);
        this.stats.failedOperations++;
      }
    } finally {
      this.activeWrites--;
      this.updateStats();
      // Process next task
      setImmediate(() => this.processWriteQueue());
    }
  }

  /**
   * Add timeout to a promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
          timeoutMs,
        ),
      ),
    ]);
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.activeReads = this.activeReads;
    this.stats.activeWrites = this.activeWrites;
    this.stats.queuedReads = this.readQueue.length;
    this.stats.queuedWrites = this.writeQueue.length;
  }

  /**
   * Read a file with controlled concurrency
   */
  async readFile(
    filePath: string,
    options?: {
      encoding?: BufferEncoding;
      priority?: 'high' | 'normal' | 'low';
    },
  ): Promise<Buffer | string> {
    return new Promise((resolve, reject) => {
      const task: FileTask<Buffer | string> = {
        id: this.generateTaskId(),
        operation: async () => {
          if (options?.encoding) {
            return fsPromises.readFile(filePath, {
              encoding: options.encoding,
            });
          }
          return fsPromises.readFile(filePath);
        },
        resolve,
        reject,
        retries: 0,
        priority: options?.priority || 'normal',
        createdAt: Date.now(),
      };

      this.readQueue.push(task);
      this.processReadQueue();
    });
  }

  /**
   * Read a file as buffer with controlled concurrency
   */
  async readFileAsBuffer(
    filePath: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
  ): Promise<Buffer> {
    const result = await this.readFile(filePath, { priority });
    return Buffer.isBuffer(result) ? result : Buffer.from(result);
  }

  /**
   * Write a file with controlled concurrency
   */
  async writeFile(
    filePath: string,
    data: Buffer | string,
    options?: {
      encoding?: BufferEncoding;
      priority?: 'high' | 'normal' | 'low';
      createDir?: boolean;
    },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const task: FileTask<void> = {
        id: this.generateTaskId(),
        operation: async () => {
          // Create directory if needed
          if (options?.createDir) {
            const dir = path.dirname(filePath);
            await fsPromises.mkdir(dir, { recursive: true });
          }

          if (typeof data === 'string' && options?.encoding) {
            await fsPromises.writeFile(filePath, data, {
              encoding: options.encoding,
            });
          } else {
            await fsPromises.writeFile(filePath, data);
          }
        },
        resolve,
        reject,
        retries: 0,
        priority: options?.priority || 'normal',
        createdAt: Date.now(),
      };

      this.writeQueue.push(task);
      this.processWriteQueue();
    });
  }

  /**
   * Delete a file with controlled concurrency
   */
  async deleteFile(
    filePath: string,
    priority: 'high' | 'normal' | 'low' = 'low',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const task: FileTask<void> = {
        id: this.generateTaskId(),
        operation: async () => {
          try {
            await fsPromises.unlink(filePath);
          } catch (error) {
            // Ignore file not found errors
            const nodeError = error as NodeJS.ErrnoException;
            if (nodeError.code !== 'ENOENT') {
              throw error;
            }
          }
        },
        resolve,
        reject,
        retries: 0,
        priority,
        createdAt: Date.now(),
      };

      this.writeQueue.push(task);
      this.processWriteQueue();
    });
  }

  /**
   * Check if a file exists (non-queued, sync check is fine for exists)
   */
  exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * Create directory with controlled concurrency
   */
  async mkdir(
    dirPath: string,
    priority: 'high' | 'normal' | 'low' = 'normal',
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const task: FileTask<void> = {
        id: this.generateTaskId(),
        operation: async () => {
          await fsPromises.mkdir(dirPath, { recursive: true });
        },
        resolve,
        reject,
        retries: 0,
        priority,
        createdAt: Date.now(),
      };

      this.writeQueue.push(task);
      this.processWriteQueue();
    });
  }

  /**
   * Get current statistics
   */
  getStats(): FileIOStats {
    return { ...this.stats };
  }

  /**
   * Check if the manager is under heavy load
   */
  isUnderHeavyLoad(): boolean {
    return (
      this.activeReads >= this.config.maxConcurrentReads * 0.8 ||
      this.activeWrites >= this.config.maxConcurrentWrites * 0.8 ||
      this.readQueue.length > 20 ||
      this.writeQueue.length > 10
    );
  }

  /**
   * Wait until the queue is below a certain threshold
   */
  async waitForCapacity(maxQueueSize = 5): Promise<void> {
    while (
      this.readQueue.length > maxQueueSize ||
      this.writeQueue.length > maxQueueSize
    ) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Process multiple files in batches
   */
  async processBatch<T>(
    items: T[],
    processor: (item: T, index: number) => Promise<void>,
    batchSize = 3,
  ): Promise<{ success: number; failed: number; errors: Error[] }> {
    const results = {
      success: 0,
      failed: 0,
      errors: [] as Error[],
    };

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map(async (item, batchIndex) => {
        try {
          await processor(item, i + batchIndex);
          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push(error as Error);
          console.error(`Batch item ${i + batchIndex} failed:`, error);
        }
      });

      await Promise.all(batchPromises);

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    return results;
  }
}

// Export singleton instance for main process use
export const fileIOManager = new FileIOManager();

// Export class for testing or custom instances
export { FileIOManager, FileIOManagerConfig };
