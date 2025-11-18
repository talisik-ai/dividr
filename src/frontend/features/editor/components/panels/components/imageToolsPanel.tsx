import React from 'react';
import { BasePanel } from '../../../components/panels/basePanel';
import { CustomPanelProps } from '../../../components/panels/panelRegistry';

export const ImageToolsPanel: React.FC<CustomPanelProps> = ({ className }) => {
  return (
    <BasePanel
      title="Image Tools"
      description="Edit and adjust image elements"
      className={className}
    >
      <div className="space-y-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Coming soon</p>
          <p className="text-xs mt-2">
            Image editing tools will be available in the next update.
          </p>
        </div>
      </div>
    </BasePanel>
  );
};
