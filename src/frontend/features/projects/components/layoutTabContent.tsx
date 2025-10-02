import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@/frontend/components/ui/animated-tabs';
import { LayoutGrid, LayoutList } from 'lucide-react';
import { useLayout } from '../hooks/useLayout';

export const LayoutTabContent = () => {
  const { viewMode, setViewMode } = useLayout();

  return (
    <Tabs
      value={viewMode}
      onValueChange={(value) => setViewMode(value as 'grid' | 'list')}
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
