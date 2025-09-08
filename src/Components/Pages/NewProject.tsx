import { useNavigate } from 'react-router-dom';
import New from '../../Assets/Logo/New.svg';
import TitleBar from '../Main/Titlebar';

/**
 * A custom React Sub Page
 * This component displays the initial project creation screen with TitleBar
 *
 * @returns JSX.Element - The rendered component displaying new project page.
 */
const NewProject = () => {
  const navigate = useNavigate();

  const handleCreateProject = () => {
    navigate('/video-editor');
  };

  return (
    <div className="h-screen flex flex-col text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-900">
      <TitleBar className="h-13 py-4 px-2 relative z-10 " />
      <div className="flex-1 flex items-center justify-center text-white text-center">
        <div className="flex text-md font-bold flex-col items-center gap-4">
          <img src={New} alt="New Project" />
          <h1 className="text-2xl text-zinc-900 dark:text-zinc-100">
            No projects yet
          </h1>
          <div className="text-xs text-[#9CA3AF]">
            <p>Start creating your first video project. Import media,</p>
            <p className="text-xs"> edit, and export professional videos.</p>
          </div>
          <button
            className="p-2 bg-white text-black rounded text-sm hover:bg-zinc-100 transition-colors"
            onClick={handleCreateProject}
          >
            Create your first project
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewProject;
