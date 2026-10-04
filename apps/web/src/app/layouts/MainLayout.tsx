import { Outlet } from 'react-router-dom';
import { TopBar } from '@/ui/TopBar';

/** MainLayout — data/browsing pages (no WebGL). */
export function MainLayout() {
  return (
    <div className="main-layout">
      <TopBar />
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
