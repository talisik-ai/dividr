/**
 * Keyboard Shortcut Actions
 * Centralized export for all keyboard shortcut action handlers
 */

// Project actions
export { closeProjectAction } from './projects/closeProject';
export { exportVideoAction } from './projects/exportVideo';
export { importMediaAction } from './projects/importMedia';
export { newProjectAction } from './projects/newProject';
export { openProjectAction } from './projects/openProject';
export { saveProjectAction } from './projects/saveProject';
export { saveProjectAsAction } from './projects/saveProjectAs';

// Edit actions
export { deselectAllTracksAction } from './files/deselectAllTracks';
export { redoAction } from './files/redo';
export { selectAllTracksAction } from './files/selectAllTracks';
export { undoAction } from './files/undo';
