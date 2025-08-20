import React from 'react';
import { CustomPanelProps } from './PanelRegistry';

export const VideoEffectsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  return (
    <div className={`${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-sm font-bold text-white">Video Effects</h3>
          <p className="text-xs text-gray-400">Apply effects and filters</p>
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
            Basic Adjustments
          </h4>

          {(['Brightness', 'Contrast', 'Saturation'] as const).map((effect) => (
            <div key={effect} className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs text-gray-300">{effect}:</label>
                <span className="text-xs text-white">0</span>
              </div>
              <input
                type="range"
                min="-100"
                max="100"
                defaultValue="0"
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white border-b border-gray-600 pb-1">
            Filters
          </h4>

          {(['Blur', 'Sepia', 'Grayscale'] as const).map((filter) => (
            <div key={filter} className="flex items-center justify-between">
              <label className="text-xs text-gray-300">{filter}:</label>
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
