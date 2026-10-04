import type { KnowledgeBase } from './knowledge.js';
import { norm } from './knowledge.js';
import type { AiContext, AiResponse, AnswerResponse, ClarifyResponse, Fact, IntentResponse, KbHistoric, KbMission, MissionDetailLevel, PlanInput, SceneIntent } from './types.js';

/**
 * Deterministic provider: grammar-based commands → SceneIntent, template-based questions → grounded answers.
 * It is always available (no network, no keys) and is also the fallback/validator path for the LLM provider.
 */
export class RuleProvider {
  private resolved: { missionId?: string; landingSiteId?: string; regionId?: string } = {};
  constructor(private kb: KnowledgeBase) {}

  async handle(text: string, context: AiContext = {}): Promise<AiResponse> {
    const t0 = Date.now();
    const trace: AiResponse['trace'] = [];
    const raw = text.trim();
    const t = norm(raw);
    this.resolved = {};
    if (!t) return this.clarify('Say what you want to see or know.', [], trace, t0);

    // 1) commands that produce a scene intent
    const cmd = await this.command(raw, t, context, trace);
    if (cmd) return this.finish(cmd, trace, t0);

    // 2) questions answered from the catalogue
    const ans = await this.question(raw, t, context, trace);
    if (ans) return this.finish(ans, trace, t0);

    // 3) a bare entity → its fact card
    const card = await this.entityCard(raw, t, context, trace);
    if (card) return this.finish(card, trace, t0);

    return this.clarify(
      `I can only work from the CLPS catalogue and the research engine, and I could not map "${raw}" to either a scene or a catalogue question.`,
      [
        { label: 'Show IM-2 with payloads', text: 'show IM-2 with payloads' },
        { label: 'When did Blue Ghost land?', text: 'when did Blue Ghost land?' },
        { label: 'Plan 84.79 S, 29.2 E with Nova-C', text: 'plan a landing at 84.79 S, 29.2 E with Nova-C on 2026-11-17' },
        { label: 'Landing history', text: 'landing history' },
      ], trace, t0);
  }

  // ---- commands ----------------------------------------------------------------------------------------------------
  private async command(raw: string, t: string, ctx: AiContext, trace: AiResponse['trace']): Promise<Omit<IntentResponse, 'ms' | 'trace' | 'provider'> | null> {
    const kb = this.kb;
    const journey = /(from earth|earth to|take me|fly me|journey)/.test(t);
    const wantsPayloads = /payload|instrument|experiment/.test(t);
    const wantsLander = /\blanders?\b|spacecraft|rovers?\b/.test(t);
    const complete = /(complete|full|everything|detailed|all of it)/.test(t);
    const research = /(scientific(ally)? important|why (is|are) .* (important|interesting)|research view|evidence|science case)/.test(t);
    const isQuestion = /^(when|where|what|which|who|how|why|is|are|was|were|did|does|do|will|can|could|tell me|list|give me|describe|explain)\b/.test(t) || raw.trim().endsWith('?');
    const mk = (intent: SceneIntent, explanation: string, facts: Fact[] = [], sourceIds: string[] = [], confidence = 0.9): Omit<IntentResponse, 'ms' | 'trace' | 'provider'> =>
      ({ kind: 'intent', intent, explanation, facts, citations: kb.citations(sourceIds), confidence });

    // ephemeris / illumination requests are questions for the research engine, not scenes
    if (/\b(landing windows?|windows?|sunrise|sun elevation|earth elevation|illumination|ephemeris|sunlit)\b/.test(t) && !/\b(plan|simulate|design|study)\b/.test(t)) return null;
    if (/^(explore |show |go to |take me to )?(the )?(space|solar system|earth moon system)$/.test(t) || /show (me )?(the )?(space|solar system)/.test(t)) return mk({ type: 'EXPLORE_SPACE' }, 'Solar-System context view (Sun, Earth, Moon, stars).');
    if (/(landing )?history|past landings|timeline of landings|all landings since|every landing/.test(t) && !isQuestion) return mk({ type: 'HISTORY' }, 'Chronological tour of lunar landing attempts 1959 → today (NSSDCA catalogue).');
    if (/^(explore |show |go to |take me to )?(the )?earth$/.test(t)) return mk({ type: 'EXPLORE_EARTH' }, 'Earth view.');
    if (/^(explore |show |go to |take me to )?(the )?moon$/.test(t) || /explore (the )?moon/.test(t)) return mk({ type: 'EXPLORE_MOON' }, 'Moon overview with all CLPS landing sites.');

    // PLAN_LANDING — coordinates or a catalogued site, plus optional parameters
    if (/\b(plan|simulate|design|study|evaluate)\b/.test(t)) {
      const plan = this.parsePlan(raw, t);
      if (plan) {
        trace.push({ step: 'rules.plan', detail: JSON.stringify(plan) });
        const facts: Fact[] = [{ label: 'Site', value: kb.fmtLatLon(plan.latitude, plan.longitude) }];
        if (plan.landerId) facts.push({ label: 'Lander preset', value: plan.landerId });
        if (plan.landingDate) facts.push({ label: 'Landing date', value: `${plan.landingDate} → first sunrise window on/after this day` });
        if (plan.payloadKg) facts.push({ label: 'Payload', value: `${plan.payloadKg} kg` });
        if (plan.transferId) facts.push({ label: 'Transfer', value: plan.transferId });
        if (plan.surfaceDays) facts.push({ label: 'Surface ops', value: `${plan.surfaceDays} d` });
        // "plan a journey / route / launch from Earth to …" → the animated Earth→Moon route of the plan (precedent-derived)
        if (/(journey|\broute\b|from earth|launch|trajectory|flight ?path)/.test(t)) {
          const launchSiteId = /vandenberg|slc-4/.test(t) ? 'vsfb-slc-4e' : /slc-41|vulcan|atlas/.test(t) ? 'ccsfs-slc-41' : /lc-36|new glenn/.test(t) ? 'ccsfs-lc-36' : /sriharikota|shar|isro/.test(t) ? 'sdsc-shar-slp' : undefined;
          facts.push({ label: 'Route', value: 'computed from precedent CLPS flight profiles (transfer type + lander preset) for your dates (model, not a real flight)' });
          return mk({ type: 'PLAN_JOURNEY', plan, ...(launchSiteId ? { launchSiteId } : {}) }, 'Earth→Moon route for your plan — launch site, transfer, lunar orbit and descent computed by the research engine from precedent missions and animated in the live environment. Model output, never flight data.', facts, ['src-pds-lola-gdr', 'src-meeus'], 0.85);
        }
        return mk({ type: 'PLAN_LANDING', plan }, 'Landing study via the research engine — terrain (LOLA), ephemeris windows, Δv/mass budget, descent simulation. Model output, never flight data.', facts, ['src-pds-lola-gdr', 'src-meeus'], 0.85);
      }
      if (!/mission|site|region/.test(t)) return null;
    }

    const missions = kb.findMissions(raw);
    let mission: KbMission | undefined = missions[0]?.entity;
    const region = kb.findRegion(raw);
    const site = mission ? undefined : kb.findSite(raw);
    const provider = kb.findProvider(raw);
    const pronoun = /\b(it|its|this mission|that mission|this one|the mission)\b/.test(t);
    if (!mission && pronoun && ctx.missionId) { mission = kb.missionById(ctx.missionId); if (mission) trace.push({ step: 'rules.context', detail: `"it" → ${mission.id}` }); }
    this.note(mission, site, region);

    if (/\bcompare\b|\bvs\b|versus/.test(t)) {
      const ids = missions.map((h) => h.entity.id);
      if (ids.length >= 2) return mk({ type: 'COMPARE', missionIds: ids }, `Compare ${ids.map((id) => kb.missionById(id)?.shortName ?? id).join(' vs ')}.`, [], ids.flatMap((id) => kb.missionById(id)?.sourceIds ?? []));
      return null;
    }
    // "journey of IM-1", "how did Blue Ghost get to the Moon", "IM-2 launch and route" → animated launch → Moon journey
    if (mission && /(journey|\broute\b|flight ?path|how did .* (get|travel|fly|reach)|how long did .* take|launch(ed)? from|lift ?off|trajectory|replay)/.test(t) && !/(take me|fly me)/.test(t)) {
      const mf = kb.missionFacts(mission);
      return mk({ type: 'SHOW_JOURNEY', missionId: mission.id }, `${mission.shortName} — launch site, route and timing animated (reconstructed/projected from published event anchors; not telemetry).`, mf.facts, mf.sourceIds);
    }
    if (research && mission) return mk({ type: 'RESEARCH', missionId: mission.id, topic: raw }, `Research view for ${mission.shortName}.`, kb.missionFacts(mission).facts, mission.sourceIds);
    if (research && site) return mk({ type: 'RESEARCH', landingSiteId: site.id, topic: raw }, `Research view for ${site.name}.`, kb.siteFacts(site).facts, site.sourceIds);
    if (isQuestion) return null; // questions are answered, not shown (unless explicitly "show …")

    if (mission) {
      const mf = kb.missionFacts(mission);
      if (/landing site|\bsite\b/.test(t) && !wantsLander && !wantsPayloads && !complete) {
        return mk({ type: 'SHOW_LANDING_SITE', landingSiteId: mission.landingSiteId, journeyFromEarth: journey }, `${mission.shortName} landing site${journey ? ' — journey from Earth' : ''}.`, mf.facts, mf.sourceIds);
      }
      const detail: MissionDetailLevel = complete ? 'complete' : wantsPayloads ? 'payloads' : wantsLander ? 'lander' : 'basic';
      return mk({ type: 'SHOW_MISSION', missionId: mission.id, detail, journeyFromEarth: journey }, `${mission.shortName} — ${detail} scene${journey ? ', journey from Earth' : ''}.`, mf.facts, mf.sourceIds);
    }
    if (provider && /mission/.test(t)) {
      const ids = kb.snapshot.missions.filter((m) => m.providerId === provider.id).map((m) => m.id);
      if (ids.length) return mk({ type: 'SHOW_MISSIONS', missionIds: ids, includeLanders: wantsLander }, `${provider.name} missions (${ids.length}).`, [], provider.sourceIds);
    }
    const year = t.match(/\b(20[2-3]\d)\b/)?.[1];
    if (year && /mission/.test(t)) {
      const ids = kb.snapshot.missions.filter((m) => (m.landing.date ?? m.launch.date ?? m.launch.nominal ?? '').includes(year)).map((m) => m.id);
      if (ids.length) return mk({ type: 'SHOW_MISSIONS', missionIds: ids, includeLanders: wantsLander }, `CLPS missions in ${year} (${ids.length}).`);
    }
    if (region && /mission/.test(t)) return mk({ type: 'SHOW_MISSIONS', regionId: region.id, includeLanders: wantsLander }, `CLPS missions in ${region.name}${wantsLander ? ' with landers' : ''}.`, [], region.sourceIds);
    if (region) return mk({ type: 'SHOW_REGION', regionId: region.id }, `Region: ${region.name}.`, [{ label: region.name, value: region.description }], region.sourceIds);
    if (site) return mk({ type: 'SHOW_LANDING_SITE', landingSiteId: site.id, journeyFromEarth: journey }, `Landing site: ${site.name}.`, kb.siteFacts(site).facts, site.sourceIds);
    if (/^(show |list |display |see )?(me )?(all |every |the )?(clps )?missions?( with landers)?$/.test(t) || /\b(all|every)\b.*\bmissions?\b/.test(t)) return mk({ type: 'SHOW_MISSIONS', includeLanders: wantsLander }, 'All CLPS missions.');
    return null;
  }

  private parsePlan(raw: string, t: string): PlanInput | null {
    const kb = this.kb;
    const s = raw.toLowerCase().replace(/[°º]/g, ' ');
    const m = s.match(/(-?\d+(?:\.\d+)?)\s*([ns])?\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*([ew])?(?![\d.])/);
    let lat: number | undefined; let lon: number | undefined;
    if (m) {
      lat = Number(m[1]); lon = Number(m[3]);
      if (m[2] === 's') lat = -Math.abs(lat);
      if (m[4] === 'w') lon = -Math.abs(lon);
    } else {
      const mission = kb.findMission(raw); const site = mission ? kb.siteById(mission.landingSiteId) : kb.findSite(raw);
      if (site?.latitude !== null && site?.latitude !== undefined && site.longitude !== null) { lat = site.latitude; lon = site.longitude; }
      else if (/south pole/.test(t)) { lat = -89.5; lon = -140; }
    }
    if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const plan: PlanInput = { latitude: lat, longitude: lon };
    const lander = kb.findLanderPreset(raw); if (lander) plan.landerId = lander;
    const transfer = kb.findTransfer(raw); if (transfer) plan.transferId = transfer;
    const date = s.match(/\b(20\d{2}-\d{2}-\d{2}(?:t\d{2}:\d{2}(?::\d{2})?z?)?)\b/)?.[1];
    if (date) plan.landingDate = date.toUpperCase();
    else {
      const month = s.match(/\b(?:in|on|during|for)\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*(20\d{2})?/);
      if (month) {
        const mi = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].indexOf(month[1]) + 1;
        const yr = month[2] ?? String(new Date().getUTCFullYear() + (mi <= new Date().getUTCMonth() + 1 ? 1 : 0));
        plan.landingDate = `${yr}-${String(mi).padStart(2, '0')}-01`;
      }
    }
    const kg = s.match(/(\d+(?:\.\d+)?)\s*kg/); if (kg) plan.payloadKg = Number(kg[1]);
    const days = s.match(/(\d+(?:\.\d+)?)\s*(?:day|days|d)\b(?!\s*(?:transfer|orbit))/); if (days) plan.surfaceDays = Number(days[1]);
    return plan;
  }

  // ---- questions -----------------------------------------------------------------------------------------------------
  private async question(raw: string, t: string, ctx: AiContext, trace: AiResponse['trace']): Promise<Omit<AnswerResponse, 'ms' | 'trace' | 'provider'> | null> {
    const kb = this.kb;
    const answer = (text: string, facts: Fact[], sourceIds: string[], suggestedIntent?: SceneIntent, confidence = 0.85): Omit<AnswerResponse, 'ms' | 'trace' | 'provider'> =>
      ({ kind: 'answer', text, facts, citations: kb.citations(sourceIds), grounded: true, explanation: 'Answered from the CLPS catalogue / research engine only.', confidence, ...(suggestedIntent ? { suggestedIntent } : {}) });

    // ephemeris questions (research engine)
    if (/\b(sun|solar|illuminat|sunrise|sunlit|earth elevation|earth visib|landing window|windows?|ephemeris|daylight|night)\b/.test(t)) {
      const target = this.resolveCoords(raw, t, ctx);
      if (target) {
        trace.push({ step: 'rules.ephemeris', detail: `${target.label} ${target.lat},${target.lon}` });
        const date = raw.match(/\b(20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?Z?)?)\b/i)?.[1];
        if (/window|next|when (can|could|should)|sunrise|opportunit/.test(t) || !date) {
          const w = await kb.research.windows(target.lat, target.lon, date, 4).catch(() => null);
          const list = (w?.windows as Array<Record<string, number | string | boolean>> | undefined) ?? [];
          if (list.length) {
            const facts: Fact[] = list.map((x) => ({ label: String(x.utc), value: `Sun ${x.sunElevationDeg}° (az ${x.sunAzimuthDeg}°), ${x.sunlitHoursAfter} h sunlit after, peak ${x.peakSunElevationDeg}°, Earth ${x.earthElevationMinDeg14d}–${x.earthElevationMaxDeg14d}° over 14 d${x.sunVisible === false ? ' — Sun behind terrain' : ''}` }));
            return answer(`Next landing opportunities at ${target.label} (local sunrise passing ${w?.targetSunElevationDeg}° Sun elevation${w?.terrainMasked ? ', terrain-horizon masked' : ''}):`, facts, ['src-meeus', 'src-iau-wgccre-2009', ...(w?.terrainMasked ? ['src-pds-lola-gdr'] : [])], { type: 'PLAN_LANDING', plan: { latitude: target.lat, longitude: target.lon, landingDate: String(list[0].utc).slice(0, 10) } });
          }
        }
        const e = await kb.research.ephemeris(target.lat, target.lon, date).catch(() => null);
        if (e) {
          const facts: Fact[] = [
            { label: 'UTC', value: String(e.utc) },
            { label: 'Sun', value: `elevation ${e.sunElevationDeg}°, azimuth ${e.sunAzimuthDeg}°` },
            { label: 'Earth', value: `elevation ${e.earthElevationDeg}°, azimuth ${e.earthAzimuthDeg}°, distance ${Number(e.earthDistanceKm).toLocaleString('en-US')} km` },
            { label: 'Sub-solar point', value: `${e.subSolarLat}°, ${e.subSolarLon}°` },
          ];
          return answer(`Sun and Earth geometry at ${target.label} for ${e.utc} (Meeus low-precision + IAU 2009 orientation, ≈ ±0.3°):`, facts, ['src-meeus', 'src-iau-wgccre-2009']);
        }
        return answer(`The research engine is not reachable right now, so I cannot compute Sun/Earth geometry for ${target.label}.`, [], [], undefined, 0.5);
      }
    }

    const missions = kb.findMissions(raw);
    let mission: KbMission | undefined = missions[0]?.entity;
    if (!mission && /\b(it|its|this|that|the mission|the lander)\b/.test(t) && ctx.missionId) { mission = kb.missionById(ctx.missionId); if (mission) trace.push({ step: 'rules.context', detail: `pronoun → ${mission.id}` }); }
    const historic = mission ? undefined : await kb.findHistoric(raw);

    if (mission) {
      const mf = kb.missionFacts(mission);
      const site = kb.siteById(mission.landingSiteId);
      this.note(mission, site, undefined);
      const show: SceneIntent = { type: 'SHOW_MISSION', missionId: mission.id, detail: 'basic' };
      if (/payload|instrument|experiment|carr(y|ied|ies)|science on board|on board/.test(t)) {
        const pf = kb.payloadFacts(mission);
        return answer(`${mission.shortName} carries ${mission.nasaPayloadCount ?? mission.payloadIds.length} NASA payload${(mission.nasaPayloadCount ?? 1) === 1 ? '' : 's'}${mission.commercialPayloads?.length ? ` plus ${mission.commercialPayloads.length} commercial/partner payloads` : ''}:`, pf.facts, pf.sourceIds, { type: 'SHOW_MISSION', missionId: mission.id, detail: 'payloads' });
      }
      if (/\bwhen\b|\bdate\b|what time|which day/.test(t)) {
        const facts = mf.facts.filter((f) => /^(Launch|Landing|End of mission)$/.test(f.label));
        const landed = mission.landing.date ? `${mission.shortName} landed ${kb.fmtDate(mission.landing.date)}${mission.landing.outcome ? ` (${mission.landing.outcome})` : ''}.` : mission.status === 'planned' ? `${mission.shortName} has not flown yet — nominal launch ${mission.launch.nominal ?? 'TBD'} on ${mission.launch.vehicle}.` : `${mission.shortName}: ${mission.statusDetail}`;
        const launched = mission.launch.date ? ` It launched ${kb.fmtDate(mission.launch.date)} on ${mission.launch.vehicle}.` : '';
        return answer(/launch|lift ?off/.test(t) && !/land/.test(t) ? (mission.launch.date ? `${mission.shortName} launched ${kb.fmtDate(mission.launch.date)} on ${mission.launch.vehicle}${mission.launch.site ? ` from ${mission.launch.site}` : ''}.` : landed) : landed + launched, facts, mf.sourceIds, show);
      }
      if (/\bwhere\b|location|coordinates|site|latitude|region/.test(t) && site) {
        const sf = kb.siteFacts(site);
        return answer(`${mission.shortName}'s landing site is ${site.name} — ${kb.fmtLatLon(site.latitude, site.longitude)}${site.elevationM !== null ? ` at ${site.elevationM} m` : ''} (${site.precision}).`, sf.facts, [...sf.sourceIds, ...mission.sourceIds], { type: 'SHOW_LANDING_SITE', landingSiteId: site.id });
      }
      if (/\bwho\b|provider|company|built|build|operat|manufactur|which lander|what lander|which spacecraft/.test(t)) {
        const p = kb.providerById(mission.providerId); const l = kb.spacecraftById(mission.landerId);
        const facts: Fact[] = [
          { label: 'Provider', value: p ? `${p.name} — ${p.headquarters}, ${p.country}` : mission.providerId },
          { label: 'Lander', value: l ? `${l.name} (${l.class})${l.payloadCapacityKg ? `, payload capacity ≈ ${l.payloadCapacityKg} kg` : ''}` : mission.landerId },
          { label: '3-D model', value: l?.assetStatus === 'official-nasa-asset' ? 'official NASA asset' : `no official NASA model — shown as an information marker${l?.assetNote ? ` (${l.assetNote})` : ''}` },
        ];
        return answer(`${mission.shortName} is flown by ${p?.name ?? mission.providerId} on its ${l?.name ?? mission.landerId} lander under ${mission.taskOrder}.`, facts, [...mission.sourceIds, ...(p?.sourceIds ?? []), ...(l?.sourceIds ?? [])], { type: 'SHOW_MISSION', missionId: mission.id, detail: 'lander' });
      }
      if (/status|happen|outcome|result|fail|succe|why|how did|went|tip|survive|end/.test(t)) {
        const ev = kb.eventsFor(mission.id);
        return answer(`${mission.shortName} — status: ${mission.status}. ${mission.statusDetail}`, [...mf.facts.filter((f) => /^(Landing|End of mission)$/.test(f.label)), ...kb.eventFacts(ev)], [...mf.sourceIds, ...ev.flatMap((e) => e.sourceIds)], show);
      }
      if (/how many|number of|count/.test(t)) return answer(`${mission.shortName}: ${mission.nasaPayloadCount ?? mission.payloadIds.length} NASA payloads${mission.commercialPayloads?.length ? `, ${mission.commercialPayloads.length} commercial/partner` : ''}.`, kb.payloadFacts(mission).facts, mission.sourceIds, { type: 'SHOW_MISSION', missionId: mission.id, detail: 'payloads' });
      return answer(`${mission.name}: ${mission.statusDetail}`, mf.facts, mf.sourceIds, show);
    }

    if (historic) {
      trace.push({ step: 'rules.historic', detail: historic.id });
      const facts = kb.historicFacts(historic);
      const lead = historic.outcome === 'success' ? `${historic.name} (${historic.agency}) landed ${historic.eventDate ?? ''}${historic.site?.latitude != null ? ` at ${kb.fmtLatLon(historic.site.latitude, historic.site.longitude)}` : ''}.` : `${historic.name} (${historic.agency}): ${historic.outcome}${historic.eventDate ? ` on ${historic.eventDate}` : ''}${historic.summary ? ` — ${historic.summary}` : ''}`;
      return answer(lead, facts, historic.sourceIds ?? ['src-nssdca-nmc'], { type: 'HISTORY' });
    }

    // aggregate / list questions over the CLPS catalogue
    if (/mission|landing|launch|flight|clps|lander/.test(t) && /(which|what|list|how many|number|count|upcoming|next|planned|all|every|schedule|when is|when are)/.test(t)) {
      const historicScope = /(ever|all time|since 19|history|humanity|any country|worldwide|in total|soft landing|apollo|soviet|luna\b|lunar landings?|moon landings?|landings? (have|has) there|there been)/.test(t) && !/clps/.test(t);
      if (historicScope) return this.historicAggregate(raw, t, answer);
      const list = this.filterMissions(raw, t);
      if (!list.length) return answer('No CLPS mission in the catalogue matches that filter.', [], [], undefined, 0.6);
      const facts: Fact[] = list.map((m) => { const site = kb.siteById(m.landingSiteId); return { label: m.shortName, value: `${m.status}${m.landing.date ? ` · landed ${kb.fmtDate(m.landing.date, false)}` : m.launch.nominal ? ` · NET ${m.launch.nominal}` : ''}${site ? ` · ${site.name}` : ''}` }; });
      const lead = /how many|number|count/.test(t) ? `${list.length} CLPS mission${list.length === 1 ? '' : 's'} match${list.length === 1 ? 'es' : ''}:` : `${list.length} CLPS mission${list.length === 1 ? '' : 's'}:`;
      return answer(lead, facts, list.flatMap((m) => m.sourceIds), { type: 'SHOW_MISSIONS', missionIds: list.map((m) => m.id) });
    }
    if (/how many|number of|count|success rate|first|earliest|latest|most recent|last/.test(t) && /(land|attempt|mission|moon|lunar)/.test(t)) return this.historicAggregate(raw, t, answer);

    if (/sources?|where does .* data|provenance|citations?|credits?/.test(t)) {
      const facts: Fact[] = kb.snapshot.sources.slice(0, 20).map((s) => ({ label: s.publisher, value: `${s.title}${s.date ? ` (${s.date})` : ''}` }));
      return answer(`Every record carries source ids; ${kb.snapshot.sources.length} sources are registered (NASA CLPS, LROC, NSSDCA, PDS, …). Assets keep their own credit/license metadata.`, facts, kb.snapshot.sources.map((s) => s.id));
    }
    return null;
  }

  private filterMissions(raw: string, t: string): KbMission[] {
    const kb = this.kb;
    let list = [...kb.snapshot.missions];
    const year = t.match(/\b(20[2-3]\d)\b/)?.[1];
    if (year) list = list.filter((m) => (m.landing.date ?? m.launch.date ?? m.launch.nominal ?? '').includes(year));
    const region = kb.findRegion(raw); if (region) list = list.filter((m) => kb.siteById(m.landingSiteId)?.regionId === region.id);
    const provider = kb.findProvider(raw); if (provider) list = list.filter((m) => m.providerId === provider.id);
    if (/upcoming|planned|future|next|schedule|not yet|will/.test(t)) list = list.filter((m) => m.status === 'planned' || m.status === 'in-flight');
    if (/\bfail|lost|crash|unsuccess/.test(t)) list = list.filter((m) => m.status.startsWith('failed'));
    if (/succe|landed|worked/.test(t) && !/\bfail/.test(t)) list = list.filter((m) => m.status.startsWith('success'));
    if (/cancel/.test(t)) list = list.filter((m) => m.status === 'cancelled');
    return list.sort((a, b) => (a.landing.date ?? a.launch.nominal ?? '9').localeCompare(b.landing.date ?? b.launch.nominal ?? '9'));
  }

  private async historicAggregate(raw: string, t: string, answer: (text: string, facts: Fact[], sourceIds: string[], suggestedIntent?: SceneIntent, confidence?: number) => Omit<AnswerResponse, 'ms' | 'trace' | 'provider'>) {
    const kb = this.kb;
    let list = await kb.historic();
    if (!list.length) return answer('The historic landing catalogue (research engine) is not reachable right now.', [], [], undefined, 0.4);
    const year = t.match(/\b((?:19|20)\d{2})\b/)?.[1];
    if (year) list = list.filter((h) => (h.eventDate ?? h.launchDate ?? '').startsWith(year));
    if (/crewed|human|astronaut|apollo/.test(t)) list = list.filter((h) => h.crewed);
    if (/commercial|private/.test(t)) list = list.filter((h) => h.commercial);
    if (/south pol|polar/.test(t)) list = list.filter((h) => h.site?.latitude != null && Math.abs(h.site.latitude) >= 75);
    const country = ['usa', 'united states', 'soviet', 'ussr', 'russia', 'china', 'india', 'japan', 'israel'].find((c) => t.includes(c));
    if (country) list = list.filter((h) => norm(`${h.country} ${h.agency}`).includes(country === 'united states' ? 'usa' : country === 'soviet' ? 'ussr' : country));
    const ok = list.filter((h) => h.outcome === 'success');
    const partial = list.filter((h) => /partial/.test(h.outcome));
    const fail = list.filter((h) => !/success/.test(h.outcome) && !/partial/.test(h.outcome));
    const sorted = [...list].sort((a, b) => (a.eventDate ?? '').localeCompare(b.eventDate ?? ''));
    const fmt = (h: KbHistoric): Fact => ({ label: h.eventDate ?? '?', value: `${h.name} (${h.agency}) — ${h.outcome}${h.site?.latitude != null ? ` · ${kb.fmtLatLon(h.site.latitude, h.site.longitude)}` : ''}` });
    if (/first|earliest/.test(t)) { const h = sorted.find((x) => x.outcome === 'success') ?? sorted[0]; return h ? answer(`First${/succe|soft/.test(t) ? ' successful' : ''} lunar landing in the catalogue: ${h.name} (${h.agency}), ${h.eventDate}.`, kb.historicFacts(h), h.sourceIds ?? [], { type: 'HISTORY' }) : answer('Nothing matches.', [], []); }
    if (/latest|most recent|last/.test(t)) { const h = sorted[sorted.length - 1]; return h ? answer(`Most recent lunar landing attempt in the catalogue: ${h.name} (${h.agency}), ${h.eventDate} — ${h.outcome}.`, kb.historicFacts(h), h.sourceIds ?? [], { type: 'HISTORY' }) : answer('Nothing matches.', [], []); }
    const lead = `${list.length} lunar landing attempts${year ? ` in ${year}` : ''} in the NSSDCA-based catalogue: ${ok.length} successes, ${partial.length} partial, ${fail.length} failures${list.length ? ` (success rate ${Math.round((100 * ok.length) / list.length)} %)` : ''}.`;
    return answer(lead, sorted.slice(-12).map(fmt), ['src-nssdca-nmc', 'src-nssdca-timeline'], { type: 'HISTORY' });
  }

  private resolveCoords(raw: string, t: string, ctx: AiContext): { lat: number; lon: number; label: string } | null {
    const kb = this.kb;
    const s = raw.toLowerCase().replace(/[°º]/g, ' ');
    const m = s.match(/(-?\d+(?:\.\d+)?)\s*([ns])\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*([ew])/) ?? s.match(/(?:at|for)\s+(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
    if (m) {
      let lat = Number(m[1]); let lon = Number(m[3] ?? m[2]);
      if (m[2] === 's') lat = -Math.abs(lat); if (m[4] === 'w') lon = -Math.abs(lon);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon, label: kb.fmtLatLon(lat, lon) };
    }
    const mission = kb.findMission(raw) ?? (/\b(it|its|this|that|the site|here)\b/.test(t) && ctx.missionId ? kb.missionById(ctx.missionId) : undefined);
    const site = mission ? kb.siteById(mission.landingSiteId) : kb.findSite(raw) ?? (ctx.landingSiteId ? kb.siteById(ctx.landingSiteId) : undefined);
    if (site && site.latitude !== null && site.longitude !== null) return { lat: site.latitude, lon: site.longitude, label: site.name };
    const region = kb.findRegion(raw);
    if (region) return { lat: region.center.latitude, lon: region.center.longitude, label: `${region.name} (center)` };
    return null;
  }

  private async entityCard(raw: string, t: string, _ctx: AiContext, trace: AiResponse['trace']): Promise<Omit<AnswerResponse, 'ms' | 'trace' | 'provider'> | null> {
    const kb = this.kb;
    const mk = (text: string, facts: Fact[], sourceIds: string[], suggestedIntent?: SceneIntent): Omit<AnswerResponse, 'ms' | 'trace' | 'provider'> =>
      ({ kind: 'answer', text, facts, citations: kb.citations(sourceIds), grounded: true, explanation: 'Catalogue record.', confidence: 0.7, ...(suggestedIntent ? { suggestedIntent } : {}) });
    const mission = kb.findMission(raw);
    if (mission) { this.note(mission, undefined, undefined); const mf = kb.missionFacts(mission); trace.push({ step: 'rules.card', detail: mission.id }); return mk(`${mission.name}: ${mission.statusDetail}`, mf.facts, mf.sourceIds, { type: 'SHOW_MISSION', missionId: mission.id, detail: 'basic' }); }
    const site = kb.findSite(raw);
    if (site) { this.note(undefined, site, undefined); const sf = kb.siteFacts(site); return mk(`${site.name}: ${site.precisionNote}`, sf.facts, sf.sourceIds, { type: 'SHOW_LANDING_SITE', landingSiteId: site.id }); }
    const region = kb.findRegion(raw);
    if (region) { this.note(undefined, undefined, region); return mk(`${region.name}: ${region.description}`, [{ label: 'Science themes', value: region.scienceThemes.join(', ') }, { label: 'Center', value: kb.fmtLatLon(region.center.latitude, region.center.longitude) }], region.sourceIds, { type: 'SHOW_REGION', regionId: region.id }); }
    const provider = kb.findProvider(raw);
    if (provider) {
      const ms = kb.snapshot.missions.filter((m) => m.providerId === provider.id);
      return mk(`${provider.name} — ${provider.headquarters}, ${provider.country}. Landers: ${provider.landers.join(', ')}.`, ms.map((m) => ({ label: m.shortName, value: `${m.status} — ${m.statusDetail}` })), provider.sourceIds, ms.length ? { type: 'SHOW_MISSIONS', missionIds: ms.map((m) => m.id) } : undefined);
    }
    const sc = kb.findSpacecraft(raw);
    if (sc) return mk(`${sc.name} — ${sc.type}, ${sc.class}.${sc.payloadCapacityKg ? ` Payload capacity ≈ ${sc.payloadCapacityKg} kg.` : ''} ${sc.assetStatus === 'official-nasa-asset' ? 'Official NASA 3-D asset available.' : `No official NASA 3-D model${sc.assetNote ? ` — ${sc.assetNote}` : ''}; shown as an information marker.`}`, [], sc.sourceIds);
    const payload = kb.findPayload(raw);
    if (payload) return mk(`${payload.name} (${payload.acronym}) — ${payload.type}, ${payload.leadOrganization}. ${payload.summary}`, [{ label: 'Flies on', value: payload.missionIds.map((id) => kb.missionById(id)?.shortName ?? id).join(', ') }], payload.missionIds.flatMap((id) => kb.missionById(id)?.sourceIds ?? []));
    const historic = await kb.findHistoric(raw);
    if (historic) return mk(`${historic.name} (${historic.agency}): ${historic.outcome}${historic.summary ? ` — ${historic.summary}` : ''}`, kb.historicFacts(historic), historic.sourceIds ?? ['src-nssdca-nmc'], { type: 'HISTORY' });
    return null;
  }

  // ---- helpers -------------------------------------------------------------------------------------------------------
  private note(mission?: KbMission, site?: { id: string; regionId: string }, region?: { id: string }) {
    if (mission) { this.resolved.missionId = mission.id; this.resolved.landingSiteId = mission.landingSiteId; }
    if (site) { this.resolved.landingSiteId = site.id; this.resolved.regionId = site.regionId; }
    if (region) this.resolved.regionId = region.id;
  }
  private finish(r: Omit<IntentResponse, 'ms' | 'trace' | 'provider'> | Omit<AnswerResponse, 'ms' | 'trace' | 'provider'>, trace: AiResponse['trace'], t0: number): AiResponse {
    return { ...r, provider: 'rules', entities: { ...this.resolved }, trace: [...trace, { step: 'rules.done', ms: Date.now() - t0 }], ms: Date.now() - t0 } as AiResponse;
  }
  private clarify(text: string, options: ClarifyResponse['options'], trace: AiResponse['trace'], t0: number): ClarifyResponse {
    return { kind: 'clarify', text, options, provider: 'rules', confidence: 0.2, explanation: 'No catalogue mapping found.', citations: [], trace, ms: Date.now() - t0 };
  }
}
