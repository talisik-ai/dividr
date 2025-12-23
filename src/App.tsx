import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { RuntimeDownloadModal } from './frontend/components/custom/RuntimeDownloadModal';
import { RuntimeMissingBanner } from './frontend/components/custom/RuntimeMissingBanner';
import StartupLoader from './frontend/components/custom/StartupLoader';
import { useShortcutRegistryInit } from './frontend/features/editor/stores/videoEditor';
import { RuntimeStatusProvider } from './frontend/providers/RuntimeStatusProvider';
import { ThemeProvider } from './frontend/providers/ThemeProvider';
import { WindowStateProvider } from './frontend/providers/WindowStateProvider';
import { router } from './frontend/routes';
import './frontend/styles/app.css';
import { startupManager, StartupStage } from './frontend/utils/startupManager';

function App() {
  // Initialize shortcut registry globally so it's always available
  useShortcutRegistryInit();

  const [isAppReady, setIsAppReady] = useState(false);
  const [startupStage, setStartupStage] =
    useState<StartupStage>('renderer-mount');
  const [startupProgress, setStartupProgress] = useState(0);
  const [showGlobalDownloadModal, setShowGlobalDownloadModal] = useState(false);

  useEffect(() => {
    // Subscribe to startup progress
    const unsubscribe = startupManager.subscribe((stage, progress) => {
      setStartupStage(stage);
      setStartupProgress(progress);

      // Hide loader when app is ready
      if (stage === 'app-ready') {
        setTimeout(() => {
          setIsAppReady(true);

          // Print performance summary
          startupManager.printSummary();

          // Remove the initial HTML loader if it still exists
          const htmlLoader = document.getElementById('startup-loader');
          if (htmlLoader) {
            htmlLoader.remove();
          }
        }, 300); // Small delay for smooth transition
      }
    });

    return () => unsubscribe();
  }, []);

  // Map stage to user-friendly message
  const getStageMessage = (stage: StartupStage): string => {
    const messages: Record<StartupStage, string> = {
      'app-start': 'Starting application',
      'renderer-mount': 'Loading interface',
      'indexeddb-init': 'Connecting to database',
      'indexeddb-ready': 'Database ready',
      'projects-loading': 'Loading your projects',
      'projects-loaded': 'Projects loaded',
      'app-ready': 'Almost there',
    };
    return messages[stage] || 'Initializing';
  };

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <WindowStateProvider>
        <RuntimeStatusProvider>
          {/* Show startup loader until app is ready */}
          {!isAppReady && (
            <StartupLoader
              stage={getStageMessage(startupStage)}
              progress={startupProgress}
              isVisible={!isAppReady}
            />
          )}

          {/* Main app - render immediately but hidden behind loader */}
          <div style={{ display: isAppReady ? 'block' : 'none' }}>
            {/* Banner for missing runtime - shown after startup */}
            <RuntimeMissingBanner
              onDownloadClick={() => setShowGlobalDownloadModal(true)}
            />

            <RouterProvider router={router} />
            <Toaster
              richColors
              position="bottom-right"
              style={{ fontFamily: 'inherit' }}
            />

            {/* Global runtime download modal */}
            <RuntimeDownloadModal
              isOpen={showGlobalDownloadModal}
              onClose={() => setShowGlobalDownloadModal(false)}
              featureName="AI Features"
            />
          </div>
        </RuntimeStatusProvider>
      </WindowStateProvider>
    </ThemeProvider>
  );
}

export default App;
