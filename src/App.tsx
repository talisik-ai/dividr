import { RouterProvider } from 'react-router-dom';
import { router } from './Routes';
import './Styles/app.css';
import { ThemeProvider } from './Utility/ThemeProvider';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <RouterProvider router={router} />
      {/*  <Toaster /> */}
    </ThemeProvider>
  );
}

export default App;
