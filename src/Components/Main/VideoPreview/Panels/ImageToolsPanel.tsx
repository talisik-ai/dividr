import React from 'react';
import { CustomPanelProps } from './PanelRegistry';

export const ImageToolsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  return (
    <div className={` ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-sm font-bold text-white">Image Tools</h3>
          <p className="text-xs text-gray-400">Edit and adjust images</p>
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
            Transform
          </h4>

          {(['Opacity', 'Rotation', 'Scale'] as const).map(
            (transform, index) => {
              const configs = [
                { min: 0, max: 100, defaultValue: 100 },
                { min: -180, max: 180, defaultValue: 0 },
                { min: 10, max: 500, defaultValue: 100 },
              ];
              const config = configs[index];

              return (
                <div key={transform} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-xs text-gray-300">
                      {transform}:
                    </label>
                    <span className="text-xs text-white">
                      {config.defaultValue}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={config.min}
                    max={config.max}
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
            Effects
          </h4>

          {(['Drop Shadow', 'Border'] as const).map((effect) => (
            <div key={effect} className="flex items-center justify-between">
              <label className="text-xs text-gray-300">{effect}:</label>
              <button className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors duration-200 bg-gray-600">
                <span className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 translate-x-1" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
