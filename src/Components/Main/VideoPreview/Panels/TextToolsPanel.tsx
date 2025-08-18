import React from 'react';
import { CustomPanelProps } from './PanelRegistry';

export const TextToolsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  return (
    <div
      className={`bg-gray-900 text-white border-r border-gray-700 transition-all duration-300 ${className || 'w-64'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div>
          <h3 className="text-lg font-bold text-white">Text Tools</h3>
          <p className="text-sm text-gray-400">Add and edit text elements</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors duration-200 text-xl leading-none"
            title="Close panel"
          >
            ×
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg text-sm font-medium transition-colors duration-200">
            Add Title
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg text-sm font-medium transition-colors duration-200">
            Add Subtitle
          </button>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-white border-b border-gray-600 pb-1">
            Text Formatting
          </h4>

          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-300">Font Size:</label>
              <input
                type="range"
                min="8"
                max="200"
                defaultValue="24"
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-300">Text Color:</label>
              <div className="flex items-center space-x-2">
                <input
                  type="color"
                  defaultValue="#ffffff"
                  className="w-8 h-6 rounded border border-gray-600 cursor-pointer"
                />
                <input
                  type="text"
                  defaultValue="#ffffff"
                  className="bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none flex-1"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
