import { Badge } from '@/frontend/components/ui/badge';
import { Button } from '@/frontend/components/ui/button';
import { Checkbox } from '@/frontend/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Label } from '@/frontend/components/ui/label';
import { Cpu, Zap } from 'lucide-react';
import { useState } from 'react';

export type NoiseReductionEngine = 'ffmpeg' | 'deepfilter';

interface NoiseReductionEngineModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (engine: NoiseReductionEngine, remember: boolean) => void;
}

export function NoiseReductionEngineModal({
  isOpen,
  onOpenChange,
  onConfirm,
}: NoiseReductionEngineModalProps) {
  const [selectedEngine, setSelectedEngine] =
    useState<NoiseReductionEngine>('ffmpeg');
  const [rememberChoice, setRememberChoice] = useState(false);

  const handleConfirm = () => {
    onConfirm(selectedEngine, rememberChoice);
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Noise Cancellation Engine</DialogTitle>
          <DialogDescription>
            Choose how you want to process your audio.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div
            className={`flex items-start space-x-4 rounded-md border p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
              selectedEngine === 'ffmpeg' ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => setSelectedEngine('ffmpeg')}
          >
            <Zap className="mt-1 h-5 w-5 text-yellow-500" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center space-x-2">
                <p className="font-medium text-base leading-none">
                  Standard (FFmpeg)
                </p>
                <Badge variant="secondary" className="text-[10px] h-5">
                  Recommended
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Fast, lightweight processing. Uses minimal system resources.
                Best for most users.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <div
                className={`h-4 w-4 rounded-full border-2 ${
                  selectedEngine === 'ffmpeg'
                    ? 'border-primary bg-primary'
                    : 'border-muted'
                }`}
              />
            </div>
          </div>

          <div
            className={`flex items-start space-x-4 rounded-md border p-4 cursor-pointer hover:bg-muted/50 transition-colors ${
              selectedEngine === 'deepfilter'
                ? 'border-primary bg-primary/5'
                : ''
            }`}
            onClick={() => setSelectedEngine('deepfilter')}
          >
            <Cpu className="mt-1 h-5 w-5 text-blue-500" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center space-x-2">
                <p className="font-medium text-base leading-none">
                  High Quality (DeepFilterNet2)
                </p>
                <Badge variant="outline" className="text-[10px] h-5">
                  Heavy
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Advanced AI-based reduction. Higher quality results but consumes
                significant CPU & RAM.
              </p>
            </div>
            <div className="flex items-center justify-center">
              <div
                className={`h-4 w-4 rounded-full border-2 ${
                  selectedEngine === 'deepfilter'
                    ? 'border-primary bg-primary'
                    : 'border-muted'
                }`}
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="remember"
              checked={rememberChoice}
              onCheckedChange={(c) => setRememberChoice(!!c)}
            />
            <Label
              htmlFor="remember"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              Remember my choice for this device
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Confirm Selection</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
