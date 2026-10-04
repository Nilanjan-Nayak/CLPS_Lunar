import type { MissionSummary, LandingSite, Region } from '@/types/domain';
import type { SceneIntent } from './SceneConfig';

/**
 * Rule-based stand-in for the AI Copilot (Phase 12). It maps free text → structured SceneIntent.
 * The AI will do exactly the same thing with tools; the ScenePlanner does not care who produced the intent.
 */
export interface ParseContext { missions: MissionSummary[]; landingSites: LandingSite[]; regions: Region[] }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function findMission(text: string, missions: MissionSummary[]) {
  const t = norm(text);
  const scored = missions
    .map((m) => {
      const keys = [m.id, m.shortName, m.name, m.landerName ?? '', m.provider ?? ''].map(norm).filter(Boolean);
      const score = keys.reduce((acc, k) => (k && t.includes(k) ? Math.max(acc, k.length) : acc), 0);
      return { m, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.m;
}

function findRegion(text: string, regions: Region[]) {
  const t = norm(text);
  return regions.find((r) => t.includes(norm(r.name)) || t.includes(norm(r.id).replace(/-/g, ' ')) || (r.id === 'south-pole' && /south pol/.test(t)) || (r.id === 'far-side' && /far side/.test(t)));
}

function findSite(text: string, sites: LandingSite[]) {
  const t = norm(text);
  return sites.find((s) => t.includes(norm(s.featureName)) || t.includes(norm(s.name)));
}

export function parseIntent(text: string, ctx: ParseContext): { intent: SceneIntent; explanation: string } | { error: string } {
  const t = norm(text);
  if (!t) return { error: 'Empty command.' };
  const journey = /(from earth|earth to|take me|fly me|journey)/.test(t);
  // animated launch → Moon route ("journey of IM-1", "how did Blue Ghost get to the Moon", "IM-2 launch and route")
  const wantsRoute = /(journey|route|flight ?path|how did|how long did|launch|lift ?off|trajectory|travel|animate|replay)/.test(t) && !/(take me|fly me)/.test(t);
  const wantsPayloads = /payload|instrument|experiment/.test(t);
  const wantsLander = /lander|spacecraft|rover/.test(t);
  const complete = /(complete|full|everything|detailed|all of it)/.test(t);
  const research = /(why|research|evidence|scientific(ally)? important|explain)/.test(t);
  const compare = /compare/.test(t);

  if (/^(explore )?(space|solar system|earth moon system)$/.test(t) || /show (me )?(the )?(space|solar system)/.test(t)) return { intent: { type: 'EXPLORE_SPACE' }, explanation: 'Solar-System context view.' };
  if (/(landing )?history|past landings|timeline of landings|all landings since/.test(t)) return { intent: { type: 'HISTORY' }, explanation: 'Lunar landing history 1959 → today (NSSDCA catalogue).' };
  const planMatch = text.toLowerCase().replace(/[°º]/g, ' ').match(/(?:plan|simulate|design)\b.*?(-?\d+(?:\.\d+)?)\s*°?\s*([ns])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([ew])?/);
  if (planMatch) {
    let lat = Number(planMatch[1]); let lon = Number(planMatch[3]);
    if (planMatch[2] === 's') lat = -Math.abs(lat);
    if (planMatch[4] === 'w') lon = -Math.abs(lon);
    const landerId = /blue ghost/.test(t) ? 'blue-ghost' : /nova|intuitive/.test(t) ? 'nova-c' : /apollo/.test(t) ? 'apollo-lm' : /vikram|chandrayaan/.test(t) ? 'vikram-class' : 'generic-clps-100kg';
    const transferId = /phasing|loops/.test(t) ? 'phasing' : /low energy|weak stability|wsb/.test(t) ? 'low-energy' : undefined;
    if (/journey|route|launch|from earth/.test(t)) {
      return { intent: { type: 'PLAN_JOURNEY', plan: { latitude: lat, longitude: lon, landerId, transferId } }, explanation: `Compute + animate the Earth→Moon route for a plan at ${lat}°, ${lon}° (${landerId} preset, research engine).` };
    }
    return { intent: { type: 'PLAN_LANDING', plan: { latitude: lat, longitude: lon, landerId, transferId } }, explanation: `Plan + simulate a landing at ${lat}°, ${lon}° with the ${landerId} preset (research engine).` };
  }
  if (/^(explore |show |go to )?(the )?earth$/.test(t)) return { intent: { type: 'EXPLORE_EARTH' }, explanation: 'Earth view.' };
  if (/^(explore |show |go to )?(the )?moon$/.test(t) || /explore (the )?moon/.test(t)) return { intent: { type: 'EXPLORE_MOON' }, explanation: 'Moon overview with all CLPS landing sites.' };

  const mission = findMission(t, ctx.missions);
  const region = findRegion(t, ctx.regions);
  const site = mission ? undefined : findSite(t, ctx.landingSites);

  if (mission && wantsRoute && !compare && !research) {
    return { intent: { type: 'SHOW_JOURNEY', missionId: mission.id }, explanation: `${mission.shortName} — launch site, route and timing, animated (reconstructed/projected from published anchors).` };
  }
  if (compare) {
    const ids = ctx.missions.filter((m) => [m.id, m.shortName, m.name].some((k) => t.includes(norm(k)))).map((m) => m.id);
    if (ids.length >= 2) return { intent: { type: 'COMPARE', missionIds: ids }, explanation: `Compare ${ids.join(', ')}.` };
    return { error: 'Name at least two missions to compare.' };
  }
  // Questions are for the Copilot (AI engine): it answers from the catalogue with citations.
  if (!research && (/^(when|where|what|which|who|how|why|is|are|was|were|did|does|do|will|can|could|tell me|list|give me|describe|explain)\b/.test(t) || text.trim().endsWith('?'))) return { error: `"${text}" looks like a question — ask the Copilot.` };
  if (research && mission) return { intent: { type: 'RESEARCH', missionId: mission.id, topic: text }, explanation: `Research view for ${mission.shortName}.` };
  if (research && site) return { intent: { type: 'RESEARCH', landingSiteId: site.id, topic: text }, explanation: `Research view for ${site.name}.` };

  if (mission) {
    if (/landing site|site/.test(t) && !wantsLander && !wantsPayloads && !complete) {
      return { intent: { type: 'SHOW_LANDING_SITE', landingSiteId: mission.landingSiteId, journeyFromEarth: journey }, explanation: `${mission.shortName} landing site${journey ? ' — journey from Earth' : ''}.` };
    }
    const detail = complete ? 'complete' : wantsPayloads ? 'payloads' : wantsLander ? 'lander' : 'basic';
    return { intent: { type: 'SHOW_MISSION', missionId: mission.id, detail, journeyFromEarth: journey }, explanation: `${mission.shortName} — ${detail} scene${journey ? ', journey from Earth' : ''}.` };
  }
  if (region && /mission/.test(t)) return { intent: { type: 'SHOW_MISSIONS', regionId: region.id, includeLanders: wantsLander }, explanation: `CLPS missions in ${region.name}${wantsLander ? ' with landers' : ''}.` };
  if (region) return { intent: { type: 'SHOW_REGION', regionId: region.id }, explanation: `Region: ${region.name}.` };
  if (site) return { intent: { type: 'SHOW_LANDING_SITE', landingSiteId: site.id, journeyFromEarth: journey }, explanation: `Landing site: ${site.name}.` };
  if (/missions?/.test(t)) return { intent: { type: 'SHOW_MISSIONS', includeLanders: wantsLander }, explanation: 'All CLPS missions.' };
  return { error: `I could not map "${text}" to a scene. Try: "show mission IM-1 with payloads", "journey of IM-2", "how did Blue Ghost get to the Moon", "take me from Earth to the Blue Ghost landing site", "south pole missions with landers", "explore moon".` };
}
