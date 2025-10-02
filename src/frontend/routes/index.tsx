import VideoEditor from '@/frontend/features/editor/VideoEditor';
import NotFound from '@/frontend/features/errors/NotFound';
import Projects from '@/frontend/features/projects/Projects';
import AppLayout from '@/frontend/layouts/AppLayout';
import VideoEditorLayout from '@/frontend/layouts/VideoEditorLayout';
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
