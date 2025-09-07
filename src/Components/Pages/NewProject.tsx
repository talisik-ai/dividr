import { useNavigate } from 'react-router-dom';
import New from '../../assets/Logo/New.svg';
import TitleBar from '../main/Titlebar';

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
    <div className="h-screen flex flex-col text-gray-900 dark:text-gray-100 pb-2 pr-2">
      <TitleBar className="h-13 py-4 px-2 bg-primary dark:bg-darkMode relative z-10" />
      <div className="flex-1 flex items-center justify-center text-white text-center">
        <div className="flex text-md font-bold flex-col items-center gap-4">
          <img src={New} alt="New Project" />
          <h1 className="text-2xl text-gray-900 dark:text-gray-100">
            No projects yet
          </h1>
          <div className="text-xs text-[#9CA3AF]">
            <p>Start creating your first video project. Import media,</p>
            <p className="text-xs"> edit, and export professional videos.</p>
          </div>
          <button
            className="p-2 bg-white text-black rounded text-sm hover:bg-gray-100 transition-colors"
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
