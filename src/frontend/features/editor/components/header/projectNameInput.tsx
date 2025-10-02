/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ProjectNameInput Component
 * A specialized input component for editing project names
 * Used in the titlebar of the video editor
 */
import { Input } from '@/frontend/components/ui/input';
import { useProjectStore } from '@/frontend/features/projects/store/projectStore';
import { cn } from '@/frontend/utils/utils';
import { ChevronDown } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

interface ProjectNameInputProps {
  className?: string;
  placeholder?: string;
}

const ProjectNameInput: React.FC<ProjectNameInputProps> = ({
  className = '',
  placeholder = 'Untitled Project',
}) => {
  const {
    currentProject,
    updateCurrentProjectMetadata,
    saveCurrentProject,
    isLoading,
  } = useProjectStore();

  const [localTitle, setLocalTitle] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update local title when current project changes
  useEffect(() => {
    if (currentProject) {
      setLocalTitle(currentProject.metadata.title);
    } else {
      setLocalTitle('');
    }
  }, [currentProject]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setLocalTitle(newTitle);

    if (currentProject && newTitle !== currentProject.metadata.title) {
      updateCurrentProjectMetadata({ title: newTitle });
    }

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout to save after 1 second of no typing
    if (
      currentProject &&
      newTitle.trim() &&
      newTitle !== currentProject.metadata.title
    ) {
      saveTimeoutRef.current = setTimeout(async () => {
        console.log('Auto-saving project with title:', newTitle);
        setIsSaving(true);
        try {
          await saveCurrentProject();
          console.log('Project saved successfully');
        } catch (error) {
          console.error('Failed to auto-save project:', error);
          toast.error('Failed to save project');
        } finally {
          setIsSaving(false);
        }
      }, 1000);
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  if (!currentProject) {
    return (
      <div className="text-sm text-zinc-500 dark:text-zinc-400 px-2 py-1">
        No project loaded
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <Input
          className={cn(
            'border-none text-center text-sm p-2 h-6 pe-9 focus-visible:ring-0 focus-visible:ring-offset-0',
            isSaving && 'text-blue-600 dark:text-blue-400',
            className,
          )}
          style={{ fieldSizing: 'content' } as any}
          placeholder={placeholder}
          value={localTitle}
          onChange={handleChange}
          disabled={isLoading || isSaving}
        />
        <ChevronDown
          className="absolute right-2 top-1/2 -translate-y-1/2"
          size={12}
        />
      </div>

      {isSaving && (
        <div className="text-xs text-blue-600 dark:text-blue-400 px-2">
          Saving...
        </div>
      )}
    </div>
  );
};

export { ProjectNameInput };
