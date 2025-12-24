import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/frontend/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { ProjectSummary } from '@/shared/types/project.types';
import { formatDistanceToNow } from 'date-fns';
import { AlertTriangle, Clock, HardDrive, Play } from 'lucide-react';
import { useState } from 'react';
import {
  formatDuration,
  getProjectFileSize,
  getProjectIcon,
  getProjectMediaCount,
  getProjectMediaSize,
  hasProjectMissingMedia,
} from '../lib/project.helpers';
import { InlineProjectNameEditor } from './inlineProjectNameEditor';
import { ProjectActionsDropdown } from './projectActionsDropdown';

interface ProjectListViewProps {
  projects: ProjectSummary[];
  selectedProjects: Set<string>;
  onProjectSelect: (projectId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onOpen: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
}

export const ProjectListView = ({
  projects,
  selectedProjects,
  onProjectSelect,
  onSelectAll,
  onOpen,
  onRename,
  onDuplicate,
  onExport,
  onDelete,
}: ProjectListViewProps) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSelectAll = (checked: boolean) => {
    onSelectAll(checked);
  };

  const handleProjectSelect = (projectId: string, checked: boolean) => {
    onProjectSelect(projectId, checked);
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

  const allSelected =
    projects.length > 0 && selectedProjects.size === projects.length;
  const someSelected =
    selectedProjects.size > 0 && selectedProjects.size < projects.length;

  return (
    <div className="rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <Checkbox
                checked={allSelected}
                ref={(el) => {
                  if (el) {
                    const checkbox = el.querySelector(
                      'button',
                    ) as HTMLInputElement;
                    if (checkbox) checkbox.indeterminate = someSelected;
                  }
                }}
                onCheckedChange={handleSelectAll}
                aria-label="Select all projects"
              />
            </TableHead>
            <TableHead>Title</TableHead>
            <TableHead className="w-28">Media Size</TableHead>
            <TableHead className="w-32">Duration</TableHead>
            <TableHead className="w-48">Last Opened</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((project) => (
            <TableRow
              key={project.id}
              className="group cursor-pointer border-b hover:bg-muted/50"
              onClick={(e) => {
                // Don't trigger row selection if we're currently editing this project
                if (editingId === project.id) {
                  e.preventDefault();
                  return;
                }
                handleProjectSelect(
                  project.id,
                  !selectedProjects.has(project.id),
                );
              }}
              onDoubleClick={(e) => {
                // Don't trigger open if we're currently editing this project
                if (editingId === project.id) {
                  e.preventDefault();
                  return;
                }
                onOpen(project.id);
              }}
            >
              <TableCell>
                <Checkbox
                  checked={selectedProjects.has(project.id)}
                  onCheckedChange={(checked) =>
                    handleProjectSelect(project.id, checked as boolean)
                  }
                  aria-label={`Select ${project.title}`}
                  className="group-hover:border-primary"
                />
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="w-24 h-16 rounded overflow-hidden bg-accent/80 flex items-center justify-center flex-shrink-0">
                    {project.thumbnail ? (
                      <img
                        src={project.thumbnail}
                        alt={project.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      getProjectIcon(project)
                    )}
                  </div>
                  <div
                    className="flex-1 min-w-0"
                    onClick={(e) => {
                      // Prevent row click when clicking on the title area during editing
                      if (editingId === project.id) {
                        e.stopPropagation();
                      }
                    }}
                  >
                    <InlineProjectNameEditor
                      projectId={project.id}
                      initialValue={project.title}
                      isEditing={editingId === project.id}
                      onSave={handleRenameSave}
                      onCancel={handleRenameCancel}
                      variant="list"
                    />
                    {project.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {project.description}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-default">
                      {hasProjectMissingMedia(project) ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      ) : (
                        <HardDrive className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                      )}
                      <span
                        className={
                          hasProjectMissingMedia(project) ? 'text-amber-500' : ''
                        }
                      >
                        {getProjectMediaSize(project)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="text-xs space-y-1">
                      <p className="font-medium">Size Breakdown</p>
                      <p>
                        Media assets ({getProjectMediaCount(project)}):{' '}
                        {getProjectMediaSize(project)}
                      </p>
                      <p>Project file: {getProjectFileSize(project)}</p>
                      {hasProjectMissingMedia(project) && (
                        <p className="text-amber-500">
                          {project.sizeInfo?.missingMediaCount} file(s) missing
                        </p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1 text-sm">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  {formatDuration(project.duration)}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-xs text-muted-foreground">
                  {project.lastOpenedAt ? (
                    <div>
                      {formatDistanceToNow(new Date(project.lastOpenedAt))} ago
                    </div>
                  ) : (
                    <div>
                      {formatDistanceToNow(new Date(project.createdAt))} ago
                    </div>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(project.id);
                    }}
                    title="Open project"
                  >
                    <Play className="h-3 w-3" />
                  </Button>
                  <div onClick={(e) => e.stopPropagation()}>
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
                      variant="visible"
                    />
                  </div>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
