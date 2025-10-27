// This file registers all custom panel components
import { AudioToolsPanel } from './components/audioToolsPanel';
import { CaptionsPanel } from './components/captionsPanel';
import { ImageToolsPanel } from './components/imageToolsPanel';
import { MediaImportPanel } from './components/mediaImportPanel';
import { SettingsPanel } from './components/settingsPanel';
import { TextToolsPanel } from './components/textToolsPanel';
import { VideoEffectsPanel } from './components/videoEffectsPanel';
import { registerPanelComponent } from './panelRegistry';

// Register all panel components
export const initializePanelRegistry = () => {
  registerPanelComponent('media-import', MediaImportPanel);
  registerPanelComponent('text-tools', TextToolsPanel);
  registerPanelComponent('video-effects', VideoEffectsPanel);
  registerPanelComponent('images', ImageToolsPanel);
  registerPanelComponent('audio-tools', AudioToolsPanel);
  registerPanelComponent('settings', SettingsPanel);
  registerPanelComponent('captions', CaptionsPanel);
};
