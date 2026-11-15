import type { CameraState } from '@/constants/cameraStates';
import type { HistoricMission, Journey, LandingSite, MissionDetail, MissionSummary, PlanResult } from '@/types/domain';
import { SpacecraftResolver } from '@/lunar-world/spacecraft/SpacecraftResolver';
import { wrapLon } from '@/utils/geo';
import { defaultLayers, type PlannerData, type SceneConfig, type SceneIntent, type SceneLighting, type SceneObject, type SceneTime } from './SceneConfig';

/** Source records backing the terrain layers (LOLA-derived DEM + LROC WAC imagery). */
const TERRAIN_SOURCES = ['src-svs-4720', 'src-lola-pds', 'src-nasa-trek-wac'];

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}-${Date.now().toString(36)}`;

/**
 * Visualization lighting: the Sun direction is a presentation setting (never an ephemeris). The planner picks a
 * sub-solar point that keeps the subject lit with useful relief shading; users can switch to manual lighting.
 */
export function lightingFor(config: SceneConfig): SceneLighting {
  if (config.mode === 'SOLAR_SYSTEM') {
    return { subsolarLongitudeDeg: 90, subsolarLatitudeDeg: 1.5, reason: 'Sun placed to light Earth and the Moon from the navigation viewpoint (not ephemeris).' };
  }
  if (!config.focus) {
    return { subsolarLongitudeDeg: 25, subsolarLatitudeDeg: 1.5, reason: 'Near-side illumination for the Moon overview (not ephemeris).' };
  }
  const polar = Math.abs(config.focus.latitude) > 60;
  // Polar sites: the real Sun never exceeds a few degrees of elevation; for legibility the visualization Sun is
  // raised to ~20° (declared in the HUD). Elsewhere a ~35° longitude offset gives morning relief shading.
  const lon = wrapLon(config.focus.longitude + (polar ? 45 : 35));
  const lat = polar ? Math.sign(config.focus.latitude) * 15 : 1.5;
  return {
    subsolarLongitudeDeg: Math.round(lon * 10) / 10,
    subsolarLatitudeDeg: lat,
    reason: polar
      ? `Visualization Sun raised to ~20° elevation for the polar site ${config.focus.label}; the real Sun never exceeds ~2° here (switch to manual lighting to explore that).`
      : `Morning-light side illumination chosen for ${config.focus.label} to show relief (not the mission-date Sun).`,
  };
}

/**
 * World clock policy: a scene about a dated landing is shown at that landing's UTC (real Sun, real Earth phase, real sky);
 * a plan scene at the planned landing UTC; everything else runs live. Missions without a landing date stay live.
 */
export function timeFor(config: SceneConfig, data: PlannerData): SceneTime {
  if (config.intent.type === 'SHOW_MISSION') {
    const id = config.intent.missionId;
    const m = data.missionDetail?.mission.id === id ? data.missionDetail.mission : data.missions.find((x) => x.id === id);
    const date = m?.landing?.date ?? null;
    const landing = date ? Date.parse(date) : NaN;
    if (m && date && !isNaN(landing) && date.length >= 10) {
      return { mode: 'fixed', epochMs: landing, rate: 0, reason: `${m.shortName || m.name} landing ${date}` };
    }
    if (m) return { mode: 'live', reason: `${m.shortName || m.name}: no landing date yet (${m.launch?.nominal ?? m.status}) → live time` };
  }
  if (config.intent.type === 'PLAN_LANDING') {
    const plan = config.objects.find((o) => o.kind === 'simulation')?.data?.plan as PlanResult | undefined;
    const utc = plan?.ephemeris?.calendar.landingUtc;
    const landing = utc ? Date.parse(utc) : NaN;
    if (utc && !isNaN(landing)) return { mode: 'fixed', epochMs: landing, rate: 0, reason: `planned landing ${utc} (research-engine model)` };
  }
  return { mode: 'live', reason: 'live UTC' };
}

/**
 * ScenePlanner — converts a structured requirement (intent) + verified backend data into a SceneConfig.
 * It never invents objects: a lander without a NASA asset becomes an information marker; a mission
 * without trajectory data gets no path; a site without coordinates gets no marker at all.
 */
export class ScenePlanner {
  constructor(private resolver: SpacecraftResolver) {}

  plan(intent: SceneIntent, data: PlannerData): SceneConfig {
    const config = this.planInner(intent, data);
    config.lighting ??= lightingFor(config);
    config.time ??= timeFor(config, data);
    return config;
  }

  private planInner(intent: SceneIntent, data: PlannerData): SceneConfig {
    switch (intent.type) {
      case 'EXPLORE_SPACE':
        return this.space(intent, 'SPACE');
      case 'EXPLORE_EARTH':
        return this.space(intent, 'EARTH');
      case 'EXPLORE_MOON':
        return this.moonOverview(intent, data);
      case 'SHOW_REGION':
        return this.region(intent, data);
      case 'SHOW_LANDING_SITE':
        return this.landingSite(intent, data);
      case 'SHOW_MISSION':
        return this.mission(intent, data);
      case 'SHOW_MISSIONS':
        return this.missions(intent, data);
      case 'RESEARCH':
        return this.research(intent, data);
      case 'COMPARE':
        return this.compare(intent, data);
      case 'PLAN_LANDING':
        return this.planLanding(intent, data);
      case 'HISTORY':
        return this.history(intent, data);
      case 'SHOW_JOURNEY':
      case 'PLAN_JOURNEY':
        return this.journey(intent, data);
    }
  }

  /**
   * Earth-launch → Moon journey. Everything drawn comes from the research engine's event-anchored route (published
   * launch pad, launch/TLI/LOI/DOI/PDI/landing times; two-body arcs in between) — fidelity is declared in the title,
   * the panel and the notes. Without a flight profile nothing is drawn (no invented trajectories).
   */
  private journey(intent: Extract<SceneIntent, { type: 'SHOW_JOURNEY' | 'PLAN_JOURNEY' }>, data: PlannerData): SceneConfig {
    const j: Journey | null = data.journey ?? null;
    const layers = defaultLayers();
    layers.navigationPath = false; // the schematic Earth→Moon line is replaced by the real route
    layers.trajectories = true;
    layers.landingSites = true;
    layers.terrain = true;
    const missionName = intent.type === 'SHOW_JOURNEY'
      ? (data.missionDetail?.mission.id === intent.missionId ? data.missionDetail.mission.name : data.missions.find((m) => m.id === intent.missionId)?.name ?? intent.missionId)
      : `Landing plan ${intent.plan.latitude.toFixed(2)}°, ${intent.plan.longitude.toFixed(2)}°`;
    const site = j?.landingSite && j.landingSite.latitude != null && j.landingSite.longitude != null ? j.landingSite : null;
    const focus = site ? { latitude: site.latitude!, longitude: site.longitude!, label: site.name, landingSiteId: site.id, missionId: intent.type === 'SHOW_JOURNEY' ? intent.missionId : undefined } : null;
    const objects: SceneObject[] = [];
    const notes: string[] = [];
    if (j) {
      objects.push({ id: `journey:${j.missionId}`, kind: 'journey', label: `${missionName} — journey`, missionId: intent.type === 'SHOW_JOURNEY' ? intent.missionId : undefined, resolution: 'info-marker', status: j.fidelity, note: j.notes[0], data: { journey: j } });
      if (site && intent.type === 'SHOW_JOURNEY' && site.id) {
        objects.push({ id: `site:${site.id}`, kind: 'landing-site', label: site.name, landingSiteId: site.id, missionId: intent.missionId, placement: { latitude: site.latitude!, longitude: site.longitude! }, resolution: 'info-marker', precision: 'measured', data: { missions: [missionName] } });
      } else if (site) {
        objects.push({ id: 'plan:site', kind: 'plan-site', label: 'Planned landing site (user input)', placement: { latitude: site.latitude!, longitude: site.longitude! }, resolution: 'info-marker', precision: 'measured', status: 'planned' });
      }
      const fid = j.fidelity === 'reconstructed'
        ? 'RECONSTRUCTED route: the launch pad, launch/TLI/LOI/DOI/PDI/landing times and the landing site are published; the arcs between those anchors are a two-body orbital-mechanics model — not flight telemetry.'
        : j.fidelity === 'projected'
          ? 'PROJECTED route: the mission has not flown; the provider\'s previous flight profile is applied to an illustrative date in the announced window. Dates, pad and route will change when the launch is scheduled.'
          : 'PLANNED route: computed for your plan by the research engine from precedent CLPS profiles (transfer type, lander preset, phase durations) and the real Moon position on your dates — a model of what such a mission would fly, not a real flight.';
      notes.push(fid, ...j.notes.filter((n) => !/^Route (reconstructed|computed)|^Projected route/.test(n)));
      notes.push('Playback compresses days into seconds per phase; the world clock shows the real UTC of the journey (launch + T+), so the Earth\'s rotation, the Moon\'s position and the Sun follow the flight.');
      notes.push('Frame: the scene is Moon-fixed, so the trans-lunar arc is drawn as its track in that frame (≈ the Earth–Moon rotating frame — a static Earth→Moon curve the spacecraft rides along); Earth-centred orbits are drawn around the Earth\'s current position and turn slowly as the Moon moves. Speeds shown are geocentric-inertial.');
    } else {
      notes.push(data.journeyUnavailable ?? 'No route is available for this mission — the catalogue has no published launch/arrival anchors for it (routes are never invented).');
    }
    const cameraPath: CameraState[] = j ? ['SPACE'] : ['SPACE'];
    const provenance = j ? j.sources.map((x) => (typeof x === 'string' ? x : x.id)) : [];
    return {
      id: nextId('scene'),
      mode: 'SOLAR_SYSTEM',
      intent,
      title: j ? `${missionName} — journey to the Moon` : `${missionName} — journey`,
      subtitle: j
        ? `${j.launchSite.name} → ${site ? site.name : 'lunar orbit'} · ${j.totalDays} days · ${j.vehicle ?? ''} · ${j.fidelity.toUpperCase()}`
        : 'no route available',
      layers,
      focus,
      terrain: { lod: focus ? 1 : 0, radiusKm: focus ? 400 : 0 },
      objects,
      camera: { state: 'SPACE', path: cameraPath },
      time: j ? { mode: 'fixed', epochMs: Date.parse(j.launchUtc), rate: 0, reason: `${missionName} launch ${j.launchUtc}` } : undefined,
      panels: ['journey', ...(intent.type === 'SHOW_JOURNEY' ? (['mission'] as const) : []), 'sources', 'scene'],
      notes,
      provenance: { sourceIds: [...provenance, 'src-research-engine'] },
      createdAt: Date.now(),
    };
  }

  // ---------------------------------------------------------------------------------------------
  private space(intent: SceneIntent, state: 'SPACE' | 'EARTH'): SceneConfig {
    const layers = defaultLayers();
    layers.navigationPath = true;
    layers.landingSites = false;
    return {
      id: nextId('scene'),
      mode: 'SOLAR_SYSTEM',
      intent,
      title: state === 'SPACE' ? 'Earth–Moon system' : 'Earth',
      subtitle: 'Solar-System context layer · NASA SVS star sky · Blue/Black Marble Earth · SVS/LRO Moon · positions, rotation and lighting from the world clock (ephemeris)',
      layers,
      focus: null,
      terrain: { lod: 0, radiusKm: 0 },
      objects: [],
      camera: { state, path: [state] },
      panels: state === 'SPACE' ? ['journey', 'scene'] : ['scene'],
      notes: [
        'Earth position/distance, its rotation (Earth Rotation Angle), the Sun direction and the star sky follow the world clock: Meeus Sun/Moon + IAU 1976 precession + IAU 2009 Moon orientation (≤0.05°; checked against JPL Horizons). Precision context, not an operational ephemeris.',
        'The faint ring is the Moon\'s orbit (schematic). Earth→Moon routes are drawn only per mission — pick a journey to see where it launched, how it flew and how long it took.',
      ],
      provenance: { sourceIds: ['src-nasa-earth-glb', 'src-svs-14959'] },
      createdAt: Date.now(),
    };
  }

  /** Historical landing attempts → info markers (coloured by outcome; dashed ring = approximate crash-site coordinates). */
  private historicObjects(history: HistoricMission[] | null | undefined, ids?: Set<string>): SceneObject[] {
    return (history ?? [])
      .filter((m) => m.site && (!ids || ids.has(m.id)))
      .map((m) => ({
        id: `hist:${m.id}`,
        kind: 'historic-landing' as const,
        label: m.name,
        placement: { latitude: m.site!.latitude, longitude: m.site!.longitude },
        resolution: 'info-marker' as const,
        precision: m.site!.precision === 'approx' ? ('approx' as const) : ('measured' as const),
        status: m.outcome,
        note: m.summary,
        data: { year: m.eventDate.slice(0, 4), agency: m.agency, missionType: m.missionType, outcome: m.outcome, eventDate: m.eventDate, hist: m },
      }));
  }

  private history(intent: Extract<SceneIntent, { type: 'HISTORY' }>, data: PlannerData): SceneConfig {
    const layers = defaultLayers();
    layers.landingSites = true;
    layers.terrain = true;
    const objs = this.historicObjects(data.history);
    const noSite = (data.history ?? []).filter((m) => !m.site).map((m) => m.name);
    return {
      id: nextId('scene'),
      mode: 'MOON_OVERVIEW',
      intent,
      title: 'Lunar landing history 1959 → today',
      subtitle: `${objs.length} impact / landing attempts from the NSSDCA catalogue · play the timeline`,
      layers,
      focus: { latitude: 5, longitude: 10, label: 'Near side' },
      terrain: { lod: 0, radiusKm: 0 },
      objects: objs,
      camera: { state: 'MOON_APPROACH', path: ['MOON_APPROACH'] },
      panels: ['history', 'scene'],
      notes: [
        'Marker colour = outcome (green nominal, amber partial, red failure); dashed ring = approximate crash-site coordinates.',
        ...(noSite.length ? [`Not placed (never reached the surface): ${noSite.join(', ')}.`] : []),
      ],
      provenance: { sourceIds: ['src-nssdca-nmc', 'src-nssdca-timeline', 'src-lroc-sites', 'src-wiki-artificial-objects'] },
      createdAt: Date.now(),
    };
  }

  private planLanding(intent: Extract<SceneIntent, { type: 'PLAN_LANDING' }>, data: PlannerData): SceneConfig {
    const plan = data.plan;
    const { latitude, longitude } = intent.plan;
    const layers = defaultLayers();
    layers.terrain = true;
    layers.landingSites = true;
    layers.trajectories = true;
    layers.navigationPath = false;
    const neighbours = new Set(plan?.outcomeModel.neighbours.map((n) => n.id) ?? []);
    const elevKm = plan ? plan.site.terrain.elevationM / 1000 : null;
    const histObjs = this.historicObjects(data.history, neighbours).filter((h) => {
      const p = h.placement;
      if (!p || p.latitude == null || p.longitude == null) return true;
      return Math.hypot(p.latitude - latitude, p.longitude - longitude) > 0.25;
    });
    const objects: SceneObject[] = [
      { id: 'plan:site', kind: 'plan-site', label: 'Planned landing site (user input)', placement: { latitude, longitude, elevationKm: elevKm }, resolution: 'info-marker', precision: 'measured', status: 'planned', data: { terrain: plan?.site.terrain } },
      ...histObjs,
    ];
    if (plan) {
      objects.push({ id: 'plan:grid', kind: 'analysis-grid', label: 'Site suitability grid (heuristic)', resolution: 'info-only', data: { grid: plan.analysisGrid } });
      objects.push({ id: 'plan:sim', kind: 'simulation', label: `Simulated mission — ${plan.input.lander.name}`, placement: { latitude, longitude, elevationKm: elevKm }, resolution: 'info-marker', note: plan.provenance.note, data: { plan } });
    }
    return {
      id: nextId('scene'),
      mode: 'MISSION',
      intent,
      title: plan ? `Landing plan — ${plan.summaryCard.landingSite}` : 'Landing plan',
      subtitle: plan ? `${plan.input.lander.name} · ${plan.input.transfer.name} · ${plan.summaryCard.totalMissionTime} · SIMULATION` : 'computing…',
      layers,
      focus: { latitude, longitude, label: 'Planned landing site' },
      terrain: { lod: 1, radiusKm: 400 },
      objects,
      camera: { state: 'LOCATION_FOCUS', path: ['MOON_ORBIT', 'LUNAR_SURFACE', 'LOCATION_FOCUS'] },
      lighting: plan?.ephemeris
        ? { subsolarLongitudeDeg: plan.ephemeris.atLanding.subSolarLon, subsolarLatitudeDeg: plan.ephemeris.atLanding.subSolarLat, reason: `Sun from the ephemeris model at the planned landing time ${plan.ephemeris.calendar.landingUtc} (±0.05°); follows mission time during playback.` }
        : undefined,
      panels: ['simulation', 'scene', 'sources'],
      notes: [
        'Everything animated here is a physics/statistics MODEL of the user\'s plan (research engine) — not NASA flight data.',
        'Transfer, launch and orbit geometry are schematic; the powered-descent profile is integrated from the lander parameters.',
        ...(plan?.flags ?? []),
      ],
      provenance: { sourceIds: plan?.provenance.sourceIds ?? ['src-research-engine'] },
      createdAt: Date.now(),
    };
  }

  private siteObjects(sites: LandingSite[], missions: MissionSummary[]): SceneObject[] {
    return sites
      .filter((s) => s.latitude != null && s.longitude != null)
      .map((s) => ({
        id: `site:${s.id}`,
        kind: 'landing-site' as const,
        label: s.name,
        landingSiteId: s.id,
        missionId: s.missionIds[0],
        placement: { latitude: s.latitude!, longitude: s.longitude!, elevationKm: s.elevationM != null ? s.elevationM / 1000 : null },
        resolution: 'info-marker' as const,
        precision: s.precision,
        status: s.status,
        data: { missions: s.missionIds.map((id) => missions.find((m) => m.id === id)?.shortName ?? id) },
      }));
  }

  private moonOverview(intent: SceneIntent, data: PlannerData): SceneConfig {
    const layers = defaultLayers();
    layers.landingSites = true;
    layers.regions = true;
    layers.terrain = true;
    const missing = data.landingSites.filter((s) => s.latitude == null);
    return {
      id: nextId('scene'),
      mode: 'MOON_OVERVIEW',
      intent,
      title: 'Moon — CLPS landing sites',
      subtitle: 'Scientific globe: LROC color + LOLA-derived elevation (NASA CGI Moon Kit)',
      layers,
      focus: { latitude: -30, longitude: 20, label: 'Near side / south' },
      terrain: { lod: 0, radiusKm: 0 },
      objects: this.siteObjects(data.landingSites, data.missions),
      camera: { state: 'MOON_ORBIT', path: ['MOON_ORBIT'] },
      panels: ['scene'],
      notes: missing.length ? [`${missing.length} site(s) have no published coordinates and are listed, not placed: ${missing.map((s) => s.name).join('; ')}.`] : [],
      provenance: { sourceIds: ['src-svs-4720', 'src-lola-pds'] },
      createdAt: Date.now(),
    };
  }

  private region(intent: Extract<SceneIntent, { type: 'SHOW_REGION' }>, data: PlannerData): SceneConfig {
    const region = data.regions.find((r) => r.id === intent.regionId);
    const sites = data.landingSites.filter((s) => s.regionId === intent.regionId);
    const layers = defaultLayers();
    layers.landingSites = true;
    layers.regions = true;
    layers.terrain = true;
    const focus = region ? { latitude: region.center.latitude, longitude: region.center.longitude, label: region.name } : null;
    return {
      id: nextId('scene'),
      mode: 'MOON_OVERVIEW',
      intent,
      title: region?.name ?? intent.regionId,
      subtitle: region?.description,
      layers,
      focus,
      terrain: { lod: 1, radiusKm: 1200 },
      objects: [
        ...(region ? [{ id: `region:${region.id}`, kind: 'region' as const, label: region.name, regionId: region.id, resolution: 'info-marker' as const, data: { bounds: region.bounds } }] : []),
        ...this.siteObjects(sites, data.missions),
      ],
      camera: { state: 'LUNAR_SURFACE', path: ['MOON_ORBIT', 'LUNAR_SURFACE'] },
      panels: ['region', 'scene'],
      notes: [],
      provenance: { sourceIds: region?.sourceIds ?? [] },
      createdAt: Date.now(),
    };
  }

  private landingSite(intent: Extract<SceneIntent, { type: 'SHOW_LANDING_SITE' }>, data: PlannerData): SceneConfig {
    const site = data.landingSites.find((s) => s.id === intent.landingSiteId);
    const layers = defaultLayers();
    layers.landingSites = true;
    layers.terrain = true;
    layers.overlays.terrain = false;
    const notes: string[] = [];
    if (!site || site.latitude == null || site.longitude == null) {
      notes.push('This site has no published coordinates — nothing is placed on the globe.');
      return {
        id: nextId('scene'), mode: 'LANDING_SITE', intent, title: site?.name ?? intent.landingSiteId, layers, focus: null,
        terrain: { lod: 0, radiusKm: 0 }, objects: [], camera: { state: 'MOON_ORBIT', path: ['MOON_ORBIT'] }, panels: ['site', 'sources', 'scene'], notes,
        provenance: { sourceIds: site?.sourceIds ?? [] }, createdAt: Date.now(),
      };
    }
    if (site.precision !== 'measured') notes.push(`Coordinates are ${site.precision}-level (${site.precisionNote}).`);
    const path: CameraState[] = intent.journeyFromEarth
      ? ['EARTH', 'EARTH_ORBIT', 'MOON_APPROACH', 'MOON_ORBIT', 'LUNAR_SURFACE', 'LOCATION_FOCUS']
      : ['MOON_ORBIT', 'LUNAR_SURFACE', 'LOCATION_FOCUS'];
    return {
      id: nextId('scene'),
      mode: 'LANDING_SITE',
      intent,
      title: site.name,
      subtitle: site.featureName,
      layers,
      focus: { latitude: site.latitude, longitude: site.longitude, label: site.name, landingSiteId: site.id },
      terrain: { lod: 1, radiusKm: 600 },
      objects: this.siteObjects([site], data.missions),
      camera: { state: 'LOCATION_FOCUS', path },
      panels: ['site', 'sources', 'scene'],
      notes,
      provenance: { sourceIds: [...site.sourceIds, ...TERRAIN_SOURCES] },
      createdAt: Date.now(),
    };
  }

  private missionObjects(detail: MissionDetail, level: 'basic' | 'lander' | 'payloads' | 'complete', notes: string[]): SceneObject[] {
    const objects: SceneObject[] = [];
    const site = detail.landingSite;
    const placed = site && site.latitude != null && site.longitude != null;
    if (!placed) {
      notes.push('Landing site has no published coordinates — no marker or lander is placed.');
      return objects;
    }
    const elevationKm = detail.terrainContext ? detail.terrainContext.elevationM / 1000 : site!.elevationM != null ? site!.elevationM / 1000 : null;
    objects.push({
      id: `site:${site!.id}`,
      kind: 'landing-site',
      label: site!.name,
      landingSiteId: site!.id,
      missionId: detail.mission.id,
      placement: { latitude: site!.latitude!, longitude: site!.longitude!, elevationKm },
      resolution: 'info-marker',
      precision: site!.precision,
      status: site!.status,
    });
    if (level === 'basic') return objects;

    for (const sc of detail.spacecraft) {
      const resolved = this.resolver.resolve(sc);
      if (sc.role === 'lander' || sc.role === 'rover' || sc.role === 'hopper') {
        objects.push({
          id: `sc:${detail.mission.id}:${sc.id}`,
          kind: sc.role === 'rover' ? 'rover' : 'lander',
          label: `${sc.name}${sc.role === 'lander' ? '' : ` (${sc.role})`}`,
          missionId: detail.mission.id,
          spacecraftId: sc.id,
          placement: { latitude: site!.latitude!, longitude: site!.longitude!, elevationKm, headingDeg: 0 },
          assetId: resolved.assetId,
          resolution: resolved.assetId ? 'nasa-asset' : 'info-marker',
          displayScale: resolved.displayScale,
          precision: site!.precision,
          status: detail.mission.status,
          note: resolved.reason,
        });
        if (!resolved.assetId) notes.push(`${sc.name}: ${resolved.reason}`);
      } else if (sc.role === 'orbiter' || sc.role === 'imaging-orbiter') {
        const alt = sc.orbit ? (sc.orbit.altitudeKm[0] + sc.orbit.altitudeKm[1]) / 2 : 100;
        objects.push({
          id: `sc:${detail.mission.id}:${sc.id}`,
          kind: 'orbiter',
          label: sc.name,
          missionId: detail.mission.id,
          spacecraftId: sc.id,
          placement: { latitude: site!.latitude!, longitude: site!.longitude!, altitudeKm: alt },
          assetId: resolved.assetId,
          resolution: resolved.assetId ? 'nasa-asset' : 'info-only',
          displayScale: resolved.displayScale,
          note: sc.roleNote ?? sc.orbit?.note,
        });
        notes.push(`${sc.name} is shown on a schematic ${sc.orbit?.type ?? ''} orbit at ~${alt} km (×${resolved.displayScale ?? 1} display scale) — ${sc.roleNote ?? 'context object'}.`);
      }
    }
    if (level === 'lander') return objects;

    for (const p of detail.payloads) {
      objects.push({
        id: `payload:${detail.mission.id}:${p.id}`,
        kind: 'payload',
        label: p.acronym || p.name,
        missionId: detail.mission.id,
        resolution: p.has3DModel ? 'nasa-asset' : 'info-only',
        note: p.has3DModel ? undefined : 'No 3D model — shown as scientific information.',
        data: { name: p.name, type: p.type, leadOrganization: p.leadOrganization, summary: p.summary },
      });
    }
    if (level === 'payloads') return objects;

    if (detail.mission.trajectory) {
      objects.push({ id: `traj:${detail.mission.id}`, kind: 'trajectory', label: 'Trajectory', missionId: detail.mission.id, resolution: 'nasa-asset', data: detail.mission.trajectory as unknown as Record<string, unknown> });
    } else {
      notes.push(`Trajectory: ${detail.mission.trajectoryNote}`);
    }
    return objects;
  }

  private mission(intent: Extract<SceneIntent, { type: 'SHOW_MISSION' }>, data: PlannerData): SceneConfig {
    const detail = data.missionDetail && data.missionDetail.mission.id === intent.missionId ? data.missionDetail : null;
    const notes: string[] = [];
    const layers = defaultLayers();
    layers.landingSites = true;
    layers.terrain = true;
    layers.spacecraft = intent.detail !== 'basic';
    layers.payloads = intent.detail === 'payloads' || intent.detail === 'complete';
    layers.overlays.mission = true;
    layers.overlays.payload = layers.payloads;
    layers.overlays.science = intent.detail === 'complete';
    layers.overlays.terrain = false; // hypsometric tint is opt-in (Scene config) so the LROC imagery stays readable
    layers.overlays.coordinateGrid = intent.detail === 'complete';
    layers.trajectories = intent.detail === 'complete' && !!detail?.mission.trajectory;

    if (!detail) {
      return {
        id: nextId('scene'), mode: 'MISSION', intent, title: intent.missionId, layers, focus: null, terrain: { lod: 0, radiusKm: 0 }, objects: [],
        camera: { state: 'MOON_ORBIT', path: ['MOON_ORBIT'] }, panels: ['mission', 'scene'], notes: ['Loading mission data…'], provenance: { sourceIds: [] }, createdAt: Date.now(),
      };
    }
    const objects = this.missionObjects(detail, intent.detail, notes);
    const site = detail.landingSite;
    const placed = site && site.latitude != null && site.longitude != null;
    const focus = placed ? { latitude: site!.latitude!, longitude: site!.longitude!, label: site!.name, landingSiteId: site!.id, missionId: detail.mission.id } : null;
    const target: CameraState = intent.detail === 'basic' ? 'LOCATION_FOCUS' : 'MISSION_FOCUS';
    const path: CameraState[] = !placed
      ? ['MOON_ORBIT']
      : intent.journeyFromEarth
        ? ['EARTH', 'EARTH_ORBIT', 'MOON_APPROACH', 'MOON_ORBIT', 'LUNAR_SURFACE', 'LOCATION_FOCUS', ...(target === 'MISSION_FOCUS' ? (['MISSION_FOCUS'] as CameraState[]) : [])]
        : ['MOON_ORBIT', 'LUNAR_SURFACE', 'LOCATION_FOCUS', ...(target === 'MISSION_FOCUS' ? (['MISSION_FOCUS'] as CameraState[]) : [])];
    if (site && site.precision !== 'measured') notes.unshift(`Site coordinates are ${site.precision}-level: ${site.precisionNote}`);
    const panels: SceneConfig['panels'] = ['mission', ...(layers.payloads ? (['payloads'] as const) : []), 'sources', 'scene'];
    return {
      id: nextId('scene'),
      mode: intent.detail === 'complete' ? 'MISSION_DETAILED' : 'MISSION',
      intent,
      title: detail.mission.name,
      subtitle: `${detail.provider?.name ?? ''} · ${detail.mission.taskOrder} · ${detail.mission.status}`,
      layers,
      focus,
      terrain: { lod: 1, radiusKm: intent.detail === 'basic' ? 600 : 400 },
      objects,
      camera: { state: placed ? target : 'MOON_ORBIT', path },
      panels,
      notes,
      provenance: { sourceIds: [...detail.sources.map((s) => s.id), ...TERRAIN_SOURCES] },
      createdAt: Date.now(),
    };
  }

  private missions(intent: Extract<SceneIntent, { type: 'SHOW_MISSIONS' }>, data: PlannerData): SceneConfig {
    let missions = data.missions;
    if (intent.missionIds) missions = missions.filter((m) => intent.missionIds!.includes(m.id));
    if (intent.regionId) missions = missions.filter((m) => m.landingSite?.regionId === intent.regionId);
    const siteIds = new Set(missions.map((m) => m.landingSiteId));
    const sites = data.landingSites.filter((s) => siteIds.has(s.id));
    const region = intent.regionId ? data.regions.find((r) => r.id === intent.regionId) : undefined;
    const layers = defaultLayers();
    layers.landingSites = true;
    layers.terrain = true;
    layers.spacecraft = !!intent.includeLanders;
    layers.regions = !!region;
    const notes: string[] = [];
    const objects = this.siteObjects(sites, data.missions);
    if (intent.includeLanders) {
      for (const m of missions) {
        const site = sites.find((s) => s.id === m.landingSiteId);
        if (!site || site.latitude == null) continue;
        const sc = data.spacecraft.find((s) => s.id === m.landerId);
        if (!sc) continue;
        const resolved = this.resolver.resolve(sc);
        objects.push({
          id: `sc:${m.id}:${sc.id}`, kind: 'lander', label: `${sc.name} (${m.shortName})`, missionId: m.id, spacecraftId: sc.id,
          placement: { latitude: site.latitude!, longitude: site.longitude!, elevationKm: site.elevationM != null ? site.elevationM / 1000 : null },
          assetId: resolved.assetId, resolution: resolved.assetId ? 'nasa-asset' : 'info-marker', precision: site.precision, status: m.status, note: resolved.reason,
        });
      }
      notes.push('CLPS commercial landers have no official NASA 3D models; they are shown as labeled information markers.');
    }
    const placedSites = sites.filter((s) => s.latitude != null);
    const focus = region
      ? { latitude: region.center.latitude, longitude: region.center.longitude, label: region.name }
      : placedSites.length
        ? { latitude: placedSites.reduce((a, s) => a + s.latitude!, 0) / placedSites.length, longitude: placedSites.reduce((a, s) => a + s.longitude!, 0) / placedSites.length, label: 'Missions' }
        : null;
    return {
      id: nextId('scene'), mode: 'MOON_OVERVIEW', intent,
      title: region ? `CLPS missions — ${region.name}` : `CLPS missions (${missions.length})`,
      layers, focus, terrain: { lod: region ? 1 : 0, radiusKm: region ? 1200 : 0 }, objects,
      camera: { state: region ? 'LUNAR_SURFACE' : 'MOON_ORBIT', path: region ? ['MOON_ORBIT', 'LUNAR_SURFACE'] : ['MOON_ORBIT'] },
      panels: [...(region ? (['region'] as const) : []), 'scene'], notes,
      provenance: { sourceIds: [...new Set(missions.flatMap((m) => m.sourceIds))] }, createdAt: Date.now(),
    };
  }

  private research(intent: Extract<SceneIntent, { type: 'RESEARCH' }>, data: PlannerData): SceneConfig {
    const base = intent.missionId
      ? this.mission({ type: 'SHOW_MISSION', missionId: intent.missionId, detail: 'complete' }, data)
      : intent.landingSiteId
        ? this.landingSite({ type: 'SHOW_LANDING_SITE', landingSiteId: intent.landingSiteId }, data)
        : this.moonOverview(intent, data);
    return { ...base, id: nextId('scene'), intent, mode: 'RESEARCH', title: `Research — ${base.title}`, panels: ['research', 'sources', 'scene'], layers: { ...base.layers, overlays: { ...base.layers.overlays, science: true } } };
  }

  private compare(intent: Extract<SceneIntent, { type: 'COMPARE' }>, data: PlannerData): SceneConfig {
    const base = this.missions({ type: 'SHOW_MISSIONS', missionIds: intent.missionIds, includeLanders: true }, data);
    return { ...base, id: nextId('scene'), intent, title: `Compare ${intent.missionIds.length} missions`, panels: ['compare', 'scene'] };
  }
}
