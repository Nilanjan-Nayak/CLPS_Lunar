import { useMemo } from 'react';
import type { PlannerData, SceneIntent } from '@/scene-manager/SceneConfig';
import { useAssets, useHistoricMissions, useLandingSites, useMission, useMissionJourney, useMissions, usePlan, usePlanJourney, useRegions, useSpacecraft } from '@/services/queries';
import { spacecraftRegistry } from '@/lunar-world/spacecraft/SpacecraftRegistry';

/** Everything the ScenePlanner may need, fetched from the backend API (the frontend holds no CLPS database). */
export function usePlannerData(missionId?: string, intent?: SceneIntent | null) {
  const missions = useMissions();
  const sites = useLandingSites();
  const regions = useRegions();
  const spacecraft = useSpacecraft();
  const detail = useMission(missionId);
  const assets = useAssets();
  const needsHistory = intent?.type === 'HISTORY' || intent?.type === 'PLAN_LANDING';
  const history = useHistoricMissions();
  const plan = usePlan(intent?.type === 'PLAN_LANDING' ? intent.plan : null);
  // journeys: a 404 (no flight profile) is a valid answer (nothing drawn), an engine failure is an error
  const missionJourney = useMissionJourney(intent?.type === 'SHOW_JOURNEY' ? intent.missionId : undefined);
  const planJourney = usePlanJourney(intent?.type === 'PLAN_JOURNEY' ? intent.plan : null, intent?.type === 'PLAN_JOURNEY' ? intent.launchSiteId : undefined);
  const journeyReady = intent?.type === 'SHOW_JOURNEY' ? !!missionJourney.data : intent?.type === 'PLAN_JOURNEY' ? !!planJourney.data : true;
  const journeyError = intent?.type === 'SHOW_JOURNEY' ? missionJourney.error : intent?.type === 'PLAN_JOURNEY' ? planJourney.error : null;
  const error = missions.error ?? sites.error ?? regions.error ?? spacecraft.error ?? detail.error ?? assets.error ?? (needsHistory ? history.error : null) ?? (intent?.type === 'PLAN_LANDING' ? plan.error : null) ?? journeyError ?? null;
  const ready = !!(missions.data && sites.data && regions.data && spacecraft.data && assets.data && (!missionId || detail.data) && (!needsHistory || history.data) && (intent?.type !== 'PLAN_LANDING' || plan.data) && journeyReady);
  const data = useMemo<PlannerData | null>(() => {
    if (!ready) return null;
    // Feed the SpacecraftRegistry from the API (assets first, then spacecraft bindings) before any planning happens.
    spacecraftRegistry.loadAssets(assets.data!.assets);
    spacecraftRegistry.loadSpacecraft(spacecraft.data!.spacecraft);
    return {
      missions: missions.data!.missions, landingSites: sites.data!.landingSites, regions: regions.data!.regions, spacecraft: spacecraft.data!.spacecraft,
      missionDetail: detail.data ?? null, history: history.data?.missions ?? null, plan: plan.data ?? null,
      journey: intent?.type === 'SHOW_JOURNEY' ? missionJourney.data?.journey ?? null : intent?.type === 'PLAN_JOURNEY' ? planJourney.data ?? null : undefined,
      journeyUnavailable: intent?.type === 'SHOW_JOURNEY' ? missionJourney.data?.detail ?? null : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, missions.data, sites.data, regions.data, spacecraft.data, detail.data, assets.data, history.data, plan.data, missionJourney.data, planJourney.data, intent?.type]);
  return { data, ready, error: error as Error | null };
}
