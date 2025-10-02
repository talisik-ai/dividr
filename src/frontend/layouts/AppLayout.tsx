import { Outlet } from 'react-router-dom';
import TitleBar from './Titlebar';

export default function AppLayout() {
  return (
    <div className="h-screen flex flex-col p-4 gap-4">
      <TitleBar className="relative z-10 -mt-4 py-2" />
      <main className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
