import { useProjectStore } from '@/Store/ProjectStore';
import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';

interface ProjectGuardProps {
  children: React.ReactNode;
}

/**
 * ProjectGuard Component
 * Ensures a project is loaded before allowing access to the video editor
 * Redirects to projects page if no project is available
 */
export const ProjectGuard: React.FC<ProjectGuardProps> = ({ children }) => {
  const { currentProject, initializeProjects, isInitialized } =
    useProjectStore();

  // Initialize projects if not already done
  useEffect(() => {
    if (!isInitialized) {
      initializeProjects();
    }
  }, [isInitialized, initializeProjects]);

  // Show loading while initializing
  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-zinc-600 dark:text-zinc-400">
          Loading project system...
        </div>
      </div>
    );
  }

  // Redirect to projects page if no project is loaded
  if (!currentProject) {
    return <Navigate to="/" replace />;
  }

  // Render children if project is loaded
  return <>{children}</>;
};
