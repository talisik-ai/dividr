import New from '../../Assets/Logo/New.svg';
import TitleBar from '../Main/Titlebar';
/**
 * A custom React Sub Page
 * This component acts as the not found page in case the navigation is pointed towards an invalid location
 *
 * @returns JSX.Element - The rendered component displaying not found page.
 */
const NewProject = () => {
  return (
    <div className="h-screen flex flex-col bg-black dark:bg-darkMode text-gray-900 dark:text-gray-100 pb-2 pr-2">
      <TitleBar className="h-13 py-4 px-2 bg-black dark:bg-darkMode" />
      <div className="absolute inset-0 flex items-center justify-center text-white text-center">
        <div className="flex text-md font-bold flex-col items-center gap-4">
          {' '}
          <img src={New} />
          <h1 className="text-2xl">No projects yet</h1>
          <div className="text-xs text-[#9CA3AF]">
            <p>Start creating your first video project. Import media,</p>
            <p className="text-xs"> edit, and export professional videos.</p>
          </div>
          <button className="p-2 bg-white text-black rounded text-sm">
            Create your first project
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewProject;
