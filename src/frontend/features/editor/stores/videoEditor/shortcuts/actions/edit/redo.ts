/**
 * Redo Action Handler (Ctrl+Shift+Z or Ctrl+Y)
 * Redoes the last undone action in the editor
 */

export const redoAction = (redo: () => void, canRedo: () => boolean) => {
  if (!canRedo()) {
    return;
  }

  redo();
};
