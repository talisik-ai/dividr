import { HashRouter as Router, Route, Routes } from 'react-router-dom';
import { VideoEditor } from './Components/VideoEditor';
import NotFound from './Features/Errors/NotFound';
import NewProject from './Features/WelcomeScreen/NewProject';
import VideoEditorLayout from './Layout/VideoEditorLayout';
import './Styles/app.css';
import { ThemeProvider } from './Utility/ThemeProvider';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
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
