import { ToolsPanel } from '@/Components/Main/VideoPreview/ToolsPanel';
import { AppMenuBar } from '@/Components/sub/custom/AppMenuBar';
import { ProjectGuard } from '@/Features/VideoEditor/Components/ProjectGuard';
import { VideoEditorHeader } from '@/Features/VideoEditor/Components/VideoEditorHeader';
import { useIsPanelVisible } from '@/Store/PanelStore';
import { Outlet } from 'react-router-dom';
import { Timeline } from '../Components/Main/Timeline/Timeline';
import TitleBar from '../Components/Main/Titlebar';
import Toolbar from '../Components/Main/Toolbar';

const VideoEditorLayout = () => {
  const isPanelVisible = useIsPanelVisible();

  return (
    <ProjectGuard>
      <div className="h-screen flex flex-col text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-900 p-4">
        <TitleBar className="relative z-10 border-b border-accent -mx-4 px-4 -mt-4 py-2" />

        <div className="grid grid-cols-[auto_1fr] grid-rows-[auto_1fr_auto] flex-1 min-h-0">
          {/* Menubar and Project Additional controllers */}
          <AppMenuBar />
          <VideoEditorHeader />

          {/* Left sidebar with toolbar and tools panel */}
          <div className="flex flex-1 min-h-0 gap-2">
            <Toolbar />
            {isPanelVisible && (
              <div className="flex-1 overflow-hidden">
                <ToolsPanel className="h-full" />
              </div>
            )}
          </div>

          {/* Main content area */}
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex flex-row flex-1 overflow-hidden">
              <main className="flex-1 overflow-auto">
                {/* Based on Video Editor component*/}
                <Outlet />
              </main>

              {/* Properties Panel - always visible */}
              {/* <PropertiesPanel />  */}
            </div>
          </div>
          {/* Timeline at bottom */}
          <div className="flex-1 grid col-span-2 -mx-4 -mb-4">
            <Timeline />
          </div>
        </div>
      </div>
    </ProjectGuard>
  );
};

export default VideoEditorLayout;
