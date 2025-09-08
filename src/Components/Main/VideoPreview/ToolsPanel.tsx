import {
  getCustomPanelComponent,
  hasCustomPanelComponent,
} from '@/Components/Main/VideoPreview/Panels/PanelRegistry';
import { initializePanelRegistry } from '@/Components/Main/VideoPreview/Panels/registerPanels';
import { useActivePanelType, usePanelStore } from '@/Store/PanelStore';
import React, { useCallback } from 'react';

interface ToolsPanelProps {
  className?: string;
}

// Initialize panel registry once
initializePanelRegistry();

export const ToolsPanel: React.FC<ToolsPanelProps> = ({ className }) => {
  const { hidePanel } = usePanelStore();
  const activePanelType = useActivePanelType();

  const handleClosePanel = useCallback(() => {
    hidePanel();
  }, [hidePanel]);

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
              className={`w-80 flex items-center justify-center bg-background border-l border-border ${className}`}
            >
              <div className="text-muted-foreground text-sm">Loading...</div>
            </div>
          }
        >
          <CustomComponent className={className} onClose={handleClosePanel} />
        </React.Suspense>
      );
    }
  }

  // Fallback message for panels without custom components
  return (
    <div
      className={`w-80 flex items-center justify-center bg-background border-l border-border ${className}`}
    >
      <div className="text-muted-foreground text-sm">Panel not available</div>
    </div>
  );
};
