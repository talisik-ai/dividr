import { ExportButton } from '../../export/components/exportButton';
import { ProjectNameInput } from './header/projectNameInput';
import { VideoPlayerControls } from './header/videoPlayerControls';

export const VideoEditorHeader = () => {
  return (
    <div className="flex items-center justify-between my-1 relative flex-1 min-h-0">
      <ProjectNameInput className="w-fit" />
      <VideoPlayerControls className="absolute left-1/2 -translate-x-1/2" />
      <ExportButton className="!px-5" />
    </div>
  );
};
