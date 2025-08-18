import React from 'react';
import { CustomPanelProps } from './PanelRegistry';

export const SettingsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
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
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white border-b border-gray-600 pb-1">
            Project Settings
          </h4>

          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-300">Project Name:</label>
              <input
                type="text"
                defaultValue="Untitled Project"
                className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-300">Auto Save:</label>
              <button className="relative inline-flex h-4 w-8 items-center rounded-full transition-colors duration-200 bg-blue-600">
                <span className="inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 translate-x-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-white border-b border-gray-600 pb-1">
            Export Settings
          </h4>

          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-xs text-gray-300">Format:</label>
              <select className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none">
                <option value="mp4">MP4</option>
                <option value="mov">MOV</option>
                <option value="avi">AVI</option>
                <option value="mkv">MKV</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-gray-300">Quality:</label>
              <select className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="ultra">Ultra</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-700">
          <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-xs font-medium transition-colors duration-200">
            Export Video
          </button>
        </div>
      </div>
    </div>
  );
};
