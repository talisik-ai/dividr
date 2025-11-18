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
  copyTracksAction,
  cutTracksAction,
  deselectAllTracksAction,
  duplicateTracksAction,
  exportVideoAction,
  importMediaAction,
  newProjectAction,
  openProjectAction,
  pasteTracksAction,
  redoAction,
  saveProjectAction,
  saveProjectAsAction,
  selectAllTracksAction,
  undoAction,
} from '@/frontend/features/editor/stores/videoEditor/shortcuts/actions';
import { useProjectShortcutDialog } from '@/frontend/features/editor/stores/videoEditor/shortcuts/hooks/useProjectShortcutDialog';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { Check } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HotkeysDialog } from './HotkeysDialog';

const AppMenuBarComponent = () => {
  const [showHotkeys, setShowHotkeys] = useState(false);
  const navigate = useNavigate();
  const importMediaFromDialog = useVideoEditorStore(
    (state) => state.importMediaFromDialog,
  );
  const tracks = useVideoEditorStore((state) => state.tracks);
  const tracksLength = tracks.length;

  // Undo/Redo state
  const undo = useVideoEditorStore((state) => state.undo);
  const redo = useVideoEditorStore((state) => state.redo);
  const canUndo = useVideoEditorStore((state) => state.canUndo);
  const canRedo = useVideoEditorStore((state) => state.canRedo);

  // Track selection state
  const setSelectedTracks = useVideoEditorStore(
    (state) => state.setSelectedTracks,
  );
  const selectedTrackIds = useVideoEditorStore(
    (state) => state.timeline.selectedTrackIds,
  );
  const selectedTrackIdsLength = selectedTrackIds.length;

  // Clipboard state
  const copyTracks = useVideoEditorStore((state) => state.copyTracks);
  const cutTracks = useVideoEditorStore((state) => state.cutTracks);
  const pasteTracks = useVideoEditorStore((state) => state.pasteTracks);
  const hasClipboardData = useVideoEditorStore(
    (state) => state.hasClipboardData,
  );
  const duplicateTrack = useVideoEditorStore((state) => state.duplicateTrack);
  const removeSelectedTracks = useVideoEditorStore(
    (state) => state.removeSelectedTracks,
  );

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

  const handleOpenHotkeys = useCallback(() => {
    setShowHotkeys(true);
  }, []);

  const handleCloseHotkeys = useCallback((open: boolean) => {
    setShowHotkeys(open);
  }, []);

  // Project action handlers - memoized to prevent re-creation
  const handleNewProject = useCallback(() => {
    newProjectAction(navigate).catch(console.error);
  }, [navigate]);

  const handleOpenProject = useCallback(() => {
    openProjectAction(navigate).catch(console.error);
  }, [navigate]);

  const handleSaveProject = useCallback(() => {
    saveProjectAction().catch(console.error);
  }, []);

  const handleSaveProjectAs = useCallback(() => {
    saveProjectAsAction().catch(console.error);
  }, []);

  const handleImportMedia = useCallback(() => {
    importMediaAction(importMediaFromDialog).catch(console.error);
  }, [importMediaFromDialog]);

  const handleExportVideo = useCallback(() => {
    exportVideoAction(tracksLength);
  }, [tracksLength]);

  const handleCloseProject = useCallback(() => {
    closeProjectAction(navigate, showConfirmation).catch(console.error);
  }, [navigate, showConfirmation]);

  // Edit action handlers - memoized to prevent re-creation
  const handleUndo = useCallback(() => {
    undoAction(undo, canUndo);
  }, [undo, canUndo]);

  const handleRedo = useCallback(() => {
    redoAction(redo, canRedo);
  }, [redo, canRedo]);

  const handleSelectAll = useCallback(() => {
    selectAllTracksAction(tracks, setSelectedTracks);
  }, [tracks, setSelectedTracks]);

  const handleDeselectAll = useCallback(() => {
    deselectAllTracksAction(setSelectedTracks, selectedTrackIds);
  }, [setSelectedTracks, selectedTrackIds]);

  // Clipboard action handlers - memoized to prevent re-creation
  const handleCopy = useCallback(() => {
    copyTracksAction(selectedTrackIds, copyTracks);
  }, [selectedTrackIds, copyTracks]);

  const handleCut = useCallback(() => {
    cutTracksAction(selectedTrackIds, cutTracks);
  }, [selectedTrackIds, cutTracks]);

  const handlePaste = useCallback(() => {
    pasteTracksAction(hasClipboardData, pasteTracks);
  }, [hasClipboardData, pasteTracks]);

  const handleDuplicate = useCallback(() => {
    duplicateTracksAction(
      selectedTrackIds,
      tracks,
      duplicateTrack,
      setSelectedTracks,
    );
  }, [selectedTrackIds, tracks, duplicateTrack, setSelectedTracks]);

  const handleDelete = useCallback(() => {
    if (selectedTrackIds.length === 0) {
      return;
    }
    removeSelectedTracks();
  }, [selectedTrackIds.length, removeSelectedTracks]);

  return (
    <div className="flex items-center my-1 ml-4">
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
            <MenubarItem onClick={handleUndo} disabled={!canUndo()}>
              Undo{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>Z</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={handleRedo} disabled={!canRedo()}>
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
            <MenubarItem
              onClick={handleCut}
              disabled={selectedTrackIdsLength === 0}
            >
              Cut{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>X</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              onClick={handleCopy}
              disabled={selectedTrackIdsLength === 0}
            >
              Copy{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>C</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem onClick={handlePaste} disabled={!hasClipboardData()}>
              Paste{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>V</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              onClick={handleDuplicate}
              disabled={selectedTrackIdsLength === 0}
            >
              Duplicate{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>D</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              onClick={handleDelete}
              disabled={selectedTrackIdsLength === 0}
            >
              Delete{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Delete</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarItem
              onClick={handleSelectAll}
              disabled={tracksLength === 0}
            >
              Select All{' '}
              <MenubarShortcut>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>A</Kbd>
                </KbdGroup>
              </MenubarShortcut>
            </MenubarItem>
            <MenubarItem
              onClick={handleDeselectAll}
              disabled={selectedTrackIdsLength === 0}
            >
              Deselect All
            </MenubarItem>
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

      <HotkeysDialog open={showHotkeys} onOpenChange={handleCloseHotkeys} />
      <ConfirmationDialog />
    </div>
  );
};

AppMenuBarComponent.displayName = 'AppMenuBar';

export const AppMenuBar = AppMenuBarComponent;
