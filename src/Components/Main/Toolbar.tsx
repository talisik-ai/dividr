/**
 * A custom React fixed component
 * A Fixed element in Downlodr, displays the tooligation links for status, categories and tag pages
 *  - Status (All Downloads, Currently Downloading, and Finished Downloads)
 *  - Categories (All Categories, Uncategorized downloads, and then list of individual categories)
 *  - Tags (All Tags, Untaged downloads, and then list of individual tags)
 *
 * @param className - for UI of Toolbar
 * @returns JSX.Element - The rendered component displaying a Toolbar
 *
 */
import { useCallback, useRef } from 'react';
import { BiText } from 'react-icons/bi';
import { BsCameraVideo } from 'react-icons/bs';
import { CgSoftwareDownload } from 'react-icons/cg';
import { LuMusic } from 'react-icons/lu';
import { MdOutlineSettings } from 'react-icons/md';
import { SlPicture } from 'react-icons/sl';
import { usePanelStore, type PanelType } from '../../Store/PanelStore';
import { useVideoEditorStore } from '../../Store/videoEditorStore';

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
  const { importMediaFromDialog } = useVideoEditorStore();

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
    await importMediaFromDialog();
    // Also show the media import panel
    togglePanel('media-import');
  }, [importMediaFromDialog, togglePanel]);

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
            className={`flex flex-col items-center transition-opacity duration-300 gap-6`}
          >
            <button
              onClick={handleImportFiles}
              title="Import media files"
              className={`text-toolbarIcon transition-colors duration-200 ${
                activePanelType === 'media-import'
                  ? 'text-blue-400'
                  : 'text-toolbarIcon'
              }`}
            >
              <CgSoftwareDownload size={20} />
            </button>
            <button
              onClick={() => handleTogglePanel('text-tools')}
              title="Text tools"
              className={`text-toolbarIcon transition-colors duration-200 ${
                activePanelType === 'text-tools'
                  ? 'text-blue-400'
                  : 'text-toolbarIcon'
              }`}
            >
              <BiText size={18} />
            </button>
            <button
              onClick={() => handleTogglePanel('video-effects')}
              title="Video effects"
              className={`text-toolbarIcon transition-colors duration-200 ${
                activePanelType === 'video-effects'
                  ? 'text-blue-400'
                  : 'text-toolbarIcon'
              }`}
            >
              <BsCameraVideo size={16} />
            </button>
            <button
              onClick={() => handleTogglePanel('images')}
              title="Image tools"
              className={`text-toolbarIcon transition-colors duration-200 ${
                activePanelType === 'images'
                  ? 'text-blue-400'
                  : 'text-toolbarIcon'
              }`}
            >
              <SlPicture size={16} />
            </button>
            <button
              onClick={() => handleTogglePanel('audio-tools')}
              title="Audio tools"
              className={`text-toolbarIcon transition-colors duration-200 ${
                activePanelType === 'audio-tools'
                  ? 'text-blue-400'
                  : 'text-toolbarIcon'
              }`}
            >
              <LuMusic size={16} />
            </button>
            <button
              onClick={() => handleTogglePanel('settings')}
              title="Project settings"
              className={`text-toolbarIcon transition-colors duration-200 ${
                activePanelType === 'settings'
                  ? 'text-blue-400'
                  : 'text-toolbarIcon'
              }`}
            >
              <MdOutlineSettings size={18} />
            </button>
          </div>
          {/*  </TooltipWrapper> */}
        </div>
      </div>
    </nav>
  );
};

export default Toolbar;
