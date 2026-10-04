import { Outlet } from 'react-router-dom';
import { LunarWorld } from '@/lunar-world/core/LunarWorld';
import { CommandBar } from '@/ui/CommandBar';
import { DataPanel } from '@/ui/DataPanel';
import { InfoPanel } from '@/ui/InfoPanel';
import { SimulationPanel } from '@/ui/SimulationPanel';
import { HistoryPanel } from '@/ui/HistoryPanel';
import { JourneyPanel } from '@/ui/JourneyPanel';
import { SceneConfigPanel } from '@/ui/SceneConfigPanel';
import { SourcesPanel } from '@/ui/SourcesPanel';
import { StageRail } from '@/ui/StageRail';
import { StatusBar } from '@/ui/StatusBar';
import { WorldClockBar } from '@/ui/WorldClockBar';
import { TopBar } from '@/ui/TopBar';

/**
 * SpaceLayout — the persistent 3D world with the HUD around it. Child routes render nothing visible:
 * they only translate the URL into a SceneIntent.
 */
export function SpaceLayout() {
  return (
    <div className="space-layout">
      <LunarWorld />
      <TopBar compact />
      <StageRail />
      <div className="hud-left">
        <JourneyPanel />
        <SimulationPanel />
        <HistoryPanel />
        <InfoPanel />
        <SourcesPanel />
      </div>
      <div className="hud-right">
        <DataPanel />
        <SceneConfigPanel />
      </div>
      <div className="hud-bottom">
        <CommandBar />
        <WorldClockBar />
        <StatusBar />
      </div>
      <Outlet />
    </div>
  );
}
