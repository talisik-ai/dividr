import {
  Navigate,
  Route,
  HashRouter as Router,
  Routes,
} from 'react-router-dom';
import './App.css';
import NewProject from './Components/Pages/NewProject';
import NotFound from './Components/Pages/NotFound';
import { VideoEditor } from './Components/VideoEditor';
import MainLayout from './Layout/Mainlayout';
import { ThemeProvider } from './Utility/ThemeProvider';
function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <Router>
        <Routes>
          <Route path="/" element={<NewProject />}>
          </Route>
          <Route path="/video-editor" element={<MainLayout />}>
            <Route index element={<Navigate to="/video-editor" replace />} />
            <Route
              path="/video-editor"
              element={<VideoEditor />}
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Router>
    {/*  <Toaster /> */} 
    </ThemeProvider>
  );
}

export default App;
