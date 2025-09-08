import { PropertiesPanel } from '@/Components/Main/VideoPreview/PropertiesPanel';
import { ToolsPanel } from '@/Components/Main/VideoPreview/ToolsPanel';
import { AppMenuBar } from '@/Components/sub/custom/AppMenuBar';
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

      <div className="flex flex-1 overflow-hidden min-h-0 gap-4">
        {/* Left sidebar with toolbar and tools panel */}
        <div className="flex flex-col min-h-0 max-w-2xl h-full gap-2">
          {/* Toolbar and Menu bar */}
          <AppMenuBar />
          <div className="flex flex-1 gap-2">
            <Toolbar />
            {isPanelVisible && (
              <div className="flex-1 overflow-hidden">
                <ToolsPanel className="h-full" />
              </div>
            )}
          </div>
        </div>

        {/* Main content area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex flex-row flex-1 overflow-hidden">
            <main className="flex-1 overflow-auto">
              {/* Based on Video Editor component*/}
              <Outlet />
            </main>

            {/* Properties Panel - always visible */}
            <PropertiesPanel />
          </div>

          {/* Timeline at bottom */}
          <div className="h-[210px] md:h-[220px] lg:h-[280px] flex-shrink-0">
            <Timeline />
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoEditorLayout;
