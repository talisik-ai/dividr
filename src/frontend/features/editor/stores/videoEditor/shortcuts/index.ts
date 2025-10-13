/* eslint-disable @typescript-eslint/no-explicit-any */
import { createGlobalShortcuts } from './globalShortcuts';
import { createPreviewShortcuts } from './previewShortcuts';
import { createTimelineShortcuts } from './timelineShortcuts';
import { createTrackShortcuts } from './trackShortcuts';
import { ShortcutConfig, ShortcutScope } from './types';

/**
 * Central shortcut registry
 * Single source of truth for all keyboard shortcuts in the video editor
 */
export class ShortcutRegistry {
  private shortcuts: Map<string, ShortcutConfig> = new Map();

  /**
   * Initialize the registry with all shortcuts
   */
  initialize(getStore: () => any, effectiveEndFrame: number): void {
    this.shortcuts.clear();

    // Register global shortcuts
    const globalShortcuts = createGlobalShortcuts(getStore, effectiveEndFrame);
    globalShortcuts.forEach((shortcut) => {
      this.shortcuts.set(shortcut.id, shortcut);
    });

    // Get store instance for other shortcuts
    const store = getStore();

    // Register timeline shortcuts
    const timelineShortcuts = createTimelineShortcuts(store);
    timelineShortcuts.forEach((shortcut) => {
      this.shortcuts.set(shortcut.id, shortcut);
    });

    // Register track shortcuts
    const trackShortcuts = createTrackShortcuts(store);
    trackShortcuts.forEach((shortcut) => {
      this.shortcuts.set(shortcut.id, shortcut);
    });

    // Register preview shortcuts
    const previewShortcuts = createPreviewShortcuts(() => getStore());
    previewShortcuts.forEach((shortcut) => {
      this.shortcuts.set(shortcut.id, shortcut);
    });
  }

  /**
   * Get all shortcuts
   */
  getAllShortcuts(): ShortcutConfig[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts by scope
   */
  getShortcutsByScope(scope: ShortcutScope): ShortcutConfig[] {
    return this.getAllShortcuts().filter((s) => s.scope === scope);
  }

  /**
   * Get shortcuts by category
   */
  getShortcutsByCategory(category: string): ShortcutConfig[] {
    return this.getAllShortcuts().filter((s) => s.category === category);
  }

  /**
   * Get a single shortcut by ID
   */
  getShortcut(id: string): ShortcutConfig | undefined {
    return this.shortcuts.get(id);
  }

  /**
   * Get all categories
   */
  getCategories(): string[] {
    const categories = new Set<string>();
    this.getAllShortcuts().forEach((shortcut) => {
      categories.add(shortcut.category);
    });
    return Array.from(categories);
  }

  /**
   * Get shortcuts grouped by category
   */
  getShortcutsByCategories(): Record<string, ShortcutConfig[]> {
    const result: Record<string, ShortcutConfig[]> = {};
    const categories = this.getCategories();

    categories.forEach((category) => {
      result[category] = this.getShortcutsByCategory(category);
    });

    return result;
  }
}

// Export singleton instance
export const shortcutRegistry = new ShortcutRegistry();

// Re-export types and shortcut creators
export { createGlobalShortcuts } from './globalShortcuts';
export { createPreviewShortcuts } from './previewShortcuts';
export { createTimelineShortcuts } from './timelineShortcuts';
export { createTrackShortcuts } from './trackShortcuts';
export * from './types';
