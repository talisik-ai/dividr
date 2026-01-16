import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/frontend/components/ui/alert-dialog';
import { Button } from '@/frontend/components/ui/button';
import { ScrollArea } from '@/frontend/components/ui/scroll-area';
import { cn } from '@/frontend/utils/utils';
import { Check, Copy, FileCheck, SkipForward, X } from 'lucide-react';
import React, { useCallback, useMemo, useState } from 'react';
import {
  DuplicateChoice,
  DuplicateItem,
} from '../../stores/videoEditor/slices/mediaLibrarySlice';

interface BatchDuplicateMediaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: DuplicateItem[];
  onConfirm: (choices: Map<string, DuplicateChoice>) => void;
  onCancel: () => void;
}

type ChoiceButtonProps = {
  choice: DuplicateChoice;
  currentChoice?: DuplicateChoice;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  variant: 'use-existing' | 'import-copy' | 'cancel';
};

const ChoiceButton: React.FC<ChoiceButtonProps> = ({
  choice,
  currentChoice,
  onClick,
  icon,
  label,
  variant,
}) => {
  const isSelected = currentChoice === choice;

  const variantStyles = {
    'use-existing': isSelected
      ? 'bg-green-500/20 border-green-500 text-green-600 dark:text-green-400'
      : 'hover:bg-green-500/10 hover:border-green-500/50',
    'import-copy': isSelected
      ? 'bg-blue-500/20 border-blue-500 text-blue-600 dark:text-blue-400'
      : 'hover:bg-blue-500/10 hover:border-blue-500/50',
    cancel: isSelected
      ? 'bg-red-500/20 border-red-500 text-red-600 dark:text-red-400'
      : 'hover:bg-red-500/10 hover:border-red-500/50',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 px-2 py-1 rounded border text-xs transition-colors',
        'border-muted-foreground/20',
        variantStyles[variant],
      )}
      aria-label={label}
      tabIndex={0}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

export const BatchDuplicateMediaDialog: React.FC<
  BatchDuplicateMediaDialogProps
> = ({ open, onOpenChange, duplicates, onConfirm, onCancel }) => {
  // Track individual choices for each duplicate
  const [choices, setChoices] = useState<Map<string, DuplicateChoice>>(
    new Map(),
  );

  // Set choice for a single item
  const handleSetChoice = useCallback((id: string, choice: DuplicateChoice) => {
    setChoices((prev) => {
      const newChoices = new Map(prev);
      newChoices.set(id, choice);
      return newChoices;
    });
  }, []);

  // Apply choice to all items
  const handleApplyToAll = useCallback(
    (choice: DuplicateChoice) => {
      const newChoices = new Map<string, DuplicateChoice>();
      duplicates.forEach((dup) => {
        newChoices.set(dup.id, choice);
      });
      setChoices(newChoices);
    },
    [duplicates],
  );

  // Check if all items have a choice
  const allChosen = useMemo(() => {
    return duplicates.every((dup) => choices.has(dup.id));
  }, [duplicates, choices]);

  // Get count by choice type
  const choiceCounts = useMemo(() => {
    const counts = { 'use-existing': 0, 'import-copy': 0, cancel: 0 };
    choices.forEach((choice) => {
      counts[choice]++;
    });
    return counts;
  }, [choices]);

  const handleConfirm = useCallback(() => {
    // Fill in any unchoosen items with 'cancel' as default
    const finalChoices = new Map<string, DuplicateChoice>();
    duplicates.forEach((dup) => {
      finalChoices.set(dup.id, choices.get(dup.id) || 'cancel');
    });
    onConfirm(finalChoices);
    setChoices(new Map());
  }, [duplicates, choices, onConfirm]);

  const handleCancel = useCallback(() => {
    onCancel();
    setChoices(new Map());
  }, [onCancel]);

  // Reset choices when dialog opens with new duplicates
  React.useEffect(() => {
    if (open) {
      setChoices(new Map());
    }
  }, [open, duplicates]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-w-2xl flex-col max-h-[80vh]">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-amber-500" />
            {duplicates.length} Duplicate{duplicates.length > 1 ? 's' : ''}{' '}
            Detected
          </AlertDialogTitle>
          <AlertDialogDescription>
            <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 mb-4">
              <p className="text-amber-600 dark:text-amber-400 font-medium text-sm">
                {duplicates.length === 1
                  ? 'This file already exists in your media library.'
                  : 'These files already exist in your media library. Choose how to handle each one.'}
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Bulk actions */}
        {duplicates.length > 1 && (
          <div className="flex items-center gap-2 pb-2 border-b">
            <span className="text-xs text-muted-foreground">Apply to all:</span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleApplyToAll('use-existing')}
            >
              <FileCheck className="h-3 w-3" />
              Skip All
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleApplyToAll('import-copy')}
            >
              <Copy className="h-3 w-3" />
              Keep Both (All)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => handleApplyToAll('cancel')}
            >
              <X className="h-3 w-3" />
              Cancel All
            </Button>
          </div>
        )}

        {/* Duplicate list */}
        <ScrollArea className="flex-1 grid -mx-6 px-6 max-h-[40vh] min-w-0">
          <div className="space-y-2 py-2 flex-1 grid min-w-0">
            {duplicates.map((dup) => {
              const currentChoice = choices.get(dup.id);
              return (
                <div
                  key={dup.id}
                  className={cn(
                    'flex items-center flex-1 min-w-0 gap-3 p-3 rounded-md border transition-colors',
                    currentChoice === 'use-existing' &&
                      'bg-green-500/5 border-green-500/30',
                    currentChoice === 'import-copy' &&
                      'bg-blue-500/5 border-blue-500/30',
                    currentChoice === 'cancel' &&
                      'bg-red-500/5 border-red-500/30',
                    !currentChoice && 'bg-muted/30 border-muted-foreground/20',
                  )}
                >
                  {/* Thumbnail */}
                  {dup.existingMedia.thumbnail ? (
                    <img
                      src={dup.existingMedia.thumbnail}
                      alt={dup.existingMedia.name}
                      className="w-12 h-9 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-9 bg-muted rounded flex items-center justify-center flex-shrink-0">
                      <FileCheck className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}

                  {/* File info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {dup.pendingFileName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      Matches: {dup.existingMedia.name}
                    </p>
                  </div>

                  {/* Choice buttons */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <ChoiceButton
                      choice="use-existing"
                      currentChoice={currentChoice}
                      onClick={() => handleSetChoice(dup.id, 'use-existing')}
                      icon={<SkipForward className="h-3 w-3" />}
                      label="Skip"
                      variant="use-existing"
                    />
                    <ChoiceButton
                      choice="import-copy"
                      currentChoice={currentChoice}
                      onClick={() => handleSetChoice(dup.id, 'import-copy')}
                      icon={<Copy className="h-3 w-3" />}
                      label="Keep Both"
                      variant="import-copy"
                    />
                    <ChoiceButton
                      choice="cancel"
                      currentChoice={currentChoice}
                      onClick={() => handleSetChoice(dup.id, 'cancel')}
                      icon={<X className="h-3 w-3" />}
                      label="Cancel"
                      variant="cancel"
                    />
                  </div>

                  {/* Selected indicator */}
                  {currentChoice && (
                    <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Summary */}
        {choices.size > 0 && (
          <div className="flex items-center gap-4 pt-2 border-t text-xs text-muted-foreground">
            {choiceCounts['use-existing'] > 0 && (
              <span className="text-green-600 dark:text-green-400">
                {choiceCounts['use-existing']} to skip
              </span>
            )}
            {choiceCounts['import-copy'] > 0 && (
              <span className="text-blue-600 dark:text-blue-400">
                {choiceCounts['import-copy']} to keep both
              </span>
            )}
            {choiceCounts['cancel'] > 0 && (
              <span className="text-red-600 dark:text-red-400">
                {choiceCounts['cancel']} to cancel
              </span>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>
            Cancel Import
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!allChosen && duplicates.length > 1}
          >
            {allChosen
              ? 'Confirm Choices'
              : `Choose for ${duplicates.length - choices.size} remaining`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
