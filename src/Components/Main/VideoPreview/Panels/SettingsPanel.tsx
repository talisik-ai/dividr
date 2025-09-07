import React from 'react';
import { CustomPanelProps } from './PanelRegistry';
import { useVideoEditorStore } from '../../../../store/videoEditorStore';

export const SettingsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  const { preview } = useVideoEditorStore();

  return (
    <div className={` ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-sm font-bold text-white">Project Settings</h3>
          <p className="text-xs text-gray-400">Configure project and export</p>
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
      <div className="p-4 space-y-4">
        {/* Canvas Settings */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold text-white uppercase tracking-wide">
            Canvas
          </h4>

          {/* Background Info */}
          <div className="space-y-2">
            <label className="text-xs text-gray-300 block">Background:</label>
            <div className="text-xs text-white bg-gray-700 px-2 py-1 rounded border border-gray-600">
              Follows theme (Primary color)
            </div>
          </div>

          {/* Resolution Display */}
          <div className="space-y-1">
            <label className="text-xs text-gray-300 block">Resolution:</label>
            <div className="text-xs text-white bg-gray-700 px-2 py-1 rounded border border-gray-600">
              {preview.canvasWidth} × {preview.canvasHeight}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
