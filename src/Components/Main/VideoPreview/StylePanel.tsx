/* eslint-disable prettier/prettier */
import React, { useCallback } from 'react';
import {
  useActivePanelType,
  usePanelContent,
  usePanelStore,
  usePanelWidth,
  type PanelItem,
  type PanelSection
} from '../../../Store/PanelStore';
import { useVideoEditorStore } from '../../../store/VideoEditorStore';
import { getCustomPanelComponent, hasCustomPanelComponent } from './Panels/PanelRegistry';
import { initializePanelRegistry } from './Panels/registerPanels';

interface StylePanelProps {
  className?: string;
}

// Component for rendering individual panel items
const PanelItemComponent: React.FC<{
  item: PanelItem;
  onUpdate: (value: string | number | boolean) => void;
}> = ({ item, onUpdate }) => {
  const handleChange = useCallback(
    (value: string | number | boolean) => {
      onUpdate(value);
      if (item.action) {
        item.action();
      }
    },
    [onUpdate, item.action],
  );

  const baseInputStyle =
    'bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-400 focus:outline-none';
  const baseButtonStyle =
    'bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1 rounded transition-colors duration-200';

  switch (item.type) {
    case 'button':
      return (
        <button onClick={() => handleChange(true)} className={baseButtonStyle}>
          {item.label}
        </button>
      );

    case 'slider':
      return (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-xs text-gray-300">{item.label}:</label>
            <span className="text-xs text-white">{item.value}</span>
          </div>
          <input
            type="range"
            min={item.min || 0}
            max={item.max || 100}
            step={item.step || 1}
            value={typeof item.value === 'number' ? item.value : 0}
            onChange={(e) => handleChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          />
        </div>
      );

    case 'input':
      return (
        <div className="space-y-1">
          <label className="text-xs text-gray-300">{item.label}:</label>
          <input
            type="text"
            value={typeof item.value === 'string' ? item.value : ''}
            onChange={(e) => handleChange(e.target.value)}
            className={baseInputStyle}
          />
        </div>
      );

    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <label className="text-xs text-gray-300">{item.label}:</label>
          <button
            onClick={() => handleChange(!item.value)}
            className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors duration-200 ${
              item.value ? 'bg-blue-600' : 'bg-gray-600'
            }`}
          >
            <span
              className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200 ${
                item.value ? 'translate-x-4' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      );

    case 'select':
      return (
        <div className="space-y-1">
          <label className="text-xs text-gray-300">{item.label}:</label>
          <select
            value={typeof item.value === 'string' ? item.value : ''}
            onChange={(e) => handleChange(e.target.value)}
            className={baseInputStyle}
          >
            {item.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );

    case 'color':
      return (
        <div className="space-y-1">
          <label className="text-xs text-gray-300">{item.label}:</label>
          <div className="flex items-center space-x-2">
            <input
              type="color"
              value={typeof item.value === 'string' ? item.value : '#ffffff'}
              onChange={(e) => handleChange(e.target.value)}
              className="w-8 h-6 rounded border border-gray-600 cursor-pointer"
            />
            <input
              type="text"
              value={typeof item.value === 'string' ? item.value : '#ffffff'}
              onChange={(e) => handleChange(e.target.value)}
              className={`${baseInputStyle} flex-1`}
            />
          </div>
        </div>
      );

    case 'info':
      return <div className="text-xs text-gray-400 italic">{item.label}</div>;

    default:
      return null;
  }
};

// Component for rendering panel sections
const PanelSectionComponent: React.FC<{
  section: PanelSection;
  onUpdateItem: (itemId: string, value: string | number | boolean) => void;
}> = ({ section, onUpdateItem }) => {
  return (
    <div className="space-y-3 bg-secondary">
      <h4 className="text-sm font-semibold text-white border-b border-gray-600 pb-1">
        {section.title}
      </h4>
      <div className="space-y-2">
        {section.items.map((item) => (
          <PanelItemComponent
            key={item.id}
            item={item}
            onUpdate={(value) => onUpdateItem(item.id, value)}
          />
        ))}
      </div>
    </div>
  );
};

// Initialize panel registry once
initializePanelRegistry();

export const StylePanel: React.FC<StylePanelProps> = ({ className }) => {
  const { tracks, timeline, preview } = useVideoEditorStore();
  const { updatePanelItem, hidePanel } = usePanelStore();
  const panelContent = usePanelContent();
  const activePanelType = useActivePanelType();
  const panelWidth = usePanelWidth();

  const handleUpdateItem = useCallback(
    (sectionId: string, itemId: string, value: string | number | boolean) => {
      updatePanelItem(sectionId, itemId, value);
    },
    [updatePanelItem],
  );

  const handleClosePanel = useCallback(() => {
    hidePanel();
  }, [hidePanel]);

  // Check if this panel type has a custom component
  if (activePanelType && hasCustomPanelComponent(activePanelType)) {
    const CustomComponent = getCustomPanelComponent(activePanelType);
    const basePanelClasses =
  "bg-secondary text-white border-r border-gray-700 transition-all duration-300 w-[22%] text-xs";

    if (CustomComponent) {
      return (
        <React.Suspense
        fallback={
          <div
            className={`${basePanelClasses} ${className} flex items-center justify-center`}
          >
            <div className="text-gray-400">Loading...</div>
          </div>
        }
      >
        <CustomComponent
          className={`${basePanelClasses} ${className}`}
          onClose={handleClosePanel}
        />
      </React.Suspense>
      );
    }
  }

  // Fallback to config-based panel for panels without custom components
  if (!panelContent) {
    return null;
  }

  return (
    <div
      className={`overflow-auto bg-secondary text-white border-r border-gray-700 transition-all duration-300 ${className || panelWidth}`}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-600">
        <div>
          <h3 className="text-sm font-bold text-white">{panelContent.title}</h3>
          {panelContent.description && (
            <p className="text-xs text-gray-400 mt-1">
              {panelContent.description}
            </p>
          )}
        </div>
        <button
          onClick={handleClosePanel}
          className="text-gray-400 hover:text-white transition-colors duration-200 text-lg leading-none"
          title="Close panel"
        >
          ×
        </button>
      </div>

      {/* Panel Content */}
      <div className="p-4 space-y-6 overflow-auto h-full">
        {panelContent.sections.map((section) => (
          <PanelSectionComponent
            key={section.id}
            section={section}
            onUpdateItem={(itemId, value) =>
              handleUpdateItem(section.id, itemId, value)
            }
          />
        ))}

        {/* Always show project info at the bottom */}
        <div className="mt-8 pt-4 border-t border-gray-600 space-y-2">
          <h4 className="text-sm font-semibold text-white">Project Info</h4>
          <div className="space-y-1 text-xs text-gray-400">
            <div className="flex justify-between">
              <span>Tracks:</span>
              <span>{tracks.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Selected:</span>
              <span>{timeline.selectedTrackIds.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Resolution:</span>
              <span>
                {preview.canvasWidth} × {preview.canvasHeight}
              </span>
            </div>
            <div className="flex justify-between">
              <span>FPS:</span>
              <span>{timeline.fps}</span>
            </div>
            <div className="flex justify-between">
              <span>Duration:</span>
              <span>{(timeline.totalFrames / timeline.fps).toFixed(2)}s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
