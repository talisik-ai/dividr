/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { VideoTrack } from '../types';

/**
 * UndoableState - Represents the state that can be undone/redone
 * This includes only the mutable editing state, not UI state like playback or preview
 */
export interface UndoableState {
  tracks: VideoTrack[];
  timeline: {
    currentFrame: number;
    totalFrames: number;
    fps: number;
    inPoint?: number;
    outPoint?: number;
    selectedTrackIds: string[];
  };
  preview: {
    canvasWidth: number;
    canvasHeight: number;
    backgroundColor: string;
  };
}

/**
 * HistoryEntry - A single entry in the history stack
 */
export interface HistoryEntry {
  state: UndoableState;
  timestamp: number;
  actionName?: string; // Optional: for debugging/displaying action names
}

export interface UndoRedoSlice {
  // History stacks
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];

  // Config
  maxHistorySize: number;
  isRecording: boolean; // Flag to prevent recording during undo/redo

  // Actions
  undo: () => void;
  redo: () => void;
  recordAction: (actionName?: string) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  setMaxHistorySize: (size: number) => void;

  // Internal helpers
  captureUndoableState: () => UndoableState;
  restoreUndoableState: (state: UndoableState) => void;
}

export const createUndoRedoSlice: StateCreator<
  UndoRedoSlice,
  [],
  [],
  UndoRedoSlice
> = (set, get) => ({
  undoStack: [],
  redoStack: [],
  maxHistorySize: 50,
  isRecording: true,

  canUndo: () => {
    const state = get() as any;
    return state.undoStack.length > 0;
  },

  canRedo: () => {
    const state = get() as any;
    return state.redoStack.length > 0;
  },

  captureUndoableState: () => {
    const state = get() as any;

    return {
      tracks: JSON.parse(JSON.stringify(state.tracks || [])),
      timeline: {
        currentFrame: state.timeline.currentFrame,
        totalFrames: state.timeline.totalFrames,
        fps: state.timeline.fps,
        inPoint: state.timeline.inPoint,
        outPoint: state.timeline.outPoint,
        selectedTrackIds: [...(state.timeline.selectedTrackIds || [])],
      },
      preview: {
        canvasWidth: state.preview.canvasWidth,
        canvasHeight: state.preview.canvasHeight,
        backgroundColor: state.preview.backgroundColor,
      },
    };
  },

  restoreUndoableState: (undoableState: UndoableState) => {
    set((state: any) => ({
      ...state,
      tracks: JSON.parse(JSON.stringify(undoableState.tracks)),
      timeline: {
        ...state.timeline,
        currentFrame: undoableState.timeline.currentFrame,
        totalFrames: undoableState.timeline.totalFrames,
        fps: undoableState.timeline.fps,
        inPoint: undoableState.timeline.inPoint,
        outPoint: undoableState.timeline.outPoint,
        selectedTrackIds: [...undoableState.timeline.selectedTrackIds],
      },
      preview: {
        ...state.preview,
        canvasWidth: undoableState.preview.canvasWidth,
        canvasHeight: undoableState.preview.canvasHeight,
        backgroundColor: undoableState.preview.backgroundColor,
      },
    }));
  },

  recordAction: (actionName?: string) => {
    const state = get() as any;

    // Don't record if we're in the middle of undo/redo
    if (!state.isRecording) {
      return;
    }

    const currentState = state.captureUndoableState();
    const newEntry: HistoryEntry = {
      state: currentState,
      timestamp: Date.now(),
      actionName,
    };

    set((state: any) => {
      const newUndoStack = [...state.undoStack, newEntry];

      // Limit history size
      if (newUndoStack.length > state.maxHistorySize) {
        newUndoStack.shift(); // Remove oldest entry
      }

      return {
        undoStack: newUndoStack,
        redoStack: [], // Clear redo stack when new action is recorded
      };
    });
  },

  undo: () => {
    const state = get() as any;

    if (state.undoStack.length === 0) {
      console.log('Nothing to undo');
      return;
    }

    // Disable recording during undo
    set({ isRecording: false });

    // Capture current state for redo
    const currentState = state.captureUndoableState();
    const currentEntry: HistoryEntry = {
      state: currentState,
      timestamp: Date.now(),
    };

    // Pop from undo stack
    const undoStack = [...state.undoStack];
    const previousEntry = undoStack.pop();

    if (!previousEntry) {
      set({ isRecording: true });
      return;
    }

    // Restore previous state
    state.restoreUndoableState(previousEntry.state);

    // Update stacks
    set((state: any) => ({
      undoStack,
      redoStack: [...state.redoStack, currentEntry],
      isRecording: true,
    }));

    // Mark as unsaved
    const currentState2 = get() as any;
    currentState2.markUnsavedChanges?.();

    console.log(
      `↶ Undo: ${previousEntry.actionName || 'action'}`,
      `(${undoStack.length} in history)`,
    );
  },

  redo: () => {
    const state = get() as any;

    if (state.redoStack.length === 0) {
      console.log('Nothing to redo');
      return;
    }

    // Disable recording during redo
    set({ isRecording: false });

    // Capture current state for undo
    const currentState = state.captureUndoableState();
    const currentEntry: HistoryEntry = {
      state: currentState,
      timestamp: Date.now(),
    };

    // Pop from redo stack
    const redoStack = [...state.redoStack];
    const nextEntry = redoStack.pop();

    if (!nextEntry) {
      set({ isRecording: true });
      return;
    }

    // Restore next state
    state.restoreUndoableState(nextEntry.state);

    // Update stacks
    set((state: any) => ({
      undoStack: [...state.undoStack, currentEntry],
      redoStack,
      isRecording: true,
    }));

    // Mark as unsaved
    const currentState2 = get() as any;
    currentState2.markUnsavedChanges?.();

    console.log(
      `↷ Redo: ${nextEntry.actionName || 'action'}`,
      `(${redoStack.length} remaining)`,
    );
  },

  clearHistory: () => {
    set({
      undoStack: [],
      redoStack: [],
    });
    console.log('🗑️ History cleared');
  },

  setMaxHistorySize: (size: number) => {
    set({ maxHistorySize: Math.max(1, size) });
  },
});
