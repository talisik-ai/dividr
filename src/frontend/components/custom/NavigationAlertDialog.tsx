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

interface NavigationBlockerDialogProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isSaving: boolean;
}

export const NavigationBlockerDialog = ({
  isOpen,
  onConfirm,
  onCancel,
  isSaving,
}: NavigationBlockerDialogProps) => {
  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isSaving ? 'Saving in progress' : 'Unsaved changes'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isSaving
              ? 'Your project is currently being saved. Please wait a moment before leaving.'
              : 'You have unsaved changes. Are you sure you want to leave? Your changes may be lost.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Leave anyway'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
