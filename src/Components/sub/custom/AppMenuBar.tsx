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
} from '@/Components/sub/ui/Menubar';

export const AppMenuBar = () => {
  return (
    <Menubar variant="minimal">
      <MenubarMenu>
        <MenubarTrigger>Home</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            Dashboard <MenubarShortcut>⌘D</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Recent Projects <MenubarShortcut>⌘R</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Welcome Screen</MenubarItem>
          <MenubarItem>Getting Started</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            New Project <MenubarShortcut>⌘N</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Open Project <MenubarShortcut>⌘O</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Save Project <MenubarShortcut>⌘S</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Save As... <MenubarShortcut>⇧⌘S</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Import</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>Import Video</MenubarItem>
              <MenubarItem>Import Audio</MenubarItem>
              <MenubarItem>Import Images</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger>Export</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>Export Video</MenubarItem>
              <MenubarItem>Export Audio</MenubarItem>
              <MenubarItem>Export Project</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>
            Close Project <MenubarShortcut>⌘W</MenubarShortcut>
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>
            Undo <MenubarShortcut>⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            Cut <MenubarShortcut>⌘X</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Copy <MenubarShortcut>⌘C</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Paste <MenubarShortcut>⌘V</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>
            Delete <MenubarShortcut>⌫</MenubarShortcut>
          </MenubarItem>
          <MenubarSeparator />
          <MenubarItem>
            Select All <MenubarShortcut>⌘A</MenubarShortcut>
          </MenubarItem>
          <MenubarItem>Deselect All</MenubarItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Timeline</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>Split Clip</MenubarItem>
              <MenubarItem>Merge Clips</MenubarItem>
              <MenubarItem>Trim Start</MenubarItem>
              <MenubarItem>Trim End</MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Settings</MenubarTrigger>
        <MenubarContent>
          <MenubarCheckboxItem>Auto-save Projects</MenubarCheckboxItem>
          <MenubarCheckboxItem checked>Show Timeline Grid</MenubarCheckboxItem>
          <MenubarCheckboxItem>Snap to Grid</MenubarCheckboxItem>
          <MenubarSeparator />
          <MenubarSub>
            <MenubarSubTrigger>Playback Quality</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarRadioGroup value="high">
                <MenubarRadioItem value="low">Low</MenubarRadioItem>
                <MenubarRadioItem value="medium">Medium</MenubarRadioItem>
                <MenubarRadioItem value="high">High</MenubarRadioItem>
                <MenubarRadioItem value="ultra">Ultra</MenubarRadioItem>
              </MenubarRadioGroup>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>Preferences...</MenubarItem>
          <MenubarItem>Keyboard Shortcuts</MenubarItem>
          <MenubarItem>Reset to Defaults</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Help</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>User Guide</MenubarItem>
          <MenubarItem>Video Tutorials</MenubarItem>
          <MenubarItem>Keyboard Shortcuts</MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Report Bug</MenubarItem>
          <MenubarItem>Feature Request</MenubarItem>
          <MenubarSeparator />
          <MenubarItem>About Dividr</MenubarItem>
          <MenubarItem>Check for Updates</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
};
