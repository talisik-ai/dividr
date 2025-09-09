import { Button } from '@/Components/sub/ui/Button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/Components/sub/ui/Popover';
import { ProjectSummary } from '@/Types/Project';
import { formatDistanceToNow } from 'date-fns';
import {
  Clock,
  Copy,
  Download,
  MoreVertical,
  Play,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';

interface ProjectCardProps {
  project: ProjectSummary;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

const ProjectCard = ({
  project,
  onOpen,
  onDuplicate,
  onExport,
  onDelete,
}: ProjectCardProps) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleOpen = () => {
    onOpen(project.id);
  };

  const handleDuplicate = () => {
    onDuplicate(project.id);
    setIsMenuOpen(false);
  };

  const handleExport = () => {
    onExport(project.id);
    setIsMenuOpen(false);
  };

  const handleDelete = () => {
    onDelete(project.id);
    setIsMenuOpen(false);
  };

  const formatDuration = (seconds: number): string => {
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

  return (
    <div className="group bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-200 overflow-hidden">
      {/* Thumbnail */}
      <div className="aspect-video relative bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
        {project.thumbnail ? (
          <img
            src={project.thumbnail}
            alt={project.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="text-zinc-400 dark:text-zinc-600">
            <Play size={32} />
          </div>
        )}

        {/* Hover overlay with play button */}
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <Button
            onClick={handleOpen}
            size="sm"
            className="bg-white/20 hover:bg-white/30 text-white border-white/20"
          >
            <Play size={16} />
            Open
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">
            {project.title}
          </h3>

          <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreVertical size={14} />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="end">
              <div className="space-y-1">
                <button
                  onClick={handleDuplicate}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                >
                  <Copy size={14} />
                  Duplicate
                </button>
                <button
                  onClick={handleExport}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded"
                >
                  <Download size={14} />
                  Export
                </button>
                <hr className="my-1 border-zinc-200 dark:border-zinc-700" />
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {project.description && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400 line-clamp-2 mb-3">
            {project.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-500">
          <div className="flex items-center gap-1">
            <Clock size={12} />
            {formatDuration(project.duration)}
          </div>

          <div className="text-right">
            {project.lastOpenedAt ? (
              <div>
                Last opened{' '}
                {formatDistanceToNow(new Date(project.lastOpenedAt))}
              </div>
            ) : (
              <div>
                Created {formatDistanceToNow(new Date(project.createdAt))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
