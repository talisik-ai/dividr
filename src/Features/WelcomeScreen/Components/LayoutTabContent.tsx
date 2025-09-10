import { Tabs, TabsList, TabsTrigger } from '@/Components/sub/ui/Animated-Tabs';
import { LayoutGrid, LayoutList } from 'lucide-react';

interface LayoutTabContentProps {
  defaultView?: 'grid' | 'list';
  onViewChange?: (view: 'grid' | 'list') => void;
}

export const LayoutTabContent = ({
  defaultView = 'grid',
  onViewChange,
}: LayoutTabContentProps) => {
  return (
    <Tabs
      defaultValue={defaultView}
      onValueChange={(value) => onViewChange?.(value as 'grid' | 'list')}
    >
      <TabsList className="!p-0">
        <TabsTrigger value="grid" className="text-xs">
          <LayoutGrid size={12} />
          Grid
        </TabsTrigger>
        <TabsTrigger value="list" className="text-xs">
          <LayoutList size={12} />
          List
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};
