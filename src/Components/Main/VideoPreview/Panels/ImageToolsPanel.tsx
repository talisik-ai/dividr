import React from 'react';
import { BasePanel } from './BasePanel';
import { CustomPanelProps } from './PanelRegistry';

export const ImageToolsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  return (
    <BasePanel
      title="Image Tools"
      description="Edit and adjust image elements"
      className={className}
      onClose={onClose}
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
