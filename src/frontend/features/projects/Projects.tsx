import NewDark from '@/frontend/assets/logo/New-Dark.svg';
import New from '@/frontend/assets/logo/New-Light.svg';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/frontend/components/ui/alert-dialog';
import { Button } from '@/frontend/components/ui/button';
import { ScrollArea } from '@/frontend/components/ui/scroll-area';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { useTheme } from '@/frontend/providers/ThemeProvider';
import { startupManager } from '@/frontend/utils/startupManager';
import { ProjectSummary } from '@/shared/types/project.types';
import { Loader2, Plus, Search, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Header } from './components/header';
import { LayoutTabContent } from './components/layoutTabContent';
import { ProjectCard } from './components/projectCard';
import { ProjectCardView } from './components/projectCardView';
import { ProjectListView } from './components/projectListView';
import { useLayout } from './hooks/useLayout';

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
    renameProject,
    duplicateProject,
    exportProject,
    importProject,
    getRecentProjects,
  } = useProjectStore();

  const [recentProjects, setRecentProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    new Set(),
  );

  // Alert dialog state for project deletion
  const [deleteConfirm, setDeleteConfirm] = useState<{
    show: boolean;
    projectId: string | null;
    projectName: string;
  }>({ show: false, projectId: null, projectName: '' });

  // Get current view mode from layout store
  const { viewMode, isGridView } = useLayout();

  // Initialize projects on component mount
  useEffect(() => {
    const initializeApp = async () => {
      startupManager.logStage('projects-loading');

      try {
        await initializeProjects();
        startupManager.logStage('projects-loaded');
      } catch (error) {
        // Silent fail
      } finally {
        // Mark app as ready after projects are loaded (or failed)
        startupManager.logStage('app-ready');
      }
    };

    initializeApp();
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
      toast.error('Failed to create project');
    }
  };

  const handleOpenProject = async (id: string) => {
    try {
      await openProject(id);
      navigate('/video-editor');
      toast.success('Project opened successfully!');
    } catch (error) {
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
      toast.error('Failed to duplicate project');
    }
  };

  const handleExportProject = async (id: string) => {
    try {
      await exportProject(id);
      toast.success('Project exported successfully!');
    } catch (error) {
      toast.error('Failed to export project');
    }
  };

  const handleDeleteProject = async (id: string) => {
    const project = projects.find((p) => p.id === id);
    setDeleteConfirm({
      show: true,
      projectId: id,
      projectName: project?.title || 'this project',
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm.projectId) return;

    try {
      await deleteProject(deleteConfirm.projectId);
      toast.success('Project deleted successfully!');
    } catch (error) {
      toast.error('Failed to delete project');
    } finally {
      setDeleteConfirm({ show: false, projectId: null, projectName: '' });
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
      toast.error('Failed to import project');
    }

    // Reset the input
    event.target.value = '';
  };

  // Clear selections when view mode changes
  useEffect(() => {
    setSelectedProjects(new Set());
  }, [viewMode]);

  const handleProjectSelect = (projectId: string, selected: boolean) => {
    const newSelected = new Set(selectedProjects);
    if (selected) {
      newSelected.add(projectId);
    } else {
      newSelected.delete(projectId);
    }
    setSelectedProjects(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected) {
      setSelectedProjects(new Set(projects.map((p) => p.id)));
    } else {
      setSelectedProjects(new Set());
    }
  };

  const handleRenameProject = async (id: string, newName: string) => {
    try {
      await renameProject(id, newName);
      toast.success('Project renamed successfully!');
    } catch (error) {
      toast.error('Failed to rename project');
    }
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
        <Header numberOfProjects={projects.length} />
        <LayoutTabContent />
      </div>

      <ScrollArea className="flex-1 min-h-0 overflow-y-auto -mx-16 px-16">
        {/* Recent Projects Section - Only show in grid view */}
        {isGridView && recentProjects.length > 0 && (
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
                  onRename={handleRenameProject}
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
            {isGridView && (
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                All Projects
                {/* {selectedProjects.size > 0 &&
                `(${selectedProjects.size} selected)`} */}
              </h2>
            )}

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
          ) : isGridView ? (
            <ProjectCardView
              projects={projects}
              onOpen={handleOpenProject}
              onRename={handleRenameProject}
              onDuplicate={handleDuplicateProject}
              onExport={handleExportProject}
              onDelete={handleDeleteProject}
            />
          ) : (
            <ProjectListView
              projects={projects}
              selectedProjects={selectedProjects}
              onProjectSelect={handleProjectSelect}
              onSelectAll={handleSelectAll}
              onOpen={handleOpenProject}
              onRename={handleRenameProject}
              onDuplicate={handleDuplicateProject}
              onExport={handleExportProject}
              onDelete={handleDeleteProject}
            />
          )}
        </div>
      </ScrollArea>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirm.show}
        onOpenChange={(open) =>
          setDeleteConfirm({ show: open, projectId: null, projectName: '' })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project?</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap break-words w-fit overflow-wrap-anywhere break-all">
              Are you sure you want to delete {`"${deleteConfirm.projectName}"`}
              ? This action cannot be undone and will permanently remove all
              project data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Projects;
