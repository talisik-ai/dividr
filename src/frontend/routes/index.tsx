import { MediaToolsTest } from '@/frontend/features/dev-tools';
import { DialogsTest } from '@/frontend/features/dev-tools/DialogsTest';
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
    path: '/dev-tools',
    element: <AppLayout />,
    children: [{ index: true, element: <MediaToolsTest /> }],
  },
  {
    path: '/dialogs-test',
    element: <AppLayout />,
    children: [{ index: true, element: <DialogsTest /> }],
  },
  {
    path: '*',
    element: <NotFound />,
  },
]);
