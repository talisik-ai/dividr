import { PropertiesPanel } from '@/Components/Main/VideoPreview/PropertiesPanel';
import { StylePanel } from '@/Components/Main/VideoPreview/StylePanel';
import { useIsPanelVisible } from '@/Store/PanelStore';
import { Outlet } from 'react-router-dom';
import { Timeline } from '../Components/Main/Timeline/Timeline';
import TitleBar from '../Components/Main/Titlebar';
import Toolbar from '../Components/Main/Toolbar';

const VideoEditorLayout = () => {
  const isPanelVisible = useIsPanelVisible();

  return (
    <div className="h-screen flex flex-col text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-900 p-4 gap-4">
      <TitleBar className="h-13 relative z-10" />

      <div className="grid grid-cols-[55px_1fr] gap-2 flex-1 overflow-hidden min-h-0">
        <Toolbar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-row flex-1 overflow-hidden">
            {/* Dynamic StylePanel - only shows when a panel is active */}
            {isPanelVisible && (
              <StylePanel className="flex-shrink-0 mr-2 rounded" />
            )}

            <main className="flex-1 overflow-auto">
              {/* Based on Video Editor component*/}
              <Outlet />
            </main>

            {/* Properties Panel - always visible */}
            <PropertiesPanel />
          </div>
          <div className="h-[210px] md:h-[220px] lg:h-[280px] flex-shrink-0">
            <Timeline />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoEditorLayout;
