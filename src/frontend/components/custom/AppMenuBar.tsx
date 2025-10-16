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
import { useVideoEditorStore } from '@/frontend/features/editor/stores/videoEditor/index';
import {
  closeProjectAction,
  exportVideoAction,
  importMediaAction,
  newProjectAction,
  openProjectAction,
  saveProjectAction,
  saveProjectAsAction,
} from '@/frontend/features/editor/stores/videoEditor/shortcuts/actions';
import { useProjectShortcutDialog } from '@/frontend/features/editor/stores/videoEditor/shortcuts/hooks/useProjectShortcutDialog';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { Check } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HotkeysDialog } from './HotkeysDialog';

export const AppMenuBar = () => {
  const [showHotkeys, setShowHotkeys] = useState(false);
  const navigate = useNavigate();
  const importMediaFromDialog = useVideoEditorStore(
    (state) => state.importMediaFromDialog,
  );
  const tracks = useVideoEditorStore((state) => state.tracks);

  // Project save state
  const { lastSavedAt, isSaving, currentProject } = useProjectStore();

  // Check if project is saved (saved within last 5 seconds means "just saved")
  const isProjectSaved = useMemo(() => {
    if (!lastSavedAt || !currentProject) return false;
    const timeSinceLastSave = Date.now() - new Date(lastSavedAt).getTime();
    return timeSinceLastSave < 5000; // Consider "saved" if within 5 seconds
  }, [lastSavedAt, currentProject]);

  // Setup confirmation dialog for close project
  const { showConfirmation, ConfirmationDialog } = useProjectShortcutDialog();

  const handleOpenHotkeys = () => {
    setShowHotkeys(true);
  };

  // Project action handlers
  const handleNewProject = () => {
    newProjectAction(navigate).catch(console.error);
  };

  const handleOpenProject = () => {
    openProjectAction(navigate).catch(console.error);
  };

  const handleSaveProject = () => {
    saveProjectAction().catch(console.error);
  };

  const handleSaveProjectAs = () => {
    saveProjectAsAction().catch(console.error);
  };

  const handleImportMedia = () => {
    importMediaAction(importMediaFromDialog).catch(console.error);
  };

  const handleExportVideo = () => {
    exportVideoAction(tracks.length);
  };

  const handleCloseProject = () => {
    closeProjectAction(navigate, showConfirmation).catch(console.error);
  };

  return (
    <div className="flex items-center my-1">
      <Menubar variant="minimal">
        <MenubarMenu>
          <Link to="/">
            <MenubarTrigger>Home</MenubarTrigger>
          </Link>
        </MenubarMenu>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem onClick={handleNewProject}>
              New Project{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>N</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={handleOpenProject}>
              Open Project{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>O</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              onClick={handleSaveProject}
              disabled={isProjectSaved || isSaving || !currentProject}
            >
              <span className="flex items-center gap-2 flex-1">
                Save Project
                {isProjectSaved && (
                  <Check className="size-3.5 text-green-500" />
                )}
                {isSaving && (
                  <span className="text-xs text-muted-foreground">
                    Saving...
                  </span>
                )}
              </span>
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>S</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={handleSaveProjectAs}>
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
            <MenubarItem onClick={handleImportMedia}>
              Import Media{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>I</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={handleExportVideo}>
              Export Video{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>E</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem onClick={handleCloseProject}>
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
      <ConfirmationDialog />
    </div>
  );
};
