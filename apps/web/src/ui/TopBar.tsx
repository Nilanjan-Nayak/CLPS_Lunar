import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAV_LINKS } from '@/app/routes';
import { CAMERA_STATE_LABEL } from '@/constants/cameraStates';
import { formatUtc, useClockStore } from '@/state/clockStore';
import { useCameraStore } from '@/state/cameraStore';
import { useSceneStore } from '@/state/sceneStore';
import { GuidedTour, useGuidedTourState } from './GuidedTour';

/**
 * TopBar — clean, high-tech aerospace mission-control navigation bar:
 * 1. Brand identity + SELENARA X tag
 * 2. [3D Navigation] interactive Space/Moon view switcher + separate [History] archive
 * 3. [⚡ 3D Navigator] primary hybrid workbench CTA
 * 4. [Mission Studio ▾] 4-step engineering intelligence dropdown (01 Plan → 02 MRI → 03 Pareto → 04 Report)
 * 5. [Missions] + [Atlas & Data ▾] + [✦ Copilot]
 * 6. Right telemetry deck: active scene title, camera stage chip & UTC world clock
 */
export function TopBar({ compact = false }: { compact?: boolean }) {
  const state = useCameraStore((s) => s.state);
  const flying = useCameraStore((s) => s.flying);
  const title = useSceneStore((s) => s.config?.title);
  const clockMode = useClockStore((s) => s.mode);
  const epochMs = useClockStore((s) => s.epochMs);
  const { pathname, search } = useLocation();
  const [openMenu, setOpenMenu] = useState<'views' | 'studio' | 'data' | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const tour = useGuidedTourState();

  useEffect(() => {
    setOpenMenu(null);
    setMobileNavOpen(false);
  }, [pathname, search]);

  useEffect(() => {
    if (!openMenu) return;
    const close = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [openMenu]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMobileNavOpen(false); setOpenMenu(null); }
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [mobileNavOpen]);

  useEffect(() => {
    const openForTour = () => setMobileNavOpen(true);
    window.addEventListener('selenara-tour-open-mobile-nav', openForTour);
    return () => window.removeEventListener('selenara-tour-open-mobile-nav', openForTour);
  }, []);

  const explore = NAV_LINKS.filter((l) => l.group === 'explore');
  const viewLinks = explore.filter((l) => l.to !== '/moon?history=1');
  const historyItem = explore.find((l) => l.to === '/moon?history=1')!;
  const navigatorItem = NAV_LINKS.find((l) => l.group === 'navigator')!;
  const studio = NAV_LINKS.filter((l) => l.group === 'studio');
  const missionsItem = NAV_LINKS.find((l) => l.to === '/missions')!;
  const copilotItem = NAV_LINKS.find((l) => l.to === '/copilot')!;
  const data = NAV_LINKS.filter((l) => l.group === 'data');
  const researchLab = data.find((l) => l.to === '/research');
  const catalogues = data.filter((l) => l.to !== '/research');

  const isActive = (to: string) => {
    const [path, q] = to.split('?');
    if (q) return pathname === path && search.includes(q);
    if (path === '/moon') return pathname === '/moon' && !search.includes('history=1');
    return pathname === path || pathname.startsWith(path + '/');
  };

  const activeStudio = studio.find((l) => isActive(l.to));
  const dataActive = data.some((l) => isActive(l.to));

  return (
    <header className={`topbar${compact ? ' compact' : ''}`}>
      <NavLink
        to="/space"
        className="brand"
        data-tour-target="brand"
        title="SELENARA X (A Modified Lunar Landing Site Navigator)"
        aria-label="SELENARA X — a modified lunar landing site navigator, home"
      >
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="15.4" stroke="currentColor" strokeOpacity=".32" />
            <path d="M27.4 8.6a13 13 0 1 0 1 21.8 10.4 10.4 0 0 1-1-21.8Z" fill="currentColor" />
            <path d="M5.4 24.8c5.2 2.4 13.1 1.7 20.6-2.6 4.6-2.7 7.7-5.8 8.6-8.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="33.8" cy="13.4" r="2.1" fill="#ffc96f" />
          </svg>
        </span>
        <span className="brand-title-wrap">
          <span className="brand-name">SELENARA <span className="brand-x">X</span></span>
          <span className="brand-tagline">A MODIFIED LUNAR LANDING SITE NAVIGATOR</span>
        </span>
      </NavLink>

      <button
        type="button"
        className="nav-mobile-toggle"
        data-tour-target="mobile-menu"
        aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileNavOpen}
        aria-controls="primary-nav"
        onClick={() => { setMobileNavOpen((open) => !open); setOpenMenu(null); }}
      >
        <span aria-hidden="true">{mobileNavOpen ? '×' : '☰'}</span> Menu
      </button>

      <nav id="primary-nav" className={`nav${mobileNavOpen ? ' mobile-open' : ''}`} aria-label="Primary Mission Navigation" ref={navRef}>
        {/* 1. Interactive 3D viewport switcher; History is intentionally a separate archive action. */}
        <div className={`nav-menu nav-views-menu${openMenu === 'views' ? ' open' : ''}`} data-tour-target="views">
          <button
            type="button"
            className={`nav-views-trigger${viewLinks.some((l) => isActive(l.to)) ? ' active' : ''}`}
            aria-haspopup="menu"
            aria-expanded={openMenu === 'views'}
            onClick={() => setOpenMenu((m) => (m === 'views' ? null : 'views'))}
            title="Switch between the live 3D space and lunar surface views"
          >
            <span className="nav-views-icon" aria-hidden="true">◇</span>
            <span className="nav-views-copy"><b>3D Navigation</b><small>SPACE · MOON</small></span>
            <span className="nav-views-current mono">{viewLinks.find((l) => isActive(l.to))?.label ?? 'Explore'}</span>
            <span className="chev">▾</span>
          </button>
          {openMenu === 'views' && (
            <div className="nav-dropdown nav-dropdown-views" role="menu">
              <div className="nav-dropdown-head">
                <span className="mono">LIVE 3D NAVIGATION</span>
                <small>Choose the view that matches your next task</small>
              </div>
              <div className="nav-view-cards">
                {viewLinks.map((l) => (
                  <NavLink key={l.to} to={l.to} role="menuitem" className={() => `nav-view-card${isActive(l.to) ? ' active' : ''}`}>
                    <span className={`nav-view-card-icon nav-view-card-${l.label.toLowerCase()}`} aria-hidden="true">{l.label === 'Space' ? '⊕' : '☾'}</span>
                    <span><strong>{l.label}</strong><small>{l.label === 'Space' ? 'Earth, Moon & mission routes' : 'Surface, sites & LOLA terrain'}</small></span>
                    <span className="mono nav-view-card-arrow">→</span>
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </div>
        <NavLink
          to={historyItem.to}
          data-tour-target="history"
          title={historyItem.hint}
          className={() => `nav-history-btn${isActive(historyItem.to) ? ' active' : ''}`}
        >
          <span className="nav-history-icon" aria-hidden="true">◷</span>
          <span><b>History</b><small>47 MISSIONS</small></span>
          <span className="nav-history-arrow" aria-hidden="true">↗</span>
        </NavLink>

        {/* 2. Flagship Hybrid 3D Navigator */}
        <NavLink
          to={navigatorItem.to}
          data-tour-target="navigator"
          title={navigatorItem.hint}
          className={() => `nav-navigator-btn${isActive(navigatorItem.to) ? ' active' : ''}`}
        >
          <span className="nav-icon-bolt" aria-hidden="true">⚡</span>
          <span>{navigatorItem.label}</span>
          <span className="nav-pill-badge mono">{navigatorItem.badge}</span>
        </NavLink>

        {/* 3. Mission Intelligence Studio (4-Step Engineering Workflow Dropdown) */}
        <div className={`nav-menu${openMenu === 'studio' ? ' open' : ''}`}>
          <button
            type="button"
            className={`nav-menu-btn studio-trigger${activeStudio ? ' active' : ''}`}
            data-tour-target="studio"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'studio'}
            onClick={() => setOpenMenu((m) => (m === 'studio' ? null : 'studio'))}
            title="4-Step Mission Intelligence Studio: Plan & Golden Window, Resilience (MRI), Pareto Optimizer & Decision Report"
          >
            <span className="nav-section-icon" aria-hidden="true">◈</span>
            <span>Mission Studio</span>
            {activeStudio ? (
              <span className="nav-step-chip mono">
                {activeStudio.step} · {activeStudio.shortLabel}
              </span>
            ) : (
              <span className="nav-pill-subtle mono">4 TOOLS</span>
            )}
            <span className="chev">▾</span>
          </button>

          {openMenu === 'studio' && (
            <div className="nav-dropdown nav-dropdown-studio" role="menu">
              <div className="nav-dropdown-head">
                <span className="mono">SELENARA X · MISSION INTELLIGENCE PIPELINE</span>
                <small>Physics, LOLA DEM &amp; Ephemeris Decision Support</small>
              </div>
              <div className="nav-studio-list">
                {studio.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    role="menuitem"
                    className={() => `nav-studio-item${isActive(l.to) ? ' active' : ''}`}
                  >
                    <span className="nav-studio-step mono">{l.step}</span>
                    <span className="nav-studio-body">
                      <span className="nav-studio-title">
                        <span>{l.label}</span>
                        {l.badge && <em className="nav-item-badge mono">{l.badge}</em>}
                      </span>
                      {l.hint && <small>{l.hint}</small>}
                    </span>
                  </NavLink>
                ))}
              </div>
              <div className="nav-dropdown-foot">
                <NavLink to="/navigator" role="menuitem" className="nav-dropdown-cta">
                  <span>⚡ Open Live 3D Hybrid Navigator Cockpit</span>
                  <span className="mono">3D + MRI →</span>
                </NavLink>
              </div>
            </div>
          )}
        </div>

        <span className="nav-sep" />

        {/* 4. CLPS Missions Manifest */}
        <NavLink
          to={missionsItem.to}
          data-tour-target="missions"
          title={missionsItem.hint}
          className={() => `nav-link-std missions-link${isActive(missionsItem.to) ? ' active' : ''}`}
        >
          <span className="nav-section-icon" aria-hidden="true">◉</span>{missionsItem.label}
        </NavLink>

        {/* 5. Atlas, Research & NASA Data Dropdown */}
        <div className={`nav-menu${openMenu === 'data' ? ' open' : ''}`}>
          <button
            type="button"
            className={`nav-menu-btn data-trigger${dataActive ? ' active' : ''}`}
            data-tour-target="data"
            aria-haspopup="menu"
            aria-expanded={openMenu === 'data'}
            onClick={() => setOpenMenu((m) => (m === 'data' ? null : 'data'))}
            title="Historical Landing Research Lab, lunar atlas and NASA Challenge resources"
          >
            <span className="nav-section-icon" aria-hidden="true">▦</span>
            <span>Atlas &amp; Data</span>
            <span className="chev">▾</span>
          </button>

          {openMenu === 'data' && (
            <div className="nav-dropdown nav-dropdown-data" role="menu">
              {researchLab && (
                <>
                  <div className="nav-dropdown-head">
                    <span className="mono">EMPIRICAL RESEARCH LAB</span>
                  </div>
                  <NavLink
                    to={researchLab.to}
                    role="menuitem"
                    className={() => `nav-studio-item${isActive(researchLab.to) ? ' active' : ''}`}
                  >
                    <span className="nav-studio-step mono">ML</span>
                    <span className="nav-studio-body">
                      <span className="nav-studio-title">
                        <span>{researchLab.label}</span>
                        <em className="nav-item-badge mono">n=47</em>
                      </span>
                      <small>{researchLab.hint}</small>
                    </span>
                  </NavLink>
                </>
              )}
              <div className="nav-dropdown-head" style={{ marginTop: 6 }}>
                <span className="mono">NASA CLPS &amp; LROC REFERENCE CATALOGUES</span>
              </div>
              <div className="nav-data-grid">
                {catalogues.map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    role="menuitem"
                    className={() => `nav-data-card${isActive(l.to) ? ' active' : ''}`}
                  >
                    <span>{l.label}</span>
                    {l.hint && <small>{l.hint}</small>}
                  </NavLink>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 6. AI Copilot Pill & Interactive Mission Guide */}
        <NavLink
          to={copilotItem.to}
          data-tour-target="copilot"
          title={copilotItem.hint}
          className={() => `nav-copilot-btn${isActive(copilotItem.to) ? ' active' : ''}`}
        >
          <span aria-hidden="true">✦</span>
          <span>{copilotItem.label}</span>
        </NavLink>

        <button
          type="button"
          className={`nav-guide-btn${tour.open ? ' active' : ''}`}
          data-tour-target="guide"
          onClick={() => tour.setOpen(true)}
          title="Open Interactive Mission Guide & Capabilities Tour"
        >
          <span className="nav-guide-q mono">?</span>
          <span>Guide</span>
        </button>
      </nav>

      <div className="topbar-state">
        {title && <span className="scene-title" title={title}>{title}</span>}
        <span className="state-chip mono" title="Active 3D camera stage">
          <span className="state-dot" />
          {CAMERA_STATE_LABEL[state]}
          {flying && <span className="pulse"> · flight</span>}
        </span>
        {!compact && (
          <span className={`clock-chip mono ${clockMode}`} title="World clock UTC (see Space or Navigator view for interactive controls)">
            {clockMode === 'live' ? '● LIVE' : clockMode === 'mission' ? '▶ MISSION' : '❚❚ FIXED'} {formatUtc(epochMs, false)}
          </span>
        )}
      </div>
      <GuidedTour open={tour.open} onClose={tour.close} />
    </header>
  );
}
