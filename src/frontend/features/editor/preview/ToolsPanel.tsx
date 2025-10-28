import { initializePanelRegistry } from '@/frontend/features/editor/components/panels/registerPanels';
import { useActivePanelType } from '@/frontend/features/editor/stores/PanelStore';
import React from 'react';
import {
  getCustomPanelComponent,
  hasCustomPanelComponent,
} from '../components/panels/panelRegistry';

interface ToolsPanelProps {
  className?: string;
}

// Initialize panel registry once
initializePanelRegistry();

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ className }) => {
  const activePanelType = useActivePanelType();

  // If no panel is active, return nothing
  if (!activePanelType) {
    return null;
  }

  // Check if this panel type has a custom component
  if (hasCustomPanelComponent(activePanelType)) {
    const CustomComponent = getCustomPanelComponent(activePanelType);

    if (CustomComponent) {
      return (
        <React.Suspense
          fallback={
            <div
              className={`w-80 flex items-center justify-center bg-background border-l border-accent ${className}`}
            >
              <div className="text-muted-foreground text-sm">Loading...</div>
            </div>
          }
        >
          <CustomComponent
            className={`flex-1 min-h-0 flex flex-col ${className}`}
          />
        </React.Suspense>
      );
    }
  }

  // Fallback message for panels without custom components
  return (
    <div
      className={`w-80 flex-1 min-h-0 flex items-center justify-center bg-background border-l border-border ${className}`}
    >
      <div className="text-muted-foreground text-sm">Panel not available</div>
    </div>
  );
};
