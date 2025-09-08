import { cn } from '@/Lib/utils';
import React from 'react';
import { useVideoEditorStore } from '../../../../Store/VideoEditorStore';
import { BasePanel } from './BasePanel';
import { CustomPanelProps } from './PanelRegistry';

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
    className={`py-6 px-2 rounded-lg transition-all duration-200 text-center border-2 ${
      disabled
        ? 'bg-muted border-border cursor-not-allowed opacity-50'
        : isActive
          ? 'bg-primary hover:bg-primary/90 border-primary text-primary-foreground'
          : 'bg-muted/50 hover:bg-muted border-transparent'
    }`}
    title={
      disabled
        ? 'Import subtitle files to apply text styling'
        : `Apply ${style.name.toLowerCase()} text style`
    }
    onClick={() => !disabled && onClick(style.id)}
    disabled={disabled}
  >
    <div
      className={cn(
        'truncate text-xs',
        isActive ? 'text-primary-foreground' : 'text-foreground',
      )}
      style={style.style}
    >
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
    <BasePanel
      title="Text Tools"
      description="Style and format text elements"
      className={className}
      onClose={onClose}
    >
      <div className="space-y-4">
        {/* Info Section */}
        {!hasSubtitles && (
          <div className="p-3 bg-muted/50 border border-border rounded-lg">
            <p className="text-xs text-muted-foreground text-center">
              💬 Import subtitle files to apply text styling
            </p>
          </div>
        )}

        {/* Text Styles Section */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Text Styles</h4>
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
    </BasePanel>
  );
};
