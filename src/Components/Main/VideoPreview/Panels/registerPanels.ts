// This file registers all custom panel components
import { AudioToolsPanel } from './AudioToolsPanel';
import { ImageToolsPanel } from './ImageToolsPanel';
import { MediaImportPanel } from './MediaImportPanel';
import { registerPanelComponent } from './PanelRegistry';
import { SettingsPanel } from './SettingsPanel';
import { TextToolsPanel } from './TextToolsPanel';
import { VideoEffectsPanel } from './VideoEffectsPanel';

// Register all panel components
export const initializePanelRegistry = () => {
  registerPanelComponent('media-import', MediaImportPanel);
  registerPanelComponent('text-tools', TextToolsPanel);
  registerPanelComponent('video-effects', VideoEffectsPanel);
  registerPanelComponent('images', ImageToolsPanel);
  registerPanelComponent('audio-tools', AudioToolsPanel);
  registerPanelComponent('settings', SettingsPanel);
};
