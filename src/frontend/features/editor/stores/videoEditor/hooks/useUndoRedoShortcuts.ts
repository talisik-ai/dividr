/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo } from 'react';
import { useHotkeys } from 'react-hotkeys-hook';
import { useVideoEditorStore } from '../index';
import { createUndoRedoShortcuts } from '../shortcuts/undoRedoShortcuts';

/**
 * Hook for undo/redo keyboard shortcuts
 * These shortcuts are globally active throughout the editor
 */
export const useUndoRedoShortcuts = () => {
  const undoStack = useVideoEditorStore((state) => state.undoStack);
  const redoStack = useVideoEditorStore((state) => state.redoStack);

  // Create undo/redo shortcuts with a getter function to always access fresh state
  const undoRedoShortcuts = useMemo(
    () => createUndoRedoShortcuts(useVideoEditorStore.getState),
    [],
  );

  // Undo (Ctrl+Z / Cmd+Z)
  useHotkeys(
    ['ctrl+z', 'meta+z'],
    undoRedoShortcuts[0].handler,
    undoRedoShortcuts[0].options,
    [undoStack.length],
  );

  // Redo (Ctrl+Shift+Z / Cmd+Shift+Z)
  useHotkeys(
    ['ctrl+shift+z', 'meta+shift+z'],
    undoRedoShortcuts[1].handler,
    undoRedoShortcuts[1].options,
    [redoStack.length],
  );

  // Redo alternative (Ctrl+Y / Cmd+Y)
  useHotkeys(
    ['ctrl+y', 'meta+y'],
    undoRedoShortcuts[2].handler,
    undoRedoShortcuts[2].options,
    [redoStack.length],
  );

  return {
    shortcuts: undoRedoShortcuts,
  };
};
