import { Badge } from '@/Components/sub/ui/Badge';
import { Input } from '@/Components/sub/ui/Input';
import { cn } from '@/Lib/utils';
import { CornerDownLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface InlineProjectNameEditorProps {
  projectId: string;
  initialValue: string;
  isEditing: boolean;
  onSave: (projectId: string, newName: string) => void;
  onCancel: () => void;
  className?: string;
  variant?: 'card' | 'list';
}

export const InlineProjectNameEditor = ({
  projectId,
  initialValue,
  isEditing,
  onSave,
  onCancel,
  className = '',
  variant = 'card',
}: InlineProjectNameEditorProps) => {
  const [value, setValue] = useState(initialValue);
  const [showInput, setShowInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    if (isEditing) {
      shouldFocusRef.current = true;

      // Show input after dropdown closes
      const showTimer = setTimeout(() => {
        setShowInput(true);
      }, 80);

      // Focus after input is rendered
      const focusTimer = setTimeout(() => {
        if (inputRef.current && shouldFocusRef.current && isEditing) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 120);

      return () => {
        clearTimeout(showTimer);
        clearTimeout(focusTimer);
        shouldFocusRef.current = false;
      };
    } else {
      shouldFocusRef.current = false;
      setShowInput(false);
    }
  }, [isEditing, projectId]);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const handleSave = () => {
    shouldFocusRef.current = false; // Stop trying to focus
    const trimmedValue = value.trim();
    if (trimmedValue && trimmedValue !== initialValue) {
      onSave(projectId, trimmedValue);
    } else {
      onCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      shouldFocusRef.current = false; // Stop trying to focus
      setValue(initialValue);
      onCancel();
    }
  };

  const handleBlur = () => {
    // Simple blur handling - only save if we're not in the initial focus phase
    setTimeout(() => {
      if (inputRef.current && isEditing && !shouldFocusRef.current) {
        handleSave();
      }
    }, 100);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  if (!isEditing || !showInput) {
    return (
      <h3
        className={cn(
          variant === 'card'
            ? 'font-semibold line-clamp-1'
            : 'font-medium text-sm truncate',
          className,
        )}
      >
        {initialValue}
      </h3>
    );
  }

  return (
    <div
      className="relative"
      onClick={handleClick}
      onMouseDown={handleMouseDown}
    >
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onMouseDown={handleMouseDown}
        autoFocus={false}
        className={cn(
          'border-primary/50 focus:border-primary',
          variant === 'card'
            ? 'text-sm font-semibold h-6 px-2 py-1'
            : 'text-sm font-medium h-7 px-2 py-1',
          className,
        )}
        placeholder="Project name"
        maxLength={100}
      />
      <Badge
        variant="secondary"
        className="absolute -top-6 right-0 text-xs px-1.5 py-0.5 h-5 bg-primary/10 text-primary border-primary/20"
      >
        <CornerDownLeft className="h-2.5 w-2.5 mr-1" />
        Enter
      </Badge>
    </div>
  );
};
