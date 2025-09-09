import { Badge } from '@/Components/sub/ui/Badge';
import { Button } from '@/Components/sub/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/Components/sub/ui/Dropdown-Menu';
import { ProjectSummary } from '@/Types/Project';
import { formatDistanceToNow } from 'date-fns';
import {
  Clock,
  Copy,
  Download,
  MoreVertical,
  PencilLine,
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
    <div className="group bg-accent/60 rounded-lg border transition-all duration-200 overflow-hidden hover:shadow-lg">
      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Thumbnail */}
        <div className="aspect-video relative rounded-md bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
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

          <Badge className="absolute bottom-2 left-2 bg-black/50 dark:bg-white/50">
            <Clock
              className="-ms-0.5 opacity-60"
              size={12}
              aria-hidden="true"
            />
            {formatDuration(project.duration)}
          </Badge>

          {/* Hover overlay with play button */}
          <div className="absolute inset-0 bg-black/50 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
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

        {/* details */}
        <div className="">
          <h3 className="font-semibold line-clamp-1">{project.title}</h3>

          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {project.description}
            </p>
          )}

          <div className="flex items-center justify-between">
            <div className="text-right text-xs text-muted-foreground">
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

            <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-fit p-1" align="end">
                <div className="space-y-1">
                  <DropdownMenuItem>
                    <PencilLine size={14} />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDuplicate}>
                    <Copy size={14} />
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExport}>
                    <Download size={14} />
                    Export Project
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleDelete}
                    className="text-red-600"
                  >
                    <Trash2 size={14} />
                    Delete
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectCard;
