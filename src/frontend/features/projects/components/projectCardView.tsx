import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { cn } from '@/frontend/utils/utils';
import { ProjectSummary } from '@/shared/types/project.types';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Clock, HardDrive, Play } from 'lucide-react';
import { useState } from 'react';
import {
  formatDuration,
  getProjectMediaSize,
  hasProjectMissingMedia,
} from '../lib/project.helpers';
import { InlineProjectNameEditor } from './inlineProjectNameEditor';
import { ProjectActionsDropdown } from './projectActionsDropdown';

interface ProjectCardViewProps {
  projects: ProjectSummary[];
  selectedProjects: Set<string>;
  onProjectSelect: (projectId: string, selected: boolean) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ProjectCardView = ({
  projects,
  selectedProjects,
  onProjectSelect,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: ProjectCardViewProps) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleOpen = (id: string) => {
    onOpen(id);
  };

  const handleRename = (id: string) => {
    setEditingId(id);
  };

  const handleRenameSave = (id: string, newName: string) => {
    onRename(id, newName);
    setEditingId(null);
  };

  const handleRenameCancel = () => {
    setEditingId(null);
  };

  const handleCardClick = (e: React.MouseEvent, projectId: string) => {
    // Don't toggle selection if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[role="menuitem"]')
    ) {
      return;
    }
    onProjectSelect(projectId, !selectedProjects.has(projectId));
  };

  const isMultiSelectMode = selectedProjects.size > 1;
  const hasSelection = selectedProjects.size > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {projects.map((project) => {
        const isSelected = selectedProjects.has(project.id);
        return (
          <div
            key={project.id}
            className={cn(
              'group bg-accent/60 rounded-lg border transition-all duration-200 overflow-hidden hover:shadow-lg cursor-pointer relative',
              isSelected && 'ring-2 ring-primary border-primary',
            )}
            onClick={(e) => handleCardClick(e, project.id)}
          >
            {/* Selection checkbox - visible on hover or when selected */}
            <div
              className={cn(
                'absolute top-2 left-2 z-10 transition-opacity',
                hasSelection || isSelected
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) =>
                  onProjectSelect(project.id, checked as boolean)
                }
                className="h-5 w-5 bg-background/80 backdrop-blur-sm"
                aria-label={`Select ${project.title}`}
              />
            </div>

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

                <Badge className="absolute bottom-2 left-2 bg-black/20 dark:bg-white/20">
                  <Clock
                    className="-ms-0.5 opacity-60"
                    size={12}
                    aria-hidden="true"
                  />
                  {formatDuration(project.duration)}
                </Badge>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      className={`absolute bottom-2 right-2 bg-black/20 dark:bg-white/20 ${
                        hasProjectMissingMedia(project) ? 'text-amber-400' : ''
                      }`}
                    >
                      {hasProjectMissingMedia(project) ? (
                        <AlertTriangle
                          className="-ms-0.5 opacity-60"
                          size={12}
                          aria-hidden="true"
                        />
                      ) : (
                        <HardDrive
                          className="-ms-0.5 opacity-60"
                          size={12}
                          aria-hidden="true"
                        />
                      )}
                      {getProjectMediaSize(project)}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p className="text-xs">
                      {hasProjectMissingMedia(project)
                        ? `Media size (${project.sizeInfo?.missingMediaCount} file(s) missing)`
                        : 'Total media size'}
                    </p>
                  </TooltipContent>
                </Tooltip>

                {/* Hover overlay with play button - disabled in multi-select mode */}
                <div
                  className={cn(
                    'absolute inset-0 bg-black/20 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center',
                    isMultiSelectMode && 'pointer-events-none',
                  )}
                >
                  <Button
                    onClick={() => handleOpen(project.id)}
                    size="sm"
                    className={cn(
                      'bg-white/20 hover:bg-white/30 text-white border-white/20',
                      isMultiSelectMode && 'opacity-50',
                    )}
                    disabled={isMultiSelectMode}
                  >
                    <Play size={16} />
                    Open
                  </Button>
                </div>
              </div>

              {/* details */}
              <div className="">
                <InlineProjectNameEditor
                  projectId={project.id}
                  initialValue={project.title}
                  isEditing={editingId === project.id}
                  onSave={handleRenameSave}
                  onCancel={handleRenameCancel}
                  variant="card"
                />

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
                        Created{' '}
                        {formatDistanceToNow(new Date(project.createdAt))}
                      </div>
                    )}
                  </div>

                  {/* Disable ellipsis menu in multi-select mode */}
                  <ProjectActionsDropdown
                    projectId={project.id}
                    isOpen={openMenuId === project.id}
                    onOpenChange={(open) =>
                      setOpenMenuId(open ? project.id : null)
                    }
                    onRename={handleRename}
                    onDuplicate={onDuplicate}
                    onExport={onExport}
                    onDelete={onDelete}
                    variant="hover"
                    disabled={isMultiSelectMode}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
