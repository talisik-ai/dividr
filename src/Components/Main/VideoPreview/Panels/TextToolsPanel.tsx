import React from 'react';
import { CustomPanelProps } from './PanelRegistry';
import { useVideoEditorStore } from '../../../../store/videoEditorStore';

interface TextStyle {
  id: string;
  name: string;
  className: string;
  style?: React.CSSProperties;
}

const textStyles: TextStyle[] = [
  {
    id: 'regular',
    name: 'Regular',
    className: 'text-white text-sm',
    style: { fontWeight: '400' },
  },
  {
    id: 'semibold',
    name: 'Semibold',
    className: 'text-white text-sm',
    style: { fontWeight: '600' },
  },
  {
    id: 'bold',
    name: 'Bold',
    className: 'text-white text-sm',
    style: { fontWeight: '900' },
  },
  {
    id: 'italic',
    name: 'Italic',
    className: 'text-white text-sm',
    style: { fontWeight: '400', fontStyle: 'italic' },
  },
  {
    id: 'uppercase',
    name: 'UPPERCASE',
    className: 'text-white text-sm uppercase',
    style: { fontWeight: '800' },
  },
  {
    id: 'script',
    name: 'Script',
    className: 'text-white text-sm',
    style: { fontFamily: '"Segoe Script", cursive', fontWeight: '400' },
  },
];

const StyleButton: React.FC<{
  style: TextStyle;
  onClick: (styleId: string) => void;
  isActive: boolean;
  disabled?: boolean;
}> = ({ style, onClick, isActive, disabled = false }) => (
  <button
    className={`py-8 px-2 rounded-lg transition-all duration-200 text-center border-2 ${
      disabled
        ? 'bg-gray-900 border-gray-800 cursor-not-allowed opacity-50'
        : isActive
          ? 'bg-blue-600 hover:bg-blue-700 border-blue-500'
          : 'bg-zinc-800 hover:bg-zinc-700 border-transparent'
    }`}
    title={
      disabled
        ? 'Import subtitle files to apply text styling'
        : `Apply ${style.name.toLowerCase()} text style`
    }
    onClick={() => !disabled && onClick(style.id)}
    disabled={disabled}
  >
    <div className={style.className} style={style.style}>
      {style.name}
    </div>
  </button>
);

export const TextToolsPanel: React.FC<CustomPanelProps> = ({
  className,
  onClose,
}) => {
  const { tracks, textStyle, setActiveTextStyle } = useVideoEditorStore();

  // Check if there are any subtitle tracks
  const subtitleTracks = tracks.filter((track) => track.type === 'subtitle');
  const hasSubtitles = subtitleTracks.length > 0;

  const handleStyleClick = (styleId: string) => {
    setActiveTextStyle(styleId);
    console.log(`Applied style: ${styleId}`);
  };

  return (
    <div className={` ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div>
          <h3 className="text-sm font-bold text-white">Text</h3>
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
        {/* Text Styles Section */}
        <div className="space-y-3">
          {!hasSubtitles && (
            <div className="mb-4 p-3 bg-gray-800/50 border border-gray-700 rounded-lg">
              <p className="text-xs text-gray-400 text-center">
                💬 Import subtitle files to apply text styling
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {textStyles.map((style) => (
              <StyleButton
                key={style.id}
                style={style}
                onClick={handleStyleClick}
                isActive={textStyle.activeStyle === style.id}
                disabled={!hasSubtitles}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
