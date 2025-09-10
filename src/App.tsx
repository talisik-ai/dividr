import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { router } from './Routes';
import './Styles/app.css';
import { ThemeProvider } from './Utility/ThemeProvider';

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
