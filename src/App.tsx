import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ThemeProvider } from './frontend/providers/ThemeProvider';
import { router } from './frontend/routes';
import './frontend/styles/app.css';

function App() {
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
