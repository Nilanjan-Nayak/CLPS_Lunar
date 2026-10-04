import type { IntentType, MissionDetailLevel, PlanInput, SceneIntent } from './types.js';
import type { KnowledgeBase } from './knowledge.js';

/** JSON schema of a SceneIntent — handed to LLM providers as the `scene_intent` tool signature. */
export const INTENT_JSON_SCHEMA = {
  type: 'object',
  description: 'A structured scene requirement. Only the ScenePlanner turns it into a scene; the AI never manipulates the scene directly.',
  oneOf: [
    { properties: { type: { const: 'EXPLORE_SPACE' } }, required: ['type'] },
    { properties: { type: { const: 'EXPLORE_EARTH' } }, required: ['type'] },
    { properties: { type: { const: 'EXPLORE_MOON' } }, required: ['type'] },
    { properties: { type: { const: 'HISTORY' } }, required: ['type'], description: 'Chronological tour of all lunar landing attempts 1959 → today' },
    { properties: { type: { const: 'SHOW_REGION' }, regionId: { type: 'string' } }, required: ['type', 'regionId'] },
    { properties: { type: { const: 'SHOW_LANDING_SITE' }, landingSiteId: { type: 'string' }, journeyFromEarth: { type: 'boolean' } }, required: ['type', 'landingSiteId'] },
    { properties: { type: { const: 'SHOW_MISSION' }, missionId: { type: 'string' }, detail: { enum: ['basic', 'lander', 'payloads', 'complete'] }, journeyFromEarth: { type: 'boolean' } }, required: ['type', 'missionId', 'detail'] },
    { properties: { type: { const: 'SHOW_MISSIONS' }, missionIds: { type: 'array', items: { type: 'string' } }, regionId: { type: 'string' }, includeLanders: { type: 'boolean' } }, required: ['type'] },
    { properties: { type: { const: 'RESEARCH' }, missionId: { type: 'string' }, landingSiteId: { type: 'string' }, topic: { type: 'string' } }, required: ['type'] },
    { properties: { type: { const: 'COMPARE' }, missionIds: { type: 'array', items: { type: 'string' }, minItems: 2 } }, required: ['type', 'missionIds'] },
    { properties: { type: { const: 'SHOW_JOURNEY' }, missionId: { type: 'string' } }, required: ['type', 'missionId'], description: 'Animated Earth-launch → Moon journey of a mission: launch pad, route, timing (reconstructed from published anchors, or projected)' },
    { properties: { type: { const: 'PLAN_JOURNEY' }, plan: { type: 'object', description: 'same fields as PLAN_LANDING.plan', properties: { latitude: { type: 'number' }, longitude: { type: 'number' }, landerId: { type: 'string' }, transferId: { type: 'string' }, landingDate: { type: 'string' } }, required: ['latitude', 'longitude'] }, launchSiteId: { type: 'string', description: 'launch pad id, e.g. ksc-lc-39a, ccsfs-slc-41, ccsfs-lc-36, sdsc-shar-slp' } }, required: ['type', 'plan'], description: 'Earth→Moon route computed for a user plan by the research engine' },
    {
      properties: {
        type: { const: 'PLAN_LANDING' },
        plan: {
          type: 'object',
          description: 'User-defined landing study evaluated by the research engine (model output, never flight data)',
          properties: {
            latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 },
            landerId: { type: 'string', description: 'lander preset id, e.g. nova-c, blue-ghost, apollo-lm, vikram-class, generic-clps-100kg' },
            transferId: { type: 'string', description: 'direct | apollo | phasing | carrier-orbit | low-energy' },
            payloadKg: { type: 'number' }, surfaceDays: { type: 'number' }, orbitDays: { type: 'number' }, dataVolumeGb: { type: 'number' }, downlinkMbps: { type: 'number' },
            landingDate: { type: 'string', description: 'ISO date (YYYY-MM-DD) or UTC datetime; date-only → first sunrise window on/after that day' },
            dryMassKg: { type: 'number' }, propellantKg: { type: 'number' }, thrustN: { type: 'number' }, ispS: { type: 'number' }, minThrottle: { type: 'number' }, gridHalfKm: { type: 'number' },
          },
          required: ['latitude', 'longitude'],
        },
      },
      required: ['type', 'plan'],
    },
  ],
} as const;

export const INTENT_TYPES: IntentType[] = ['EXPLORE_SPACE', 'EXPLORE_EARTH', 'EXPLORE_MOON', 'SHOW_REGION', 'SHOW_LANDING_SITE', 'SHOW_MISSION', 'SHOW_MISSIONS', 'RESEARCH', 'COMPARE', 'PLAN_LANDING', 'HISTORY', 'SHOW_JOURNEY', 'PLAN_JOURNEY'];

const PLAN_NUMBER_KEYS: Array<keyof PlanInput> = ['latitude', 'longitude', 'dryMassKg', 'propellantKg', 'payloadKg', 'thrustN', 'ispS', 'minThrottle', 'orbitDays', 'surfaceDays', 'dataVolumeGb', 'downlinkMbps', 'year', 'gridHalfKm'];
const PLAN_STRING_KEYS: Array<keyof PlanInput> = ['landerId', 'launchVehicleId', 'transferId', 'landingDate'];

export type Validation = { ok: true; intent: SceneIntent; warnings: string[] } | { ok: false; errors: string[] };

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim() : undefined);
const bool = (x: unknown) => (typeof x === 'boolean' ? x : undefined);

/**
 * Validate an untrusted intent object (from an LLM or a client) and resolve every entity id against the catalogue.
 * Unknown ids are errors: an intent must never reference something the catalogue cannot verify.
 */
export function validateIntent(raw: unknown, kb: KnowledgeBase): Validation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['intent must be an object'] };
  const type = str(raw.type) as IntentType | undefined;
  if (!type || !INTENT_TYPES.includes(type)) return { ok: false, errors: [`unknown intent type '${String(raw.type)}'; allowed: ${INTENT_TYPES.join(', ')}`] };

  const mission = (id: unknown, field: string) => {
    const s = str(id);
    if (!s) { errors.push(`${field} is required`); return undefined; }
    const m = kb.missionById(s) ?? kb.findMission(s);
    if (!m) errors.push(`${field} '${s}' is not in the CLPS catalogue (known: ${kb.snapshot.missions.map((x) => x.id).join(', ')})`);
    else if (m.id !== s) warnings.push(`${field} '${s}' resolved to '${m.id}'`);
    return m?.id;
  };
  const site = (id: unknown, field: string, required = true) => {
    const s = str(id);
    if (!s) { if (required) errors.push(`${field} is required`); return undefined; }
    const x = kb.siteById(s) ?? kb.findSite(s);
    if (!x) errors.push(`${field} '${s}' is not a catalogued landing site`);
    return x?.id;
  };
  const region = (id: unknown, field: string, required = true) => {
    const s = str(id);
    if (!s) { if (required) errors.push(`${field} is required`); return undefined; }
    const x = kb.regionById(s) ?? kb.findRegion(s);
    if (!x) errors.push(`${field} '${s}' is not a catalogued region`);
    return x?.id;
  };

  let intent: SceneIntent | undefined;
  switch (type) {
    case 'EXPLORE_SPACE': case 'EXPLORE_EARTH': case 'EXPLORE_MOON': case 'HISTORY':
      intent = { type }; break;
    case 'SHOW_REGION': { const r = region(raw.regionId, 'regionId'); if (r) intent = { type, regionId: r }; break; }
    case 'SHOW_LANDING_SITE': { const s = site(raw.landingSiteId, 'landingSiteId'); if (s) intent = { type, landingSiteId: s, ...(bool(raw.journeyFromEarth) !== undefined ? { journeyFromEarth: bool(raw.journeyFromEarth) } : {}) }; break; }
    case 'SHOW_MISSION': {
      const m = mission(raw.missionId, 'missionId');
      const detail = str(raw.detail) ?? 'basic';
      if (!['basic', 'lander', 'payloads', 'complete'].includes(detail)) errors.push(`detail '${detail}' must be basic | lander | payloads | complete`);
      if (m && !errors.length) intent = { type, missionId: m, detail: detail as MissionDetailLevel, ...(bool(raw.journeyFromEarth) !== undefined ? { journeyFromEarth: bool(raw.journeyFromEarth) } : {}) };
      break;
    }
    case 'SHOW_MISSIONS': {
      const ids = Array.isArray(raw.missionIds) ? raw.missionIds.map((x, i) => mission(x, `missionIds[${i}]`)).filter(Boolean) as string[] : undefined;
      const r = region(raw.regionId, 'regionId', false);
      if (!errors.length) intent = { type, ...(ids?.length ? { missionIds: ids } : {}), ...(r ? { regionId: r } : {}), ...(bool(raw.includeLanders) !== undefined ? { includeLanders: bool(raw.includeLanders) } : {}) };
      break;
    }
    case 'RESEARCH': {
      const m = raw.missionId !== undefined ? mission(raw.missionId, 'missionId') : undefined;
      const s = raw.landingSiteId !== undefined ? site(raw.landingSiteId, 'landingSiteId') : undefined;
      if (!m && !s) errors.push('RESEARCH needs missionId or landingSiteId');
      if (!errors.length) intent = { type, ...(m ? { missionId: m } : {}), ...(s ? { landingSiteId: s } : {}), ...(str(raw.topic) ? { topic: str(raw.topic) } : {}) };
      break;
    }
    case 'COMPARE': {
      const ids = Array.isArray(raw.missionIds) ? (raw.missionIds.map((x, i) => mission(x, `missionIds[${i}]`)).filter(Boolean) as string[]) : [];
      if (ids.length < 2) errors.push('COMPARE needs at least two catalogued missionIds');
      if (!errors.length) intent = { type, missionIds: [...new Set(ids)] };
      break;
    }
    case 'SHOW_JOURNEY': { const m = mission(raw.missionId, 'missionId'); if (m) intent = { type, missionId: m }; break; }
    case 'PLAN_JOURNEY':
    case 'PLAN_LANDING': {
      const p = isObj(raw.plan) ? raw.plan : undefined;
      if (!p) { errors.push('plan is required'); break; }
      const plan: PlanInput = { latitude: NaN, longitude: NaN };
      for (const k of PLAN_NUMBER_KEYS) { const v = p[k]; if (v === undefined || v === null || v === '') continue; const n = typeof v === 'number' ? v : Number(v); if (!Number.isFinite(n)) errors.push(`plan.${k} must be a number`); else (plan as unknown as Record<string, unknown>)[k] = n; }
      for (const k of PLAN_STRING_KEYS) { const v = str(p[k]); if (v) (plan as unknown as Record<string, unknown>)[k] = v; }
      if (!Number.isFinite(plan.latitude) || Math.abs(plan.latitude) > 90) errors.push('plan.latitude must be within ±90');
      if (!Number.isFinite(plan.longitude) || Math.abs(plan.longitude) > 180) errors.push('plan.longitude must be within ±180');
      if (plan.landerId && kb.landerPresets.length && !kb.landerPresets.some((l) => l.id === plan.landerId)) {
        const alt = kb.findLanderPreset(plan.landerId);
        if (alt) { warnings.push(`landerId '${plan.landerId}' resolved to '${alt}'`); plan.landerId = alt; }
        else errors.push(`plan.landerId '${plan.landerId}' is not a preset (${kb.landerPresets.map((l) => l.id).join(', ')})`);
      }
      if (plan.transferId && kb.transferPresets.length && !kb.transferPresets.some((t) => t.id === plan.transferId)) errors.push(`plan.transferId '${plan.transferId}' is not a transfer preset (${kb.transferPresets.map((t) => t.id).join(', ')})`);
      if (plan.landingDate && !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?Z?)?$/.test(plan.landingDate)) errors.push('plan.landingDate must be YYYY-MM-DD or an ISO UTC datetime');
      if (!errors.length) intent = type === 'PLAN_JOURNEY' ? { type, plan, ...(str(raw.launchSiteId) ? { launchSiteId: str(raw.launchSiteId) } : {}) } : { type, plan };
      break;
    }
  }
  if (errors.length || !intent) return { ok: false, errors: errors.length ? errors : ['invalid intent'] };
  return { ok: true, intent, warnings };
}
