import { Tabs, TabsList, TabsTrigger } from '@/frontend/components/ui/tabs';
import { LayoutGrid, LayoutList } from 'lucide-react';
import { useLayout } from '../hooks/useLayout';

export const LayoutTabContent = () => {
  const { viewMode, setViewMode } = useLayout();

  return (
    <Tabs
      value={viewMode}
      onValueChange={(value) => setViewMode(value as 'grid' | 'list')}
    >
      <TabsList className="bg-transparent gap-1">
        <TabsTrigger
          value="grid"
          className="text-xs border-none data-[state=active]:text-primary-foreground data-[state=active]:bg-primary"
        >
          <LayoutGrid size={12} />
          Grid
        </TabsTrigger>
        <TabsTrigger
          value="list"
          className="text-xs border-none data-[state=active]:text-primary-foreground data-[state=active]:bg-primary"
        >
          <LayoutList size={12} />
          List
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};
