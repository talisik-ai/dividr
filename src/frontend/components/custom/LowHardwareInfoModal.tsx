import { Cpu, Info } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

const STORAGE_KEY = 'lowHardwareModalDismissed';

interface LowHardwareInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Informational modal shown when the system has low hardware capabilities
 * (RAM <= 8GB AND no hardware encoder) on first 4K video import.
 *
 * This modal is purely informational and does not block the user.
 * It explains that proxy generation will use CPU encoding which may be slower.
 */
export function LowHardwareInfoModal({
  isOpen,
  onClose,
}: LowHardwareInfoModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Check if modal was previously dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed === 'true' && isOpen) {
      onClose();
    }
  }, [isOpen, onClose]);

  const handleGotIt = useCallback(() => {
    if (dontShowAgain) {
      localStorage.setItem(STORAGE_KEY, 'true');
    }
    onClose();
  }, [dontShowAgain, onClose]);

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Info className="size-5 text-blue-500" />
            Performance Note
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 pt-2">
              <p>
                Your system will use <strong>CPU encoding</strong> for proxy
                generation. This may take longer than on systems with dedicated
                GPU encoding, but the editor will remain fully functional.
              </p>

              <div className="space-y-1 rounded-md bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <Cpu className="size-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">
                    What this means:
                  </p>
                </div>
                <ul className="space-y-0.5 pl-6 text-xs text-muted-foreground">
                  <li>• 4K videos will be optimized in the background</li>
                  <li>• Track will show "Optimizing..." during processing</li>
                  <li>• Other tracks remain fully editable</li>
                  <li>• Quality and features are not affected</li>
                </ul>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <Checkbox
                  id="dont-show-again"
                  checked={dontShowAgain}
                  onCheckedChange={(checked) =>
                    setDontShowAgain(checked === true)
                  }
                />
                <Label
                  htmlFor="dont-show-again"
                  className="cursor-pointer text-xs text-muted-foreground"
                >
                  Don't show this again
                </Label>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={handleGotIt}>Got it</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Check if the low hardware modal should be shown.
 * Returns true if the modal has not been dismissed before.
 */
export function shouldShowLowHardwareModal(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== 'true';
}

/**
 * Reset the low hardware modal dismissed state.
 * Useful for testing or if user wants to see the modal again.
 */
export function resetLowHardwareModal(): void {
  localStorage.removeItem(STORAGE_KEY);
}
