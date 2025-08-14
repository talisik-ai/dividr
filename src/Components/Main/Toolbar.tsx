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

    const {
        tracks,
        timeline,
        render,
        importMediaFromDialog,
        startRender,
        updateRenderProgress,
        finishRender,
        cancelRender,
        exportProject,
        importProject,
        reset,
      } = useVideoEditorStore();
    
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
    
      // File import using native Electron dialog
      const handleImportFiles = useCallback(async () => {
        await importMediaFromDialog();
      }, [importMediaFromDialog]);
    
    


    
      // Project management
      const handleExportProject = useCallback(() => {
        const projectData = exportProject();
        const blob = new Blob([projectData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'video-project.json';
        a.click();
        URL.revokeObjectURL(url);
      }, [exportProject]);
    
      const handleImportProject = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
              try {
                const data = e.target?.result as string;
                importProject(data);
              } catch (error) {
                alert('Failed to import project');
              }
            };
            reader.readAsText(file);
          }
        };
        input.click();
      }, [importProject]);
    
    const toolRef = useRef<HTMLElement>(null);


  return (
    <nav
      ref={toolRef}
      className={`${className} transition-all duration-300 ${
        collapsed ? 'w-[70px]' : ''
      } relative overflow-x-hidden`}
    >
      <div
        className={`${
          collapsed ? 'px-1' : 'p-2 ml-0 md:ml-1'
        } mt-2 space-y-2 pb-20`}
      >
        {/* Category Section */}
        <div>
         {/*  <TooltipWrapper content={collapsed ? 'Status' : null} side="left"> */}
          <div
                className={`flex flex-col items-center transition-opacity duration-300 ${
                  collapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'
                }`}
              >
                          <button
            onClick={handleImportFiles}
            style={{
              backgroundColor: '#4CAF50',
              border: 'none',
              color: '#fff',
              fontSize: '12px',
              cursor: 'pointer',
              padding: '6px 12px',
              borderRadius: '4px',
            }}
            title="Import video files"
          >
            Import Files
          </button>
          <button
              onClick={handleImportProject}
              style={{
                backgroundColor: '#2196F3',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              Open Project
            </button>
            <button
              onClick={handleExportProject}
              style={{
                backgroundColor: '#FF9800',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              Save Project
            </button>
            <button
              onClick={reset}
              style={{
                backgroundColor: '#f44336',
                border: 'none',
                color: '#fff',
                fontSize: '12px',
                cursor: 'pointer',
                padding: '6px 12px',
                borderRadius: '4px',
              }}
            >
              New Project
            </button>


        </div>
         {/*  </TooltipWrapper> */} 
      </div>
      </div>

    </nav>
  );
};

export default Toolbar;
