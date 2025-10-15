import { cn } from '@/frontend/utils/utils';
import React from 'react';
import { useVideoEditorStore } from '../stores/videoEditor/index';

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
          ? 'bg-primary hover:bg-primary/90 border-primary'
          : 'bg-muted/50 hover:bg-muted border-transparent'
    }`}
    title={
      disabled
        ? 'Select a single subtitle track to apply text styling'
        : `Apply ${style.name.toLowerCase()} text style`
    }
    onClick={() => !disabled && onClick(style.id)}
    disabled={disabled}
  >
    <div
      className={cn(
        'truncate text-xs',
        isActive && !disabled ? 'text-primary-foreground' : 'text-foreground',
      )}
      style={style.style}
    >
      {style.name}
    </div>
  </button>
);

interface PropertiesPanelProps {
  className?: string;
}

export const PropertiesPanel: React.FC<PropertiesPanelProps> = ({
  className,
}) => {
  const { tracks, timeline, textStyle, setActiveTextStyle } =
    useVideoEditorStore();

  // Get selected subtitle tracks
  const selectedSubtitleTracks = tracks.filter(
    (track) =>
      track.type === 'subtitle' && timeline.selectedTrackIds.includes(track.id),
  );

  const handleStyleClick = (styleId: string) => {
    setActiveTextStyle(styleId);
    console.log(`Applied style: ${styleId}`);
  };

  // Don't render if no subtitle tracks are selected
  if (selectedSubtitleTracks.length === 0) {
    return null;
  }

  const isMultipleSelected = selectedSubtitleTracks.length > 1;

  return (
    <div
      className={cn(
        'w-80 flex flex-col border-l border-accent bg-transparent',
        className,
      )}
    >
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4">
        {isMultipleSelected ? (
          // Multiple items selected state
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground text-center">
                Multiple subtitles selected
              </p>
              <p className="text-xs text-muted-foreground text-center mt-1">
                Select a single subtitle to edit its properties
              </p>
            </div>
          </div>
        ) : (
          // Single item selected - show properties
          <div className="space-y-4">
            {/* Subtitle Text Display */}
            <div className="space-y-2">
              <h4 className="text-base font-semibold text-foreground">Basic</h4>
              <div className="p-3 bg-muted/50 border border-border rounded-lg">
                <p className="text-xs text-foreground whitespace-pre-wrap">
                  {selectedSubtitleTracks[0].subtitleText || 'No text'}
                </p>
              </div>
            </div>

            {/* Text Styles Section */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-foreground">
                Text Styles
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {textStyles.map((style) => (
                  <StyleButton
                    key={style.id}
                    style={style}
                    onClick={handleStyleClick}
                    isActive={textStyle.activeStyle === style.id}
                    disabled={false}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
