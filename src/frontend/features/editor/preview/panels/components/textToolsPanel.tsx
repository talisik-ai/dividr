import React from 'react';
import { BasePanel } from '../basePanel';
import { CustomPanelProps } from '../panelRegistry';

export const TextToolsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  return (
    <BasePanel
      title="Text Tools"
      description="Style and format text elements"
      className={className}
    >
      <div className="space-y-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Coming soon</p>
          <p className="text-xs mt-2">
            Subtitle styling has been moved to the Properties Panel. Select a
            subtitle track to customize its appearance.
          </p>
        </div>
      </div>
    </BasePanel>
  );
};
