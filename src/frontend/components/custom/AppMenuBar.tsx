import { Kbd, KbdGroup } from '@/frontend/components/ui/kbd';
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/frontend/components/ui/menubar';
import { useState } from 'react';
import { HotkeysDialog } from './HotkeysDialog';

export const AppMenuBar = () => {
  const [showHotkeys, setShowHotkeys] = useState(false);

  const handleOpenHotkeys = () => {
    setShowHotkeys(true);
  };

  return (
    <div className="flex items-center my-1">
      <Menubar variant="minimal">
        <MenubarMenu>
          <MenubarTrigger>Home</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>
              Dashboard{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>D</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Recent Projects{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>R</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled>Welcome Screen</MenubarItem>
            <MenubarItem disabled>Getting Started</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>
              New Project{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>N</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Open Project{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>O</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Save Project{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>S</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Save As...{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Shift</Kbd>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>S</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger disabled>Import</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem disabled>Import Video</MenubarItem>
                <MenubarItem disabled>Import Audio</MenubarItem>
                <MenubarItem disabled>Import Images</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSub>
              <MenubarSubTrigger disabled>Export</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem disabled>Export Video</MenubarItem>
                <MenubarItem disabled>Export Audio</MenubarItem>
                <MenubarItem disabled>Export Project</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem disabled>
              Close Project{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>W</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>
              Undo{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Z</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Redo{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Shift</Kbd>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Z</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled>
              Cut{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>X</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Copy{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>C</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Paste{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>V</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Delete{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Delete</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled>
              Select All{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>A</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>Deselect All</MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger disabled>Timeline</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem disabled>Split Clip</MenubarItem>
                <MenubarItem disabled>Merge Clips</MenubarItem>
                <MenubarItem disabled>Trim Start</MenubarItem>
                <MenubarItem disabled>Trim End</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Settings</MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem disabled>
              Auto-save Projects
            </MenubarCheckboxItem>
            <MenubarCheckboxItem checked disabled>
              Show Timeline Grid
            </MenubarCheckboxItem>
            <MenubarCheckboxItem disabled>Snap to Grid</MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger disabled>Playback Quality</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarRadioGroup value="high">
                  <MenubarRadioItem value="low" disabled>
                    Low
                  </MenubarRadioItem>
                  <MenubarRadioItem value="medium" disabled>
                    Medium
                  </MenubarRadioItem>
                  <MenubarRadioItem value="high" disabled>
                    High
                  </MenubarRadioItem>
                  <MenubarRadioItem value="ultra" disabled>
                    Ultra
                  </MenubarRadioItem>
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem disabled>Preferences...</MenubarItem>
            <MenubarItem disabled>Reset to Defaults</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>Help</MenubarTrigger>
          <MenubarContent>
            <MenubarItem disabled>User Guide</MenubarItem>
            <MenubarItem disabled>Video Tutorials</MenubarItem>
            <MenubarItem onClick={handleOpenHotkeys}>
              Keyboard Shortcuts
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled>Report Bug</MenubarItem>
            <MenubarItem disabled>Feature Request</MenubarItem>
            <MenubarSeparator />
            <MenubarItem disabled>About Dividr</MenubarItem>
            <MenubarItem disabled>Check for Updates</MenubarItem>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>

      <HotkeysDialog open={showHotkeys} onOpenChange={setShowHotkeys} />
    </div>
  );
};
