import { VideoEditor } from '@/Components/VideoEditor';
import NotFound from '@/Features/Errors/NotFound';
import Projects from '@/Features/WelcomeScreen/Projects';
import AppLayout from '@/Layout/AppLayout';
import { createHashRouter } from 'react-router-dom';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <Projects /> },
      {
        path: '/video-editor',
        element: <VideoEditor />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);
