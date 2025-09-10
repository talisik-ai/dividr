import { Button } from '@/Components/sub/ui/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/Components/sub/ui/Dropdown-Menu';
import { Copy, Download, MoreVertical, PencilLine, Trash2 } from 'lucide-react';

interface ProjectActionsDropdownProps {
  projectId: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onDelete: (id: string) => void;
  variant?: 'hover' | 'visible';
  className?: string;
}

export const ProjectActionsDropdown = ({
  projectId,
  isOpen,
  onOpenChange,
  onDuplicate,
  onExport,
  onDelete,
  variant = 'hover',
  className = '',
}: ProjectActionsDropdownProps) => {
  const handleDuplicate = () => {
    onDuplicate(projectId);
    onOpenChange?.(false);
  };

  const handleExport = () => {
    onExport(projectId);
    onOpenChange?.(false);
  };

  const handleDelete = () => {
    onDelete(projectId);
    onOpenChange?.(false);
  };

  const buttonClassName =
    variant === 'hover'
      ? `h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity ${className}`
      : `h-6 w-6 p-0 ${className}`;

  return (
    <DropdownMenu open={isOpen} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={buttonClassName}>
          <MoreVertical className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-fit p-1" align="end">
        <div className="space-y-1">
          <DropdownMenuItem>
            <PencilLine className="h-3 w-3" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleDuplicate}>
            <Copy className="h-3 w-3" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleExport}>
            <Download className="h-3 w-3" />
            Export Project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleDelete} className="text-red-600">
            <Trash2 className="h-3 w-3" />
            Delete
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
