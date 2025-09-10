import React from 'react';
import { BasePanel } from './BasePanel';
import { CustomPanelProps } from './PanelRegistry';

export const AudioToolsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  return (
    <BasePanel
      title="Audio Tools"
      description="Edit and enhance audio tracks"
      className={className}
    >
      <div className="space-y-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Coming soon</p>
          <p className="text-xs mt-2">
            Audio editing tools will be available in the next update.
          </p>
        </div>
      </div>
    </BasePanel>
  );
};
