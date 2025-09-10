import { Button } from '@/Components/sub/ui/Button';
import { Checkbox } from '@/Components/sub/ui/Checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/Components/sub/ui/Table';
import { ProjectSummary } from '@/Types/Project';
import { formatDistanceToNow } from 'date-fns';
import { Clock, Play } from 'lucide-react';
import { useState } from 'react';
import {
  formatDuration,
  getProjectIcon,
  getProjectSize,
} from '../Lib/projectHelpers';
import { ProjectActionsDropdown } from './ProjectActionsDropdown';

interface ProjectListViewProps {
  projects: ProjectSummary[];
  selectedProjects: Set<string>;
  onProjectSelect: (projectId: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onOpen: (id: string) => void;
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
  onDuplicate,
  onExport,
  onDelete,
}: ProjectListViewProps) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const handleSelectAll = (checked: boolean) => {
    onSelectAll(checked);
  };

  const handleProjectSelect = (projectId: string, checked: boolean) => {
    onProjectSelect(projectId, checked);
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
            <TableHead className="w-24">Size</TableHead>
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
              onClick={() =>
                handleProjectSelect(
                  project.id,
                  !selectedProjects.has(project.id),
                )
              }
              onDoubleClick={() => onOpen(project.id)}
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
                  <div className="w-24 h-16 rounded overflow-hidden bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center flex-shrink-0">
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
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {project.title}
                    </div>
                    {project.description && (
                      <div className="text-xs text-muted-foreground truncate">
                        {project.description}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {getProjectSize(project)}
                </span>
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
