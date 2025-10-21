/**
 * Hook for managing project shortcut confirmation dialogs
 */
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
import { useCallback, useState } from 'react';

interface ConfirmationOptions {
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'destructive';
}

export const useProjectShortcutDialog = () => {
  const [dialogState, setDialogState] = useState<{
    open: boolean;
    options: ConfirmationOptions | null;
  }>({
    open: false,
    options: null,
  });

  const showConfirmation = useCallback((options: ConfirmationOptions) => {
    setDialogState({
      open: true,
      options,
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (dialogState.options?.onConfirm) {
      dialogState.options.onConfirm();
    }
    setDialogState({ open: false, options: null });
  }, [dialogState.options]);

  const handleCancel = useCallback(() => {
    setDialogState({ open: false, options: null });
  }, []);

  const ConfirmationDialog = useCallback(
    () => (
      <AlertDialog open={dialogState.open} onOpenChange={handleCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialogState.options?.title || 'Confirm Action'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialogState.options?.message ||
                'Are you sure you want to proceed?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>
              {dialogState.options?.cancelText || 'Cancel'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={
                dialogState.options?.variant === 'destructive'
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                  : ''
              }
            >
              {dialogState.options?.confirmText || 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    [dialogState, handleConfirm, handleCancel],
  );

  return {
    showConfirmation,
    ConfirmationDialog,
  };
};
