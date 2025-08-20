import React from 'react';
import { PanelType } from '../../../../Store/PanelStore';

// Base interface for custom panel components
export interface CustomPanelProps {
  className?: string;
  onClose?: () => void;
}

// Type for custom panel components
export type CustomPanelComponent = React.ComponentType<CustomPanelProps>;

// We'll populate this registry dynamically to avoid circular dependencies
export const panelRegistry: Partial<Record<PanelType, CustomPanelComponent>> =
  {};

// Helper function to register a panel component
export const registerPanelComponent = (
  panelType: PanelType,
  component: CustomPanelComponent,
) => {
  if (panelType !== null) {
    panelRegistry[panelType] = component;
  }
};

// Helper function to check if a panel type has a custom component
export const hasCustomPanelComponent = (panelType: PanelType): boolean => {
  return panelType !== null && panelType in panelRegistry;
};

// Helper function to get the custom component for a panel type
export const getCustomPanelComponent = (
  panelType: PanelType,
): CustomPanelComponent | null => {
  if (panelType === null) return null;
  return panelRegistry[panelType] || null;
};
