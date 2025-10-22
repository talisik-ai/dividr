import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/frontend/components/ui/dialog';
import { Kbd } from '@/frontend/components/ui/kbd';
import { ScrollArea } from '@/frontend/components/ui/scroll-area';
import { shortcutRegistry } from '@/frontend/features/editor/stores/videoEditor/shortcuts';
import { Keyboard } from 'lucide-react';
import React, { useMemo } from 'react';

interface HotkeyItemProps {
  keys: (string | string[])[];
  description: string;
  category?: string;
}

const HotkeyItemComponent: React.FC<HotkeyItemProps> = ({
  keys,
  description,
}) => {
  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-muted/40 rounded-lg transition-all duration-150 group">
      <span className="text-sm text-foreground/90 group-hover:text-foreground">
        {description}
      </span>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        {keys.map((keyCombo, comboIndex) => (
          <React.Fragment key={comboIndex}>
            <div className="flex items-center gap-1">
              {(Array.isArray(keyCombo) ? keyCombo : [keyCombo]).map(
                (key, keyIndex) => (
                  <React.Fragment key={keyIndex}>
                    <Kbd className="min-w-[32px] h-6 px-2 text-[10px] font-semibold shadow-sm">
                      {key}
                    </Kbd>
                    {keyIndex <
                      (Array.isArray(keyCombo) ? keyCombo : [keyCombo]).length -
                        1 && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        +
                      </span>
                    )}
                  </React.Fragment>
                ),
              )}
            </div>
            {comboIndex < keys.length - 1 && (
              <span className="text-[10px] text-muted-foreground/70 font-medium px-1">
                or
              </span>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

HotkeyItemComponent.displayName = 'HotkeyItem';

const HotkeyItem = React.memo(HotkeyItemComponent);

interface HotkeySectionProps {
  title: string;
  hotkeys: HotkeyItemProps[];
}

const HotkeySectionComponent: React.FC<HotkeySectionProps> = ({
  title,
  hotkeys,
}) => {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-xs text-muted-foreground/80 uppercase tracking-wide pb-1">
        {title}
      </h3>
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

HotkeySectionComponent.displayName = 'HotkeySection';

const HotkeySection = React.memo(HotkeySectionComponent);

interface HotkeysDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const HotkeysDialog: React.FC<HotkeysDialogProps> = ({
  open,
  onOpenChange,
}) => {
  // Define professional category order and grouping like CapCut/Premiere Pro
  const categoryOrder = [
    // Project Management
    'Project',

    // Core Operations
    'Edit',
    'Playback',

    // Editing
    'Track Editing',
    'Track Properties',

    // Navigation
    'Navigation',
    'Track Selection',
    'Timeline Selection',

    // Tools
    'Tools',
    'Preview Tools',

    // View & Display
    'Timeline Zoom',
    'Timeline Tools',
    'Preview Zoom',
  ];

  // Get shortcuts grouped by category from the registry
  // Registry is initialized globally in App.tsx via useShortcutRegistryInit
  const shortcutsByCategory = useMemo(() => {
    if (!open) return [];

    const shortcuts = shortcutRegistry.getShortcutsByCategories();

    // Transform shortcuts into the format expected by the UI
    const transformedCategories = Object.entries(shortcuts).map(
      ([category, shortcuts]) => {
        // Group shortcuts by description to combine duplicates
        const groupedByDescription = new Map<
          string,
          Array<string | string[]>
        >();

        shortcuts.forEach((shortcut) => {
          const existing = groupedByDescription.get(shortcut.description) || [];
          groupedByDescription.set(shortcut.description, [
            ...existing,
            shortcut.keys,
          ]);
        });

        // Transform grouped shortcuts
        const hotkeys = Array.from(groupedByDescription.entries()).map(
          ([description, keyCombinations]) => {
            // Flatten and format all key combinations
            const allKeys = keyCombinations.flatMap((keys) => {
              const keyArray = Array.isArray(keys) ? keys : [keys];
              return keyArray.map((keyCombo) =>
                keyCombo.split('+').map((key) => {
                  // Format key names for display
                  const keyMap: Record<string, string> = {
                    ctrl: 'Ctrl',
                    cmd: 'Cmd',
                    meta: 'Cmd',
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
                }),
              );
            });

            return {
              keys: allKeys,
              description,
            };
          },
        );

        return {
          title: category,
          hotkeys,
        };
      },
    );

    // Sort categories by the defined order
    return transformedCategories.sort((a, b) => {
      const aIndex = categoryOrder.indexOf(a.title);
      const bIndex = categoryOrder.indexOf(b.title);

      // If both categories are in the order list, sort by their position
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      }
      // If only one is in the order list, prioritize it
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      // If neither is in the order list, sort alphabetically
      return a.title.localeCompare(b.title);
    });
  }, [open]);

  // Create structured groups with visual separators
  const createGroupedData = () => {
    const groups = [
      {
        name: 'PROJECT',
        categories: ['Project'],
      },
      {
        name: 'ESSENTIALS',
        categories: ['Edit', 'Playback'],
      },
      {
        name: 'EDITING',
        categories: ['Track Editing', 'Track Properties'],
      },
      {
        name: 'NAVIGATION',
        categories: ['Navigation', 'Track Selection', 'Timeline Selection'],
      },
      {
        name: 'TOOLS',
        categories: ['Tools', 'Preview Tools'],
      },
      {
        name: 'VIEW & DISPLAY',
        categories: ['Timeline Zoom', 'Timeline Tools', 'Preview Zoom'],
      },
      {
        name: 'INTERACTIONS',
        categories: ['Mouse Interactions'],
      },
    ];

    return groups;
  };

  // Add manual interaction shortcuts that aren't keyboard-based
  const manualInteractionShortcuts = {
    title: 'Mouse Interactions',
    hotkeys: [
      {
        keys: [['Shift', 'Click']],
        description: 'Toggle Track Selection (Multi-select)',
      },
    ],
  };

  const allShortcuts = [...shortcutsByCategory, manualInteractionShortcuts];
  const groups = createGroupedData();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1400px] w-[92vw] max-h-[90vh] p-0 flex flex-col">
        <div className="flex flex-col flex-1 min-h-0">
          <DialogHeader className="px-8 py-5 border-b border-border/50 bg-gradient-to-b from-muted/30 to-background">
            <DialogTitle className="flex items-center gap-4">
              <div className="p-2.5 bg-primary/15 rounded-xl ring-1 ring-primary/20">
                <Keyboard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Keyboard Shortcuts
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5 font-normal">
                  Master these shortcuts to edit faster and more efficiently
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 px-8 py-6 overflow-y-auto min-h-0">
            <div className="space-y-10">
              {groups.map((group) => {
                const groupSections = allShortcuts.filter((section) =>
                  group.categories.includes(section.title),
                );

                if (groupSections.length === 0) return null;

                return (
                  <div key={group.name} className="space-y-4">
                    {/* Group Header */}
                    <div className="flex items-center gap-3">
                      <div className="h-[2px] w-2 bg-primary rounded-full" />
                      <h2 className="text-xs font-bold tracking-[0.2em] text-primary/80 uppercase">
                        {group.name}
                      </h2>
                      <div className="flex-1 h-[1px] bg-gradient-to-r from-primary/20 via-border/50 to-transparent" />
                    </div>

                    {/* Group Sections */}
                    <div className="grid grid-cols-1 gap-x-8 gap-y-6">
                      {groupSections.map((section) => (
                        <HotkeySection
                          key={section.title}
                          title={section.title}
                          hotkeys={section.hotkeys}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          <div className="px-8 py-4 border-t border-border/50 bg-muted/10">
            <p className="text-xs text-muted-foreground text-center">
              <span className="font-medium">💡 Pro Tip:</span> Most shortcuts
              work when the timeline or preview is focused. Use{' '}
              <Kbd className="inline-flex mx-1 px-1.5 py-0.5 text-[9px]">
                Esc
              </Kbd>{' '}
              to deselect and exit modes.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
