import React from 'react';
import { CustomPanelProps } from './PanelRegistry';

export const AudioToolsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  return (
    <div className={` ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-sm font-bold text-white">Audio Tools</h3>
          <p className="text-xs text-gray-400">Edit and enhance audio</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors duration-200 text-lg leading-none"
            title="Close panel"
          >
            ×
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">Coming soon</div>
    </div>
  );
};
