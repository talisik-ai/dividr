import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { ScrollArea } from '@/frontend/components/ui/scroll-area';
import { useVideoEditorStore } from '@/frontend/features/editor/stores/videoEditor';
import { shortcutRegistry } from '@/frontend/features/editor/stores/videoEditor/shortcuts';
import { Keyboard } from 'lucide-react';
import React, { useEffect, useMemo } from 'react';

interface HotkeyItemProps {
  keys: string[];
  description: string;
  category?: string;
}

const HotkeyItem: React.FC<HotkeyItemProps> = ({ keys, description }) => {
  return (
    <div className="flex items-center justify-between py-3 px-1 hover:bg-muted/30 rounded-md transition-colors">
      <span className="text-sm font-medium text-foreground">{description}</span>
      <div className="flex items-center gap-1">
        {keys.map((key, index) => (
          <React.Fragment key={index}>
            <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 text-[11px] font-semibold bg-background border border-border rounded-md shadow-sm text-muted-foreground">
              {key}
            </kbd>
            {index < keys.length - 1 && (
              <span className="text-xs text-muted-foreground mx-0.5">+</span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

interface HotkeySectionProps {
  title: string;
  hotkeys: HotkeyItemProps[];
}

const HotkeySection: React.FC<HotkeySectionProps> = ({ title, hotkeys }) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-base text-foreground">{title}</h3>
        <div className="flex-1 h-px bg-border"></div>
      </div>
      <div className="space-y-0.5">
        {hotkeys.map((hotkey, index) => (
          <HotkeyItem
            key={index}
            keys={hotkey.keys}
            description={hotkey.description}
          />
        ))}
      </div>
    </div>
  );
};

interface HotkeysDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const HotkeysDialog: React.FC<HotkeysDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const tracks = useVideoEditorStore((state) => state.tracks);
  const timeline = useVideoEditorStore((state) => state.timeline);

  // Calculate effective end frame for initializing registry
  const effectiveEndFrame = useMemo(() => {
    return tracks.length > 0
      ? Math.max(...tracks.map((track) => track.endFrame), timeline.totalFrames)
      : timeline.totalFrames;
  }, [tracks, timeline.totalFrames]);

  // Initialize shortcut registry
  useEffect(() => {
    shortcutRegistry.initialize(
      useVideoEditorStore.getState(),
      effectiveEndFrame,
    );
  }, [effectiveEndFrame]);

  // Get shortcuts grouped by category from the registry
  const shortcutsByCategory = useMemo(() => {
    const shortcuts = shortcutRegistry.getShortcutsByCategories();

    // Transform shortcuts into the format expected by the UI
    return Object.entries(shortcuts).map(([category, shortcuts]) => ({
      title: category,
      hotkeys: shortcuts.map((shortcut) => {
        // Convert key combinations to display format
        const keys = Array.isArray(shortcut.keys)
          ? shortcut.keys
          : shortcut.keys.split('+').map((key) => {
              // Format key names for display
              const keyMap: Record<string, string> = {
                ctrl: 'Ctrl',
                cmd: 'Cmd',
                shift: 'Shift',
                alt: 'Alt',
                space: 'Space',
                left: '←',
                right: '→',
                up: '↑',
                down: '↓',
                equal: '=',
                minus: '-',
                del: 'Delete',
                backspace: 'Backspace',
                escape: 'Esc',
              };
              return keyMap[key.toLowerCase()] || key.toUpperCase();
            });

        return {
          keys,
          description: shortcut.description,
        };
      }),
    }));
  }, []);

  // Add manual interaction shortcuts that aren't keyboard-based
  const manualInteractionShortcuts = {
    title: 'Track Interaction',
    hotkeys: [{ keys: ['Alt', 'Click'], description: 'Multi-select Tracks' }],
  };

  const hotkeyData = [...shortcutsByCategory, manualInteractionShortcuts];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl min-w-[90vw] max-h-[85vh] p-0 flex flex-col">
        <div className="flex flex-col flex-1 min-h-0">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <DialogTitle className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Keyboard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Keyboard Shortcuts</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Boost your productivity with these keyboard shortcuts
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-4 overflow-y-auto min-h-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {hotkeyData.map((section) => (
                <HotkeySection
                  key={section.title}
                  title={section.title}
                  hotkeys={section.hotkeys}
                />
              ))}
            </div>
          </ScrollArea>

          <div className="px-6 py-4 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground text-center">
              Pro tip: Most shortcuts work when you're focused on the timeline
              or video preview
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
