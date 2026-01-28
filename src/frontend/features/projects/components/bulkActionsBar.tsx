import { Button } from '@/frontend/components/ui/button';
import { Download, Trash2, X } from 'lucide-react';

interface BulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onBulkExport: () => void;
}

export const BulkActionsBar = ({
  selectedCount,
  totalCount,
  onClearSelection,
  onBulkDelete,
  onBulkExport,
}: BulkActionsBarProps) => {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 dark:bg-zinc-50 bg-zinc-900 backdrop-blur-sm border rounded-md px-3 animate-in fade-in duration-150 py-1">
      <Button
        variant="ghost"
        size="sm"
        className="size-4 !p-0 text-xs hover:!bg-accent/20 text-zinc-500 dark:text-zinc-900"
        onClick={onClearSelection}
        title="Clear selection (Esc)"
      >
        <X className="size-3.5" />
      </Button>
      <span className="text-xs text-zinc-500 dark:text-zinc-900 font-medium whitespace-nowrap">
        {selectedCount} selected
        {selectedCount === totalCount && totalCount > 1 && ' (all)'}
      </span>
      <div className="w-px h-4 bg-border" />
      <Button
        variant="ghost"
        className="gap-1.5 !px-2 rounded py-0.5 h-fit w-fit text-xs text-zinc-500 dark:text-zinc-900 hover:!bg-accent/20"
        onClick={onBulkExport}
        title="Export selected projects"
      >
        <Download className="size-3.5" />
        Export
      </Button>
      <Button
        variant="ghost"
        className="gap-1.5 !px-2 rounded py-0.5 h-fit w-fit text-xs text-destructive hover:text-destructive hover:!bg-destructive/20"
        onClick={onBulkDelete}
        title="Delete selected projects"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
    </div>
  );
};
