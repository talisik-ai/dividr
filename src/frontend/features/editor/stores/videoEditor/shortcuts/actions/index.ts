/**
 * Keyboard Shortcut Actions
 * Centralized export for all keyboard shortcut action handlers
 */

// Project actions
export { closeProjectAction } from './files/closeProject';
export { exportVideoAction } from './files/exportVideo';
export { importMediaAction } from './files/importMedia';
export { newProjectAction } from './files/newProject';
export { openProjectAction } from './files/openProject';
export { saveProjectAction } from './files/saveProject';
export { saveProjectAsAction } from './files/saveProjectAs';

// Edit actions
export { deselectAllTracksAction } from './edit/deselectAllTracks';
export { redoAction } from './edit/redo';
export { selectAllTracksAction } from './edit/selectAllTracks';
export { undoAction } from './edit/undo';

// Clipboard actions
export { copyTracksAction } from './edit/copyTracks';
export { cutTracksAction } from './edit/cutTracks';
export { duplicateTracksAction } from './edit/duplicateTracks';
export { pasteTracksAction } from './edit/pasteTracks';
