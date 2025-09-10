import NotFound from '@/Features/Errors/NotFound';
import VideoEditor from '@/Features/VideoEditor/VideoEditor';
import Projects from '@/Features/WelcomeScreen/Projects';
import AppLayout from '@/Layout/AppLayout';
import VideoEditorLayout from '@/Layout/VideoEditorLayout';
import { createHashRouter } from 'react-router-dom';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [{ index: true, element: <Projects /> }],
  },
  {
    path: '/video-editor',
    element: <VideoEditorLayout />,
    children: [{ index: true, element: <VideoEditor /> }],
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);
