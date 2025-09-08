import NewDark from '@/Assets/Logo/New-Dark.svg';
import New from '@/Assets/Logo/New-Light.svg';
import { useTheme } from '@/Utility/ThemeProvider';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import TitleBar from '../../Components/Main/Titlebar';
import { Button } from '../../Components/sub/ui/Button';
import { Header } from './Components/Header';

/**
 * A custom React Sub Page
 * This component displays the initial project creation screen with TitleBar
 *
 * @returns JSX.Element - The rendered component displaying new project page.
 */
const NewProject = () => {
  const { theme } = useTheme();

  const navigate = useNavigate();

  const handleCreateProject = () => {
    navigate('/video-editor');
  };

  return (
    <div className="h-screen flex flex-col text-zinc-900 bg-zinc-100 dark:text-zinc-100 dark:bg-zinc-900 p-4 gap-4">
      <TitleBar className="h-13 relative z-10" />

      {/* Main Content */}
      <div className="p-12 flex-1 min-h-0 flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center text-white text-center">
          <div className="flex text-md font-bold flex-col items-center gap-4">
            <img src={theme === 'dark' ? NewDark : New} alt="New Project" />
            <h1 className="text-3xl text-zinc-900 font-semibold dark:text-zinc-100">
              No projects yet
            </h1>
            <div className="text-base text-muted-foreground font-normal">
              <p>Start creating your first video project. Import media,</p>
              <p> edit, and export professional videos.</p>
            </div>
            <Button onClick={handleCreateProject}>
              <Plus size={16} /> Create your first project
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewProject;
