import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LunarWorld } from '@/lunar-world/core/LunarWorld';
import { useSceneStore } from '@/state/sceneStore';
import { CommandBar } from '@/ui/CommandBar';
import { DataPanel } from '@/ui/DataPanel';
import { InfoPanel } from '@/ui/InfoPanel';
import { SimulationPanel } from '@/ui/SimulationPanel';
import { HistoryPanel } from '@/ui/HistoryPanel';
import { JourneyPanel } from '@/ui/JourneyPanel';
import { NavHud } from '@/ui/NavHud';
import { SceneConfigPanel } from '@/ui/SceneConfigPanel';
import { SourcesPanel } from '@/ui/SourcesPanel';
import { StageRail } from '@/ui/StageRail';
import { StatusBar } from '@/ui/StatusBar';
import { ClockControls, EnvReadout } from '@/ui/WorldClockBar';
import { TopBar } from '@/ui/TopBar';

/**
 * SpaceLayout — the persistent 3D world with the mission-control HUD around it:
 *   top bar (navigation) → stage strip (Earth → Moon → Surface → Mission) →
 *   left dock = what you are looking at (journey / simulation / history / selection),
 *   right dock = data & provenance (terrain, payloads, scene config, sources — replaced by the Hybrid Workbench on /navigator),
 *   bottom dock = world clock · command bar · environment readout, with the telemetry strip beneath;
 *   NavHud (bottom-right, surface regime only) = compass / AGL / heading / distance to the focus / scale bar.
 */
export function SpaceLayout() {
  const loc = useLocation();
  const isNavigator = loc.pathname === '/navigator';
  const hasFlight = useSceneStore((s) => !!s.config?.panels.some((p) => p === 'journey' || p === 'simulation'));
  const [mobilePanelsOpen, setMobilePanelsOpen] = useState(false);

  useEffect(() => setMobilePanelsOpen(false), [loc.pathname]);

  return (
    <div className="space-layout">
      <LunarWorld />
      <TopBar compact />
      <StageRail />
      <button
        type="button"
        className="hud-mobile-toggle"
        aria-controls="scene-panels"
        aria-expanded={mobilePanelsOpen}
        onClick={() => setMobilePanelsOpen((open) => !open)}
      >
        <span aria-hidden="true">◈</span> {hasFlight ? 'Mission controls' : 'Scene panels'} <span aria-hidden="true">{mobilePanelsOpen ? '▴' : '▾'}</span>
      </button>
      <aside id="scene-panels" className={`hud hud-left${mobilePanelsOpen ? ' mobile-open' : ''}`} aria-label="Scene panels">
        <JourneyPanel />
        <SimulationPanel />
        <HistoryPanel />
        <InfoPanel />
      </aside>
      {!isNavigator && (
        <aside className="hud hud-right" aria-label="Data panels">
          <DataPanel />
          <SceneConfigPanel />
          <SourcesPanel />
        </aside>
      )}
      <NavHud />
      <div className="hud-bottom">
        <div className="dock">
          <ClockControls />
          <CommandBar />
          <EnvReadout />
        </div>
        <StatusBar />
      </div>
      <Outlet />
    </div>
  );
}
