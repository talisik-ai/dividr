/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Utility functions to make actions undoable
 * These wrap existing actions to automatically record state before execution
 */

import { useVideoEditorStore } from '../index';

/**
 * makeUndoable - Wraps an action function to automatically record state before execution
 *
 * @param actionFn - The action function to make undoable
 * @param actionName - Optional name for debugging/display
 * @returns A wrapped function that records state before executing
 *
 * @example
 * const undoableAddTrack = makeUndoable(
 *   (trackData) => useVideoEditorStore.getState().addTrack(trackData),
 *   'Add Track'
 * );
 */
export const makeUndoable = <T extends (...args: any[]) => any>(
  actionFn: T,
  actionName?: string,
): T => {
  return ((...args: Parameters<T>) => {
    const store = useVideoEditorStore.getState();

    // Record state before action
    store.recordAction(actionName);

    // Execute the action
    return actionFn(...args);
  }) as T;
};

/**
 * batchUndoable - Groups multiple actions into a single undo/redo operation
 *
 * @param actions - Array of action functions to execute
 * @param actionName - Optional name for the batched operation
 *
 * @example
 * batchUndoable([
 *   () => store.addTrack(track1),
 *   () => store.addTrack(track2),
 * ], 'Add Multiple Tracks');
 */
export const batchUndoable = (
  actions: Array<() => void>,
  actionName?: string,
): void => {
  const store = useVideoEditorStore.getState();

  // Record state before batch
  store.recordAction(actionName);

  // Disable recording during batch execution
  useVideoEditorStore.setState({ isRecording: false });

  // Execute all actions
  actions.forEach((action) => action());

  // Re-enable recording
  useVideoEditorStore.setState({ isRecording: true });
};

/**
 * withUndo - Higher-order function that wraps a component's action handlers
 *
 * @example
 * const handleDeleteTrack = withUndo(
 *   (trackId: string) => {
 *     store.removeTrack(trackId);
 *   },
 *   'Delete Track'
 * );
 */
export const withUndo = <T extends (...args: any[]) => void>(
  handler: T,
  actionName?: string,
): T => {
  return ((...args: Parameters<T>) => {
    const store = useVideoEditorStore.getState();

    // Record state before action
    store.recordAction(actionName);

    // Execute handler
    handler(...args);
  }) as T;
};

/**
 * Hook to get undo/redo functions with action tracking
 */
export const useUndoableActions = () => {
  const store = useVideoEditorStore.getState();

  return {
    /**
     * Record current state snapshot
     */
    recordAction: (actionName?: string) => {
      store.recordAction(actionName);
    },

    /**
     * Execute an action with automatic undo recording
     */
    executeUndoable: <T extends (...args: any[]) => any>(
      actionFn: T,
      actionName?: string,
    ): ((...args: Parameters<T>) => ReturnType<T>) => {
      return (...args: Parameters<T>) => {
        store.recordAction(actionName);
        return actionFn(...args);
      };
    },

    /**
     * Batch multiple actions into a single undoable operation
     */
    executeBatch: (actions: Array<() => void>, actionName?: string) => {
      batchUndoable(actions, actionName);
    },
  };
};
