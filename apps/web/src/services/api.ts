import type {
  AiCapabilities, AiRequest, AiResponse,
  AssetEntry, AssetManifest, HistoricCatalog, ImageryIndex, Journey, JourneyIndexEntry, JourneyResponse, LandingSite, LaunchSite, ModelInfo, PlanInput, PlanOptions, PlanResult, Mission, MissionDetail, MissionEvent, MissionSummary, Payload, Provider, Region, SiteTerrain, SourceRef, Spacecraft, TileIndex,
} from '@/types/domain';

const BASE = '/api/v1';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  // AI engine (Phase 12) — returns intents/answers as data; never touches the scene
  aiCapabilities: () => get<AiCapabilities>('/ai/capabilities'),
  aiMessage: (req: AiRequest) => post<AiResponse>('/ai/message', req),
  // research engine (Python) — always through this API
  researchMissions: () => get<HistoricCatalog>('/research/missions'),
  researchModel: () => get<ModelInfo>('/research/model'),
  researchOptions: () => get<PlanOptions>('/research/options'),
  researchPlan: (input: PlanInput) => post<PlanResult>('/research/plan', input),
  health: () => get<{ ok: boolean; assets: number }>('/health'),
  // journeys (research engine, through this API)
  launchSites: () => get<{ launchSites: LaunchSite[] }>('/launch-sites'),
  journeys: () => get<{ journeys: JourneyIndexEntry[] }>('/journeys'),
  missionJourney: async (id: string): Promise<JourneyResponse> => {
    const res = await fetch(`${BASE}/missions/${id}/journey`);
    if (res.status === 404) { const b = await res.json().catch(() => ({})); return { journey: null, reason: b.reason ?? 'not-found', detail: b.detail ?? b.error }; }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — /missions/${id}/journey`);
    return { journey: (await res.json()) as Journey };
  },
  planJourney: (planInput: PlanInput, launchSiteId?: string) => post<Journey>('/plan/journey', { planInput, launchSiteId }),
  missions: (q: { status?: string; providerId?: string; regionId?: string } = {}) => {
    const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
    return get<{ count: number; missions: MissionSummary[] }>(`/missions${s ? `?${s}` : ''}`);
  },
  mission: (id: string) => get<MissionDetail>(`/missions/${id}`),
  missionEvents: (id: string) => get<{ events: MissionEvent[] }>(`/missions/${id}/events`),
  providers: () => get<{ providers: Provider[] }>('/providers'),
  provider: (id: string) => get<Provider & { missions: Pick<Mission, 'id' | 'name' | 'status'>[] }>(`/providers/${id}`),
  spacecraft: () => get<{ spacecraft: Spacecraft[] }>('/spacecraft'),
  spacecraftById: (id: string) => get<Spacecraft & { missions: string[] }>(`/spacecraft/${id}`),
  payloads: () => get<{ payloads: Payload[] }>('/payloads'),
  payload: (id: string) => get<Payload & { missions: Pick<Mission, 'id' | 'name' | 'status'>[] }>(`/payloads/${id}`),
  landingSites: () => get<{ landingSites: LandingSite[] }>('/landing-sites'),
  landingSite: (id: string) => get<LandingSite & { region: Region | null; missions: Pick<Mission, 'id' | 'name' | 'status'>[]; sources: SourceRef[] }>(`/landing-sites/${id}`),
  siteTerrain: (id: string, radiusKm = 400) => get<SiteTerrain>(`/landing-sites/${id}/terrain?radiusKm=${radiusKm}`),
  regions: () => get<{ regions: Region[] }>('/lunar/regions'),
  region: (id: string) => get<Region & { landingSites: LandingSite[]; missions: Pick<Mission, 'id' | 'name' | 'status'>[] }>(`/lunar/regions/${id}`),
  tilesets: () => get<TileIndex>('/lunar/terrain/tilesets'),
  imageryTilesets: () => get<ImageryIndex>('/lunar/imagery/tilesets'),
  elevation: (lat: number, lon: number) => get<{ latitude: number; longitude: number; elevationM: number; slopeDeg: number }>(`/lunar/terrain/elevation?lat=${lat}&lon=${lon}`),
  assets: () => get<AssetManifest>('/assets'),
  asset: (id: string) => get<AssetEntry>(`/assets/${id}`),
  sources: () => get<{ sources: SourceRef[] }>('/sources'),
  timeline: () => get<{ events: MissionEvent[] }>('/timeline'),
  search: (q: string) => get<{ missions: { id: string; name: string; status: string }[]; landingSites: { id: string; name: string }[]; payloads: { id: string; name: string; acronym: string }[]; regions: { id: string; name: string }[] }>(`/search?q=${encodeURIComponent(q)}`),
};
