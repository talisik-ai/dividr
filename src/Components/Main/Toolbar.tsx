/**
 * A custom React toolbar component for the video editor
 * Displays tool buttons for different panels: media import, text tools, video effects, etc.
 *
 * @param className - for UI of Toolbar
 * @param collapsed - whether the toolbar is collapsed
 * @returns JSX.Element - The rendered component displaying a Toolbar
 */
import { useCallback, useRef } from 'react';
import { BiText } from 'react-icons/bi';
import { BsCameraVideo } from 'react-icons/bs';
import { CgSoftwareDownload } from 'react-icons/cg';
import { LuMusic } from 'react-icons/lu';
import { MdOutlineSettings } from 'react-icons/md';
import { SlPicture } from 'react-icons/sl';
import { usePanelStore, type PanelType } from '../../store/panelStore';

interface ToolbarButtonProps {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
  isActive: boolean;
}

const ToolbarButton = ({
  icon,
  title,
  onClick,
  isActive,
}: ToolbarButtonProps) => (
  <button
    onClick={onClick}
    title={title}
    className={`transition-all duration-200 p-2 rounded-lg hover:bg-gray-800/50 ${
      isActive
        ? 'text-blue-400 bg-blue-500/20 hover:bg-blue-500/30'
        : 'text-toolbarIcon hover:text-gray-300'
    }`}
  >
    {icon}
  </button>
);

interface ToolbarConfig {
  panelType: PanelType;
  icon: React.ReactNode;
  title: string;
  size: number;
  isSpecial?: boolean; // for media-import which has special handling
}

const toolbarConfig: ToolbarConfig[] = [
  {
    panelType: 'media-import',
    icon: <CgSoftwareDownload size={20} />,
    title: 'Import media files',
    size: 20,
    isSpecial: true,
  },
  {
    panelType: 'text-tools',
    icon: <BiText size={18} />,
    title: 'Text tools',
    size: 18,
  },
  {
    panelType: 'video-effects',
    icon: <BsCameraVideo size={16} />,
    title: 'Video effects',
    size: 16,
  },
  {
    panelType: 'images',
    icon: <SlPicture size={16} />,
    title: 'Image tools',
    size: 16,
  },
  {
    panelType: 'audio-tools',
    icon: <LuMusic size={16} />,
    title: 'Audio tools',
    size: 16,
  },
  {
    panelType: 'settings',
    icon: <MdOutlineSettings size={18} />,
    title: 'Project settings',
    size: 18,
  },
];

// import { toast } from 'react-hot-toast';
//import TooltipWrapper from '@/Components/SubComponents/custom/TooltipWrapper';
//import { toast } from '@/Components/SubComponents/shadcn/hooks/use-toast';

const Toolbar = ({
  className,
  collapsed,
}: {
  className?: string;
  collapsed?: boolean;
  toggleCollapse?: () => void;
}) => {
  const { togglePanel, activePanelType } = usePanelStore();

  /*
      // Add demo tracks for demonstration
      const addDemoTracks = useCallback(() => {
        // Add some sample tracks
        addTrack({
          type: 'video',
          name: 'Sample Video 1',
          source: 'demo://video1.mp4',
          duration: 600, // 20 seconds at 30fps
          startFrame: 0,
          endFrame: 600,
          width: 640,
          height: 360,
          visible: true,
          locked: false,
        });
    
        addTrack({
          type: 'audio',
          name: 'Background Music',
          source: 'demo://music.mp3',
          duration: 900, // 30 seconds at 30fps
          startFrame: 0,
          endFrame: 900,
          volume: 0.8,
          visible: true,
          locked: false,
        });
    
        addTrack({
          type: 'video',
          name: 'Sample Video 2',
          source: 'demo://video2.mp4',
          duration: 450, // 15 seconds at 30fps
          startFrame: 300, // Start at 10 seconds
          endFrame: 750,
          width: 640,
          height: 360,
          visible: true,
          locked: false,
        });
    
        addTrack({
          type: 'image',
          name: 'Logo Overlay',
          source: 'demo://logo.png',
          duration: 150, // 5 seconds at 30fps
          startFrame: 600,
          endFrame: 750,
          width: 200,
          height: 200,
          offsetX: 50,
          offsetY: 50,
          visible: true,
          locked: false,
        });
      }, [addTrack]);
    
     */

  // Panel toggle handlers
  const handleTogglePanel = useCallback(
    (panelType: PanelType) => {
      togglePanel(panelType);
    },
    [togglePanel],
  );

  // File import using native Electron dialog
  const handleImportFiles = useCallback(async () => {
    // Also show the media import panel
    togglePanel('media-import');
  }, [togglePanel]);

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
    <nav
      ref={toolRef}
      className={`${className} transition-all duration-300 ${
        collapsed ? 'w-[70px]' : ''
      } relative overflow-x-hidden`}
    >
      <div
        className={`${collapsed ? 'px-1' : 'p-2 ml-0'} mt-2 space-y-2 pb-20`}
      >
        {/* Category Section */}
        <div>
          {/*  <TooltipWrapper content={collapsed ? 'Status' : null} side="left"> */}
          <div
            className={`flex flex-col items-center transition-opacity duration-300 gap-4`}
          >
            {toolbarConfig.map((config) => (
              <ToolbarButton
                key={config.panelType}
                icon={config.icon}
                title={config.title}
                onClick={getClickHandler(config)}
                isActive={activePanelType === config.panelType}
              />
            ))}
          </div>
          {/*  </TooltipWrapper> */}
        </div>
      </div>
    </nav>
  );
};

export default Toolbar;
