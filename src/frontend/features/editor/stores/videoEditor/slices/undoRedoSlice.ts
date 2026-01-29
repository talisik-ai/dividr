/* eslint-disable @typescript-eslint/no-explicit-any */
import { StateCreator } from 'zustand';
import { MediaLibraryItem, VideoTrack } from '../types';

/**
 * UndoableState - Represents the state that can be undone/redone
 * This includes only the mutable editing state, not UI state like playback or preview
 */
export interface UndoableState {
  tracks: VideoTrack[];
  mediaLibrary: MediaLibraryItem[];
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
  // Text style global controls for subtitle styling (undo/redo support)
  textStyle: {
    activeStyle: string;
    styleApplicationMode: 'all' | 'selected';
    globalControls: {
      fontFamily: string;
      isBold: boolean;
      isItalic: boolean;
      isUnderline: boolean;
      textTransform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
      textAlign: 'left' | 'center' | 'right' | 'justify';
      fontSize: number;
      fillColor: string;
      strokeColor: string;
      backgroundColor: string;
      hasShadow: boolean;
      letterSpacing: number;
      lineHeight: number;
      hasGlow: boolean;
      opacity: number;
    };
    // Global subtitle position for transform undo/redo support
    globalSubtitlePosition: {
      x: number;
      y: number;
      scale: number;
      width: number;
      height: number;
    };
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

  // Batch transaction grouping
  isGrouping: boolean; // Flag to indicate we're in a grouped transaction
  groupStartState: UndoableState | null; // State at the start of a group
  groupActionName: string | null; // Name of the grouped action

  // Actions
  undo: () => void;
  redo: () => void;
  recordAction: (actionName?: string) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  setMaxHistorySize: (size: number) => void;

  // Batch transaction grouping
  beginGroup: (actionName: string) => void;
  endGroup: () => void;
  forceEndGroup: () => void; // Emergency cleanup for stuck grouping state

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
  isGrouping: false,
  groupStartState: null,
  groupActionName: null,

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
      mediaLibrary: JSON.parse(JSON.stringify(state.mediaLibrary || [])),
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
      textStyle: {
        activeStyle: state.textStyle?.activeStyle || 'default',
        styleApplicationMode: state.textStyle?.styleApplicationMode || 'all',
        globalControls: JSON.parse(
          JSON.stringify(state.textStyle?.globalControls || {}),
        ),
        globalSubtitlePosition: {
          x: state.textStyle?.globalSubtitlePosition?.x ?? 0,
          y: state.textStyle?.globalSubtitlePosition?.y ?? 0.7,
          scale: state.textStyle?.globalSubtitlePosition?.scale ?? 1,
          width: state.textStyle?.globalSubtitlePosition?.width ?? 0,
          height: state.textStyle?.globalSubtitlePosition?.height ?? 0,
        },
      },
    };
  },

  restoreUndoableState: (undoableState: UndoableState) => {
    set((state: any) => ({
      ...state,
      tracks: JSON.parse(JSON.stringify(undoableState.tracks)),
      mediaLibrary: JSON.parse(JSON.stringify(undoableState.mediaLibrary)),
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
      textStyle: {
        ...state.textStyle,
        activeStyle: undoableState.textStyle.activeStyle,
        styleApplicationMode: undoableState.textStyle.styleApplicationMode,
        globalControls: JSON.parse(
          JSON.stringify(undoableState.textStyle.globalControls),
        ),
        globalSubtitlePosition: {
          x: undoableState.textStyle.globalSubtitlePosition?.x ?? 0,
          y: undoableState.textStyle.globalSubtitlePosition?.y ?? 0.7,
          scale: undoableState.textStyle.globalSubtitlePosition?.scale ?? 1,
          width: undoableState.textStyle.globalSubtitlePosition?.width ?? 0,
          height: undoableState.textStyle.globalSubtitlePosition?.height ?? 0,
        },
      },
    }));
  },

  recordAction: (actionName?: string) => {
    const state = get() as any;

    // Don't record if we're in the middle of undo/redo
    if (!state.isRecording) {
      return;
    }

    // Don't record individual actions if we're in a grouped transaction
    // The group will be recorded when endGroup() is called
    if (state.isGrouping) {
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

  beginGroup: (actionName: string) => {
    const state = get() as any;

    // If already grouping, force end the previous group to prevent stuck state
    // This can happen if a component unmounts during a drag operation
    if (state.isGrouping) {
      console.warn(
        `⚠️ Already grouping (${state.groupActionName}), forcing end before starting new group: ${actionName}`,
      );
      // Force end the previous group without recording (cleanup only)
      set({
        isGrouping: false,
        groupStartState: null,
        groupActionName: null,
      });
    }

    // Don't start a group if not recording
    if (!state.isRecording) {
      console.warn('⚠️ Cannot begin group: not recording');
      return;
    }

    // Capture the state at the start of the group
    const startState = state.captureUndoableState();

    set({
      isGrouping: true,
      groupStartState: startState,
      groupActionName: actionName,
    });

    console.log(`🔗 Begin group: ${actionName}`);
  },

  endGroup: () => {
    const state = get() as any;

    // Don't end a group if we're not in one
    if (!state.isGrouping) {
      console.warn('⚠️ Cannot end group: not currently grouping');
      return;
    }

    // Capture the final state after all operations in the group
    const finalState = state.captureUndoableState();

    // Only record if the state actually changed
    const stateChanged =
      JSON.stringify(state.groupStartState) !== JSON.stringify(finalState);

    if (stateChanged && state.groupStartState) {
      const newEntry: HistoryEntry = {
        state: state.groupStartState,
        timestamp: Date.now(),
        actionName: state.groupActionName || 'Grouped Action',
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
          isGrouping: false,
          groupStartState: null,
          groupActionName: null,
        };
      });

      console.log(
        `✅ End group: ${state.groupActionName} (state changed, recorded)`,
      );
    } else {
      // State didn't change, just reset the grouping flags
      set({
        isGrouping: false,
        groupStartState: null,
        groupActionName: null,
      });

      console.log(
        `⏭️ End group: ${state.groupActionName} (no state change, not recorded)`,
      );
    }
  },

  forceEndGroup: () => {
    const state = get() as any;

    if (!state.isGrouping) {
      return; // Nothing to clean up
    }

    console.warn(
      `⚠️ Force ending group: ${state.groupActionName} (cleanup from stuck state)`,
    );

    set({
      isGrouping: false,
      groupStartState: null,
      groupActionName: null,
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
