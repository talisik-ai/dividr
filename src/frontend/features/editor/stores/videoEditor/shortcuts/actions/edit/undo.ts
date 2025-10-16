/**
 * Undo Action Handler (Ctrl+Z)
 * Undoes the last action in the editor
 */

export const undoAction = (undo: () => void, canUndo: () => boolean) => {
  if (!canUndo()) {
    return;
  }

  undo();
};
