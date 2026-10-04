import { NavLink } from 'react-router-dom';
import { NAV_LINKS } from '@/app/routes';
import { CAMERA_STATE_LABEL } from '@/constants/cameraStates';
import { useCameraStore } from '@/state/cameraStore';
import { useSceneStore } from '@/state/sceneStore';

export function TopBar({ compact = false }: { compact?: boolean }) {
  const state = useCameraStore((s) => s.state);
  const flying = useCameraStore((s) => s.flying);
  const title = useSceneStore((s) => s.config?.title);
  return (
    <header className={`topbar${compact ? ' compact' : ''}`}>
      <NavLink to="/space" className="brand">
        <span className="brand-dot" />
        <span>CLPS Lunar Mission Browser</span>
        <small>NASA-grounded · Earth → Moon → Surface → Mission</small>
      </NavLink>
      <nav>
        {NAV_LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <div className="topbar-state">
        <span className="mono">{CAMERA_STATE_LABEL[state]}</span>
        {flying && <span className="pulse">flight</span>}
        {title && <span className="scene-title">{title}</span>}
      </div>
    </header>
  );
}
