import { Button } from '@/frontend/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/frontend/components/ui/tooltip';
import { cn } from '@/frontend/utils/utils';
import { Film, Image, Music, Plus, Type } from 'lucide-react';
import React, { useCallback } from 'react';
import { useVideoEditorStore } from '../stores/videoEditor/index';
import { TRACK_ROWS } from './timelineTracks';

interface AddTrackButtonProps {
  className?: string;
}

export const AddTrackButton: React.FC<AddTrackButtonProps> = React.memo(
  ({ className }) => {
    const addTrackRow = useVideoEditorStore((state) => state.addTrackRow);
    const visibleTrackRows = useVideoEditorStore(
      (state) => state.timeline.visibleTrackRows || ['video', 'audio'],
    );

    const handleAddTrack = useCallback(
      (trackRowId: string) => {
        addTrackRow(trackRowId);
      },
      [addTrackRow],
    );

    // Get track rows that are not currently visible
    const availableTrackRows = TRACK_ROWS.filter(
      (row) => !visibleTrackRows.includes(row.id),
    );

    const getTrackIcon = (rowId: string) => {
      switch (rowId) {
        case 'video':
          return <Film className="h-4 w-4" />;
        case 'audio':
          return <Music className="h-4 w-4" />;
        case 'subtitle':
          return <Type className="h-4 w-4" />;
        case 'image':
          return <Image className="h-4 w-4" />;
        default:
          return <Plus className="h-4 w-4" />;
      }
    };

    return (
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-6 w-6 p-0', className)}
                disabled={availableTrackRows.length === 0}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">
            Add new track to timeline
          </TooltipContent>
        </Tooltip>

        <DropdownMenuContent align="start" className="w-48">
          {availableTrackRows.map((row) => (
            <DropdownMenuItem
              key={row.id}
              onClick={() => handleAddTrack(row.id)}
              className="flex items-center gap-2 cursor-pointer"
            >
              {getTrackIcon(row.id)}
              <span>Add {row.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
);

AddTrackButton.displayName = 'AddTrackButton';
