import { createContext, useContext, useEffect, useState } from 'react';

type WindowStateProviderProps = {
  children: React.ReactNode;
};

type WindowStateProviderState = {
  isMaximized: boolean;
};

const initialState: WindowStateProviderState = {
  isMaximized: false,
};

const WindowStateProviderContext =
  createContext<WindowStateProviderState>(initialState);

export function WindowStateProvider({
  children,
  ...props
}: WindowStateProviderProps) {
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  useEffect(() => {
    // Get initial state
    window.appControl.getMaximizeState().then((state: boolean) => {
      setIsMaximized(state);
    });

    // Listen for maximize state changes
    window.appControl.onMaximizeChanged((state: boolean) => {
      setIsMaximized(state);
    });

    // Cleanup listener on unmount
    return () => {
      window.appControl.offMaximizeChanged();
    };
  }, []);

  const value = {
    isMaximized,
  };

  return (
    <WindowStateProviderContext.Provider {...props} value={value}>
      {children}
    </WindowStateProviderContext.Provider>
  );
}

export const useWindowState = () => {
  const context = useContext(WindowStateProviderContext);

  if (context === undefined)
    throw new Error('useWindowState must be used within a WindowStateProvider');

  return context;
};
