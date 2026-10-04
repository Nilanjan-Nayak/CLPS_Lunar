import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useSceneIntent } from '@/hooks/useSceneIntent';
import type { MissionDetailLevel, SceneIntent } from '@/scene-manager/SceneConfig';

/* Scene routes: each one is a pure URL → SceneIntent mapping. */

function useIntentRoute(intent: SceneIntent | null) {
  const { error } = useSceneIntent(intent);
  if (error) return <div className="route-error">API error: {error.message}</div>;
  return null;
}

export function SpaceScenePage() {
  const intent = useMemo<SceneIntent>(() => ({ type: 'EXPLORE_SPACE' }), []);
  return useIntentRoute(intent);
}
export function EarthScenePage() {
  const intent = useMemo<SceneIntent>(() => ({ type: 'EXPLORE_EARTH' }), []);
  return useIntentRoute(intent);
}
export function MoonScenePage() {
  const [q] = useSearchParams();
  const history = q.get('history') === '1';
  const intent = useMemo<SceneIntent>(() => (history ? { type: 'HISTORY' } : { type: 'EXPLORE_MOON' }), [history]);
  return useIntentRoute(intent);
}
export function PlanScenePage() {
  const [q] = useSearchParams();
  const key = q.toString();
  const intent = useMemo<SceneIntent | null>(() => {
    const num = (k: string) => (q.get(k) != null && q.get(k) !== '' ? Number(q.get(k)) : undefined);
    const lat = num('latitude'), lon = num('longitude');
    if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return null;
    return {
      type: 'PLAN_LANDING',
      plan: {
        latitude: lat, longitude: lon, landerId: q.get('landerId') ?? undefined, launchVehicleId: q.get('launchVehicleId') ?? undefined, transferId: q.get('transferId') ?? undefined,
        dryMassKg: num('dryMassKg'), propellantKg: num('propellantKg'), payloadKg: num('payloadKg'), thrustN: num('thrustN'), ispS: num('ispS'), minThrottle: num('minThrottle'),
        orbitDays: num('orbitDays'), surfaceDays: num('surfaceDays'), dataVolumeGb: num('dataVolumeGb'), downlinkMbps: num('downlinkMbps'), year: num('year'),
        landingDate: q.get('landingDate') || undefined,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useIntentRoute(intent);
}
function planFromQuery(q: URLSearchParams) {
  const num = (k: string) => (q.get(k) != null && q.get(k) !== '' ? Number(q.get(k)) : undefined);
  const lat = num('latitude'), lon = num('longitude');
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return {
    latitude: lat, longitude: lon, landerId: q.get('landerId') ?? undefined, launchVehicleId: q.get('launchVehicleId') ?? undefined, transferId: q.get('transferId') ?? undefined,
    dryMassKg: num('dryMassKg'), propellantKg: num('propellantKg'), payloadKg: num('payloadKg'), thrustN: num('thrustN'), ispS: num('ispS'), minThrottle: num('minThrottle'),
    orbitDays: num('orbitDays'), surfaceDays: num('surfaceDays'), dataVolumeGb: num('dataVolumeGb'), downlinkMbps: num('downlinkMbps'), year: num('year'),
    landingDate: q.get('landingDate') || undefined,
  };
}
/** /plan/journey?latitude&longitude&landerId…&launchSiteId — the plan's Earth→Moon route (research engine). */
export function PlanJourneyScenePage() {
  const [q] = useSearchParams();
  const key = q.toString();
  const intent = useMemo<SceneIntent | null>(() => {
    const plan = planFromQuery(q);
    if (!plan) return null;
    return { type: 'PLAN_JOURNEY', plan, launchSiteId: q.get('launchSiteId') ?? undefined };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useIntentRoute(intent);
}
/** /missions/:id/journey — animated launch → Moon route of a catalogued mission. */
export function MissionJourneyScenePage() {
  const { id = '' } = useParams();
  const intent = useMemo<SceneIntent>(() => ({ type: 'SHOW_JOURNEY', missionId: id }), [id]);
  return useIntentRoute(intent);
}
export function RegionScenePage() {
  const { id = '' } = useParams();
  const intent = useMemo<SceneIntent>(() => ({ type: 'SHOW_REGION', regionId: id }), [id]);
  return useIntentRoute(intent);
}
export function LandingSiteScenePage() {
  const { id = '' } = useParams();
  const [q] = useSearchParams();
  const journey = q.get('journey') === '1';
  const intent = useMemo<SceneIntent>(() => ({ type: 'SHOW_LANDING_SITE', landingSiteId: id, journeyFromEarth: journey }), [id, journey]);
  return useIntentRoute(intent);
}
export function MissionScenePage() {
  const { id = '' } = useParams();
  const [q] = useSearchParams();
  const detail = (q.get('detail') as MissionDetailLevel | null) ?? 'basic';
  const journey = q.get('journey') === '1';
  const intent = useMemo<SceneIntent>(() => ({ type: 'SHOW_MISSION', missionId: id, detail, journeyFromEarth: journey }), [id, detail, journey]);
  return useIntentRoute(intent);
}
export function MissionsScenePage() {
  const [q] = useSearchParams();
  const ids = q.get('ids');
  const region = q.get('region') ?? undefined;
  const landers = q.get('landers') === '1';
  const intent = useMemo<SceneIntent>(() => ({ type: 'SHOW_MISSIONS', missionIds: ids ? ids.split(',') : undefined, regionId: region, includeLanders: landers }), [ids, region, landers]);
  return useIntentRoute(intent);
}
