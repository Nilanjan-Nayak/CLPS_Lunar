import { Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from './layouts/MainLayout';
import { SpaceLayout } from './layouts/SpaceLayout';
import { EarthScenePage, LandingSiteScenePage, MissionJourneyScenePage, MissionScenePage, MissionsScenePage, MoonScenePage, PlanJourneyScenePage, PlanScenePage, RegionScenePage, SpaceScenePage } from '@/pages/scene';
import { NavigatorPage } from '@/pages/NavigatorPage';
import { PlanPage } from '@/pages/PlanPage';
import { ResiliencePage } from '@/pages/ResiliencePage';
import { OptimizerPage } from '@/pages/OptimizerPage';
import { DecisionReportPage } from '@/pages/DecisionReportPage';
import { MissionsPage } from '@/pages/MissionsPage';
import { MissionPage } from '@/pages/MissionPage';
import { PayloadPage, PayloadsPage } from '@/pages/PayloadsPage';
import { LanderPage, ProviderPage, ProvidersPage } from '@/pages/ProvidersPage';
import { MapPage } from '@/pages/MapPage';
import { TimelinePage } from '@/pages/TimelinePage';
import { ComparePage } from '@/pages/ComparePage';
import { ResearchPage } from '@/pages/ResearchPage';
import { CopilotPage } from '@/pages/CopilotPage';
import { SourcesPage } from '@/pages/SourcesPage';
import { AssetsPage } from '@/pages/AssetsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function Router() {
  return (
    <Routes>
      <Route element={<SpaceLayout />}>
        <Route path="/" element={<Navigate to="/space" replace />} />
        <Route path="/space" element={<SpaceScenePage />} />
        <Route path="/earth" element={<EarthScenePage />} />
        <Route path="/moon" element={<MoonScenePage />} />
        <Route path="/regions/:id" element={<RegionScenePage />} />
        <Route path="/landing-sites/:id" element={<LandingSiteScenePage />} />
        <Route path="/missions/scene" element={<MissionsScenePage />} />
        <Route path="/missions/:id/scene" element={<MissionScenePage />} />
        <Route path="/missions/:id/journey" element={<MissionJourneyScenePage />} />
        <Route path="/plan/scene" element={<PlanScenePage />} />
        <Route path="/plan/journey" element={<PlanJourneyScenePage />} />
        <Route path="/navigator" element={<NavigatorPage />} />
      </Route>
      <Route element={<MainLayout />}>
        <Route path="/plan" element={<PlanPage />} />
        <Route path="/resilience" element={<ResiliencePage />} />
        <Route path="/optimizer" element={<OptimizerPage />} />
        <Route path="/report" element={<DecisionReportPage />} />
        <Route path="/missions" element={<MissionsPage />} />
        <Route path="/missions/:id" element={<MissionPage />} />
        <Route path="/payloads" element={<PayloadsPage />} />
        <Route path="/payloads/:id" element={<PayloadPage />} />
        <Route path="/providers" element={<ProvidersPage />} />
        <Route path="/providers/:id" element={<ProviderPage />} />
        <Route path="/landers/:id" element={<LanderPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/timeline" element={<TimelinePage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/research" element={<ResearchPage />} />
        <Route path="/copilot" element={<CopilotPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/assets" element={<AssetsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
