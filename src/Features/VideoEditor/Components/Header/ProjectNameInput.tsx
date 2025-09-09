/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ProjectNameInput Component
 * A specialized input component for editing project names
 * Used in the titlebar of the video editor
 */
import { Input } from '@/Components/sub/ui/Input';
import { cn } from '@/Lib/utils';
import { useProjectStore } from '@/Store/ProjectStore';
import { ChevronDown } from 'lucide-react';
import React from 'react';

interface ProjectNameInputProps {
  className?: string;
  placeholder?: string;
}

const ProjectNameInput: React.FC<ProjectNameInputProps> = ({
  className = '',
  placeholder = 'Untitled Project',
}) => {
  const { metadata, setTitle } = useProjectStore();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
  };

  return (
    <div className="relative">
      <Input
        className={cn(
          'border-none text-center text-sm p-2 h-6 pe-9 focus-visible:ring-0 focus-visible:ring-offset-0',
          className,
        )}
        style={{ 'field-sizing': 'content' } as any}
        placeholder={placeholder}
        value={metadata.title}
        onChange={handleChange}
      />
      <ChevronDown
        className="absolute right-2 top-1/2 -translate-y-1/2"
        size={12}
      />
    </div>
  );
};

export default ProjectNameInput;
