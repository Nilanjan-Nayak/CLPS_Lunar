import type { FastifyInstance } from 'fastify';
import type { Repository } from '../repo/jsonRepository.js';
import type { TerrainService } from '../services/terrain.js';
import type { ImageryService } from '../services/imagery.js';
import { registerAiRoutes } from './ai.js';

interface Ctx {
  repo: Repository;
  terrain: TerrainService;
  imagery: ImageryService;
}

const notFound = (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, what: string, id: string) =>
  reply.code(404).send({ error: `${what} '${id}' not found` });

export function registerRoutes(app: FastifyInstance, { repo, terrain, imagery }: Ctx) {
  const v1 = '/api/v1';

  app.get(`${v1}`, async () => ({
    name: 'SELENARA X API',
    version: 'v1',
    endpoints: [
      'GET /api/v1/health',
      'GET /api/v1/missions?status=&providerId=&regionId=',
      'GET /api/v1/missions/:id',
      'GET /api/v1/missions/:id/assets',
      'GET /api/v1/missions/:id/events',
      'GET /api/v1/providers', 'GET /api/v1/providers/:id',
      'GET /api/v1/spacecraft', 'GET /api/v1/spacecraft/:id',
      'GET /api/v1/payloads', 'GET /api/v1/payloads/:id',
      'GET /api/v1/landing-sites', 'GET /api/v1/landing-sites/:id', 'GET /api/v1/landing-sites/:id/terrain',
      'GET /api/v1/lunar/regions', 'GET /api/v1/lunar/regions/:id',
      'GET /api/v1/lunar/terrain/tilesets', 'GET /api/v1/lunar/terrain/elevation?lat=&lon=', 'GET /api/v1/lunar/terrain/tiles?lat=&lon=&radiusKm=',
      'GET /api/v1/lunar/imagery/tilesets', 'GET /api/v1/lunar/imagery/:layer/:z/:y/:x.jpg',
      'GET /api/v1/assets', 'GET /api/v1/assets/:id',
      'GET /api/v1/sources', 'GET /api/v1/sources/:id',
      'GET /api/v1/timeline',
      'GET /api/v1/search?q=',
      'GET /api/v1/research/{health|missions|model|features|options|terrain|grid|horizon|ephemeris|windows}',
      'GET /api/v1/research/horizons?lat=&lon=&utc=&days= (on-demand JPL/LOLA comparison)', 'POST /api/v1/research/{plan|train}',
      'GET /api/v1/launch-sites', 'GET /api/v1/launch-sites/:id', 'GET /api/v1/journeys', 'GET /api/v1/missions/:id/journey', 'POST /api/v1/plan/journey',
      'GET /api/v1/ai/capabilities', 'POST /api/v1/ai/message', 'POST /api/v1/ai/validate',
    ],
  }));

  app.get(`${v1}/health`, async () => ({ ok: true, time: new Date().toISOString(), assets: repo.assetManifest().assets.length }));

  // ---- missions ---------------------------------------------------------------------------
  app.get<{ Querystring: { status?: string; providerId?: string; regionId?: string } }>(`${v1}/missions`, async (req) => {
    let list = repo.missions();
    const { status, providerId, regionId } = req.query;
    if (status) list = list.filter((m) => m.status === status || (status === 'landed' && m.landing.attempted && m.status !== 'failed'));
    if (providerId) list = list.filter((m) => m.providerId === providerId);
    if (regionId) list = list.filter((m) => repo.landingSite(m.landingSiteId)?.regionId === regionId);
    return {
      count: list.length,
      missions: list.map((m) => {
        const site = repo.landingSite(m.landingSiteId);
        return {
          ...m,
          provider: repo.provider(m.providerId)?.name ?? null,
          landerName: repo.spacecraftById(m.landerId)?.name ?? null,
          landingSite: site
            ? { id: site.id, name: site.name, regionId: site.regionId, latitude: site.latitude, longitude: site.longitude, precision: site.precision }
            : null,
        };
      }),
    };
  });

  app.get<{ Params: { id: string } }>(`${v1}/missions/:id`, async (req, reply) => {
    const d = repo.missionDetail(req.params.id);
    if (!d) return notFound(reply, 'mission', req.params.id);
    // Terrain context for the landing site (drives placement in the frontend).
    let terrainContext = null;
    if (d.landingSite?.latitude != null && d.landingSite.longitude != null) {
      const surface = terrain.surfaceAt(d.landingSite.latitude, d.landingSite.longitude);
      terrainContext = surface
        ? { ...surface, tiles: terrain.tilesAround(d.landingSite.latitude, d.landingSite.longitude, 400).map((t) => t.id) }
        : null;
    }
    return { ...d, terrainContext };
  });

  app.get<{ Params: { id: string } }>(`${v1}/missions/:id/assets`, async (req, reply) => {
    const d = repo.missionDetail(req.params.id);
    if (!d) return notFound(reply, 'mission', req.params.id);
    return {
      missionId: d.mission.id,
      assets: d.spacecraft.map((s) => ({
        spacecraftId: s.id,
        role: s.role,
        assetId: s.assetId,
        assetStatus: s.assetStatus,
        assetNote: s.assetNote ?? null,
        asset: s.asset,
      })),
    };
  });

  app.get<{ Params: { id: string } }>(`${v1}/missions/:id/events`, async (req, reply) => {
    if (!repo.mission(req.params.id)) return notFound(reply, 'mission', req.params.id);
    return { events: repo.events(req.params.id) };
  });

  // ---- providers / spacecraft / payloads ---------------------------------------------------
  app.get(`${v1}/providers`, async () => ({ providers: repo.providers() }));
  app.get<{ Params: { id: string } }>(`${v1}/providers/:id`, async (req, reply) => {
    const p = repo.provider(req.params.id);
    if (!p) return notFound(reply, 'provider', req.params.id);
    return { ...p, missions: repo.missions().filter((m) => m.providerId === p.id).map((m) => ({ id: m.id, name: m.name, status: m.status })) };
  });

  app.get(`${v1}/spacecraft`, async () => ({
    spacecraft: repo.spacecraft().map((s) => ({ ...s, asset: s.assetId ? repo.asset(s.assetId) ?? null : null })),
  }));
  app.get<{ Params: { id: string } }>(`${v1}/spacecraft/:id`, async (req, reply) => {
    const s = repo.spacecraftById(req.params.id);
    if (!s) return notFound(reply, 'spacecraft', req.params.id);
    return { ...s, asset: s.assetId ? repo.asset(s.assetId) ?? null : null, missions: repo.missions().filter((m) => m.spacecraftRefs.some((r) => r.spacecraftId === s.id)).map((m) => m.id) };
  });
  app.get(`${v1}/landers`, async () => ({ landers: repo.spacecraft().filter((s) => s.type === 'lander') }));
  app.get<{ Params: { id: string } }>(`${v1}/landers/:id`, async (req, reply) => {
    const s = repo.spacecraftById(req.params.id);
    if (!s || s.type !== 'lander') return notFound(reply, 'lander', req.params.id);
    return s;
  });

  app.get(`${v1}/payloads`, async () => ({ payloads: repo.payloads() }));
  app.get<{ Params: { id: string } }>(`${v1}/payloads/:id`, async (req, reply) => {
    const p = repo.payload(req.params.id);
    if (!p) return notFound(reply, 'payload', req.params.id);
    return { ...p, missions: p.missionIds.map((id) => repo.mission(id)).filter(Boolean).map((m) => ({ id: m!.id, name: m!.name, status: m!.status })) };
  });

  // ---- landing sites & lunar ----------------------------------------------------------------
  app.get(`${v1}/landing-sites`, async () => ({
    landingSites: repo.landingSites().map((s) => ({ ...s, region: repo.region(s.regionId)?.name ?? null })),
  }));
  app.get<{ Params: { id: string } }>(`${v1}/landing-sites/:id`, async (req, reply) => {
    const s = repo.landingSite(req.params.id);
    if (!s) return notFound(reply, 'landing site', req.params.id);
    return {
      ...s,
      region: repo.region(s.regionId) ?? null,
      missions: s.missionIds.map((id) => repo.mission(id)).filter(Boolean).map((m) => ({ id: m!.id, name: m!.name, status: m!.status })),
      sources: s.sourceIds.map((id) => repo.source(id)).filter(Boolean),
    };
  });
  app.get<{ Params: { id: string }; Querystring: { radiusKm?: string } }>(`${v1}/landing-sites/:id/terrain`, async (req, reply) => {
    const s = repo.landingSite(req.params.id);
    if (!s) return notFound(reply, 'landing site', req.params.id);
    if (s.latitude == null || s.longitude == null) {
      return { siteId: s.id, available: false, reason: 'No published coordinates — nothing to place.', precision: s.precision };
    }
    const radiusKm = Number(req.query.radiusKm ?? 400);
    const surface = terrain.surfaceAt(s.latitude, s.longitude);
    const tiles = terrain.tilesAround(s.latitude, s.longitude, radiusKm);
    const idx = terrain.tileIndex();
    return {
      siteId: s.id,
      available: !!surface,
      site: { latitude: s.latitude, longitude: s.longitude, precision: s.precision, publishedElevationM: s.elevationM },
      surface,
      elevationDiscrepancyM: surface && s.elevationM != null ? surface.elevationM - s.elevationM : null,
      tiles,
      datum: idx?.datum ?? null,
      encoding: idx?.encoding ?? null,
      dataSource: {
        assetId: 'nasa-cgi-moon-kit-ldem-16-uint',
        description: 'LOLA-derived elevation via NASA CGI Moon Kit (16 px/deg ≈ 1.9 km/px). Not science-grade; see PDS LOLA GDR.',
        scientificGrade: 'derived',
      },
    };
  });

  app.get(`${v1}/lunar/regions`, async () => ({ regions: repo.regions() }));
  app.get<{ Params: { id: string } }>(`${v1}/lunar/regions/:id`, async (req, reply) => {
    const r = repo.region(req.params.id);
    if (!r) return notFound(reply, 'region', req.params.id);
    const sites = repo.landingSites().filter((s) => s.regionId === r.id);
    return { ...r, landingSites: sites, missions: sites.flatMap((s) => s.missionIds).map((id) => repo.mission(id)).filter(Boolean).map((m) => ({ id: m!.id, name: m!.name, status: m!.status })) };
  });

  app.get(`${v1}/lunar/terrain/tilesets`, async () => terrain.tileIndex() ?? { tiles: [] });

  // ---- imagery (LOD2: NASA Trek WMTS proxy + cache) ---------------------------------------------
  app.get(`${v1}/lunar/imagery/tilesets`, async () => imagery.index());

  // ---- research engine (Python service) — proxied so the browser only ever talks to this API -------------------------
  const configuredResearchUrl = process.env.RESEARCH_ENGINE_URL?.trim().replace(/\/+$/, '');
  const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';
  const RESEARCH = configuredResearchUrl || 'http://127.0.0.1:8790';
  const researchConfigurationError = isProduction && !configuredResearchUrl
    ? 'RESEARCH_ENGINE_URL must point to the deployed research-engine service in Vercel'
    : null;
  registerAiRoutes(app, repo, RESEARCH);
  const forward = async (reply: { code: (n: number) => { send: (b: unknown) => unknown } }, path: string, init?: RequestInit) => {
    if (researchConfigurationError) {
      return reply.code(503).send({ error: 'research engine is not configured', detail: researchConfigurationError });
    }
    try {
      const res = await fetch(`${RESEARCH}${path}`, { ...init, signal: AbortSignal.timeout(60_000) });
      const body = await res.json().catch(() => ({ error: 'invalid response from research engine' }));
      return reply.code(res.status).send(body);
    } catch (e) {
      return reply.code(502).send({ error: 'research engine unavailable', detail: (e as Error).message });
    }
  };
  app.get<{ Params: { '*': string } }>(`${v1}/research/*`, async (req, reply) => {
    const rest = req.params['*'];
    if (!/^[a-z-]+$/.test(rest)) return reply.code(404).send({ error: 'not found' });
    const qs = req.raw.url?.includes('?') ? '?' + req.raw.url.split('?')[1] : '';
    try {
      const res = await fetch(`${RESEARCH}/${rest}${qs}`, { signal: AbortSignal.timeout(3_000) });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && !body.error) return reply.code(res.status).send(body);
      }
    } catch {
      // Offline fallback
    }
    const fallback = repo.researchFallback?.(rest);
    if (fallback) return reply.code(200).send(fallback);
    return forward(reply, `/${rest}${qs}`);
  });
  app.post<{ Params: { '*': string } }>(`${v1}/research/*`, async (req, reply) => {
    const rest = req.params['*'];
    if (!/^(plan|resilience|optimize|batch|report|train)$/.test(rest)) return reply.code(404).send({ error: 'not found' });
    return forward(reply, `/${rest}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req.body ?? {}) });
  });
  // ---- journeys: Earth launch → Moon (per mission, or for a user plan) -------------------------------------------
  // The mission→lander-class mapping lives here (data layer), never in a React component. Journey specs are composed
  // from the flight profile (published event anchors), the launch pad, the landing site and the lander class, and the
  // research engine turns them into an event-anchored route. Nothing is fabricated for missions without a profile.
  const LANDER_PRESET: Record<string, string> = {
    'peregrine': 'generic-clps-100kg', 'nova-c': 'nova-c', 'blue-ghost': 'blue-ghost', 'griffin': 'generic-clps-100kg', 'blue-moon-mk1': 'generic-clps-100kg',
  };
  const journeyCache = new Map<string, { at: number; body: unknown; status: number }>();
  const JOURNEY_TTL_MS = 10 * 60_000;
  app.get(`${v1}/launch-sites`, async () => ({ launchSites: repo.launchSites() }));
  /** Which missions have a journey (flight profile) and of what fidelity — for menus; the route itself is per mission. */
  app.get(`${v1}/journeys`, async () => ({
    journeys: repo.missions().map((m) => {
      const p = repo.flightProfile(m.id);
      const pad = p ? repo.launchSite(p.launchSiteId) : undefined;
      return {
        missionId: m.id, name: m.name, shortName: m.shortName, status: m.status, available: !!p, fidelity: p?.fidelity ?? null, profile: p?.profile ?? null,
        launchSiteId: p?.launchSiteId ?? null, launchSite: pad?.shortName ?? null, launchUtc: p?.launchUtc ?? null, illustrativeDate: !!p?.illustrativeDate, landingSiteId: m.landingSiteId
      };
    }),
  }));
  app.get<{ Params: { id: string } }>(`${v1}/launch-sites/:id`, async (req, reply) => {
    const site = repo.launchSite(req.params.id);
    if (!site) return notFound(reply, 'launch site', req.params.id);
    return { launchSite: site, sources: site.sourceIds.map((id) => repo.source(id)).filter(Boolean) };
  });
  app.get<{ Params: { id: string } }>(`${v1}/missions/:id/journey`, async (req, reply) => {
    const mission = repo.mission(req.params.id);
    if (!mission) return notFound(reply, 'mission', req.params.id);
    const profile = repo.flightProfile(mission.id);
    if (!profile) {
      return reply.code(404).send({
        error: `no flight profile for mission '${mission.id}'`, reason: 'no-profile',
        detail: 'No published launch/arrival anchors are available for this mission (or it was cancelled), so no route is drawn — routes are never invented.'
      });
    }
    const launchSite = repo.launchSite(profile.launchSiteId);
    if (!launchSite) return reply.code(500).send({ error: `launch site '${profile.launchSiteId}' missing` });
    const cached = journeyCache.get(mission.id);
    if (cached && Date.now() - cached.at < JOURNEY_TTL_MS) return reply.code(cached.status).send(cached.body);
    const { missionId: _m, launchSiteId: _l, ...rest } = profile;
    const site = repo.landingSite(mission.landingSiteId);
    const spec: Record<string, unknown> = {
      ...rest,
      id: mission.id,
      launchSite: { id: launchSite.id, name: launchSite.name, shortName: launchSite.shortName, latitude: launchSite.latitude, longitude: launchSite.longitude, altitudeM: launchSite.altitudeM },
      vehicle: mission.launch.vehicle,
      landerPresetId: LANDER_PRESET[mission.landerId] ?? 'generic-clps-100kg',
      landingSite: site ? { id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude } : null,
    };
    try {
      const res = await fetch(`${RESEARCH}/journey`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ spec }), signal: AbortSignal.timeout(3_000) });
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && !body.error) {
          const out = {
            ...(body as Record<string, unknown>), mission: { id: mission.id, name: mission.name, shortName: mission.shortName, status: mission.status },
            sources: (profile.sourceIds ?? []).map((id) => repo.source(id)).filter(Boolean)
          };
          journeyCache.set(mission.id, { at: Date.now(), body: out, status: res.status });
          return reply.code(res.status).send(out);
        }
      }
    } catch {
      // Research engine unavailable, fall through to static pre-computed journey
    }

    const staticJourney = repo.journey?.(mission.id);
    if (staticJourney) {
      journeyCache.set(mission.id, { at: Date.now(), body: staticJourney, status: 200 });
      return reply.code(200).send(staticJourney);
    }

    return reply.code(502).send({ error: 'research engine unavailable' });
  });
  app.post<{ Body: { planInput?: Record<string, unknown>; launchSiteId?: string } }>(`${v1}/plan/journey`, async (req, reply) => {
    const planInput = req.body?.planInput;
    if (!planInput || typeof planInput.latitude !== 'number' || typeof planInput.longitude !== 'number') {
      return reply.code(400).send({ error: 'planInput with numeric latitude/longitude is required' });
    }
    const launchSite = repo.launchSite(req.body.launchSiteId ?? 'ksc-lc-39a');
    if (!launchSite) return notFound(reply, 'launch site', String(req.body.launchSiteId));
    return forward(reply, '/journey', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ planInput, launchSite: { id: launchSite.id, name: launchSite.name, shortName: launchSite.shortName, latitude: launchSite.latitude, longitude: launchSite.longitude, altitudeM: launchSite.altitudeM } })
    });
  });

  app.get<{ Params: { layer: string; z: string; y: string; x: string } }>(`${v1}/lunar/imagery/:layer/:z/:y/:x.jpg`, async (req, reply) => {
    const layer = imagery.layer(req.params.layer);
    if (!layer) return notFound(reply, 'imagery layer', req.params.layer);
    const z = Number(req.params.z), y = Number(req.params.y), x = Number(req.params.x);
    if (!imagery.valid(layer, z, y, x)) return reply.code(400).send({ error: 'tile index out of range' });
    const buf = await imagery.tile(layer, z, y, x);
    if (!buf) return reply.code(502).send({ error: 'upstream tile unavailable' });
    reply.header('Cache-Control', 'public, max-age=604800');
    reply.header('X-Credit', 'NASA/GSFC/Arizona State University (LROC WAC) via NASA Solar System Treks');
    return reply.type(layer.contentType).send(buf);
  });
  app.get<{ Querystring: { lat?: string; lon?: string } }>(`${v1}/lunar/terrain/elevation`, async (req, reply) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return reply.code(400).send({ error: 'lat & lon required' });
    return { latitude: lat, longitude: lon, ...terrain.surfaceAt(lat, lon) };
  });
  app.get<{ Querystring: { lat?: string; lon?: string; radiusKm?: string } }>(`${v1}/lunar/terrain/tiles`, async (req, reply) => {
    const lat = Number(req.query.lat), lon = Number(req.query.lon), r = Number(req.query.radiusKm ?? 400);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return reply.code(400).send({ error: 'lat & lon required' });
    return { tiles: terrain.tilesAround(lat, lon, r) };
  });

  // ---- assets / sources / timeline / search ------------------------------------------------
  app.get<{ Querystring: { type?: string } }>(`${v1}/assets`, async (req) => {
    const m = repo.assetManifest();
    const assets = req.query.type ? m.assets.filter((a) => a.assetType === req.query.type) : m.assets;
    return { ...m, assets };
  });
  app.get<{ Params: { id: string } }>(`${v1}/assets/:id`, async (req, reply) => {
    const a = repo.asset(req.params.id);
    if (!a) return notFound(reply, 'asset', req.params.id);
    return a;
  });

  app.get(`${v1}/sources`, async () => ({ sources: repo.sources() }));
  app.get<{ Params: { id: string } }>(`${v1}/sources/:id`, async (req, reply) => {
    const s = repo.source(req.params.id);
    if (!s) return notFound(reply, 'source', req.params.id);
    return s;
  });

  app.get(`${v1}/timeline`, async () => ({
    events: repo.events().map((e) => ({ ...e, missionName: repo.mission(e.missionId)?.shortName ?? e.missionId })),
  }));

  app.get<{ Querystring: { q?: string } }>(`${v1}/search`, async (req) => {
    const q = (req.query.q ?? '').toLowerCase().trim();
    if (!q) return { missions: [], landingSites: [], payloads: [], regions: [] };
    const hit = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
    return {
      missions: repo.missions().filter((m) => hit(m.name) || hit(m.shortName) || hit(m.id) || hit(m.taskOrder) || hit(repo.provider(m.providerId)?.name)).map((m) => ({ id: m.id, name: m.name, status: m.status })),
      landingSites: repo.landingSites().filter((s) => hit(s.name) || hit(s.featureName) || hit(s.id)).map((s) => ({ id: s.id, name: s.name })),
      payloads: repo.payloads().filter((p) => hit(p.name) || hit(p.acronym)).map((p) => ({ id: p.id, name: p.name, acronym: p.acronym })),
      regions: repo.regions().filter((r) => hit(r.name) || hit(r.id)).map((r) => ({ id: r.id, name: r.name })),
    };
  });
}
