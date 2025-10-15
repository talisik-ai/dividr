import React from 'react';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';
import { useVideoEditorStore } from '../../../stores/videoEditor/index';

export const SettingsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  const { preview } = useVideoEditorStore();

  return (
    <BasePanel
      title="Project Settings"
      description="Configure project and export settings"
      className={className}
    >
      <div className="space-y-6">
        {/* Canvas Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-foreground">
            Canvas Settings
          </h4>

          {/* Background Info */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Background:</label>
            <div className="text-xs text-foreground bg-muted px-3 py-2 rounded-md border border-border">
              Follows theme (Primary color)
            </div>
          </div>

          {/* Resolution Display */}
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground">Resolution:</label>
            <div className="text-xs text-foreground bg-muted px-3 py-2 rounded-md border border-border">
              {preview.canvasWidth} × {preview.canvasHeight}
            </div>
          </div>
        </div>
      </div>
    </BasePanel>
  );
};
