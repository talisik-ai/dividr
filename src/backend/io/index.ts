/**
 * File I/O and Background Task Management Module
 *
 * This module provides controlled concurrency for file operations
 * and background task processing to prevent EMFILE (too many open files) errors.
 */

export {
  FileIOManager,
  FileIOManagerConfig,
  FileIOStats,
  fileIOManager,
} from './FileIOManager';

export {
  BackgroundTaskQueue,
  QueueStats,
  Task,
  TaskPriority,
  TaskStatus,
  TaskType,
  backgroundTaskQueue,
} from './BackgroundTaskQueue';
