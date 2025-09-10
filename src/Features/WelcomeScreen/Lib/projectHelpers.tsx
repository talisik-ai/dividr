import { ProjectSummary } from '@/Types/Project';
import { FileText, FileVideo } from 'lucide-react';

/**
 * Formats file size in bytes to human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Formats duration in seconds to HH:MM:SS or MM:SS format
 */
export const formatDuration = (seconds: number): string => {
  if (seconds === 0) return '0:00';

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);

  if (minutes < 60) {
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

/**
 * Estimates project size based on duration
 * This is a rough estimation - in a real app you'd have actual file sizes
 */
export const getProjectSize = (project: ProjectSummary): string => {
  const estimatedBytes = project.duration * 1024 * 1024 * 2; // ~2MB per second estimate
  return formatFileSize(estimatedBytes);
};

/**
 * Returns appropriate icon for project based on its content
 */
export const getProjectIcon = (project: ProjectSummary) => {
  if (project.duration === 0) {
    return <FileText className="h-4 w-4 text-zinc-500" />;
  }
  return <FileVideo className="h-4 w-4 text-blue-500" />;
};
