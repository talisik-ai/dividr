import { Route, HashRouter as Router, Routes } from 'react-router-dom';
import './App.css';
import NewProject from './Components/Pages/NewProject';
import NotFound from './Components/Pages/NotFound';
import { VideoEditor } from './Components/VideoEditor';
import VideoEditorLayout from './Layout/VideoEditorLayout';
import { ThemeProvider } from './Utility/ThemeProvider';

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <Router>
        <Routes>
          {/* Home route - Shows NewProject page with TitleBar */}
          <Route path="/" element={<NewProject />} />

          {/* Video Editor route - Shows full VideoEditorLayout */}
          <Route path="/video-editor" element={<VideoEditorLayout />}>
            <Route index element={<VideoEditor />} />
          </Route>

          {/* Fallback for any unknown routes */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
      {/*  <Toaster /> */}
    </ThemeProvider>
  );
}

export default App;
