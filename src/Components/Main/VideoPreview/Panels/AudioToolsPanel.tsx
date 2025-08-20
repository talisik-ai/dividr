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
      <div className="p-4 space-y-4">
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white border-b border-gray-600 pb-1">
            Audio Controls
          </h4>

          {(['Volume', 'Fade In', 'Fade Out'] as const).map(
            (control, index) => {
              const configs = [
                { min: 0, max: 200, defaultValue: 100, unit: '%' },
                { min: 0, max: 10, defaultValue: 0, unit: 's', step: 0.1 },
                { min: 0, max: 10, defaultValue: 0, unit: 's', step: 0.1 },
              ];
              const config = configs[index];

              return (
                <div key={control} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-gray-300">{control}:</label>
                    <span className="text-xs text-white">
                      {config.defaultValue}
                      {config.unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={config.min}
                    max={config.max}
                    step={config.step || 1}
                    defaultValue={config.defaultValue}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              );
            },
          )}
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white border-b border-gray-600 pb-1">
            Audio Effects
          </h4>

          <button className="w-full bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded transition-colors duration-200 text-xs">
            Normalize Audio
          </button>

          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-300">Noise Reduction:</label>
            <button className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors duration-200 bg-gray-600">
              <span className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 translate-x-1" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
