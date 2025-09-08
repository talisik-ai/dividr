import TitleBar from '@/Components/Main/Titlebar';
import { Outlet } from 'react-router-dom';

export default function AppLayout() {
  return (
    <div className="h-screen flex flex-col p-4 gap-4">
      <TitleBar className="h-13 relative z-10" />
      <main className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
