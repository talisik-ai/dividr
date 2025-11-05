/**
 * A custom React toolbar component for the video editor
 * Displays tool buttons for different panels: media import, text tools, video effects, etc.
 *
 * @param className - for UI of Toolbar
 * @param collapsed - whether the toolbar is collapsed
 * @returns JSX.Element - The rendered component displaying a Toolbar
 */
import {
  usePanelStore,
  type PanelType,
} from '@/frontend/features/editor/stores/PanelStore';
import { useVideoEditorStore } from '@/frontend/features/editor/stores/videoEditor';
import { cn } from '@/frontend/utils/utils';
import { ClosedCaption, Music, Settings, Type, Upload } from 'lucide-react';
import { useCallback, useRef } from 'react';
import { Button } from '../../components/ui/button';

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  isActive: boolean;
  disabled?: boolean;
}

const ToolbarButton = ({
  icon,
  title,
  onClick,
  isActive,
  disabled = false,
}: ToolbarButtonProps) => (
  <Button
    onClick={onClick}
    title={title}
    size="icon"
    variant="ghost"
    className={cn(isActive && 'bg-accent', 'rounded-sm')}
    disabled={disabled}
  >
    {icon}
  </Button>
);

interface ToolbarConfig {
  panelType: PanelType;
  icon: React.ReactNode;
  title: string;
  isSpecial?: boolean; // for media-import which has special handling
}

const toolbarConfig: ToolbarConfig[] = [
  {
    panelType: 'media-import',
    icon: <Upload size={16} />,
    title: 'Import media files',
    isSpecial: true,
  },
  {
    panelType: 'settings',
    icon: <Settings size={16} />,
    title: 'Project settings',
  },
  {
    panelType: 'text-tools',
    icon: <Type size={16} />,
    title: 'Text tools',
  },
  {
    panelType: 'captions',
    icon: <ClosedCaption size={16} />,
    title: 'Captions',
  },
  {
    panelType: 'audio-tools',
    icon: <Music size={16} />,
    title: 'Audio tools',
  },
];

const Toolbar = ({
  className,
}: {
  className?: string;
  collapsed?: boolean;
  toggleCollapse?: () => void;
}) => {
  const { togglePanel, activePanelType } = usePanelStore();
  const tracks = useVideoEditorStore((state) => state.tracks);

  // Check if there are any subtitle tracks on the timeline
  const hasSubtitles = tracks.some((track) => track.type === 'subtitle');

  // Panel toggle handlers - only open panels, don't close them
  const handleTogglePanel = useCallback(
    (panelType: PanelType) => {
      // Only open the panel if it's not already active
      if (activePanelType !== panelType) {
        togglePanel(panelType);
      }
    },
    [togglePanel, activePanelType],
  );

  // File import using native Electron dialog
  const handleImportFiles = useCallback(async () => {
    // Only show the media import panel if it's not already active
    if (activePanelType !== 'media-import') {
      togglePanel('media-import');
    }
  }, [togglePanel, activePanelType]);

  // Get the appropriate click handler for each button
  const getClickHandler = useCallback(
    (config: ToolbarConfig) => {
      return config.isSpecial && config.panelType === 'media-import'
        ? handleImportFiles
        : () => handleTogglePanel(config.panelType);
    },
    [handleImportFiles, handleTogglePanel],
  );

  // Note: Project management functions removed for now, but can be re-added to UI store actions

  const toolRef = useRef<HTMLElement>(null);

  return (
    <nav ref={toolRef} className={cn('', className)}>
      <div>
        <div
          className={`flex flex-col items-center transition-opacity duration-300 gap-3`}
        >
          {toolbarConfig.map((config) => (
            <ToolbarButton
              key={config.panelType}
              icon={config.icon}
              title={config.title}
              onClick={getClickHandler(config)}
              isActive={activePanelType === config.panelType}
              disabled={config.panelType === 'captions' && !hasSubtitles}
            />
          ))}
        </div>
      </div>
    </nav>
  );
};

export default Toolbar;
