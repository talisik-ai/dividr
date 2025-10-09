import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useShortcutRegistryInit } from './frontend/features/editor/stores/videoEditor';
import { ThemeProvider } from './frontend/providers/ThemeProvider';
import { router } from './frontend/routes';
import './frontend/styles/app.css';

function App() {
  // Initialize shortcut registry globally so it's always available
  useShortcutRegistryInit();

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <RouterProvider router={router} />
      <Toaster
        richColors
        position="bottom-right"
        style={{ fontFamily: 'inherit' }}
      />
    </ThemeProvider>
  );
}

export default App;
