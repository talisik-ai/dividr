/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Keyboard shortcut scope determines when a shortcut should be active
 */
export type ShortcutScope = 'global' | 'timeline' | 'track' | 'preview';

/**
 * Shortcut priority - higher priority shortcuts take precedence
 */
export type ShortcutPriority = 'high' | 'normal' | 'low';

/**
 * Shortcut handler callback type
 */
export type ShortcutHandlerCallback = (
  event?: KeyboardEvent,
  handler?: any,
) => void;

/**
 * Shortcut configuration interface
 */
export interface ShortcutConfig {
  /** Unique identifier for the shortcut */
  id: string;
  /** Key combination (e.g., 'space', 'ctrl+k', 'cmd+d') */
  keys: string | string[];
  /** Human-readable description */
  description: string;
  /** Category for organization in UI */
  category: string;
  /** Scope where this shortcut is active */
  scope: ShortcutScope;
  /** Priority level */
  priority?: ShortcutPriority;
  /** Handler function */
  handler: ShortcutHandlerCallback;
  /** Options for react-hotkeys-hook */
  options?: {
    enableOnFormTags?: boolean;
    preventDefault?: boolean;
    enabled?: boolean;
  };
}

/**
 * Shortcut handler function type
 */
export type ShortcutHandler = (
  event?: KeyboardEvent,
  handler?: any,
) => void | boolean;

/**
 * Shortcut registry entry
 */
export interface ShortcutRegistryEntry {
  config: ShortcutConfig;
  isActive: boolean;
}

/**
 * Context for shortcut execution
 */
export interface ShortcutContext {
  /** Whether the timeline is focused */
  timelineFocused: boolean;
  /** Whether a track is focused */
  trackFocused: boolean;
  /** Whether the preview is focused */
  previewFocused: boolean;
  /** Whether split mode is active */
  splitModeActive: boolean;
  /** Whether playback is in progress */
  isPlaying: boolean;
  /** Whether tracks are being dragging */
  isDragging: boolean;
}
