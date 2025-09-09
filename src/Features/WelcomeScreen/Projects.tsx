import NewDark from '@/Assets/Logo/New-Dark.svg';
import New from '@/Assets/Logo/New-Light.svg';
import ProjectCard from '@/Features/WelcomeScreen/Components/ProjectCard';
import { cn } from '@/Lib/utils';
import { useProjectStore } from '@/Store/ProjectStore';
import { ProjectSummary } from '@/Types/Project';
import { useTheme } from '@/Utility/ThemeProvider';
import { Loader2, Plus, Search, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button, buttonVariants } from '../../Components/sub/ui/Button';
import { Header } from './Components/Header';

/**
 * A custom React Sub Page
 * This component displays the projects management screen with CRUD operations
 *
 * @returns JSX.Element - The rendered component displaying projects.
 */
const Projects = () => {
  const { theme } = useTheme();
  const navigate = useNavigate();

  const {
    projects,
    isLoading,
    isInitialized,
    initializeProjects,
    createNewProject,
    openProject,
    deleteProject,
    duplicateProject,
    exportProject,
    importProject,
    getRecentProjects,
  } = useProjectStore();

  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);

  // Initialize projects on component mount
  useEffect(() => {
    initializeProjects();
  }, [initializeProjects]);

  // Load recent projects
  useEffect(() => {
    const loadRecent = async () => {
      const recent = await getRecentProjects(5);
      setRecentProjects(recent);
    };

    if (isInitialized) {
      loadRecent();
    }
  }, [isInitialized, getRecentProjects, projects]);

  const handleCreateProject = async () => {
    try {
      const projectId = await createNewProject('Untitled Project');

      // Open the newly created project to set it as current
      await openProject(projectId);

      // Navigate to video editor with the new project
      navigate('/video-editor');
    } catch (error) {
      console.error('Failed to create project:', error);
      // Could add toast notification here if needed
    }
  };

  const handleOpenProject = async (id: string) => {
    try {
      await openProject(id);
      navigate('/video-editor');
      toast.success('Project opened successfully!');
    } catch (error) {
      console.error('Failed to open project:', error);
      toast.error('Failed to open project');
    }
  };

  const handleDuplicateProject = async (id: string) => {
    try {
      const originalProject = projects.find((p) => p.id === id);
      const newTitle = originalProject
        ? `${originalProject.title} Copy`
        : 'Project Copy';

      await duplicateProject(id, newTitle);
      toast.success('Project duplicated successfully!');
    } catch (error) {
      console.error('Failed to duplicate project:', error);
      toast.error('Failed to duplicate project');
    }
  };

  const handleExportProject = async (id: string) => {
    try {
      await exportProject(id);
      toast.success('Project exported successfully!');
    } catch (error) {
      console.error('Failed to export project:', error);
      toast.error('Failed to export project');
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (
      window.confirm(
        'Are you sure you want to delete this project? This action cannot be undone.',
      )
    ) {
      try {
        await deleteProject(id);
        toast.success('Project deleted successfully!');
      } catch (error) {
        console.error('Failed to delete project:', error);
        toast.error('Failed to delete project');
      }
    }
  };

  const handleImportProject = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await importProject(file);
      toast.success('Project imported successfully!');
    } catch (error) {
      console.error('Failed to import project:', error);
      toast.error('Failed to import project');
    }

    // Reset the input
    event.target.value = '';
  };

  // Show loading state during initialization
  if (!isInitialized && isLoading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 p-6 lg:p-12">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
            <p className="text-zinc-600 dark:text-zinc-400">
              Loading projects...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show empty state when no projects exist
  if (projects.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 p-6 lg:p-12">
        <Header />
        <div className="flex-1 flex items-center justify-center text-center">
          <div className="flex flex-col items-center gap-4 max-w-md">
            <img
              src={theme === 'dark' ? NewDark : New}
              alt="New Project"
              className="w-24 h-24"
            />
            <h1 className="text-3xl text-zinc-900 font-semibold dark:text-zinc-100">
              No projects yet
            </h1>
            <div className="text-base text-muted-foreground font-normal">
              <p>Start creating your first video project. Import media,</p>
              <p>edit, and export professional videos.</p>
            </div>
            <Button onClick={handleCreateProject}>
              <Plus size={16} />
              Create your first project
            </Button>

            {/* Import option */}
            <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 w-full">
              <label className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer transition-colors">
                <Upload size={16} />
                Import existing project
                <input
                  type="file"
                  accept=".dividr,.json"
                  onChange={handleImportProject}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 p-6 lg:p-12">
      <div className="flex justify-between mb-6 gap-4">
        <Header />
        <div className="flex items-center h-fit gap-3">
          <label
            className={cn(
              'cursor-pointer',
              buttonVariants({ variant: 'outline', size: 'sm' }),
            )}
          >
            <Upload size={16} />
            Import
            <input
              type="file"
              accept=".dividr,.json"
              onChange={handleImportProject}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* Recent Projects Section */}
        {recentProjects.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
              Recent Projects
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {recentProjects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleOpenProject}
                  onDuplicate={handleDuplicateProject}
                  onExport={handleExportProject}
                  onDelete={handleDeleteProject}
                />
              ))}
            </div>
          </div>
        )}

        {/* All Projects Section */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              All Projects
            </h2>

            {isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
            )}
          </div>

          {projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="h-12 w-12 text-zinc-400 mb-4" />
              <h3 className="text-lg font-medium text-zinc-900 dark:text-zinc-100 mb-2">
                No projects found
              </h3>
              <p className="text-zinc-600 dark:text-zinc-400">
                Try adjusting your search terms or create a new project.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {projects.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  onOpen={handleOpenProject}
                  onDuplicate={handleDuplicateProject}
                  onExport={handleExportProject}
                  onDelete={handleDeleteProject}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Projects;
