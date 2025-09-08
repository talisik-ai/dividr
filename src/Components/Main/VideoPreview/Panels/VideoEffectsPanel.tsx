import React from 'react';
import { BasePanel } from './BasePanel';
import { CustomPanelProps } from './PanelRegistry';

export const VideoEffectsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  return (
    <BasePanel
      title="Video Effects"
      description="Apply effects and filters to video"
      className={className}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Coming soon</p>
          <p className="text-xs mt-2">
            Video effects and filters will be available in the next update.
          </p>
        </div>
      </div>
    </BasePanel>
  );
};
