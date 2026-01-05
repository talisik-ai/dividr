import { ProjectSummary } from '@/shared/types/project.types';
import { FileText, FileVideo } from 'lucide-react';

/**
 * Formats file size in bytes to human readable format
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 0) return 'Unknown';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
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
 * Get formatted media size for display
 * Returns actual size from sizeInfo, or "—" if not available
 */
export const getProjectMediaSize = (project: ProjectSummary): string => {
  if (!project.sizeInfo) return '—';
  return formatFileSize(project.sizeInfo.totalMediaSize);
};

/**
 * Get project file size (JSON metadata)
 */
export const getProjectFileSize = (project: ProjectSummary): string => {
  if (!project.sizeInfo) return '—';
  return formatFileSize(project.sizeInfo.projectFileSize);
};

/**
 * Check if project has missing media
 */
export const hasProjectMissingMedia = (project: ProjectSummary): boolean => {
  return (project.sizeInfo?.missingMediaCount ?? 0) > 0;
};

/**
 * Get the number of media assets in the project
 */
export const getProjectMediaCount = (project: ProjectSummary): number => {
  return project.sizeInfo?.mediaCount ?? 0;
};

/**
 * @deprecated Use getProjectMediaSize() instead. This function estimates size inaccurately.
 * Kept for backward compatibility.
 */
export const getProjectSize = (project: ProjectSummary): string => {
  // If we have actual size info, use it
  if (project.sizeInfo) {
    return getProjectMediaSize(project);
  }
  // Fallback to old estimate (will be removed in future)
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
